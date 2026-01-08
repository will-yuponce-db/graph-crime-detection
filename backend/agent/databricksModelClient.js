/**
 * Minimal Databricks Model Serving invocations client.
 *
 * We avoid extra deps; uses Node's https.
 *
 * Expected endpoint:
 *   POST https://<DATABRICKS_HOST>/api/2.0/serving-endpoints/<ENDPOINT>/invocations
 *
 * NOTE: Payload formats vary by model type. We start with a chat-style payload
 * and parse common response shapes.
 */

const https = require('https');

function requestJson(url, { method, headers, body }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);

    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method,
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const status = res.statusCode || 0;
          const contentType = String(res.headers['content-type'] || '');

          if (status < 200 || status >= 300) {
            return reject(
              new Error(
                `Databricks request failed (${status}). ${data?.slice(0, 500) || ''}`.trim()
              )
            );
          }

          if (!contentType.includes('application/json')) {
            return resolve({ raw: data });
          }

          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse JSON response: ${String(e?.message || e)}`));
          }
        });
      }
    );

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function coerceHostToBaseUrl(host) {
  if (!host) return null;
  // Normalize to URL origin only (scheme + host). Users often paste UI URLs that include paths.
  // Examples we accept:
  // - https://<workspace>
  // - https://<workspace>/serving-endpoints/<name>/invocations
  // - <workspace>
  const raw = host.startsWith('http://') || host.startsWith('https://') ? host : `https://${host}`;
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}`;
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

function extractAssistantText(responseJson) {
  // Common OpenAI-ish shape
  const choice0 = responseJson?.choices?.[0];
  const msg = choice0?.message?.content;
  if (typeof msg === 'string' && msg.trim()) return msg;

  const text = choice0?.text;
  if (typeof text === 'string' && text.trim()) return text;

  // Common MLflow-ish shape
  const pred0 = responseJson?.predictions?.[0];
  if (typeof pred0 === 'string' && pred0.trim()) return pred0;
  if (typeof pred0?.content === 'string' && pred0.content.trim()) return pred0.content;

  // Fallback: stringify
  try {
    return JSON.stringify(responseJson);
  } catch {
    return String(responseJson);
  }
}

// In-memory OAuth token cache (best-effort).
// We keep it minimal: one token per (baseUrl, clientId, scope).
const oauthTokenCache = {
  baseUrl: null,
  clientId: null,
  scope: null,
  accessToken: null,
  expiresAtMs: 0,
};

function getOauthScope() {
  const scope = process.env.DATABRICKS_OAUTH_SCOPE;
  return typeof scope === 'string' && scope.trim() ? scope.trim() : 'all-apis';
}

async function getServicePrincipalAccessToken({ host, clientId, clientSecret }) {
  const baseUrl = coerceHostToBaseUrl(host);
  if (!baseUrl) throw new Error('Missing DATABRICKS_HOST');
  if (!clientId) throw new Error('Missing DATABRICKS_CLIENT_ID');
  if (!clientSecret) throw new Error('Missing DATABRICKS_CLIENT_SECRET');

  const scope = getOauthScope();

  // Return cached token if still valid (with a 60s safety buffer).
  const now = Date.now();
  if (
    oauthTokenCache.accessToken &&
    oauthTokenCache.baseUrl === baseUrl &&
    oauthTokenCache.clientId === clientId &&
    oauthTokenCache.scope === scope &&
    now < oauthTokenCache.expiresAtMs - 60 * 1000
  ) {
    return oauthTokenCache.accessToken;
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64');
  const form = new URLSearchParams({
    grant_type: 'client_credentials',
    scope,
  }).toString();

  // Databricks workspaces generally expose an OIDC token endpoint under the workspace host.
  // We try a couple of common paths for compatibility.
  const tokenPaths = ['/oidc/v1/token', '/oidc/oauth2/v1/token'];

  let lastErr = null;
  for (const p of tokenPaths) {
    const url = `${baseUrl}${p}`;
    try {
      const tokenJson = await requestJson(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form,
      });

      const accessToken = tokenJson?.access_token;
      const expiresInSec = tokenJson?.expires_in;

      if (typeof accessToken !== 'string' || !accessToken.trim()) {
        throw new Error(`OAuth token response missing access_token from ${p}`);
      }

      const expiresAtMs =
        typeof expiresInSec === 'number' && Number.isFinite(expiresInSec)
          ? now + Math.max(30, expiresInSec) * 1000
          : now + 55 * 60 * 1000; // default ~55 minutes

      oauthTokenCache.baseUrl = baseUrl;
      oauthTokenCache.clientId = clientId;
      oauthTokenCache.scope = scope;
      oauthTokenCache.accessToken = accessToken;
      oauthTokenCache.expiresAtMs = expiresAtMs;

      return accessToken;
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error('Failed to acquire Databricks OAuth access token');
}

/**
 * Detect if running inside Databricks Apps.
 */
function isDatabricksApp() {
  return !!process.env.DATABRICKS_APP_NAME;
}

/**
 * Try to find a Databricks token from various sources that Databricks Apps might provide.
 */
function findDatabricksToken() {
  // Check various environment variable names that might contain the token
  const tokenEnvVars = [
    'DATABRICKS_TOKEN',
    'DATABRICKS_ACCESS_TOKEN',
    'DATABRICKS_OAUTH_TOKEN',
    'DBX_TOKEN',
  ];

  for (const envVar of tokenEnvVars) {
    const val = process.env[envVar];
    if (typeof val === 'string' && val.trim()) {
      return val.trim();
    }
  }

  return null;
}

async function invokeAgentModel({
  host,
  token,
  clientId,
  clientSecret,
  endpointName,
  messages,
  temperature,
  maxTokens,
}) {
  const baseUrl = coerceHostToBaseUrl(host);
  if (!baseUrl) throw new Error('Missing DATABRICKS_HOST');
  if (!endpointName) throw new Error('Missing DATABRICKS_AGENT_ENDPOINT');

  // Priority 1: Explicit token passed as argument
  let bearerToken = token;

  // Priority 2: Check environment variables for token
  if (!bearerToken) {
    bearerToken = findDatabricksToken();
  }

  // Priority 3: Service principal OAuth (if credentials provided)
  if (!bearerToken && clientId && clientSecret) {
    bearerToken = await getServicePrincipalAccessToken({ host, clientId, clientSecret });
  }

  // Build helpful error message
  if (!bearerToken) {
    const inApp = isDatabricksApp();
    const envVars = [
      `DATABRICKS_TOKEN=${process.env.DATABRICKS_TOKEN ? '[set]' : '[not set]'}`,
      `DATABRICKS_CLIENT_ID=${process.env.DATABRICKS_CLIENT_ID ? '[set]' : '[not set]'}`,
      `DATABRICKS_CLIENT_SECRET=${process.env.DATABRICKS_CLIENT_SECRET ? '[set]' : '[not set]'}`,
      `DATABRICKS_APP_NAME=${process.env.DATABRICKS_APP_NAME || '[not set]'}`,
    ].join(', ');

    throw new Error(
      inApp
        ? `Databricks Apps auth failed. No token found. Environment: ${envVars}. ` +
            'Ensure the app has a serving-endpoint resource configured, or set DATABRICKS_TOKEN.'
        : `Missing Databricks auth for model serving. Environment: ${envVars}. ` +
            'Set DATABRICKS_TOKEN or DATABRICKS_CLIENT_ID + DATABRICKS_CLIENT_SECRET.'
    );
  }

  // Invocation path differs from management APIs in some workspaces.
  // We'll try the most common first, then fall back.
  const invocationPaths = [
    `/serving-endpoints/${encodeURIComponent(endpointName)}/invocations`,
    `/api/2.0/serving-endpoints/${encodeURIComponent(endpointName)}/invocations`,
  ];

  // Chat-style payload (Databricks foundation model serving commonly supports this shape)
  const payload = {
    messages,
    temperature: typeof temperature === 'number' ? temperature : 0.2,
    max_tokens: typeof maxTokens === 'number' ? maxTokens : 600,
  };

  let lastErr = null;
  for (const path of invocationPaths) {
    const url = `${baseUrl}${path}`;
    try {
      const resJson = await requestJson(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      return { raw: resJson, text: extractAssistantText(resJson) };
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error('Databricks invocation failed');
}

module.exports = {
  invokeAgentModel,
};
