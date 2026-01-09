/**
 * Backend entrypoint.
 *
 * - Wires up the Express app (routes live in `createApp`)
 * - Initializes Databricks connection (best-effort)
 * - Starts listening
 */

require('dotenv').config();

const logger = require('./utils/logger');
const databricks = require('./db/databricks');
const { createApp } = require('./createApp');

// Databricks Apps environment configuration
const DATABRICKS_CONFIG = {
  appName: process.env.DATABRICKS_APP_NAME,
  appUrl: process.env.DATABRICKS_APP_URL,
  host: process.env.DATABRICKS_HOST,
  workspaceId: process.env.DATABRICKS_WORKSPACE_ID,
  clientId: process.env.DATABRICKS_CLIENT_ID,
};

const isDatabricksApp = !!DATABRICKS_CONFIG.appName;

// Port: Databricks sets DATABRICKS_APP_PORT and PORT (both 8000)
const PORT = parseInt(process.env.DATABRICKS_APP_PORT || process.env.PORT || '8000', 10);

// Host: Databricks requires 0.0.0.0, local dev can use localhost
const HOST = isDatabricksApp ? '0.0.0.0' : process.env.HOST || '0.0.0.0';

const { app } = createApp({ logger, databricks });

// Initialize Databricks connection on startup
(async () => {
  try {
    await databricks.initDatabricks();
    logger.info({ type: 'databricks_init', status: 'connected' });
  } catch (error) {
    logger.error({ type: 'databricks_init', status: 'failed', error: error.message });
    // Don't exit - allow health check to report status
  }
})();

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info({ type: 'server_shutdown', signal: 'SIGINT' });
  await databricks.closeDatabricks();
  process.exit(0);
});

// Start server
app.listen(PORT, HOST, async () => {
  let tableCount = 0;
  try {
    const tables = await databricks.listTables();
    tableCount = tables.length;
  } catch {
    // Databricks not connected yet
  }

  const serverInfo = {
    type: 'server_started',
    host: HOST,
    port: PORT,
    localUrl: `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`,
    database: {
      type: 'Databricks',
      catalog: databricks.CATALOG,
      schema: databricks.SCHEMA,
      tableCount,
    },
  };

  if (isDatabricksApp) {
    serverInfo.databricks = {
      appName: DATABRICKS_CONFIG.appName,
      appUrl: DATABRICKS_CONFIG.appUrl,
      host: DATABRICKS_CONFIG.host,
      workspaceId: DATABRICKS_CONFIG.workspaceId,
    };
  }

  logger.info(serverInfo);
});

