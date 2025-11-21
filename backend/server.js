/**
 * Express Backend Server for Graph Database with Databricks Integration
 *
 * This server uses Databricks as the primary data store with SQLite as a fallback.
 * - Reads: Try Databricks first, fallback to SQLite if unavailable
 * - Writes: Try Databricks first, fallback to SQLite if unavailable
 * It provides a REST API for the React frontend to manage graph data.
 *
 * Setup:
 * 1. cd backend
 * 2. npm install
 * 3. Copy .env.example to .env and configure your credentials (optional)
 * 4. npm run seed (to initialize database)
 * 5. npm start
 */

const express = require('express');
const cors = require('cors');
const { DBSQLClient } = require('@databricks/sql');
const logger = require('./utils/logger');
const fs = require('fs');
require('dotenv').config();

const {
  initDatabase,
  createTables,
  getAllNodes,
  getAllEdges,
  getAllCases,
  getCaseById,
  insertNodes,
  insertEdges,
  insertCase,
  updateNodesStatus,
  updateEdgesStatus,
  updateCase,
  deleteCase,
  isDatabaseEmpty,
} = require('./db/database');

const { seedDatabase } = require('./db/seed');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;

    const logData = {
      type: 'request',
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      requestId,
    };

    // Add query params if present
    if (Object.keys(req.query).length > 0) {
      logData.query = req.query;
    }

    // Add body info for POST/PATCH requests
    if (req.body && Object.keys(req.body).length > 0) {
      if (req.body.nodes || req.body.edges) {
        logData.bodySize = {
          nodes: req.body.nodes?.length || 0,
          edges: req.body.edges?.length || 0,
        };
      }
    }

    logger.info(logData);
  });

  next();
});

// Serve static files from React app in production
const path = require('path');
if (process.env.NODE_ENV === 'production') {
  app.use(
    express.static(path.join(__dirname, '../dist'), {
      setHeaders: (res, filePath) => {
        // Prevent caching of HTML files to ensure users get latest frontend code
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      },
    })
  );
}

// Initialize database
let db;
try {
  db = initDatabase();
  logger.info({ type: 'database_init', status: 'initialized', database: 'SQLite' });

  // Check if database is empty, if so seed it
  if (isDatabaseEmpty(db)) {
    logger.info({ type: 'database_seed', status: 'seeding', reason: 'empty database' });
    db.close();
    seedDatabase(false);
    db = initDatabase();
  }
} catch (error) {
  logger.error({ type: 'database_init', status: 'failed', error: error.message });
  process.exit(1);
}

// Databricks Configuration - uses environment variables from Databricks Apps
const DATABRICKS_CONFIG = {
  host: process.env.DATABRICKS_HOST || 'e2-demo-west.cloud.databricks.com',
  path: process.env.DATABRICKS_HTTP_PATH || '/sql/1.0/warehouses/75fd8278393d07eb',
  clientId: process.env.DATABRICKS_CLIENT_ID,
  clientSecret: process.env.DATABRICKS_CLIENT_SECRET,
};

const DEFAULT_TABLE_NAME =
  process.env.DATABRICKS_TABLE || 'main.default.property_graph_entity_edges';

// Note: Databricks authentication now uses ONLY user OAuth tokens
// from X-Forwarded-Access-Token header (provided by Databricks Apps)

/**
 * Validate and sanitize table name to prevent SQL injection
 * Table names should be in format: catalog.schema.table or schema.table or table
 * Only allows alphanumeric, underscores, dots, and backticks
 */
function validateTableName(tableName) {
  if (!tableName) {
    return DEFAULT_TABLE_NAME;
  }

  // Remove any whitespace
  const trimmed = tableName.trim();

  // Check for valid table name pattern (catalog.schema.table or schema.table or table)
  // Allows alphanumeric, underscores, dots, and backticks for escaped identifiers
  const validPattern = /^[a-zA-Z0-9_`]+(\.[a-zA-Z0-9_`]+){0,2}$/;

  if (!validPattern.test(trimmed)) {
    throw new Error(
      'Invalid table name format. Use: catalog.schema.table or schema.table or table'
    );
  }

  return trimmed;
}

/**
 * Sanitize error messages for client responses
 * Keeps full details in server logs but sends clean messages to frontend
 */
function sanitizeErrorForClient(error) {
  if (!error) return null;

  const errorMessage = typeof error === 'string' ? error : error.message || 'Unknown error';
  const errorObj = typeof error === 'object' ? error : {};

  // Check for Databricks-specific error properties first
  if (errorObj.errorClass) {
    switch (errorObj.errorClass) {
      case 'TABLE_OR_VIEW_NOT_FOUND':
        return 'Database table not found';
      case 'SCHEMA_NOT_FOUND':
        return 'Database schema not found';
      case 'PARSE_SYNTAX_ERROR':
        return 'Invalid query syntax';
      default:
        return `Database error: ${errorObj.errorClass}`;
    }
  }

  // Check HTTP status codes
  if (errorObj.statusCode || errorObj.status) {
    const status = errorObj.statusCode || errorObj.status;
    switch (status) {
      case 401:
      case 403:
        return 'Databricks authentication failed';
      case 404:
        return 'Databricks resource not found';
      case 500:
        return 'Databricks server error';
      case 503:
        return 'Databricks service unavailable';
      default:
        return `Databricks error (HTTP ${status})`;
    }
  }

  // Detect common error types from message
  if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('connect')) {
    return 'Unable to connect to Databricks';
  }
  if (
    errorMessage.includes('authentication') ||
    errorMessage.includes('401') ||
    errorMessage.includes('403')
  ) {
    return 'Databricks authentication failed';
  }
  if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
    return 'Databricks connection timed out';
  }
  if (errorMessage.includes('not configured')) {
    return 'Databricks not configured';
  }
  if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('DNS')) {
    return 'Databricks host not found';
  }
  if (errorMessage.includes('table') && errorMessage.includes('not found')) {
    return 'Database table not found';
  }

  // Return a generic version of the message without internal details
  return errorMessage.split('\n')[0].substring(0, 150);
}

logger.info({
  type: 'server_config',
  environment: process.env.NODE_ENV || 'development',
  port: PORT,
  sqlite: 'enabled',
  databricks: {
    authMode: 'user_oauth_only',
    host: DATABRICKS_CONFIG.host,
    defaultTable: DEFAULT_TABLE_NAME,
    path: DATABRICKS_CONFIG.path,
    note: 'Requires X-Forwarded-Access-Token header from Databricks Apps',
  },
});

/**
 * Create a Databricks SQL connection using User OAuth ONLY
 * @param {string} userAccessToken - Required user access token from X-Forwarded-Access-Token header
 */
async function createDatabricksConnection(userAccessToken) {
  if (!userAccessToken) {
    throw new Error('User access token required - app must be accessed through Databricks Apps');
  }

  logger.databricks(logger.info.level, {
    operation: 'connection',
    status: 'attempting',
    host: DATABRICKS_CONFIG.host,
    path: DATABRICKS_CONFIG.path,
    authType: 'user_oauth',
  });

  try {
    const client = new DBSQLClient();

    // OAuth2: User's access token ONLY (from X-Forwarded-Access-Token header)
    // All operations execute with user's identity and permissions
    const connectionConfig = {
      host: DATABRICKS_CONFIG.host,
      path: DATABRICKS_CONFIG.path,
      token: userAccessToken,
    };

    const connection = await client.connect(connectionConfig);

    logger.databricks('INFO', {
      operation: 'connection',
      status: 'success',
      authType: 'user_oauth',
    });
    return connection;
  } catch (error) {
    const errorDetails = {
      operation: 'connection',
      status: 'failed',
      authType: 'user_oauth',
      error: error.message,
      errorType: error.constructor.name,
      statusCode: error.statusCode,
      errorCode: error.code,
      sqlState: error.sqlState,
      errorClass: error.errorClass,
    };

    // Add helpful context for permission errors
    if (error.statusCode === 403 || error.message?.includes('403')) {
      errorDetails.hint =
        'User does not have permission to access SQL Warehouse. Grant CAN USE permission to the user.';
      errorDetails.grantCommand = `GRANT USE ON WAREHOUSE \`Shared Endpoint\` TO \`user@example.com\`;`;
    }

    logger.databricks('ERROR', errorDetails);
    throw error;
  }
}

/**
 * Read graph data from Databricks using user's OAuth token
 * @param {string} userAccessToken - Required user access token
 * @param {string} tableName - Table name to query
 */
async function readFromDatabricks(userAccessToken, tableName) {
  let connection;

  try {
    connection = await createDatabricksConnection(userAccessToken);
    const session = await connection.openSession();

    const query = `SELECT * FROM ${tableName}`;
    const queryOperation = await session.executeStatement(query, {
      runAsync: false,
    });

    const result = await queryOperation.fetchAll();
    await queryOperation.close();
    await session.close();

    // Transform Databricks result into nodes and edges
    const nodesMap = new Map();
    const edges = [];

    result.forEach((row) => {
      // Parse properties safely
      let startProps = {};
      let endProps = {};
      try {
        startProps = JSON.parse(row.node_start_properties || '{}');
      } catch (e) {
        console.warn(`Failed to parse node_start_properties for ${row.node_start_id}:`, e.message);
      }
      try {
        endProps = JSON.parse(row.node_end_properties || '{}');
      } catch (e) {
        console.warn(`Failed to parse node_end_properties for ${row.node_end_id}:`, e.message);
      }

      // Add source node (use node_start_key as the type, which appears to be the entity type)
      if (!nodesMap.has(row.node_start_id)) {
        // Extract label from properties or fallback to ID
        const label = startProps._label || startProps.label || row.node_start_id;
        // Remove _label from properties if it exists (it's metadata, not a real property)
        const { _label, ...nodeProps } = startProps;

        nodesMap.set(row.node_start_id, {
          id: row.node_start_id,
          label: label,
          type: row.node_start_key || 'Unknown', // node_start_key is the entity type (e.g., "Customer")
          properties: nodeProps,
          status: 'existing',
        });
      }

      // Add target node (use node_end_key as the type)
      if (!nodesMap.has(row.node_end_id)) {
        // Extract label from properties or fallback to ID
        const label = endProps._label || endProps.label || row.node_end_id;
        // Remove _label from properties if it exists (it's metadata, not a real property)
        const { _label, ...nodeProps } = endProps;

        nodesMap.set(row.node_end_id, {
          id: row.node_end_id,
          label: label,
          type: row.node_end_key || 'Unknown', // node_end_key is the entity type (e.g., "Account")
          properties: nodeProps,
          status: 'existing',
        });
      }

      // Add edge
      edges.push({
        id: `edge_${row.node_start_id}_${row.node_end_id}_${row.relationship}`,
        source: row.node_start_id,
        target: row.node_end_id,
        relationshipType: row.relationship,
        properties: {},
        status: 'existing',
      });
    });

    const nodes = Array.from(nodesMap.values());
    logger.databricks('INFO', {
      operation: 'read',
      status: 'success',
      nodeCount: nodes.length,
      edgeCount: edges.length,
    });

    return { nodes, edges };
  } catch (error) {
    logger.databricks('ERROR', {
      operation: 'read',
      status: 'failed',
      query: `SELECT * FROM ${tableName}`,
      error: error.message,
      errorType: error.constructor.name,
      statusCode: error.statusCode,
      errorCode: error.code,
      sqlState: error.sqlState,
      errorClass: error.errorClass,
    });
    throw error;
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (closeError) {
        console.error('Error closing Databricks connection:', closeError);
      }
    }
  }
}

/**
 * Write nodes and edges to Databricks using user's OAuth token
 * @param {Array} nodes - Nodes to write
 * @param {Array} edges - Edges to write
 * @param {string} userAccessToken - Required user access token
 * @param {string} tableName - Table name to write to
 */
async function writeToDatabricks(nodes, edges, userAccessToken, tableName) {
  let connection;

  try {
    connection = await createDatabricksConnection(userAccessToken);
    const session = await connection.openSession();

    // For each edge, insert a row into the table with both nodes
    for (const edge of edges) {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      const targetNode = nodes.find((n) => n.id === edge.target);

      if (!sourceNode || !targetNode) {
        console.warn(`Skipping edge ${edge.id} - missing source or target node`);
        continue;
      }

      // Include label in properties for storage (using _label to avoid conflicts)
      const sourceProps = { ...sourceNode.properties, _label: sourceNode.label };
      const targetProps = { ...targetNode.properties, _label: targetNode.label };

      const query = `
        INSERT INTO ${tableName} (
          node_start_id,
          node_start_key,
          relationship,
          node_end_id,
          node_end_key,
          node_start_properties,
          node_end_properties
        ) VALUES (
          '${sourceNode.id}',
          '${sourceNode.type}',
          '${edge.relationshipType}',
          '${targetNode.id}',
          '${targetNode.type}',
          '${JSON.stringify(sourceProps).replace(/'/g, "''")}',
          '${JSON.stringify(targetProps).replace(/'/g, "''")}'
        )
      `;

      const queryOperation = await session.executeStatement(query, {
        runAsync: false,
      });
      await queryOperation.close();
    }

    await session.close();
    logger.databricks('INFO', {
      operation: 'write',
      status: 'success',
      nodeCount: nodes.length,
      edgeCount: edges.length,
    });

    return {
      success: true,
      target: 'databricks',
    };
  } catch (error) {
    logger.databricks('ERROR', {
      operation: 'write',
      status: 'failed',
      table: tableName,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      error: error.message,
      errorType: error.constructor.name,
      statusCode: error.statusCode,
      errorCode: error.code,
      sqlState: error.sqlState,
      errorClass: error.errorClass,
    });
    throw error;
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (closeError) {
        console.error('Error closing Databricks connection:', closeError);
      }
    }
  }
}

/**
 * GET /api/graph
 * Fetch graph data - tries Databricks first, falls back to SQLite
 * Uses user's access token if available (X-Forwarded-Access-Token header)
 * Accepts optional tableName query parameter
 */
app.get('/api/graph', async (req, res) => {
  const startTime = Date.now();
  let nodes, edges;
  let source = 'SQLite';
  let databricksError = null;

  // Extract table name from query parameter
  let tableName;
  try {
    tableName = validateTableName(req.query.tableName);
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }

  // Extract user's access token from Databricks Apps header
  const userAccessToken = req.headers['x-forwarded-access-token'];
  const userEmail = req.headers['x-forwarded-email'];

  if (userAccessToken) {
    logger.info({
      type: 'user_auth',
      endpoint: 'GET /api/graph',
      email: userEmail,
      hasToken: true,
      tokenLength: userAccessToken.length,
      tokenPrefix: userAccessToken.substring(0, 10) + '...',
      tableName,
    });
  } else {
    logger.info({
      type: 'user_auth',
      endpoint: 'GET /api/graph',
      email: userEmail,
      hasToken: false,
      tableName,
      availableHeaders: Object.keys(req.headers).filter((h) => h.startsWith('x-forwarded')),
    });
  }

  try {
    // Try Databricks only if user token is available
    if (userAccessToken) {
      try {
        const data = await readFromDatabricks(userAccessToken, tableName);
        nodes = data.nodes;
        edges = data.edges;
        source = 'Databricks (user auth)';
      } catch (dbError) {
        databricksError = dbError.message;
        logger.warn({
          type: 'api_fallback',
          endpoint: 'GET /api/graph',
          reason: 'databricks_failed',
          error: sanitizeErrorForClient(dbError),
          tableName,
        });

        // Fall back to SQLite
        nodes = getAllNodes(db);
        edges = getAllEdges(db);
        source = 'SQLite (fallback)';
      }
    } else {
      nodes = getAllNodes(db);
      edges = getAllEdges(db);
    }

    const duration = Date.now() - startTime;
    logger.info({
      type: 'api_success',
      method: 'GET',
      endpoint: '/api/graph',
      source,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      duration,
    });

    res.json({
      success: true,
      source,
      userAuth: !!userAccessToken,
      databricksError: sanitizeErrorForClient(databricksError),
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      nodes,
      edges,
      metadata: {
        source,
        userAuth: !!userAccessToken,
        databricksEnabled: !!userAccessToken,
        databricksError: sanitizeErrorForClient(databricksError),
        timestamp: new Date().toISOString(),
        duration: `${duration}ms`,
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error({
      type: 'api_error',
      method: 'GET',
      endpoint: '/api/graph',
      error: error.message,
      duration,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to fetch graph data',
      message: sanitizeErrorForClient(error),
      source: 'error',
      userAuth: !!userAccessToken,
      databricksError: sanitizeErrorForClient(databricksError || error),
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      metadata: {
        source: 'error',
        userAuth: !!userAccessToken,
        databricksEnabled: !!userAccessToken,
        databricksError: sanitizeErrorForClient(databricksError || error),
        timestamp: new Date().toISOString(),
        duration: `${duration}ms`,
      },
    });
  }
});

/**
 * POST /api/graph
 * Write new nodes and edges to database
 * Tries Databricks first, falls back to SQLite on failure
 * Uses user's access token if available (X-Forwarded-Access-Token header)
 * Accepts optional tableName query parameter
 */
app.post('/api/graph', async (req, res) => {
  const { nodes, edges } = req.body;

  if (!nodes || !edges) {
    return res.status(400).json({
      success: false,
      message: 'Missing nodes or edges in request body',
    });
  }

  if (nodes.length === 0 && edges.length === 0) {
    return res.json({
      success: true,
      message: 'No new changes to write',
      writtenNodes: 0,
      writtenEdges: 0,
    });
  }

  // Extract table name from query parameter
  let tableName;
  try {
    tableName = validateTableName(req.query.tableName);
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }

  const startTime = Date.now();
  let target = 'SQLite';
  let writeError = null;

  // Extract user's access token from Databricks Apps header
  const userAccessToken = req.headers['x-forwarded-access-token'];
  const userEmail = req.headers['x-forwarded-email'];

  if (userAccessToken) {
    logger.info({
      type: 'user_auth',
      endpoint: 'POST /api/graph',
      email: userEmail,
      hasToken: true,
      tokenLength: userAccessToken.length,
      tokenPrefix: userAccessToken.substring(0, 10) + '...',
      tableName,
    });
  } else {
    logger.info({
      type: 'user_auth',
      endpoint: 'POST /api/graph',
      email: userEmail,
      hasToken: false,
      tableName,
      availableHeaders: Object.keys(req.headers).filter((h) => h.startsWith('x-forwarded')),
    });
  }

  try {
    // Try writing to Databricks only if user token is available
    if (userAccessToken) {
      try {
        await writeToDatabricks(nodes, edges, userAccessToken, tableName);
        target = 'Databricks (user auth)';
      } catch (error) {
        writeError = error.message;
        logger.warn({
          type: 'api_fallback',
          endpoint: 'POST /api/graph',
          reason: 'databricks_failed',
          error: sanitizeErrorForClient(error),
          tableName,
        });

        // Fall back to SQLite
        insertNodes(db, nodes);
        insertEdges(db, edges);
        target = 'SQLite (fallback)';
      }
    } else {
      insertNodes(db, nodes);
      insertEdges(db, edges);
    }

    const totalDuration = Date.now() - startTime;
    const sanitizedError = sanitizeErrorForClient(writeError);
    const message = writeError
      ? `Wrote ${nodes.length} nodes and ${edges.length} edges to ${target} (Databricks unavailable: ${sanitizedError})`
      : `Wrote ${nodes.length} nodes and ${edges.length} edges to ${target}`;

    logger.info({
      type: 'api_success',
      method: 'POST',
      endpoint: '/api/graph',
      target,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      duration: totalDuration,
    });

    res.json({
      success: true,
      message,
      source: target,
      userAuth: !!userAccessToken,
      databricksError: sanitizedError,
      timestamp: new Date().toISOString(),
      duration: `${totalDuration}ms`,
      target,
      jobId: `job_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      writtenNodes: nodes.length,
      writtenEdges: edges.length,
      metadata: {
        source: target,
        userAuth: !!userAccessToken,
        databricksEnabled: !!userAccessToken,
        databricksError: sanitizedError,
        timestamp: new Date().toISOString(),
        duration: `${totalDuration}ms`,
      },
    });
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    logger.error({
      type: 'api_error',
      method: 'POST',
      endpoint: '/api/graph',
      error: error.message,
      duration: totalDuration,
    });

    res.status(500).json({
      success: false,
      message: `Failed to write to database: ${sanitizeErrorForClient(error)}`,
      source: 'error',
      userAuth: !!userAccessToken,
      databricksError: sanitizeErrorForClient(writeError || error),
      timestamp: new Date().toISOString(),
      duration: `${totalDuration}ms`,
      metadata: {
        source: 'error',
        userAuth: !!userAccessToken,
        databricksEnabled: !!userAccessToken,
        databricksError: sanitizeErrorForClient(writeError || error),
        timestamp: new Date().toISOString(),
        duration: `${totalDuration}ms`,
      },
    });
  }
});

/**
 * PATCH /api/graph/status
 * Update status of nodes and edges (e.g., from 'new' to 'existing')
 *
 * IMPORTANT: This endpoint is DEPRECATED and SQLite-only.
 * - Status is frontend UI state only (to show "proposed" vs "existing" nodes)
 * - Databricks table does NOT have a status column
 * - Status should be managed in frontend state, not persisted to Databricks
 * - This endpoint only exists for local SQLite persistence between sessions
 */
app.patch('/api/graph/status', async (req, res) => {
  const { nodeIds, edgeIds, status } = req.body;
  const startTime = Date.now();

  // Extract user's access token from Databricks Apps header
  const userAccessToken = req.headers['x-forwarded-access-token'];

  if (!status) {
    return res.status(400).json({
      success: false,
      message: 'Missing status in request body',
      source: 'error',
      userAuth: !!userAccessToken,
      databricksEnabled: !!userAccessToken,
      databricksError: null,
      timestamp: new Date().toISOString(),
      duration: '0ms',
    });
  }

  try {
    // Note: Status updates are SQLite-only
    // Databricks table structure doesn't include status field
    if (nodeIds && nodeIds.length > 0) {
      updateNodesStatus(db, nodeIds, status);
    }

    if (edgeIds && edgeIds.length > 0) {
      updateEdgesStatus(db, edgeIds, status);
    }

    const totalDuration = Date.now() - startTime;
    logger.info({
      type: 'api_success',
      method: 'PATCH',
      endpoint: '/api/graph/status',
      status,
      nodeCount: nodeIds?.length || 0,
      edgeCount: edgeIds?.length || 0,
      duration: totalDuration,
    });

    res.json({
      success: true,
      message: `Updated ${(nodeIds?.length || 0) + (edgeIds?.length || 0)} items to status: ${status}`,
      source: 'SQLite',
      userAuth: !!userAccessToken,
      databricksEnabled: !!userAccessToken,
      databricksError: null,
      timestamp: new Date().toISOString(),
      duration: `${totalDuration}ms`,
      updatedNodes: nodeIds?.length || 0,
      updatedEdges: edgeIds?.length || 0,
      metadata: {
        source: 'SQLite',
        userAuth: !!userAccessToken,
        databricksEnabled: !!userAccessToken,
        databricksError: null,
        timestamp: new Date().toISOString(),
        duration: `${totalDuration}ms`,
      },
    });
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    logger.error({
      type: 'api_error',
      method: 'PATCH',
      endpoint: '/api/graph/status',
      error: error.message,
      duration: totalDuration,
    });

    res.status(500).json({
      success: false,
      message: `Failed to update status: ${sanitizeErrorForClient(error)}`,
      source: 'error',
      userAuth: !!userAccessToken,
      databricksEnabled: !!userAccessToken,
      databricksError: null,
      timestamp: new Date().toISOString(),
      duration: `${totalDuration}ms`,
      metadata: {
        source: 'error',
        userAuth: !!userAccessToken,
        databricksEnabled: !!userAccessToken,
        databricksError: null,
        timestamp: new Date().toISOString(),
        duration: `${totalDuration}ms`,
      },
    });
  }
});

/**
 * POST /api/graph/seed
 * Reseed the database with mock data
 */
app.post('/api/graph/seed', async (req, res) => {
  const startTime = Date.now();

  // Extract user's access token from Databricks Apps header
  const userAccessToken = req.headers['x-forwarded-access-token'];

  try {
    // Close current connection
    db.close();

    // Reseed
    seedDatabase(true);

    // Reinitialize connection
    db = initDatabase();

    const nodes = getAllNodes(db);
    const edges = getAllEdges(db);

    const totalDuration = Date.now() - startTime;
    logger.info({
      type: 'api_success',
      method: 'POST',
      endpoint: '/api/graph/seed',
      nodeCount: nodes.length,
      edgeCount: edges.length,
      duration: totalDuration,
    });

    res.json({
      success: true,
      message: 'Database reseeded successfully',
      source: 'SQLite',
      userAuth: !!userAccessToken,
      databricksEnabled: !!userAccessToken,
      databricksError: null,
      timestamp: new Date().toISOString(),
      duration: `${totalDuration}ms`,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      metadata: {
        source: 'SQLite',
        userAuth: !!userAccessToken,
        databricksEnabled: !!userAccessToken,
        databricksError: null,
        timestamp: new Date().toISOString(),
        duration: `${totalDuration}ms`,
      },
    });
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    logger.error({
      type: 'api_error',
      method: 'POST',
      endpoint: '/api/graph/seed',
      error: error.message,
      duration: totalDuration,
    });

    res.status(500).json({
      success: false,
      message: `Failed to reseed database: ${sanitizeErrorForClient(error)}`,
      source: 'error',
      userAuth: !!userAccessToken,
      databricksEnabled: !!userAccessToken,
      databricksError: null,
      timestamp: new Date().toISOString(),
      duration: `${totalDuration}ms`,
      metadata: {
        source: 'error',
        userAuth: !!userAccessToken,
        databricksEnabled: !!userAccessToken,
        databricksError: null,
        timestamp: new Date().toISOString(),
        duration: `${totalDuration}ms`,
      },
    });
  }
});

/**
 * DELETE /api/graph/node/:nodeId
 * Delete a node and its connected edges from the database
 * Tries Databricks first, falls back to SQLite
 */
app.delete('/api/graph/node/:nodeId', async (req, res) => {
  const { nodeId } = req.params;
  const startTime = Date.now();
  let target = 'SQLite';
  let deleteError = null;

  // Extract user's access token from Databricks Apps header
  const userAccessToken = req.headers['x-forwarded-access-token'];

  // Extract table name from query parameter
  let tableName;
  try {
    tableName = validateTableName(req.query.tableName);
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }

  try {
    // Try deleting from Databricks only if user token is available
    if (userAccessToken) {
      try {
        let connection = await createDatabricksConnection(userAccessToken);
        const session = await connection.openSession();

        // Delete edges connected to this node first
        const deleteEdgesQuery = `
          DELETE FROM ${tableName}
          WHERE node_start_id = '${nodeId}' OR node_end_id = '${nodeId}'
        `;
        const deleteEdgesOp = await session.executeStatement(deleteEdgesQuery, {
          runAsync: false,
        });
        await deleteEdgesOp.close();

        await session.close();
        await connection.close();
        target = 'Databricks (user auth)';
      } catch (error) {
        deleteError = error.message;
        logger.warn({
          type: 'api_fallback',
          endpoint: 'DELETE /api/graph/node',
          reason: 'databricks_failed',
          error: sanitizeErrorForClient(error),
          tableName,
        });
      }
    }

    // Also delete from SQLite (either as fallback or as primary)
    // Delete connected edges first
    const deleteEdgesStmt = db.prepare('DELETE FROM edges WHERE source = ? OR target = ?');
    deleteEdgesStmt.run(nodeId, nodeId);

    // Delete the node
    const deleteNodeStmt = db.prepare('DELETE FROM nodes WHERE id = ?');
    const result = deleteNodeStmt.run(nodeId);

    if (!userAccessToken) {
      target = 'SQLite';
    } else if (deleteError) {
      target = 'SQLite (fallback)';
    }

    const totalDuration = Date.now() - startTime;
    const sanitizedError = sanitizeErrorForClient(deleteError);
    const message = deleteError
      ? `Deleted node ${nodeId} from ${target} (Databricks unavailable: ${sanitizedError})`
      : `Deleted node ${nodeId} from ${target}`;

    logger.info({
      type: 'api_success',
      method: 'DELETE',
      endpoint: '/api/graph/node',
      target,
      nodeId,
      duration: totalDuration,
    });

    res.json({
      success: true,
      message,
      target,
      nodeId,
      deleted: result.changes > 0,
      userAuth: !!userAccessToken,
      databricksError: sanitizedError,
      timestamp: new Date().toISOString(),
      duration: `${totalDuration}ms`,
    });
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    logger.error({
      type: 'api_error',
      method: 'DELETE',
      endpoint: '/api/graph/node',
      error: error.message,
      duration: totalDuration,
    });

    res.status(500).json({
      success: false,
      message: `Failed to delete node: ${sanitizeErrorForClient(error)}`,
      userAuth: !!userAccessToken,
      databricksError: sanitizeErrorForClient(deleteError || error),
      timestamp: new Date().toISOString(),
      duration: `${totalDuration}ms`,
    });
  }
});

/**
 * DELETE /api/graph/edge/:edgeId
 * Delete an edge from the database
 * Tries Databricks first, falls back to SQLite
 */
app.delete('/api/graph/edge/:edgeId', async (req, res) => {
  const { edgeId } = req.params;
  const startTime = Date.now();
  let target = 'SQLite';
  let deleteError = null;

  // Extract user's access token from Databricks Apps header
  const userAccessToken = req.headers['x-forwarded-access-token'];

  // Extract table name from query parameter
  let tableName;
  try {
    tableName = validateTableName(req.query.tableName);
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }

  try {
    // Get edge details from SQLite first to identify it in Databricks
    const edge = db.prepare('SELECT * FROM edges WHERE id = ?').get(edgeId);

    if (!edge) {
      return res.status(404).json({
        success: false,
        message: `Edge ${edgeId} not found`,
        timestamp: new Date().toISOString(),
      });
    }

    // Try deleting from Databricks only if user token is available
    if (userAccessToken) {
      try {
        let connection = await createDatabricksConnection(userAccessToken);
        const session = await connection.openSession();

        // Delete edge from Databricks
        // Note: Databricks edge table doesn't have an 'id' column,
        // so we need to match by node_start_id, node_end_id, and relationship
        const deleteEdgeQuery = `
          DELETE FROM ${tableName}
          WHERE node_start_id = '${edge.source}'
            AND node_end_id = '${edge.target}'
            AND relationship = '${edge.relationshipType}'
        `;
        const deleteEdgeOp = await session.executeStatement(deleteEdgeQuery, {
          runAsync: false,
        });
        await deleteEdgeOp.close();

        await session.close();
        await connection.close();
        target = 'Databricks (user auth)';
      } catch (error) {
        deleteError = error.message;
        logger.warn({
          type: 'api_fallback',
          endpoint: 'DELETE /api/graph/edge',
          reason: 'databricks_failed',
          error: sanitizeErrorForClient(error),
          tableName,
        });
      }
    }

    // Also delete from SQLite (either as fallback or as primary)
    const deleteEdgeStmt = db.prepare('DELETE FROM edges WHERE id = ?');
    const result = deleteEdgeStmt.run(edgeId);

    if (!userAccessToken) {
      target = 'SQLite';
    } else if (deleteError) {
      target = 'SQLite (fallback)';
    }

    const totalDuration = Date.now() - startTime;
    const sanitizedError = sanitizeErrorForClient(deleteError);
    const message = deleteError
      ? `Deleted edge ${edgeId} from ${target} (Databricks unavailable: ${sanitizedError})`
      : `Deleted edge ${edgeId} from ${target}`;

    logger.info({
      type: 'api_success',
      method: 'DELETE',
      endpoint: '/api/graph/edge',
      target,
      edgeId,
      duration: totalDuration,
    });

    res.json({
      success: true,
      message,
      target,
      edgeId,
      deleted: result.changes > 0,
      userAuth: !!userAccessToken,
      databricksError: sanitizedError,
      timestamp: new Date().toISOString(),
      duration: `${totalDuration}ms`,
    });
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    logger.error({
      type: 'api_error',
      method: 'DELETE',
      endpoint: '/api/graph/edge',
      error: error.message,
      duration: totalDuration,
    });

    res.status(500).json({
      success: false,
      message: `Failed to delete edge: ${sanitizeErrorForClient(error)}`,
      userAuth: !!userAccessToken,
      databricksError: sanitizeErrorForClient(deleteError || error),
      timestamp: new Date().toISOString(),
      duration: `${totalDuration}ms`,
    });
  }
});

/**
 * GET /api/job/:jobId
 * Check job status (simplified for demo)
 */
app.get('/api/job/:jobId', (req, res) => {
  const { jobId } = req.params;

  res.json({
    jobId,
    status: 'SUCCESS',
    message: 'Write operation completed successfully',
  });
});

/**
 * GET /api/cases
 * Fetch all cases from database
 */
app.get('/api/cases', async (req, res) => {
  const startTime = Date.now();
  const userAccessToken = req.headers['x-forwarded-access-token'];

  try {
    const cases = getAllCases(db);
    const duration = Date.now() - startTime;

    logger.info({
      type: 'api_success',
      method: 'GET',
      endpoint: '/api/cases',
      caseCount: cases.length,
      duration,
    });

    res.json({
      success: true,
      source: 'SQLite',
      userAuth: !!userAccessToken,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      cases,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error({
      type: 'api_error',
      method: 'GET',
      endpoint: '/api/cases',
      error: error.message,
      duration,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to fetch cases',
      message: sanitizeErrorForClient(error),
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
    });
  }
});

/**
 * GET /api/cases/:caseId
 * Fetch a single case by ID
 */
app.get('/api/cases/:caseId', async (req, res) => {
  const { caseId } = req.params;
  const startTime = Date.now();
  const userAccessToken = req.headers['x-forwarded-access-token'];

  try {
    const caseData = getCaseById(db, caseId);
    
    if (!caseData) {
      return res.status(404).json({
        success: false,
        error: `Case ${caseId} not found`,
        timestamp: new Date().toISOString(),
      });
    }

    const duration = Date.now() - startTime;

    logger.info({
      type: 'api_success',
      method: 'GET',
      endpoint: '/api/cases/:caseId',
      caseId,
      duration,
    });

    res.json({
      success: true,
      source: 'SQLite',
      userAuth: !!userAccessToken,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      case: caseData,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error({
      type: 'api_error',
      method: 'GET',
      endpoint: '/api/cases/:caseId',
      error: error.message,
      duration,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to fetch case',
      message: sanitizeErrorForClient(error),
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
    });
  }
});

/**
 * POST /api/cases
 * Create a new case
 */
app.post('/api/cases', async (req, res) => {
  const caseData = req.body;
  const startTime = Date.now();
  const userAccessToken = req.headers['x-forwarded-access-token'];

  if (!caseData || !caseData.id) {
    return res.status(400).json({
      success: false,
      message: 'Missing case data or case ID in request body',
      timestamp: new Date().toISOString(),
    });
  }

  try {
    insertCase(db, caseData);

    const duration = Date.now() - startTime;
    logger.info({
      type: 'api_success',
      method: 'POST',
      endpoint: '/api/cases',
      caseId: caseData.id,
      duration,
    });

    res.json({
      success: true,
      message: `Created case ${caseData.caseNumber}`,
      source: 'SQLite',
      userAuth: !!userAccessToken,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      case: caseData,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error({
      type: 'api_error',
      method: 'POST',
      endpoint: '/api/cases',
      error: error.message,
      duration,
    });

    res.status(500).json({
      success: false,
      message: `Failed to create case: ${sanitizeErrorForClient(error)}`,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
    });
  }
});

/**
 * PATCH /api/cases/:caseId
 * Update an existing case
 */
app.patch('/api/cases/:caseId', async (req, res) => {
  const { caseId } = req.params;
  const updates = req.body;
  const startTime = Date.now();
  const userAccessToken = req.headers['x-forwarded-access-token'];

  if (!updates || Object.keys(updates).length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No updates provided in request body',
      timestamp: new Date().toISOString(),
    });
  }

  try {
    // Check if case exists
    const existingCase = getCaseById(db, caseId);
    if (!existingCase) {
      return res.status(404).json({
        success: false,
        error: `Case ${caseId} not found`,
        timestamp: new Date().toISOString(),
      });
    }

    updateCase(db, caseId, updates);

    const duration = Date.now() - startTime;
    logger.info({
      type: 'api_success',
      method: 'PATCH',
      endpoint: '/api/cases/:caseId',
      caseId,
      duration,
    });

    res.json({
      success: true,
      message: `Updated case ${caseId}`,
      source: 'SQLite',
      userAuth: !!userAccessToken,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error({
      type: 'api_error',
      method: 'PATCH',
      endpoint: '/api/cases/:caseId',
      error: error.message,
      duration,
    });

    res.status(500).json({
      success: false,
      message: `Failed to update case: ${sanitizeErrorForClient(error)}`,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
    });
  }
});

/**
 * DELETE /api/cases/:caseId
 * Delete a case
 */
app.delete('/api/cases/:caseId', async (req, res) => {
  const { caseId } = req.params;
  const startTime = Date.now();
  const userAccessToken = req.headers['x-forwarded-access-token'];

  try {
    const deleted = deleteCase(db, caseId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: `Case ${caseId} not found`,
        timestamp: new Date().toISOString(),
      });
    }

    const duration = Date.now() - startTime;
    logger.info({
      type: 'api_success',
      method: 'DELETE',
      endpoint: '/api/cases/:caseId',
      caseId,
      duration,
    });

    res.json({
      success: true,
      message: `Deleted case ${caseId}`,
      source: 'SQLite',
      userAuth: !!userAccessToken,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error({
      type: 'api_error',
      method: 'DELETE',
      endpoint: '/api/cases/:caseId',
      error: error.message,
      duration,
    });

    res.status(500).json({
      success: false,
      message: `Failed to delete case: ${sanitizeErrorForClient(error)}`,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
    });
  }
});

/**
 * GET /api/documents
 * List all available PDF and HTML documents from scrapers
 */
app.get('/api/documents', (req, res) => {
  try {
    const scrapersDir = path.join(__dirname, '../scrapers/data/reports');
    const files = [];

    if (!fs.existsSync(scrapersDir)) {
      return res.json({ files: [] });
    }

    function scanDirectory(dir, relativePath = '') {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativeFilePath = path.join(relativePath, entry.name);

        if (entry.isDirectory()) {
          scanDirectory(fullPath, relativeFilePath);
        } else if (entry.isFile()) {
          const ext = entry.name.toLowerCase();
          if (ext.endsWith('.pdf') || ext.endsWith('.html')) {
            const stats = fs.statSync(fullPath);
            const source = relativePath.split(path.sep)[0] || 'unknown';
            const type = ext.endsWith('.pdf') ? 'pdf' : 'html';

            files.push({
              name: entry.name,
              path: relativeFilePath.replace(/\\/g, '/'), // Normalize path separators
              source: source,
              type: type,
              size: stats.size,
              date: stats.mtime.toISOString(),
            });
          }
        }
      }
    }

    scanDirectory(scrapersDir);

    res.json({
      success: true,
      files: files.sort((a, b) => b.date.localeCompare(a.date)),
      count: files.length,
    });
  } catch (error) {
    logger.error({
      type: 'api_error',
      method: 'GET',
      endpoint: '/api/documents',
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to list documents',
      message: error.message,
      files: [],
    });
  }
});

/**
 * GET /api/documents/:path
 * Serve a PDF or HTML document by path
 */
app.get('/api/documents/:path(*)', (req, res) => {
  try {
    const requestedPath = req.params.path;
    
    // Security: Prevent directory traversal
    if (requestedPath.includes('..') || (requestedPath.includes('/') && requestedPath.startsWith('/'))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid path',
      });
    }

    const scrapersDir = path.join(__dirname, '../scrapers/data/reports');
    const filePath = path.join(scrapersDir, requestedPath);

    // Ensure the file is within the scrapers directory
    if (!filePath.startsWith(scrapersDir)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found',
      });
    }

    const ext = filePath.toLowerCase();
    const isPDF = ext.endsWith('.pdf');
    const isHTML = ext.endsWith('.html');

    if (!isPDF && !isHTML) {
      return res.status(400).json({
        success: false,
        error: 'File must be PDF or HTML',
      });
    }

    if (isPDF) {
      // Set headers for PDF
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
    } else {
      // Set headers for HTML
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
    }

    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      logger.error({
        type: 'api_error',
        method: 'GET',
        endpoint: '/api/documents/:path',
        error: error.message,
      });

      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Failed to read file',
        });
      }
    });
  } catch (error) {
    logger.error({
      type: 'api_error',
      method: 'GET',
      endpoint: '/api/documents/:path',
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to serve document',
      message: error.message,
    });
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  const nodes = getAllNodes(db);
  const edges = getAllEdges(db);

  // Extract user's access token from Databricks Apps header
  const userAccessToken = req.headers['x-forwarded-access-token'];

  res.json({
    status: 'ok',
    environment: process.env.NODE_ENV || 'development',
    source: 'Databricks (user OAuth) + SQLite (fallback)',
    userAuth: !!userAccessToken,
    databricksEnabled: !!userAccessToken,
    databricksError: null,
    timestamp: new Date().toISOString(),
    database: {
      type: 'SQLite',
      nodeCount: nodes.length,
      edgeCount: edges.length,
    },
    databricks: {
      authMode: 'user_oauth_only',
      host: DATABRICKS_CONFIG.host,
      defaultTable: DEFAULT_TABLE_NAME,
    },
    metadata: {
      source: 'Databricks (user OAuth) + SQLite (fallback)',
      userAuth: !!userAccessToken,
      databricksEnabled: !!userAccessToken,
      databricksError: null,
      timestamp: new Date().toISOString(),
    },
  });
});

// Serve React app for all other routes in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info({ type: 'server_shutdown', signal: 'SIGINT' });
  if (db) {
    db.close();
    logger.info({ type: 'database_close', status: 'success' });
  }
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  const nodeCount = getAllNodes(db).length;
  const edgeCount = getAllEdges(db).length;

  logger.info({
    type: 'server_started',
    url: `http://localhost:${PORT}`,
    database: {
      sqlite: { nodes: nodeCount, edges: edgeCount },
    },
    dataStrategy: 'Databricks (user OAuth) with SQLite fallback',
    authMode: 'User identity passthrough only',
  });
});
