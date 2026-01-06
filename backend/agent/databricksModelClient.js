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

async function invokeAgentModel({ host, token, endpointName, messages, temperature, maxTokens }) {
  const baseUrl = coerceHostToBaseUrl(host);
  if (!baseUrl) throw new Error('Missing DATABRICKS_HOST');
  if (!endpointName) throw new Error('Missing DATABRICKS_AGENT_ENDPOINT');
  if (!token) throw new Error('Missing DATABRICKS_TOKEN (required to call model serving)');

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
          Authorization: `Bearer ${token}`,
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
