/**
 * Lakebase PostgreSQL Connector
 * Drop-in replacement for databricks.js — queries synced tables
 * in the Lakebase Postgres instance.
 *
 * When running in Databricks Apps with a database resource attached,
 * PGHOST, PGPORT, PGDATABASE, PGUSER, PGSSLMODE are auto-injected.
 * PGPASSWORD is NOT injected — we generate a short-lived OAuth
 * credential via the Databricks API automatically.
 *
 * For local dev, set PGPASSWORD manually in your .env file.
 */

const { Pool } = require('pg');
const https = require('https');
const logger = require('../utils/logger');

/**
 * Make an HTTPS request (works on all Node.js versions, unlike fetch).
 * @param {string} url - Full URL
 * @param {object} options - { method, headers, body }
 * @returns {Promise<{statusCode: number, body: string}>}
 */
function _httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method: options.method || 'GET',
        headers: options.headers || {},
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks).toString() });
        });
      }
    );
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// Schema where synced tables land (matches the UC source schema)
const SCHEMA = process.env.POSTGRES_SCHEMA || process.env.DATABRICKS_SCHEMA || 'demo';

// Exposed for backward compatibility with createApp.js references
const CATALOG = SCHEMA; // Not meaningful in PG, but keeps the interface stable

let pool = null;
let _dbCredential = null; // cached { token, expiresAt }

function escapeSqlLiteral(value) {
  return String(value).replace(/'/g, "''");
}

// ============== Credential Generation ==============

/**
 * Generate a Databricks OAuth access token using client_credentials grant.
 * Works when DATABRICKS_CLIENT_ID + DATABRICKS_CLIENT_SECRET are set
 * (auto-injected in Databricks Apps).
 */
async function _getOAuthToken() {
  const host = (process.env.DATABRICKS_HOST || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const clientId = process.env.DATABRICKS_CLIENT_ID;
  const clientSecret = process.env.DATABRICKS_CLIENT_SECRET;

  // If a static token is available, use it directly
  if (process.env.DATABRICKS_TOKEN) {
    return process.env.DATABRICKS_TOKEN;
  }

  if (!host || !clientId || !clientSecret) {
    return null;
  }

  const tokenUrl = `https://${host}/oidc/v1/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'all-apis',
  }).toString();

  logger.info({ type: 'postgres_credential', status: 'oauth_requesting', url: tokenUrl });

  const resp = await _httpsRequest(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    body,
  });

  if (resp.statusCode < 200 || resp.statusCode >= 300) {
    throw new Error(`OAuth token request failed (${resp.statusCode}): ${resp.body.substring(0, 200)}`);
  }

  const data = JSON.parse(resp.body);
  logger.info({ type: 'postgres_credential', status: 'oauth_success' });
  return data.access_token;
}

/**
 * Get a Lakebase-compatible PG password.
 * Uses the OAuth access token directly — Lakebase accepts Databricks
 * OAuth tokens for PostgreSQL authentication.
 * Tokens are cached and refreshed 5 minutes before expiry (~1h lifetime).
 */
async function _generateDatabaseCredential() {
  // Return cached credential if still valid (with 5-min buffer)
  if (_dbCredential && _dbCredential.expiresAt > Date.now() + 5 * 60 * 1000) {
    return _dbCredential.token;
  }

  const oauthToken = await _getOAuthToken();
  if (!oauthToken) return null;

  // OAuth access tokens work directly as PG passwords for Lakebase
  _dbCredential = {
    token: oauthToken,
    expiresAt: Date.now() + 55 * 60 * 1000, // OAuth tokens ~1h, refresh at 55m
  };

  logger.info({
    type: 'postgres_credential',
    status: 'generated',
    method: 'oauth_token',
    expiresIn: '55m',
  });
  return oauthToken;
}

// ============== Pool Management ==============

/**
 * Create the connection pool with a given password.
 */
function _createPool(password) {
  if (pool) return pool;

  const connectionString = process.env.POSTGRES_CONNECTION_STRING;

  if (connectionString) {
    pool = new Pool({ connectionString });
  } else {
    pool = new Pool({
      host: process.env.PGHOST || process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.PGPORT || process.env.POSTGRES_PORT || '5432', 10),
      database: process.env.PGDATABASE || process.env.POSTGRES_DATABASE || 'investigative_analytics',
      user: process.env.PGUSER || process.env.POSTGRES_USER,
      password: password || process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD,
      ssl: (process.env.PGSSLMODE || process.env.POSTGRES_SSL || 'require') !== 'disable'
        ? { rejectUnauthorized: false }
        : false,
    });
  }

  pool.on('error', (err) => {
    logger.error({ type: 'postgres_pool', status: 'error', error: err.message });
  });

  logger.info({
    type: 'postgres_init',
    status: 'pool_created',
    host: process.env.PGHOST || process.env.POSTGRES_HOST || 'localhost',
    database: process.env.PGDATABASE || process.env.POSTGRES_DATABASE || 'investigative_analytics',
    schema: SCHEMA,
    authMethod: password ? 'generated_credential' : 'static',
  });

  return pool;
}

/** Lazy pool accessor — creates if needed with static password. */
function initPool() {
  if (pool) return pool;
  return _createPool(null);
}

/**
 * Initialize the database connection. For Databricks Apps (no PGPASSWORD),
 * generates a short-lived credential first. For local dev with PGPASSWORD,
 * uses it directly.
 */
async function initDatabricks() {
  const hasStaticPassword = !!(
    process.env.PGPASSWORD ||
    process.env.POSTGRES_PASSWORD ||
    process.env.POSTGRES_CONNECTION_STRING
  );

  if (hasStaticPassword) {
    if (!pool) _createPool(null);
    return;
  }

  // No static password — need to generate a Lakebase credential.
  // If we already have a pool with a valid credential, skip.
  if (pool && _dbCredential && _dbCredential.expiresAt > Date.now() + 5 * 60 * 1000) {
    return;
  }

  // Destroy stale pool (if any) so we can recreate with fresh credential
  if (pool) {
    try { await pool.end(); } catch { /* ignore */ }
    pool = null;
  }

  // Log available env vars for debugging (first call only)
  if (!_dbCredential) {
    logger.info({
      type: 'postgres_credential',
      status: 'attempting',
      hasDatabricksHost: !!process.env.DATABRICKS_HOST,
      hasDatabricksToken: !!process.env.DATABRICKS_TOKEN,
      hasClientId: !!process.env.DATABRICKS_CLIENT_ID,
      hasClientSecret: !!process.env.DATABRICKS_CLIENT_SECRET,
      databricksHost: (process.env.DATABRICKS_HOST || '').substring(0, 40),
    });
  }

  // Generate credential — let errors propagate so the retry loop in
  // waitForDatabase() catches them and tries again.
  const credential = await _generateDatabaseCredential();

  if (!credential) {
    throw new Error(
      'No Lakebase credential generated. Ensure DATABRICKS_HOST and ' +
      'DATABRICKS_CLIENT_ID/SECRET (or DATABRICKS_TOKEN) are set, ' +
      'or set PGPASSWORD directly.'
    );
  }

  _createPool(credential);

  // Schedule credential refresh before expiry
  const refreshMs = _dbCredential
    ? Math.max((_dbCredential.expiresAt - Date.now()) - 5 * 60 * 1000, 60 * 1000)
    : 50 * 60 * 1000;
  setTimeout(async () => {
    try {
      logger.info({ type: 'postgres_credential', status: 'refreshing' });
      if (pool) {
        await pool.end();
        pool = null;
      }
      _dbCredential = null;
      await initDatabricks();
    } catch (err) {
      logger.error({ type: 'postgres_credential', status: 'refresh_failed', error: err.message });
    }
  }, refreshMs).unref();
}

/**
 * Execute a SQL query against Lakebase Postgres.
 * Retries once on connection errors.
 */
async function executeQuery(sql) {
  const p = initPool();
  let lastError = null;
  const maxRetries = 2;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await p.query(sql);
      return result.rows;
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries - 1 && isRetryableError(error)) {
        logger.warn({
          type: 'postgres_query',
          status: 'retry',
          attempt: attempt + 1,
          error: error.message,
          sql: sql.substring(0, 100),
        });
        // Brief delay before retry
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } else {
        logger.error({
          type: 'postgres_query',
          status: 'failed',
          attempt: attempt + 1,
          error: error.message,
          sql: sql.substring(0, 100),
        });
      }
    }
  }

  throw lastError;
}

/**
 * Check if an error is retryable (connection issues, etc.)
 */
function isRetryableError(error) {
  const msg = (error?.message || '').toLowerCase();
  return (
    msg.includes('connection') ||
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('enotfound') ||
    msg.includes('socket') ||
    msg.includes('terminated') ||
    msg.includes('password')
  );
}

/**
 * Get schema-qualified table name for Postgres.
 * In Lakebase, synced tables land under the schema matching the UC source schema.
 */
function getTableName(table) {
  return `"${SCHEMA}"."${table}"`;
}

// ============== Query Functions ==============

async function getCases() {
  return executeQuery(`SELECT * FROM ${getTableName('cases_silver')}`);
}

async function getSuspectRankings() {
  return executeQuery(`SELECT * FROM ${getTableName('suspect_rankings')} ORDER BY total_score DESC`);
}

async function getCoPresenceEdges() {
  return executeQuery(`SELECT * FROM ${getTableName('co_presence_edges')}`);
}

async function getSocialEdges() {
  return executeQuery(`SELECT * FROM ${getTableName('social_edges_silver')}`);
}

async function getRelationships() {
  return executeQuery(`SELECT * FROM ${getTableName('social_edges_silver')}`);
}

async function getDevicePersonLinks() {
  return executeQuery(`SELECT * FROM ${getTableName('person_device_links_silver')}`);
}

async function getCellDeviceCounts() {
  return executeQuery(`SELECT * FROM ${getTableName('cell_device_counts')}`);
}

async function getHotspotsForHour(hour) {
  return executeQuery(`SELECT * FROM ${getTableName('cell_device_counts')}`);
}

async function getLocationEvents() {
  return executeQuery(`SELECT * FROM ${getTableName('location_events_silver')}`);
}

async function getEvidenceCardData() {
  return executeQuery(`SELECT * FROM ${getTableName('evidence_card_data')}`);
}

async function getEntityCaseOverlap() {
  return executeQuery(`SELECT * FROM ${getTableName('entity_case_overlap')}`);
}

async function getHandoffCandidates() {
  return executeQuery(`SELECT * FROM ${getTableName('handoff_candidates')}`);
}

async function runCustomQuery(sql) {
  const normalized = sql.trim().toUpperCase();
  if (!normalized.startsWith('SELECT') && !normalized.startsWith('SHOW')) {
    throw new Error('Only SELECT queries are allowed');
  }
  return executeQuery(sql);
}

// ============== Entity Properties (overlay for read-only synced tables) ==============

async function updateEntityProperties(tableName, entityIdColumn, entityId, properties) {
  const p = initPool();
  const safeId = escapeSqlLiteral(entityId);

  const existingQuery = `
    SELECT properties FROM ${getTableName(tableName)}
    WHERE ${entityIdColumn} = '${safeId}'
    LIMIT 1
  `;
  const existing = await executeQuery(existingQuery);

  let mergedProperties = properties;
  if (existing.length > 0 && existing[0].properties) {
    try {
      const existingProps =
        typeof existing[0].properties === 'object'
          ? existing[0].properties
          : JSON.parse(existing[0].properties);
      mergedProperties = { ...existingProps, ...properties };
    } catch {
      // If parsing fails, just use the new properties
    }
  }

  await p.query(`
    CREATE TABLE IF NOT EXISTS "${SCHEMA}"."entity_properties_overlay" (
      table_name TEXT NOT NULL,
      entity_id_column TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      properties JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (table_name, entity_id_column, entity_id)
    )
  `);

  await p.query(`
    INSERT INTO "${SCHEMA}"."entity_properties_overlay"
      (table_name, entity_id_column, entity_id, properties, updated_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (table_name, entity_id_column, entity_id)
    DO UPDATE SET properties = $4, updated_at = NOW()
  `, [tableName, entityIdColumn, entityId, JSON.stringify(mergedProperties)]);

  return mergedProperties;
}

async function setEntityName(tableName, entityIdColumn, entityId, displayName) {
  return updateEntityProperties(tableName, entityIdColumn, entityId, {
    display_name: displayName,
  });
}

async function getEntityWithProperties(tableName, entityIdColumn, entityId) {
  const safeId = escapeSqlLiteral(entityId);
  const results = await executeQuery(`
    SELECT * FROM ${getTableName(tableName)}
    WHERE ${entityIdColumn} = '${safeId}'
    LIMIT 1
  `);

  if (results.length === 0) return null;
  const entity = results[0];

  try {
    const overlay = await executeQuery(`
      SELECT properties FROM "${SCHEMA}"."entity_properties_overlay"
      WHERE table_name = '${escapeSqlLiteral(tableName)}'
        AND entity_id_column = '${escapeSqlLiteral(entityIdColumn)}'
        AND entity_id = '${safeId}'
      LIMIT 1
    `);
    if (overlay.length > 0 && overlay[0].properties) {
      entity.properties =
        typeof overlay[0].properties === 'object'
          ? overlay[0].properties
          : JSON.parse(overlay[0].properties);
      return entity;
    }
  } catch {
    // Overlay table may not exist yet
  }

  if (entity.properties) {
    try {
      entity.properties =
        typeof entity.properties === 'object'
          ? entity.properties
          : JSON.parse(entity.properties);
    } catch {
      entity.properties = {};
    }
  } else {
    entity.properties = {};
  }

  return entity;
}

// ============== Metadata ==============

async function getUniqueLocations() {
  return executeQuery(`
    SELECT DISTINCT h3_cell, city, state,
           AVG(latitude) as latitude, AVG(longitude) as longitude
    FROM ${getTableName('location_events_silver')}
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
    GROUP BY h3_cell, city, state
  `);
}

async function listTables() {
  return executeQuery(`
    SELECT table_name as tableName, table_schema as database, 'false' as isTemporary
    FROM information_schema.tables
    WHERE table_schema = '${escapeSqlLiteral(SCHEMA)}'
    ORDER BY table_name
  `);
}

async function describeTable(tableName) {
  return executeQuery(`
    SELECT column_name as col_name, data_type as data_type,
           CASE WHEN is_nullable = 'YES' THEN 'true' ELSE 'false' END as nullable
    FROM information_schema.columns
    WHERE table_schema = '${escapeSqlLiteral(SCHEMA)}'
      AND table_name = '${escapeSqlLiteral(tableName)}'
    ORDER BY ordinal_position
  `);
}

async function closeDatabricks() {
  if (pool) {
    await pool.end();
    pool = null;
  }
  logger.info({ type: 'postgres_close', status: 'closed' });
}

module.exports = {
  initDatabricks,
  executeQuery,
  getCases,
  getSuspectRankings,
  getCoPresenceEdges,
  getSocialEdges,
  getRelationships,
  getDevicePersonLinks,
  getCellDeviceCounts,
  getHotspotsForHour,
  getLocationEvents,
  getEvidenceCardData,
  getEntityCaseOverlap,
  getHandoffCandidates,
  runCustomQuery,
  getUniqueLocations,
  listTables,
  describeTable,
  closeDatabricks,
  updateEntityProperties,
  setEntityName,
  getEntityWithProperties,
  CATALOG,
  SCHEMA,
  getTableName,
};
