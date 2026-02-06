/**
 * Databricks SQL Connector for Unity Catalog
 * Queries tables in pubsec_geo_law.demo schema
 */

const { DBSQLClient } = require('@databricks/sql');
const logger = require('../utils/logger');

// Unity Catalog configuration
const CATALOG = process.env.DATABRICKS_CATALOG || 'pubsec_geo_law';
const SCHEMA = process.env.DATABRICKS_SCHEMA || 'demo';

let client = null;
let session = null;
let sessionCreatedAt = null;

// Session TTL: 8 hours (conservative - Databricks sessions typically expire after 8-24 hours)
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

function escapeSqlLiteral(value) {
  return String(value).replace(/'/g, "''");
}

/**
 * Check if the current session is stale and should be reconnected
 */
function isSessionStale() {
  if (!session || !sessionCreatedAt) return true;
  const age = Date.now() - sessionCreatedAt;
  return age > SESSION_MAX_AGE_MS;
}

/**
 * Force close and clear the current session (for reconnection)
 */
async function clearSession() {
  const hadSession = !!session;
  try {
    if (session) {
      await session.close().catch(() => {}); // Ignore errors on stale session close
    }
    if (client) {
      await client.close().catch(() => {}); // Ignore errors on stale client close
    }
  } catch {
    // Ignore cleanup errors
  }
  session = null;
  client = null;
  sessionCreatedAt = null;
  if (hadSession) {
    logger.info({ type: 'databricks_session', status: 'cleared', reason: 'stale_or_error' });
  }
}

/**
 * Initialize Databricks SQL connection
 * Supports multiple auth methods:
 * 1. DATABRICKS_TOKEN (PAT or Databricks Apps injected token)
 * 2. Service Principal (CLIENT_ID + CLIENT_SECRET)
 * 3. Databricks Apps native OAuth (when running in Databricks Apps)
 * 
 * @param {boolean} forceReconnect - Force a new connection even if one exists
 */
async function initDatabricks(forceReconnect = false) {
  // Check if we need to reconnect due to stale session
  if (isSessionStale() || forceReconnect) {
    await clearSession();
  }
  
  // Return existing valid session
  if (session) return session;

  const host = process.env.DATABRICKS_HOST;
  const path = process.env.DATABRICKS_HTTP_PATH;
  const token = process.env.DATABRICKS_TOKEN;
  const clientId = process.env.DATABRICKS_CLIENT_ID;
  const clientSecret = process.env.DATABRICKS_CLIENT_SECRET;

  // Databricks Apps environment detection
  const isDatabricksApp = !!process.env.DATABRICKS_APP_NAME;

  if (!host || !path) {
    logger.warn({
      type: 'databricks_init',
      status: 'skipped',
      reason: 'Missing DATABRICKS_HOST or DATABRICKS_HTTP_PATH',
    });
    return null;
  }

  // Determine authentication method
  let authOptions = {};
  let authMethod = 'none';

  if (token) {
    // Personal Access Token or Databricks Apps injected token
    authOptions = { token };
    authMethod = 'token';
  } else if (clientId && clientSecret) {
    // Service Principal OAuth (M2M)
    authOptions = {
      authType: 'databricks-oauth',
      oauthClientId: clientId,
      oauthClientSecret: clientSecret,
    };
    authMethod = 'service-principal';
  } else if (isDatabricksApp) {
    // Databricks Apps native OAuth - uses app's service principal automatically
    authOptions = {
      authType: 'databricks-oauth',
    };
    authMethod = 'databricks-apps-oauth';
  } else {
    logger.warn({
      type: 'databricks_init',
      status: 'skipped',
      reason: 'No authentication credentials provided',
    });
    return null;
  }

  try {
    client = new DBSQLClient();

    logger.info({
      type: 'databricks_init',
      status: 'connecting',
      authMethod,
      host,
      isDatabricksApp,
    });

    await client.connect({
      host,
      path,
      ...authOptions,
    });

    session = await client.openSession({
      initialCatalog: CATALOG,
      initialSchema: SCHEMA,
    });
    
    sessionCreatedAt = Date.now();

    logger.info({
      type: 'databricks_init',
      status: 'connected',
      catalog: CATALOG,
      schema: SCHEMA,
      host,
      authMethod,
    });

    return session;
  } catch (error) {
    logger.error({ type: 'databricks_init', status: 'failed', error: error.message, authMethod });
    // Clear any partial state on failure
    await clearSession();
    throw error;
  }
}

/**
 * Check if an error indicates a stale/expired session that should be retried
 */
function isRetryableError(error) {
  const msg = (error?.message || '').toLowerCase();
  return (
    msg.includes('session') ||
    msg.includes('expired') ||
    msg.includes('token') ||
    msg.includes('unauthorized') ||
    msg.includes('authentication') ||
    msg.includes('invalid') ||
    msg.includes('closed') ||
    msg.includes('timeout') ||
    msg.includes('connection') ||
    msg.includes('econnreset') ||
    msg.includes('enotfound') ||
    msg.includes('socket')
  );
}

/**
 * Execute a SQL query against Databricks
 * Automatically retries with a fresh session on connection/auth errors
 */
async function executeQuery(sql, params = []) {
  let lastError = null;
  const maxRetries = 2;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const sess = await initDatabricks(attempt > 0); // Force reconnect on retry
      if (!sess) {
        throw new Error('Databricks not connected');
      }

      const operation = await sess.executeStatement(sql, {
        runAsync: true,
        // Allow larger batches for complete data fetches
        // UI will paginate to load progressively
        maxRows: 100000,
      });

      const result = await operation.fetchAll();
      await operation.close();

      return result;
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries - 1 && isRetryableError(error)) {
        logger.warn({
          type: 'databricks_query',
          status: 'retry',
          attempt: attempt + 1,
          error: error.message,
          sql: sql.substring(0, 100),
        });
        // Clear the stale session before retry
        await clearSession();
        // Brief delay before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        logger.error({
          type: 'databricks_query',
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
 * Get table fully qualified name
 */
function getTableName(table) {
  return `${CATALOG}.${SCHEMA}.${table}`;
}

// ============== Query Functions ==============

/**
 * Get all cases from cases_silver table
 * @param {number} limit - Max rows (default 10000, no artificial truncation)
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
 * Note: Filtering by hour is done in application code, not SQL,
 * since time_bucket contains timestamp strings
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
 * @param {number} limit - Max rows (default 2000; table is slow at 5k+)
 */
async function getHandoffCandidates(limit = 2000) {
  const sql = `SELECT * FROM ${getTableName('handoff_candidates')} LIMIT ${limit}`;
  return executeQuery(sql);
}

/**
 * Run a custom SQL query (read-only for safety)
 */
async function runCustomQuery(sql) {
  // Basic SQL injection protection - only allow SELECT
  const normalized = sql.trim().toUpperCase();
  if (!normalized.startsWith('SELECT') && !normalized.startsWith('SHOW')) {
    throw new Error('Only SELECT queries are allowed');
  }
  return executeQuery(sql);
}

/**
 * Update entity properties (name, custom fields stored as JSON)
 * This allows naming entities without schema changes
 * @param {string} tableName - Table to update (e.g., 'suspect_rankings', 'cases_silver')
 * @param {string} entityIdColumn - Column name for entity ID (e.g., 'entity_id', 'case_id')
 * @param {string} entityId - The entity's ID value
 * @param {object} properties - JSON object with properties to merge
 */
async function updateEntityProperties(tableName, entityIdColumn, entityId, properties) {
  const sess = await initDatabricks();
  if (!sess) {
    throw new Error('Databricks not connected');
  }

  const safeId = escapeSqlLiteral(entityId);

  // Merge with existing properties if they exist
  const existingQuery = `
    SELECT properties FROM ${getTableName(tableName)} 
    WHERE ${entityIdColumn} = '${safeId}'
    LIMIT 1
  `;
  const existing = await executeQuery(existingQuery);

  let mergedProperties = properties;
  if (existing.length > 0 && existing[0].properties) {
    try {
      const existingProps = JSON.parse(existing[0].properties);
      mergedProperties = { ...existingProps, ...properties };
    } catch {
      // If parsing fails, just use the new properties
    }
  }

  const propsJson = JSON.stringify(mergedProperties).replace(/'/g, "''");

  const sql = `
    UPDATE ${getTableName(tableName)}
    SET properties = '${propsJson}'
    WHERE ${entityIdColumn} = '${safeId}'
  `;

  const operation = await sess.executeStatement(sql, {
    runAsync: true,
  });
  await operation.close();

  return mergedProperties;
}

/**
 * Set display name for an entity
 * @param {string} tableName - Table name
 * @param {string} entityIdColumn - ID column name
 * @param {string} entityId - Entity ID
 * @param {string} displayName - The display name to set
 */
async function setEntityName(tableName, entityIdColumn, entityId, displayName) {
  return updateEntityProperties(tableName, entityIdColumn, entityId, {
    display_name: displayName,
  });
}

/**
 * Get entity with parsed properties
 * @param {string} tableName - Table name
 * @param {string} entityIdColumn - ID column name
 * @param {string} entityId - Entity ID
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
  if (entity.properties) {
    try {
      entity.properties = JSON.parse(entity.properties);
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
  const sql = `SHOW TABLES IN ${CATALOG}.${SCHEMA}`;
  return executeQuery(sql);
}

/**
 * Describe a table's schema
 */
async function describeTable(tableName) {
  const sql = `DESCRIBE ${getTableName(tableName)}`;
  return executeQuery(sql);
}

/**
 * Close Databricks connection
 */
async function closeDatabricks() {
  if (session) {
    await session.close();
    session = null;
  }
  if (client) {
    await client.close();
    client = null;
  }
  sessionCreatedAt = null;
  logger.info({ type: 'databricks_close', status: 'closed' });
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
};
