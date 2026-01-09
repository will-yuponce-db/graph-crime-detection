/**
 * Sample Databricks UC tables for quick change detection.
 *
 * Usage:
 *   node backend/scripts/sample_tables.js --tables cases_silver,persons_silver --limit 5 --count
 *   node backend/scripts/sample_tables.js --tables-file backend/scripts/tables.txt
 *   node backend/scripts/sample_tables.js --api http://localhost:3000 --tables cases_silver --count
 *
 * Requires env:
 *   DATABRICKS_HOST, DATABRICKS_HTTP_PATH, and one of:
 *   DATABRICKS_TOKEN or (DATABRICKS_CLIENT_ID + DATABRICKS_CLIENT_SECRET)
 *
 * Optional:
 *   DATABRICKS_CATALOG (default pubsec_geo_law)
 *   DATABRICKS_SCHEMA  (default demo)
 */

const path = require('path');
const fs = require('fs');
const databricks = require('../db/databricks');

function parseArgs(argv) {
  const args = {
    tables: null,
    tablesFile: null,
    limit: 5,
    count: false,
    json: false,
    api: null,
    detail: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tables' && argv[i + 1]) {
      args.tables = argv[++i];
      continue;
    }
    if (a === '--tables-file' && argv[i + 1]) {
      args.tablesFile = argv[++i];
      continue;
    }
    if (a === '--api' && argv[i + 1]) {
      args.api = argv[++i];
      continue;
    }
    if (a === '--detail') {
      args.detail = true;
      continue;
    }
    if (a === '--limit' && argv[i + 1]) {
      args.limit = Math.max(1, Math.min(50, parseInt(argv[++i], 10) || 5));
      continue;
    }
    if (a === '--count') {
      args.count = true;
      continue;
    }
    if (a === '--json') {
      args.json = true;
      continue;
    }
    if (a === '--help' || a === '-h') {
      args.help = true;
      continue;
    }
  }
  return args;
}

function readTablesFromFile(p) {
  const abs = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
  const raw = fs.readFileSync(abs, 'utf8');
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

function safeString(v, maxLen = 200) {
  if (v == null) return v;
  if (typeof v === 'string') {
    const s = v.replace(/\s+/g, ' ').trim();
    if (s.length <= maxLen) return s;
    return s.slice(0, maxLen) + `…(${s.length} chars)`;
  }
  return v;
}

function truncateRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    if (Array.isArray(v)) {
      out[k] = v.length > 15 ? [...v.slice(0, 15), `…(+${v.length - 15} more)`] : v;
    } else if (typeof v === 'object' && v !== null) {
      // The DBSQL client sometimes returns structs as objects; keep but limit depth a bit.
      out[k] = JSON.parse(JSON.stringify(v, (_, vv) => safeString(vv, 200)));
    } else {
      out[k] = safeString(v, 300);
    }
  }
  return out;
}

function asFqn(table) {
  return `${databricks.CATALOG}.${databricks.SCHEMA}.${table}`;
}

async function apiGet(baseUrl, p) {
  const url = baseUrl.replace(/\/+$/, '') + p;
  const r = await fetch(url);
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore
  }
  if (!r.ok) {
    const msg = (json && (json.error || json.message)) || text || `HTTP ${r.status}`;
    throw new Error(msg);
  }
  return json;
}

async function apiPost(baseUrl, p, body) {
  const url = baseUrl.replace(/\/+$/, '') + p;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore
  }
  if (!r.ok) {
    const msg = (json && (json.error || json.message)) || text || `HTTP ${r.status}`;
    throw new Error(msg);
  }
  return json;
}

function pickTimestampColumns(columns) {
  const names = new Set(
    columns
      .map((c) => String(c.name || c.col_name || c.colName || c.column_name || '').trim())
      .filter(Boolean)
  );
  const candidates = [
    'ingestion_timestamp',
    'updated_at',
    'updatedAt',
    'created_at',
    'createdAt',
    'incident_start_ts',
    'incident_end_ts',
    'detected_at',
    'timestamp',
    'event_ts',
    'event_time',
    'event_timestamp',
    'time_bucket_ts',
    'assigned_date_ts',
  ];
  return candidates.filter((c) => names.has(c));
}

async function tryQuery(sql) {
  try {
    const rows = await databricks.runCustomQuery(sql);
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

async function sampleTable(table, { limit, count, apiBaseUrl, includeDetail }) {
  const fqn = asFqn(table);
  const result = { table, fqn };

  if (apiBaseUrl) {
    // Describe columns via backend (supports DESCRIBE)
    try {
      const resp = await apiGet(
        apiBaseUrl,
        `/api/databricks/tables/${encodeURIComponent(table)}/describe`
      );
      const rows = resp?.columns || [];
      result.columns = rows
        .filter((r) => r && r.col_name && !String(r.col_name).startsWith('#'))
        .map((r) => ({ name: r.col_name, type: r.data_type, comment: r.comment || null }));
    } catch (e) {
      result.columnsError = e?.message || String(e);
      result.columns = [];
    }

    if (includeDetail) {
      // Detail via backend (DESCRIBE DETAIL / EXTENDED fallback)
      try {
        const resp = await apiGet(
          apiBaseUrl,
          `/api/databricks/tables/${encodeURIComponent(table)}/detail`
        );
        result.detailKind = resp?.kind || null;
        result.detail = resp?.details || null;
        if (resp?.detailError) result.detailError = resp.detailError;
      } catch (e) {
        result.detailError = e?.message || String(e);
      }
    }
  } else {
    // Describe columns (works for tables + views)
    const desc = await tryQuery(`DESCRIBE ${fqn}`);
    if (desc.ok) {
      result.columns = desc.rows
        .filter((r) => r && r.col_name && !String(r.col_name).startsWith('#'))
        .map((r) => ({ name: r.col_name, type: r.data_type, comment: r.comment || null }));
    } else {
      result.columnsError = desc.error;
      result.columns = [];
    }

    // Table detail (best-effort; not all objects support this)
    const detail = await tryQuery(`DESCRIBE DETAIL ${fqn}`);
    if (detail.ok && detail.rows && detail.rows[0]) {
      const d = detail.rows[0];
      result.detail = {
        format: d.format || null,
        id: d.id || null,
        name: d.name || null,
        description: d.description || null,
        createdAt: d.createdAt || null,
        lastModified: d.lastModified || null,
        location: d.location || null,
        numFiles: d.numFiles || null,
        sizeInBytes: d.sizeInBytes || null,
        properties: d.properties || null,
      };
    } else if (!detail.ok) {
      result.detailError = detail.error;
    }
  }

  // Count rows (optional, can be expensive)
  if (count) {
    if (apiBaseUrl) {
      try {
        const resp = await apiPost(apiBaseUrl, '/api/databricks/query', {
          sql: `SELECT COUNT(*) AS row_count FROM ${fqn}`,
        });
        const r0 = resp?.results?.[0];
        result.rowCount = r0?.row_count;
      } catch (e) {
        result.rowCountError = e?.message || String(e);
      }
    } else {
      const cnt = await tryQuery(`SELECT COUNT(*) AS row_count FROM ${fqn}`);
      if (cnt.ok && cnt.rows && cnt.rows[0]) result.rowCount = cnt.rows[0].row_count;
      else result.rowCountError = cnt.ok ? 'Unexpected result shape' : cnt.error;
    }
  }

  // Timestamp hints
  const tsCols = pickTimestampColumns(result.columns || []);
  result.timestampColumns = tsCols;
  result.maxTimestamps = {};
  for (const c of tsCols) {
    if (apiBaseUrl) {
      try {
        const resp = await apiPost(apiBaseUrl, '/api/databricks/query', {
          sql: `SELECT MAX(${c}) AS max_${c} FROM ${fqn}`,
        });
        const r0 = resp?.results?.[0];
        result.maxTimestamps[c] = r0?.[`max_${c}`];
      } catch {
        // ignore per-column errors
      }
    } else {
      const maxq = await tryQuery(`SELECT MAX(${c}) AS max_${c} FROM ${fqn}`);
      if (maxq.ok && maxq.rows && maxq.rows[0]) result.maxTimestamps[c] = maxq.rows[0][`max_${c}`];
    }
  }

  // Sample rows
  if (apiBaseUrl) {
    try {
      const resp = await apiPost(apiBaseUrl, '/api/databricks/query', {
        sql: `SELECT * FROM ${fqn} LIMIT ${limit}`,
      });
      result.sample = (resp?.results || []).map(truncateRow);
    } catch (e) {
      result.sampleError = e?.message || String(e);
      result.sample = [];
    }
  } else {
    const sample = await tryQuery(`SELECT * FROM ${fqn} LIMIT ${limit}`);
    if (sample.ok) {
      result.sample = (sample.rows || []).map(truncateRow);
    } else {
      result.sampleError = sample.error;
      result.sample = [];
    }
  }

  return result;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`
Sample UC tables (Databricks SQL).

Options:
  --tables <csv>         Comma-separated table list (without catalog/schema)
  --tables-file <path>   Newline-separated list (without catalog/schema)
  --api <baseUrl>        Query through a running backend (e.g. http://localhost:3000)
  --detail               Also try DESCRIBE DETAIL / EXTENDED (may require extra privileges)
  --limit <n>            Sample rows per table (default 5, max 50)
  --count                Also run COUNT(*)
  --json                 Output newline-delimited JSON (one per table)
`);
    process.exit(0);
  }

  let tables = [];
  if (args.tablesFile) tables = readTablesFromFile(args.tablesFile);
  else if (args.tables)
    tables = args.tables
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  else if (args.api) {
    // fallback: list all tables via backend
    const resp = await apiGet(args.api, '/api/databricks/tables');
    const listed = resp?.tables || [];
    tables = (listed || []).map((t) => t.tableName || t.table_name || t.name).filter(Boolean);
  } else {
    // fallback: list all tables in schema (direct DBSQL)
    const listed = await databricks.listTables();
    tables = (listed || []).map((t) => t.tableName || t.table_name || t.name).filter(Boolean);
  }

  // Normalize to just table name (strip catalog/schema if user included)
  tables = tables.map((t) => String(t).split('.').slice(-1)[0]);

  if (!args.api) {
    await databricks.initDatabricks();
  }

  for (const t of tables) {
    const out = await sampleTable(t, {
      limit: args.limit,
      count: args.count,
      apiBaseUrl: args.api,
      includeDetail: args.detail,
    });
    if (args.json) {
      process.stdout.write(JSON.stringify(out) + '\n');
    } else {
      console.log('\n============================================================');
      console.log(`${out.fqn}`);
      if (out.detail)
        console.log(
          'DETAIL:',
          out.detailKind ? { kind: out.detailKind, details: out.detail } : out.detail
        );
      if (out.rowCount !== undefined) console.log('ROW_COUNT:', out.rowCount);
      if (out.timestampColumns?.length) {
        console.log('TIMESTAMP_COLUMNS:', out.timestampColumns);
        console.log('MAX_TIMESTAMPS:', out.maxTimestamps);
      }
      console.log('COLUMNS:', (out.columns || []).map((c) => `${c.name}:${c.type}`).join(', '));
      if (out.sampleError) console.log('SAMPLE_ERROR:', out.sampleError);
      console.log('SAMPLE:', out.sample);
    }
  }

  if (!args.api) {
    await databricks.closeDatabricks();
  }
}

main().catch(async (err) => {
  // Try to close on error
  try {
    await databricks.closeDatabricks();
  } catch {
    // ignore
  }
  console.error(err);
  process.exit(1);
});
