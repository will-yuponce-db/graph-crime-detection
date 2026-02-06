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
    CATALOG: 'sch',
    SCHEMA: 'sch',
    getTableName: (table) => `"sch"."${table}"`,
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
      if (sql.toUpperCase().includes('FROM "SCH"."LOCATION_EVENTS_SILVER')) {
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
      if (sql.toUpperCase().includes('FROM "SCH"."SUSPECT_RANKINGS')) {
        return [];
      }
      return [];
    },
    getSuspectRankings: async () => [{ entity_id: 'E_001' }],
    getLocationEvents: async () => [],
    getCellDeviceCounts: async () => [
      {
        h3_cell: '892a1072a9fffff',
        city: 'Washington',
        state: 'DC',
        center_lat: 38.9,
        center_lon: -77.07,
        device_count: 2,
        entity_ids: ['E_001', 'E_002'],
        is_high_activity: true,
        time_bucket: '2025-01-01T00:00',
      },
      {
        // Duplicate h3_cell in same bucket should be aggregated
        h3_cell: '892a1072a9fffff',
        city: 'Washington',
        state: 'DC',
        center_lat: 38.9,
        center_lon: -77.07,
        device_count: 3,
        entity_ids: ['E_001', 'E_003'],
        is_high_activity: false,
        time_bucket: '2025-01-01T00:00',
      },
      {
        // Different bucket, same cell
        h3_cell: '892a1072a9fffff',
        city: 'Washington',
        state: 'DC',
        center_lat: 38.9,
        center_lon: -77.07,
        device_count: 1,
        entity_ids: ['E_005'],
        is_high_activity: false,
        time_bucket: '2025-01-01T02:00',
      },
      {
        // Different cell and bucket
        h3_cell: '892a1072a8fffff',
        city: 'Washington',
        state: 'DC',
        center_lat: 38.91,
        center_lon: -77.071,
        device_count: 4,
        entity_ids: ['E_004'],
        is_high_activity: false,
        time_bucket: '2025-01-01T02:00',
      },
    ],
    getHotspotsForHour: async () => [
      {
        h3_cell: '892a1072a9fffff',
        city: 'Washington',
        state: 'DC',
        center_lat: 38.9,
        center_lon: -77.07,
        device_count: 5,
        entity_ids: ['E_001', 'E_002', 'E_003'],
        tower_name: 'Tower A',
        suspect_count: 1,
      },
    ],
    getRelationships: async () => [],
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

test('GET /api/demo/hotspots/:hour deduplicates h3_cells and calculates suspect counts', async () => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();
  const { app } = createApp({ databricks, dataDir, distPath: path.join(dataDir, 'no-dist') });

  const { server, baseUrl } = await start(app);
  try {
    const res = await fetch(`${baseUrl}/api/demo/hotspots/0`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);

    // Stub has 2 rows with same h3_cell - should be aggregated to 1 hotspot
    assert.equal(body.hotspots.length, 1);
    assert.equal(body.totalHotspots, 1);

    const hotspot = body.hotspots[0];
    // Device count should be summed (2 + 3 = 5)
    assert.equal(hotspot.deviceCount, 5);
    // Entity IDs should be deduplicated: E_001, E_002, E_003 = 3 unique
    assert.equal(hotspot.entityIds.length, 3);
    // E_001 is in suspectRankings, so suspectCount = 1
    assert.equal(hotspot.suspectCount, 1);
    // Should use correct column names (center_lat/center_lon)
    assert.equal(hotspot.lat, 38.9);
    assert.equal(hotspot.lng, -77.07);
    // Name should use 8 chars not 6
    assert.ok(hotspot.towerName.includes('2a9fffff'));
  } finally {
    server.close();
  }
});

test('GET /api/demo/hotspots/:hour supports bounded windows', async () => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();
  const { app } = createApp({ databricks, dataDir, distPath: path.join(dataDir, 'no-dist') });

  const { server, baseUrl } = await start(app);
  try {
    // Window covering only first bucket
    const resNarrow = await fetch(`${baseUrl}/api/demo/hotspots/0?startHour=0&endHour=0`);
    assert.equal(resNarrow.status, 200);
    const bodyNarrow = await resNarrow.json();
    assert.equal(bodyNarrow.success, true);
    assert.equal(bodyNarrow.hotspots.length, 1);
    assert.equal(bodyNarrow.hotspots[0].deviceCount, 5); // first bucket only
    assert.equal(bodyNarrow.startHour, 0);
    assert.equal(bodyNarrow.endHour, 0);

    // Window covering both buckets
    const resWide = await fetch(`${baseUrl}/api/demo/hotspots/0?startHour=0&endHour=1`);
    assert.equal(resWide.status, 200);
    const bodyWide = await resWide.json();
    assert.equal(bodyWide.success, true);
    assert.equal(bodyWide.hotspots.length, 2); // second cell appears
    const first = bodyWide.hotspots.find((h) => h.towerId === '892a1072a9fffff');
    const second = bodyWide.hotspots.find((h) => h.towerId === '892a1072a8fffff');
    assert.ok(first);
    assert.ok(second);
    assert.equal(first.deviceCount, 6); // adds bucket 2 for same cell
    assert.equal(bodyWide.startHour, 0);
    assert.equal(bodyWide.endHour, 1);
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

test('GET /api/demo/cases/:id/detail falls back to entity ID for generic placeholder names', async () => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();

  // Simulate entities with generic placeholder names like "Unknown Suspect #4"
  databricks.runCustomQuery = async (sql) => {
    const u = String(sql || '').toUpperCase();
    if (u.includes('FROM "SCH"."CASES_SILVER')) {
      return [
        {
          case_id: 'CASE_TEST',
          case_type: 'Burglary',
          city: 'Nashville',
          state: 'TN',
          address: '123 Main St, Nashville',
          latitude: 36.16,
          longitude: -86.78,
          narrative: 'Test narrative',
          status: 'open',
          priority: 'high',
        },
      ];
    }
    if (u.includes('FROM "SCH"."CASE_SUMMARY_WITH_SUSPECTS')) {
      return []; // Force fallback to entity_case_overlap path
    }
    if (u.includes('FROM "SCH"."ENTITY_CASE_OVERLAP')) {
      return [
        { entity_id: 'E_10294', case_id: 'CASE_TEST', overlap_score: 0.95 },
        { entity_id: 'E_10627', case_id: 'CASE_TEST', overlap_score: 0.85 },
      ];
    }
    if (u.includes('FROM "SCH"."SUSPECT_RANKINGS')) {
      // Return generic placeholder names that should be replaced with entity IDs
      return [
        { entity_id: 'E_10294', entity_name: 'Unknown Suspect #4', total_score: 1.2 },
        { entity_id: 'E_10627', entity_name: 'Unknown Suspect #4', total_score: 0.8 },
      ];
    }
    if (u.includes('FROM "SCH"."EVIDENCE_CARD_DATA')) {
      return [];
    }
    return [];
  };

  const { app } = createApp({ databricks, dataDir, distPath: path.join(dataDir, 'no-dist') });
  const { server, baseUrl } = await start(app);
  try {
    const res = await fetch(`${baseUrl}/api/demo/cases/CASE_TEST/detail`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.linkedEntities));
    assert.equal(body.linkedEntities.length, 2);

    // Names should fall back to "Entity E_XXXXX" instead of "Unknown Suspect #4"
    const names = body.linkedEntities.map((e) => e.name);
    assert.ok(
      names.every((n) => n.startsWith('Entity E_')),
      `Expected names to be entity IDs but got: ${names.join(', ')}`
    );
    assert.ok(
      !names.some((n) => n.includes('Unknown Suspect')),
      'Names should not contain "Unknown Suspect" placeholder'
    );
  } finally {
    server.close();
  }
});

test('POST /api/demo/colocation-log returns grouped colocations (best-effort without timestamps)', async () => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();

  databricks.runCustomQuery = async (sql) => {
    const u = String(sql || '').toUpperCase();
    if (u.includes('FROM "SCH"."SUSPECT_RANKINGS')) {
      return [
        { entity_id: 'A', entity_name: 'Alice' },
        { entity_id: 'B', entity_name: 'Bob' },
        { entity_id: 'C', entity_name: 'Carol' },
      ];
    }
    if (u.includes('FROM "SCH"."LOCATION_EVENTS_SILVER')) {
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

test('POST /api/demo/cases/:id/entities links entity to case and GET returns it', async () => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();
  const { app } = createApp({ databricks, dataDir, distPath: path.join(dataDir, 'no-dist') });

  const { server, baseUrl } = await start(app);
  try {
    // Link an entity to a case
    const linkRes = await fetch(`${baseUrl}/api/demo/cases/CASE_1/entities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entityId: 'entity_suspect_1',
        role: 'suspect',
        notes: 'Seen near the crime scene',
      }),
    });
    assert.equal(linkRes.status, 201);
    const linkBody = await linkRes.json();
    assert.equal(linkBody.success, true);
    assert.equal(linkBody.entity.entityId, 'entity_suspect_1');
    assert.equal(linkBody.entity.role, 'suspect');
    assert.equal(linkBody.entity.notes, 'Seen near the crime scene');
    assert.equal(linkBody.entity.linkSource, 'manual');

    // GET should return the linked entity
    const getRes = await fetch(`${baseUrl}/api/demo/cases/CASE_1/entities`);
    assert.equal(getRes.status, 200);
    const getBody = await getRes.json();
    assert.equal(getBody.success, true);
    assert.equal(getBody.entities.length, 1);
    assert.equal(getBody.entities[0].entityId, 'entity_suspect_1');
  } finally {
    server.close();
  }
});

test('POST /api/demo/cases/:id/entities rejects duplicate entity links', async () => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();
  const { app } = createApp({ databricks, dataDir, distPath: path.join(dataDir, 'no-dist') });

  const { server, baseUrl } = await start(app);
  try {
    // Link first time
    await fetch(`${baseUrl}/api/demo/cases/CASE_1/entities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId: 'entity_dup' }),
    });

    // Try to link again - should fail
    const dupRes = await fetch(`${baseUrl}/api/demo/cases/CASE_1/entities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId: 'entity_dup' }),
    });
    assert.equal(dupRes.status, 409);
    const dupBody = await dupRes.json();
    assert.equal(dupBody.success, false);
    assert.ok(dupBody.error.includes('already linked'));
  } finally {
    server.close();
  }
});

test('PATCH /api/demo/cases/:id/entities/:entityId updates role and notes', async () => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();
  const { app } = createApp({ databricks, dataDir, distPath: path.join(dataDir, 'no-dist') });

  const { server, baseUrl } = await start(app);
  try {
    // Link an entity first
    await fetch(`${baseUrl}/api/demo/cases/CASE_1/entities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId: 'entity_update', role: 'witness' }),
    });

    // Update the role and notes
    const patchRes = await fetch(`${baseUrl}/api/demo/cases/CASE_1/entities/entity_update`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'suspect', notes: 'Upgraded to suspect after new evidence' }),
    });
    assert.equal(patchRes.status, 200);
    const patchBody = await patchRes.json();
    assert.equal(patchBody.success, true);
    assert.equal(patchBody.entity.role, 'suspect');
    assert.equal(patchBody.entity.notes, 'Upgraded to suspect after new evidence');
    assert.ok(patchBody.entity.updatedAt);
  } finally {
    server.close();
  }
});

test('DELETE /api/demo/cases/:id/entities/:entityId removes entity link', async () => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();
  const { app } = createApp({ databricks, dataDir, distPath: path.join(dataDir, 'no-dist') });

  const { server, baseUrl } = await start(app);
  try {
    // Link an entity
    await fetch(`${baseUrl}/api/demo/cases/CASE_1/entities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId: 'entity_delete' }),
    });

    // Verify it's there
    const before = await fetch(`${baseUrl}/api/demo/cases/CASE_1/entities`);
    const beforeBody = await before.json();
    assert.equal(beforeBody.entities.length, 1);

    // Delete it
    const delRes = await fetch(`${baseUrl}/api/demo/cases/CASE_1/entities/entity_delete`, {
      method: 'DELETE',
    });
    assert.equal(delRes.status, 200);
    const delBody = await delRes.json();
    assert.equal(delBody.success, true);

    // Verify it's gone
    const after = await fetch(`${baseUrl}/api/demo/cases/CASE_1/entities`);
    const afterBody = await after.json();
    assert.equal(afterBody.entities.length, 0);
  } finally {
    server.close();
  }
});

test('DELETE /api/demo/cases/:id/entities/:entityId returns 404 for non-existent link', async () => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();
  const { app } = createApp({ databricks, dataDir, distPath: path.join(dataDir, 'no-dist') });

  const { server, baseUrl } = await start(app);
  try {
    const delRes = await fetch(`${baseUrl}/api/demo/cases/CASE_1/entities/nonexistent`, {
      method: 'DELETE',
    });
    assert.equal(delRes.status, 404);
    const delBody = await delRes.json();
    assert.equal(delBody.success, false);
  } finally {
    server.close();
  }
});

test('POST /api/demo/cases/:id/entities validates role against allowed values', async () => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();
  const { app } = createApp({ databricks, dataDir, distPath: path.join(dataDir, 'no-dist') });

  const { server, baseUrl } = await start(app);
  try {
    // Invalid role should default to 'person_of_interest'
    const res = await fetch(`${baseUrl}/api/demo/cases/CASE_1/entities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId: 'entity_invalid_role', role: 'invalid_role' }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.entity.role, 'person_of_interest');
  } finally {
    server.close();
  }
});

// ============== DEVICE-PERSON LINKS TESTS ==============

test('GET /api/demo/device-person-links returns empty array initially', async () => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();
  const { app } = createApp({ databricks, dataDir, distPath: path.join(dataDir, 'no-dist') });

  const { server, baseUrl } = await start(app);
  try {
    const res = await fetch(`${baseUrl}/api/demo/device-person-links`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.links.length, 0);
  } finally {
    server.close();
  }
});

test('POST /api/demo/device-person-links creates a new link', async () => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();
  const { app } = createApp({ databricks, dataDir, distPath: path.join(dataDir, 'no-dist') });

  const { server, baseUrl } = await start(app);
  try {
    const res = await fetch(`${baseUrl}/api/demo/device-person-links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'E_1234',
        personId: 'P_001',
        relationship: 'owner',
        confidence: 0.9,
        notes: 'Test link',
      }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.link.deviceId, 'E_1234');
    assert.equal(body.link.personId, 'P_001');
    assert.equal(body.link.relationship, 'owner');
    assert.equal(body.link.confidence, 0.9);
    assert.equal(body.link.source, 'manual');
    assert.ok(body.link.linkId);

    // Verify it persists
    const getRes = await fetch(`${baseUrl}/api/demo/device-person-links`);
    const getBody = await getRes.json();
    assert.equal(getBody.links.length, 1);
    assert.equal(getBody.links[0].deviceId, 'E_1234');
  } finally {
    server.close();
  }
});

test('POST /api/demo/device-person-links rejects duplicate links', async () => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();
  const { app } = createApp({ databricks, dataDir, distPath: path.join(dataDir, 'no-dist') });

  const { server, baseUrl } = await start(app);
  try {
    // Create first link
    await fetch(`${baseUrl}/api/demo/device-person-links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: 'E_1234', personId: 'P_001' }),
    });

    // Try to create duplicate
    const res = await fetch(`${baseUrl}/api/demo/device-person-links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: 'E_1234', personId: 'P_001' }),
    });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.success, false);
  } finally {
    server.close();
  }
});

test('PATCH /api/demo/device-person-links/:linkId updates a link', async () => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();
  const { app } = createApp({ databricks, dataDir, distPath: path.join(dataDir, 'no-dist') });

  const { server, baseUrl } = await start(app);
  try {
    // Create a link
    const createRes = await fetch(`${baseUrl}/api/demo/device-person-links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: 'E_1234', personId: 'P_001', relationship: 'suspected_owner' }),
    });
    const createBody = await createRes.json();
    const linkId = createBody.link.linkId;

    // Update it
    const patchRes = await fetch(`${baseUrl}/api/demo/device-person-links/${linkId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relationship: 'owner', confidence: 0.95, notes: 'Updated notes' }),
    });
    assert.equal(patchRes.status, 200);
    const patchBody = await patchRes.json();
    assert.equal(patchBody.success, true);
    assert.equal(patchBody.link.relationship, 'owner');
    assert.equal(patchBody.link.confidence, 0.95);
    assert.equal(patchBody.link.notes, 'Updated notes');
  } finally {
    server.close();
  }
});

test('DELETE /api/demo/device-person-links/:linkId removes a link', async () => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();
  const { app } = createApp({ databricks, dataDir, distPath: path.join(dataDir, 'no-dist') });

  const { server, baseUrl } = await start(app);
  try {
    // Create a link
    const createRes = await fetch(`${baseUrl}/api/demo/device-person-links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: 'E_1234', personId: 'P_001' }),
    });
    const createBody = await createRes.json();
    const linkId = createBody.link.linkId;

    // Delete it
    const delRes = await fetch(`${baseUrl}/api/demo/device-person-links/${linkId}`, {
      method: 'DELETE',
    });
    assert.equal(delRes.status, 200);
    const delBody = await delRes.json();
    assert.equal(delBody.success, true);

    // Verify it's gone
    const getRes = await fetch(`${baseUrl}/api/demo/device-person-links`);
    const getBody = await getRes.json();
    assert.equal(getBody.links.length, 0);
  } finally {
    server.close();
  }
});

test('POST /api/demo/device-person-links validates required fields', async () => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();
  const { app } = createApp({ databricks, dataDir, distPath: path.join(dataDir, 'no-dist') });

  const { server, baseUrl } = await start(app);
  try {
    // Missing deviceId
    const res1 = await fetch(`${baseUrl}/api/demo/device-person-links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId: 'P_001' }),
    });
    assert.equal(res1.status, 400);

    // Missing personId
    const res2 = await fetch(`${baseUrl}/api/demo/device-person-links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: 'E_1234' }),
    });
    assert.equal(res2.status, 400);
  } finally {
    server.close();
  }
});

test('POST /api/demo/device-person-links defaults relationship to suspected_owner', async () => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();
  const { app } = createApp({ databricks, dataDir, distPath: path.join(dataDir, 'no-dist') });

  const { server, baseUrl } = await start(app);
  try {
    const res = await fetch(`${baseUrl}/api/demo/device-person-links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: 'E_1234', personId: 'P_001' }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.link.relationship, 'suspected_owner');
    assert.equal(body.link.confidence, 0.5); // default confidence
  } finally {
    server.close();
  }
});

// ============== AGENT ENDPOINT TESTS ==============

test('POST /api/demo/agent/step returns 400 when answer is missing', async () => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();
  const { app } = createApp({ databricks, dataDir, distPath: path.join(dataDir, 'no-dist') });

  const { server, baseUrl } = await start(app);
  try {
    const res = await fetch(`${baseUrl}/api/demo/agent/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'test-session' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.error.includes('answer'));
  } finally {
    server.close();
  }
});

test('POST /api/demo/agent/step returns 400 when answer is empty string', async () => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();
  const { app } = createApp({ databricks, dataDir, distPath: path.join(dataDir, 'no-dist') });

  const { server, baseUrl } = await start(app);
  try {
    const res = await fetch(`${baseUrl}/api/demo/agent/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: '   ' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
  } finally {
    server.close();
  }
});

test('POST /api/demo/agent/step returns 400 when answer is non-string', async () => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();
  const { app } = createApp({ databricks, dataDir, distPath: path.join(dataDir, 'no-dist') });

  const { server, baseUrl } = await start(app);
  try {
    const res = await fetch(`${baseUrl}/api/demo/agent/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: 123 }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
  } finally {
    server.close();
  }
});

// ============== AGENT ACTION VALIDATION TESTS (via mock model client) ==============

// Helper to create app with a mocked model client
// We need to clear and re-require modules to inject the mock properly
function createAppWithMockedAgent(mockInvokeFn, databricks, dataDir) {
  const createAppPath = require.resolve('../createApp');
  const modelClientPath = require.resolve('../agent/databricksModelClient');
  
  // Clear both modules from cache
  delete require.cache[createAppPath];
  delete require.cache[modelClientPath];
  
  // Set up mock before requiring createApp
  const modelClient = require('../agent/databricksModelClient');
  modelClient.invokeAgentModel = mockInvokeFn;
  
  // Now require createApp - it will get the mocked version
  const { createApp: freshCreateApp } = require('../createApp');
  
  return freshCreateApp({ databricks, dataDir, distPath: path.join(dataDir, 'no-dist') });
}

// Cleanup helper to restore modules after mocked tests
function restoreModules() {
  const createAppPath = require.resolve('../createApp');
  const modelClientPath = require.resolve('../agent/databricksModelClient');
  delete require.cache[createAppPath];
  delete require.cache[modelClientPath];
}

test('POST /api/demo/agent/step with mocked model returns sanitized navigate actions', async (t) => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();
  
  const mockInvoke = async () => ({
    text: JSON.stringify({
      assistantMessage: 'Navigating to heatmap',
      actions: [
        { type: 'navigate', path: '/heatmap', searchParams: { city: 'Nashville', invalidKey: 'ignore' } },
      ],
    }),
    raw: {},
  });

  const { app } = createAppWithMockedAgent(mockInvoke, databricks, dataDir);
  const { server, baseUrl } = await start(app);
  
  try {
    const res = await fetch(`${baseUrl}/api/demo/agent/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: 'show me the heatmap' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.assistantMessage, 'Navigating to heatmap');
    assert.equal(body.actions.length, 1);
    assert.equal(body.actions[0].type, 'navigate');
    assert.equal(body.actions[0].path, '/heatmap');
    // invalidKey should be filtered out
    assert.equal(body.actions[0].searchParams.city, 'Nashville');
    assert.equal(body.actions[0].searchParams.invalidKey, undefined);
  } finally {
    server.close();
    restoreModules();
  }
});

test('POST /api/demo/agent/step filters out invalid navigate paths', async (t) => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();
  
  const mockInvoke = async () => ({
    text: JSON.stringify({
      assistantMessage: 'Test',
      actions: [
        { type: 'navigate', path: '/admin' }, // not allowed
        { type: 'navigate', path: '/graph-explorer' }, // allowed
      ],
    }),
    raw: {},
  });

  const { app } = createAppWithMockedAgent(mockInvoke, databricks, dataDir);
  const { server, baseUrl } = await start(app);
  
  try {
    const res = await fetch(`${baseUrl}/api/demo/agent/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: 'test' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    // Only the valid navigate action should remain
    assert.equal(body.actions.length, 1);
    assert.equal(body.actions[0].path, '/graph-explorer');
  } finally {
    server.close();
    restoreModules();
  }
});

test('POST /api/demo/agent/step handles setSearchParams action', async (t) => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();
  
  const mockInvoke = async () => ({
    text: JSON.stringify({
      assistantMessage: 'Setting params',
      actions: [
        { type: 'setSearchParams', searchParams: { hour: '5', entityIds: 'E_001,E_002', badKey: 'nope' } },
      ],
    }),
    raw: {},
  });

  const { app } = createAppWithMockedAgent(mockInvoke, databricks, dataDir);
  const { server, baseUrl } = await start(app);
  
  try {
    const res = await fetch(`${baseUrl}/api/demo/agent/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: 'set hour to 5' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.actions.length, 1);
    assert.equal(body.actions[0].type, 'setSearchParams');
    assert.equal(body.actions[0].searchParams.hour, '5');
    assert.equal(body.actions[0].searchParams.entityIds, 'E_001,E_002');
    // badKey should be filtered
    assert.equal(body.actions[0].searchParams.badKey, undefined);
  } finally {
    server.close();
    restoreModules();
  }
});

test('POST /api/demo/agent/step handles selectEntities action', async (t) => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();
  
  const mockInvoke = async () => ({
    text: JSON.stringify({
      assistantMessage: 'Selecting entities',
      actions: [
        { type: 'selectEntities', entityIds: ['E_001', 'E_002', '', 123] }, // includes invalid items
      ],
    }),
    raw: {},
  });

  const { app } = createAppWithMockedAgent(mockInvoke, databricks, dataDir);
  const { server, baseUrl } = await start(app);
  
  try {
    const res = await fetch(`${baseUrl}/api/demo/agent/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: 'select E_001 and E_002' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.actions.length, 1);
    assert.equal(body.actions[0].type, 'selectEntities');
    // Empty string and number should be filtered out
    assert.deepEqual(body.actions[0].entityIds, ['E_001', 'E_002']);
  } finally {
    server.close();
    restoreModules();
  }
});

test('POST /api/demo/agent/step handles generateEvidenceCard action', async (t) => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();
  
  const mockInvoke = async () => ({
    text: JSON.stringify({
      assistantMessage: 'Generating evidence card',
      actions: [
        { type: 'generateEvidenceCard', personIds: ['P_001', 'P_002'], navigateToEvidenceCard: true },
      ],
    }),
    raw: {},
  });

  const { app } = createAppWithMockedAgent(mockInvoke, databricks, dataDir);
  const { server, baseUrl } = await start(app);
  
  try {
    const res = await fetch(`${baseUrl}/api/demo/agent/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: 'generate evidence card for P_001 and P_002' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.actions.length, 1);
    assert.equal(body.actions[0].type, 'generateEvidenceCard');
    assert.deepEqual(body.actions[0].personIds, ['P_001', 'P_002']);
    assert.equal(body.actions[0].navigateToEvidenceCard, true);
  } finally {
    server.close();
    restoreModules();
  }
});

test('POST /api/demo/agent/step respects maxActions limit', async (t) => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();
  
  // Return more actions than the default limit (5)
  const mockInvoke = async () => ({
    text: JSON.stringify({
      assistantMessage: 'Multiple actions',
      actions: [
        { type: 'navigate', path: '/' },
        { type: 'navigate', path: '/heatmap' },
        { type: 'navigate', path: '/graph-explorer' },
        { type: 'navigate', path: '/evidence-card' },
        { type: 'navigate', path: '/' },
        { type: 'navigate', path: '/heatmap' }, // 6th action, should be truncated
        { type: 'navigate', path: '/graph-explorer' }, // 7th
      ],
    }),
    raw: {},
  });

  const { app } = createAppWithMockedAgent(mockInvoke, databricks, dataDir);
  const { server, baseUrl } = await start(app);
  
  try {
    const res = await fetch(`${baseUrl}/api/demo/agent/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: 'test' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    // Default maxActions is 5
    assert.equal(body.actions.length, 5);
  } finally {
    server.close();
    restoreModules();
  }
});

test('POST /api/demo/agent/step returns empty actions for invalid action types', async (t) => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();
  
  const mockInvoke = async () => ({
    text: JSON.stringify({
      assistantMessage: 'No valid actions',
      actions: [
        { type: 'deleteDatabase' }, // invalid type
        { type: 'runSql', query: 'DROP TABLE' }, // invalid type
        'not an object', // invalid
        null, // invalid
      ],
    }),
    raw: {},
  });

  const { app } = createAppWithMockedAgent(mockInvoke, databricks, dataDir);
  const { server, baseUrl } = await start(app);
  
  try {
    const res = await fetch(`${baseUrl}/api/demo/agent/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: 'test' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    // All actions are invalid, so should be empty
    assert.equal(body.actions.length, 0);
  } finally {
    server.close();
    restoreModules();
  }
});

test('POST /api/demo/agent/step handles model returning plain text', async (t) => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();
  
  // Model returns non-JSON text
  const mockInvoke = async () => ({
    text: 'I am not sure what you mean. Could you clarify?',
    raw: {},
  });

  const { app } = createAppWithMockedAgent(mockInvoke, databricks, dataDir);
  const { server, baseUrl } = await start(app);
  
  try {
    const res = await fetch(`${baseUrl}/api/demo/agent/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: 'gibberish' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    // Falls back to using the raw text as assistantMessage
    assert.ok(body.assistantMessage.includes('I am not sure'));
    // No valid actions parsed
    assert.equal(body.actions.length, 0);
  } finally {
    server.close();
    restoreModules();
  }
});

test('POST /api/demo/agent/step handles model error gracefully', async (t) => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();
  
  // Model throws an error
  const mockInvoke = async () => {
    throw new Error('Model service unavailable');
  };

  const { app } = createAppWithMockedAgent(mockInvoke, databricks, dataDir);
  const { server, baseUrl } = await start(app);
  
  try {
    const res = await fetch(`${baseUrl}/api/demo/agent/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: 'test' }),
    });
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.error.includes('Model service unavailable'));
  } finally {
    server.close();
    restoreModules();
  }
});

test('POST /api/demo/agent/step passes uiContext to agent', async (t) => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();
  
  let capturedMessages = null;
  const mockInvoke = async ({ messages }) => {
    capturedMessages = messages;
    return {
      text: JSON.stringify({ assistantMessage: 'OK', actions: [] }),
      raw: {},
    };
  };

  const { app } = createAppWithMockedAgent(mockInvoke, databricks, dataDir);
  const { server, baseUrl } = await start(app);
  
  try {
    const res = await fetch(`${baseUrl}/api/demo/agent/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'sess_123',
        answer: 'show me cases',
        uiContext: { path: '/heatmap', search: '?city=Nashville' },
        history: [{ role: 'user', content: 'hello' }],
      }),
    });
    assert.equal(res.status, 200);
    // Verify context was passed to model
    assert.ok(capturedMessages);
    assert.equal(capturedMessages.length, 3); // system + context + user
    const contextMsg = capturedMessages[1].content;
    assert.ok(contextMsg.includes('Nashville'));
    assert.ok(contextMsg.includes('/heatmap'));
    assert.ok(contextMsg.includes('sess_123'));
  } finally {
    server.close();
    restoreModules();
  }
});

test('POST /api/demo/agent/step sanitizes setSearchParams with null values', async (t) => {
  const dataDir = makeTmpDir();
  const databricks = makeStubDatabricks();
  
  const mockInvoke = async () => ({
    text: JSON.stringify({
      assistantMessage: 'Clearing params',
      actions: [
        { type: 'setSearchParams', searchParams: { city: null, hour: '10' } },
      ],
    }),
    raw: {},
  });

  const { app } = createAppWithMockedAgent(mockInvoke, databricks, dataDir);
  const { server, baseUrl } = await start(app);
  
  try {
    const res = await fetch(`${baseUrl}/api/demo/agent/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: 'clear city filter' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.actions.length, 1);
    // null values should be preserved for deletion
    assert.equal(body.actions[0].searchParams.city, null);
    assert.equal(body.actions[0].searchParams.hour, '10');
  } finally {
    server.close();
    restoreModules();
  }
});
