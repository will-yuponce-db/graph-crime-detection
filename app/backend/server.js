/**
 * Backend entrypoint.
 *
 * - Wires up the Express app (routes live in `createApp`)
 * - Waits for Databricks connection before accepting requests
 * - Starts listening only after init completes (or timeout)
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

// Wait for Databricks before accepting requests (avoids first-load race)
const INIT_TIMEOUT_MS = parseInt(process.env.DATABRICKS_INIT_TIMEOUT_MS || '15000', 10);

async function waitForDatabricks() {
  const deadline = Date.now() + INIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      await databricks.initDatabricks();
      const tables = await databricks.listTables();
      return { ok: true, tableCount: tables?.length ?? 0 };
    } catch (err) {
      logger.warn({ type: 'databricks_init', status: 'retrying', error: err.message });
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  logger.warn({ type: 'databricks_init', status: 'timeout', timeoutMs: INIT_TIMEOUT_MS });
  return { ok: false, tableCount: 0 };
}

const { app, warmCache } = createApp({ logger, databricks });

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info({ type: 'server_shutdown', signal: 'SIGINT' });
  await databricks.closeDatabricks();
  process.exit(0);
});

// Start server only after Databricks is ready (or timeout)
(async () => {
  const { ok, tableCount = 0 } = await waitForDatabricks();
  if (ok) {
    logger.info({ type: 'databricks_init', status: 'connected', tableCount });
  }

  app.listen(PORT, HOST, () => {
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

    // Warm cache in background after server is listening
    if (ok) {
      warmCache().catch(() => {});
    }
  });
})();

