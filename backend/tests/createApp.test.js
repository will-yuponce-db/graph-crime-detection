const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const { createApp } = require('../createApp');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'crime-graph-tests-'));
}

function makeStubDatabricks() {
  let lastSql = null;
  const stub = {
    CATALOG: 'cat',
    SCHEMA: 'sch',
    getCases: async (limit) => {
      const count = Math.min(limit || 100, 8);
      return Array.from({ length: count }).map((_, i) => ({
        case_id: `CASE_${i}`,
        case_type: 'Burglary',
        city: 'Washington',
        state: 'DC',
        address: 'Georgetown, Washington, DC',
        latitude: 38.9,
        longitude: -77.07,
        narrative: 'Narrative',
        status: 'open',
        priority: 'medium',
        estimated_loss: 1000,
        ingestion_timestamp: new Date().toISOString(),
      }));
    },
    runCustomQuery: async (sql) => {
      lastSql = sql;
      // location_events_silver query used by /config
      if (sql.toUpperCase().includes('FROM CAT.SCH.LOCATION_EVENTS_SILVER')) {
        return [
          {
            h3_cell: '8928308280fffff',
            city: 'Washington',
            state: 'DC',
            latitude: 38.9,
            longitude: -77.07,
          },
        ];
      }
      // suspect_rankings query used by /persons/:id
      if (sql.toUpperCase().includes('FROM CAT.SCH.SUSPECT_RANKINGS')) {
        return [];
      }
      return [];
    },
    getSuspectRankings: async () => [],
    getLocationEvents: async () => [],
    getCellDeviceCounts: async () => [
      {
        h3_cell: 'h3',
        city: 'Washington',
        latitude: 38.9,
        longitude: -77.07,
        device_count: 2,
        suspect_count: 1,
      },
    ],
    listTables: async () => [{ tableName: 'x' }],
    describeTable: async () => [
      // Minimal schema surface for colocation log endpoint (no timestamp column)
      { col_name: 'entity_id' },
      { col_name: 'latitude' },
      { col_name: 'longitude' },
      { col_name: 'h3_cell' },
      { col_name: 'city' },
      { col_name: 'state' },
      // (intentionally omit time cols so endpoint falls back to time:null)
    ],
    getLastSql: () => lastSql,
  };
  return stub;
}

async function start(app) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const addr = server.address();
  assert.equal(typeof addr, 'object');
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  return { server, baseUrl };
}

test('GET /api/demo/config constrains keyFrame hours to 0-71', async () => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();
  const { app } = createApp({ databricks, dataDir, distPath: path.join(dataDir, 'no-dist') });

  const { server, baseUrl } = await start(app);
  try {
    const res = await fetch(`${baseUrl}/api/demo/config`);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.totalHours, 72);
    for (const kf of body.keyFrames) {
      assert.ok(Number.isInteger(kf.hour));
      assert.ok(kf.hour >= 0 && kf.hour <= 71);
    }
  } finally {
    server.close();
  }
});

test('GET /api/demo/hotspots/:hour validates hour range', async () => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();
  const { app } = createApp({ databricks, dataDir, distPath: path.join(dataDir, 'no-dist') });

  const { server, baseUrl } = await start(app);
  try {
    const bad = await fetch(`${baseUrl}/api/demo/hotspots/72`);
    assert.equal(bad.status, 400);
    const badBody = await bad.json();
    assert.equal(badBody.success, false);

    const ok = await fetch(`${baseUrl}/api/demo/hotspots/0`);
    assert.equal(ok.status, 200);
    const okBody = await ok.json();
    assert.equal(okBody.success, true);
    assert.ok(Array.isArray(okBody.hotspots));
  } finally {
    server.close();
  }
});

test('POST /api/demo/cases creates a local case and PATCH status persists via overrides', async () => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();
  const { app } = createApp({ databricks, dataDir, distPath: path.join(dataDir, 'no-dist') });

  const { server, baseUrl } = await start(app);
  try {
    const createdRes = await fetch(`${baseUrl}/api/demo/cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        city: 'Washington',
        neighborhood: 'Georgetown',
        state: 'DC',
        priority: 'Medium',
      }),
    });
    assert.equal(createdRes.status, 201);
    const createdBody = await createdRes.json();
    assert.equal(createdBody.success, true);
    const caseId = createdBody.case.id;

    const updateRes = await fetch(`${baseUrl}/api/demo/cases/${caseId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'review' }),
    });
    assert.equal(updateRes.status, 200);

    const listRes = await fetch(`${baseUrl}/api/demo/cases`);
    const listBody = await listRes.json();
    const found = listBody.cases.find((c) => c.id === caseId);
    assert.ok(found);
    assert.equal(found.status, 'review');
  } finally {
    server.close();
  }
});

test('GET /api/demo/persons/:id escapes SQL literals', async () => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();
  const { app } = createApp({ databricks, dataDir, distPath: path.join(dataDir, 'no-dist') });

  const { server, baseUrl } = await start(app);
  try {
    const id = "E_'1";
    const res = await fetch(`${baseUrl}/api/demo/persons/${encodeURIComponent(id)}`);
    assert.equal(res.status, 404);
    const sql = databricks.getLastSql();
    assert.ok(sql);
    assert.ok(sql.includes("E_''1"));
    assert.ok(!sql.includes("E_'1'")); // would be unsafe/unescaped
  } finally {
    server.close();
  }
});

test('POST /api/demo/colocation-log returns grouped colocations (best-effort without timestamps)', async () => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();

  databricks.runCustomQuery = async (sql) => {
    const u = String(sql || '').toUpperCase();
    if (u.includes('FROM CAT.SCH.SUSPECT_RANKINGS')) {
      return [
        { entity_id: 'A', entity_name: 'Alice' },
        { entity_id: 'B', entity_name: 'Bob' },
        { entity_id: 'C', entity_name: 'Carol' },
      ];
    }
    if (u.includes('FROM CAT.SCH.LOCATION_EVENTS_SILVER')) {
      // Return three location rows:
      // - A + B co-present at same h3/city/state
      // - C alone somewhere else
      return [
        {
          entity_id: 'A',
          latitude: 38.9,
          longitude: -77.07,
          h3_cell: 'h3_1',
          city: 'Washington',
          state: 'DC',
        },
        {
          entity_id: 'B',
          latitude: 38.9001,
          longitude: -77.0701,
          h3_cell: 'h3_1',
          city: 'Washington',
          state: 'DC',
        },
        {
          entity_id: 'C',
          latitude: 36.16,
          longitude: -86.78,
          h3_cell: 'h3_2',
          city: 'Nashville',
          state: 'TN',
        },
      ];
    }
    return [];
  };

  const { app } = createApp({ databricks, dataDir, distPath: path.join(dataDir, 'no-dist') });
  const { server, baseUrl } = await start(app);
  try {
    const res = await fetch(`${baseUrl}/api/demo/colocation-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityIds: ['A', 'B', 'C'], mode: 'any', limit: 1000 }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(Array.isArray(body.entries), true);
    // Should include only the A+B co-location group (>=2 participants)
    assert.equal(body.entries.length, 1);
    assert.equal(body.entries[0].participantCount, 2);
    const ids = body.entries[0].participants.map((p) => p.id).sort();
    assert.deepEqual(ids, ['A', 'B']);
    assert.equal(body.entries[0].time, null);
    assert.equal(body.entries[0].city, 'Washington');
  } finally {
    server.close();
  }
});
