/**
 * Lakebase PostgreSQL Connector
 * Drop-in replacement for databricks.js — queries synced tables
 * in the Lakebase Postgres instance.
 *
 * When running in Databricks Apps with a database resource attached,
 * the following env vars are auto-injected: PGHOST, PGPORT, PGDATABASE,
 * PGUSER, PGSSLMODE. For local dev, set them manually or use
 * POSTGRES_CONNECTION_STRING.
 */

const { Pool } = require('pg');
const logger = require('../utils/logger');

// Schema where synced tables land (matches the UC source schema)
const SCHEMA = process.env.POSTGRES_SCHEMA || process.env.DATABRICKS_SCHEMA || 'demo';

// Exposed for backward compatibility with createApp.js references
const CATALOG = SCHEMA; // Not meaningful in PG, but keeps the interface stable

let pool = null;

function escapeSqlLiteral(value) {
  return String(value).replace(/'/g, "''");
}

/**
 * Initialize the connection pool.
 * Reuses an existing pool if already created.
 */
function initPool() {
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
      password: process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD,
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
  });

  return pool;
}

/**
 * Placeholder — Postgres pool is created lazily, but this keeps the
 * same interface as databricks.js (which exports initDatabricks).
 */
async function initDatabricks() {
  return initPool();
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
    msg.includes('terminated')
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

/**
 * Get all cases from cases_silver table
 * @param {number} limit - Max rows (default 10000)
 */
async function getCases(limit = 10000) {
  const sql = `SELECT * FROM ${getTableName('cases_silver')} LIMIT ${limit}`;
  return executeQuery(sql);
}

/**
 * Get suspect rankings
 * @param {number} limit - Max rows (default 10000)
 */
async function getSuspectRankings(limit = 10000) {
  const sql = `SELECT * FROM ${getTableName('suspect_rankings')} ORDER BY total_score DESC LIMIT ${limit}`;
  return executeQuery(sql);
}

/**
 * Get co-presence edges (suspects seen together)
 * @param {number} limit - Max rows (default 15000)
 */
async function getCoPresenceEdges(limit = 15000) {
  const sql = `SELECT * FROM ${getTableName('co_presence_edges')} LIMIT ${limit}`;
  return executeQuery(sql);
}

/**
 * Get social edges (communication/relationship links)
 * @param {number} limit - Max rows (default 15000)
 */
async function getSocialEdges(limit = 15000) {
  const sql = `SELECT * FROM ${getTableName('social_edges_silver')} LIMIT ${limit}`;
  return executeQuery(sql);
}

/**
 * Get relationships between entities
 * @param {number} limit - Max rows (default 50000)
 */
async function getRelationships(limit = 50000) {
  const sql = `SELECT * FROM ${getTableName('social_edges_silver')} LIMIT ${limit}`;
  return executeQuery(sql);
}

/**
 * Get device-person links from person_device_links_silver table
 * @param {number} limit - Max rows (default 1000)
 */
async function getDevicePersonLinks(limit = 1000) {
  const sql = `SELECT * FROM ${getTableName('person_device_links_silver')} LIMIT ${limit}`;
  return executeQuery(sql);
}

/**
 * Get cell device counts per location
 * @param {number} limit - Max rows (default 5000)
 */
async function getCellDeviceCounts(limit = 5000) {
  const sql = `SELECT * FROM ${getTableName('cell_device_counts')} LIMIT ${limit}`;
  return executeQuery(sql);
}

/**
 * Get hotspots (cell device counts) for a specific hour
 * @param {number} hour - Hour index (0-71) - currently unused, filtering done in app
 * @param {number} limit - Max rows (default 5000)
 */
async function getHotspotsForHour(hour, limit = 5000) {
  const sql = `SELECT * FROM ${getTableName('cell_device_counts')} LIMIT ${limit}`;
  return executeQuery(sql);
}

/**
 * Get location events
 * @param {number} limit - Max rows (default 10000)
 */
async function getLocationEvents(limit = 10000) {
  const sql = `SELECT * FROM ${getTableName('location_events_silver')} LIMIT ${limit}`;
  return executeQuery(sql);
}

/**
 * Get evidence card data
 * @param {number} limit - Max rows (default 5000)
 */
async function getEvidenceCardData(limit = 5000) {
  const sql = `SELECT * FROM ${getTableName('evidence_card_data')} LIMIT ${limit}`;
  return executeQuery(sql);
}

/**
 * Get entity case overlap (entities appearing in multiple cases)
 * @param {number} limit - Max rows (default 10000)
 */
async function getEntityCaseOverlap(limit = 10000) {
  const sql = `SELECT * FROM ${getTableName('entity_case_overlap')} LIMIT ${limit}`;
  return executeQuery(sql);
}

/**
 * Get handoff candidates (suspects that may have handed off between locations)
 * @param {number} limit - Max rows (default 2000)
 */
async function getHandoffCandidates(limit = 2000) {
  const sql = `SELECT * FROM ${getTableName('handoff_candidates')} LIMIT ${limit}`;
  return executeQuery(sql);
}

/**
 * Run a custom SQL query (read-only for safety)
 */
async function runCustomQuery(sql) {
  const normalized = sql.trim().toUpperCase();
  if (!normalized.startsWith('SELECT') && !normalized.startsWith('SHOW')) {
    throw new Error('Only SELECT queries are allowed');
  }
  return executeQuery(sql);
}

/**
 * Update entity properties (name, custom fields stored as JSON)
 * Note: Synced tables are read-only in Lakebase. This writes to a
 * local properties overlay table instead.
 * @param {string} tableName - Table to update
 * @param {string} entityIdColumn - Column name for entity ID
 * @param {string} entityId - The entity's ID value
 * @param {object} properties - JSON object with properties to merge
 */
async function updateEntityProperties(tableName, entityIdColumn, entityId, properties) {
  const p = initPool();
  const safeId = escapeSqlLiteral(entityId);

  // Read existing properties from the source synced table
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

  // Synced tables are read-only — store properties in a local overlay table.
  // Create the overlay table if it doesn't exist.
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

/**
 * Set display name for an entity
 */
async function setEntityName(tableName, entityIdColumn, entityId, displayName) {
  return updateEntityProperties(tableName, entityIdColumn, entityId, {
    display_name: displayName,
  });
}

/**
 * Get entity with parsed properties
 */
async function getEntityWithProperties(tableName, entityIdColumn, entityId) {
  const safeId = escapeSqlLiteral(entityId);
  const sql = `
    SELECT * FROM ${getTableName(tableName)}
    WHERE ${entityIdColumn} = '${safeId}'
    LIMIT 1
  `;
  const results = await executeQuery(sql);

  if (results.length === 0) return null;

  const entity = results[0];

  // Try to load overlay properties
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
    // Overlay table may not exist yet — that's OK
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

/**
 * Get unique locations from location events
 */
async function getUniqueLocations(limit = 50) {
  const sql = `
    SELECT DISTINCT h3_cell, city, state,
           AVG(latitude) as latitude, AVG(longitude) as longitude
    FROM ${getTableName('location_events_silver')}
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
    GROUP BY h3_cell, city, state
    LIMIT ${limit}
  `;
  return executeQuery(sql);
}

/**
 * List all tables in the schema
 */
async function listTables() {
  const sql = `
    SELECT table_name as tableName, table_schema as database, 'false' as isTemporary
    FROM information_schema.tables
    WHERE table_schema = '${escapeSqlLiteral(SCHEMA)}'
    ORDER BY table_name
  `;
  return executeQuery(sql);
}

/**
 * Describe a table's schema
 */
async function describeTable(tableName) {
  const sql = `
    SELECT column_name as col_name, data_type as data_type,
           CASE WHEN is_nullable = 'YES' THEN 'true' ELSE 'false' END as nullable
    FROM information_schema.columns
    WHERE table_schema = '${escapeSqlLiteral(SCHEMA)}'
      AND table_name = '${escapeSqlLiteral(tableName)}'
    ORDER BY ordinal_position
  `;
  return executeQuery(sql);
}

/**
 * Close the connection pool
 */
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
  // Entity property management (for naming entities)
  updateEntityProperties,
  setEntityName,
  getEntityWithProperties,
  CATALOG,
  SCHEMA,
  // Postgres-specific exports
  getTableName,
};
