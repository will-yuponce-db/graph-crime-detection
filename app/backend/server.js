/**
 * Backend entrypoint.
 *
 * - Wires up the Express app (routes live in `createApp`)
 * - Waits for Postgres (Lakebase) connection before accepting requests
 * - Starts listening only after init completes (or timeout)
 */

require('dotenv').config();

const logger = require('./utils/logger');
const db = require('./db/postgres');
const { createApp } = require('./createApp');

// Databricks Apps environment configuration (for app identity, not SQL)
const APP_CONFIG = {
  appName: process.env.DATABRICKS_APP_NAME,
  appUrl: process.env.DATABRICKS_APP_URL,
  host: process.env.DATABRICKS_HOST,
  workspaceId: process.env.DATABRICKS_WORKSPACE_ID,
};

const isDatabricksApp = !!APP_CONFIG.appName;

// Port: Databricks sets DATABRICKS_APP_PORT and PORT (both 8000)
const PORT = parseInt(process.env.DATABRICKS_APP_PORT || process.env.PORT || '8000', 10);

// Host: Databricks requires 0.0.0.0, local dev can use localhost
const HOST = isDatabricksApp ? '0.0.0.0' : process.env.HOST || '0.0.0.0';

// Wait for Postgres before accepting requests (avoids first-load race)
// Increased default to 30s to allow time for Lakebase credential generation
const INIT_TIMEOUT_MS = parseInt(process.env.DB_INIT_TIMEOUT_MS || process.env.DATABRICKS_INIT_TIMEOUT_MS || '30000', 10);

async function waitForDatabase() {
  const deadline = Date.now() + INIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      await db.initDatabricks();
      const tables = await db.listTables();
      return { ok: true, tableCount: tables?.length ?? 0 };
    } catch (err) {
      logger.warn({ type: 'db_init', status: 'retrying', error: err.message });
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  logger.warn({ type: 'db_init', status: 'timeout', timeoutMs: INIT_TIMEOUT_MS });
  return { ok: false, tableCount: 0 };
}

const { app, warmCache } = createApp({ logger, databricks: db });

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info({ type: 'server_shutdown', signal: 'SIGINT' });
  await db.closeDatabricks();
  process.exit(0);
});

// Memory monitor — log heap usage every 15s so we can diagnose OOM
setInterval(() => {
  const mem = process.memoryUsage();
  logger.info({
    type: 'memory',
    rss_mb: Math.round(mem.rss / 1048576),
    heap_used_mb: Math.round(mem.heapUsed / 1048576),
    heap_total_mb: Math.round(mem.heapTotal / 1048576),
    external_mb: Math.round(mem.external / 1048576),
  });
}, 15000).unref();

// Start server only after Postgres is ready (or timeout)
(async () => {
  const { ok, tableCount = 0 } = await waitForDatabase();
  if (ok) {
    logger.info({ type: 'db_init', status: 'connected', tableCount });
  }

  app.listen(PORT, HOST, () => {
    const serverInfo = {
      type: 'server_started',
      host: HOST,
      port: PORT,
      localUrl: `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`,
      database: {
        type: 'Lakebase Postgres',
        schema: db.SCHEMA,
        tableCount,
      },
    };

    if (isDatabricksApp) {
      serverInfo.app = {
        appName: APP_CONFIG.appName,
        appUrl: APP_CONFIG.appUrl,
        host: APP_CONFIG.host,
        workspaceId: APP_CONFIG.workspaceId,
      };
    }

    logger.info(serverInfo);

    // Warm cache in background after server is listening
    if (ok) {
      warmCache().catch(() => {});
    }
  });
})();
