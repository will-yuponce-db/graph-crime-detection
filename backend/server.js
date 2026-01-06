/**
 * Express Backend Server for Cross-Jurisdictional Investigative Analytics Demo
 * All data is stored in SQLite for easy deployment and demo purposes.
 */

const express = require('express');
const cors = require('cors');
const logger = require('./utils/logger');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const {
  initDatabase,
  isDatabaseEmpty,
  getAllCellTowers,
  getAllPersons,
  getPersonById,
  getSuspects,
  getAllDevices,
  getDeviceById,
  getDevicePositionsAtHour,
  getDevicePositionHistory,
  getAllDemoCases,
  getDemoCaseById,
  getDemoCaseByHour,
  updateDemoCaseStatus,
  getAllRelationships,
  getRelationshipsForPerson,
  getHotspotsAtHour,
} = require('./db/database');

const { seedDatabase } = require('./db/seed');

// Databricks connector (optional - for Unity Catalog queries)
const databricks = require('./db/databricks');

const app = express();

// Databricks Apps environment configuration
const DATABRICKS_CONFIG = {
  appName: process.env.DATABRICKS_APP_NAME,
  appUrl: process.env.DATABRICKS_APP_URL,
  host: process.env.DATABRICKS_HOST,
  workspaceId: process.env.DATABRICKS_WORKSPACE_ID,
  clientId: process.env.DATABRICKS_CLIENT_ID,
  // Note: DATABRICKS_CLIENT_SECRET is available for API calls but not logged
};

const isDatabricksApp = !!DATABRICKS_CONFIG.appName;

// Port: Databricks sets DATABRICKS_APP_PORT and PORT (both 8000)
const PORT = parseInt(process.env.DATABRICKS_APP_PORT || process.env.PORT || '8000', 10);

// Host: Databricks requires 0.0.0.0, local dev can use localhost
const HOST = isDatabricksApp ? '0.0.0.0' : process.env.HOST || '0.0.0.0';

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    if (!req.path.startsWith('/api/demo/positions')) {
      // Don't log frequent position requests
      logger.info({
        type: 'request',
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration,
      });
    }
  });
  next();
});

// Serve static files from React app in production
const distPath = path.join(__dirname, '../dist');
const indexPath = path.join(distPath, 'index.html');

logger.info({
  type: 'static_files_config',
  distPath,
  indexPath,
  distExists: fs.existsSync(distPath),
  indexExists: fs.existsSync(indexPath),
  nodeEnv: process.env.NODE_ENV,
});

// Always serve static files if dist exists (monolith mode)
if (fs.existsSync(distPath)) {
  app.use(
    express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      },
    })
  );
  logger.info({ type: 'static_files', status: 'enabled', distPath });
} else {
  logger.warn({
    type: 'static_files',
    status: 'disabled',
    reason: 'dist folder not found',
    distPath,
  });
}

// Initialize database
let db;
try {
  db = initDatabase();
  logger.info({ type: 'database_init', status: 'initialized' });

  // Seed if empty
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

// ============== DEMO DATA ENDPOINTS ==============

/**
 * GET /api/demo/config
 * Get demo configuration (cell towers, time range, key frames)
 */
app.get('/api/demo/config', (req, res) => {
  try {
    const towers = getAllCellTowers(db);
    const cases = getAllDemoCases(db);
    const keyFrames = cases.map((c) => ({
      id: c.id,
      caseNumber: c.case_number,
      hour: c.hour,
      lat: c.latitude,
      lng: c.longitude,
      neighborhood: c.neighborhood,
      city: c.city,
      description: c.description,
      priority: c.priority.toLowerCase(),
    }));

    res.json({
      success: true,
      towers,
      keyFrames,
      timeRange: { min: 0, max: 71 },
      totalHours: 72,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/towers
 * Get all cell towers
 */
app.get('/api/demo/towers', (req, res) => {
  try {
    const towers = getAllCellTowers(db);
    res.json({ success: true, towers });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/persons
 * Get all persons (optionally filter to suspects only)
 */
app.get('/api/demo/persons', (req, res) => {
  try {
    const suspectsOnly = req.query.suspects === 'true';
    const persons = suspectsOnly ? getSuspects(db) : getAllPersons(db);
    res.json({ success: true, persons });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/persons/:id
 * Get a single person by ID
 */
app.get('/api/demo/persons/:id', (req, res) => {
  try {
    const person = getPersonById(db, req.params.id);
    if (!person) {
      return res.status(404).json({ success: false, error: 'Person not found' });
    }
    res.json({ success: true, person });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/devices
 * Get all devices with owner info
 */
app.get('/api/demo/devices', (req, res) => {
  try {
    const devices = getAllDevices(db);
    res.json({ success: true, devices });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/devices/:id
 * Get a single device by ID
 */
app.get('/api/demo/devices/:id', (req, res) => {
  try {
    const device = getDeviceById(db, req.params.id);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }
    res.json({ success: true, device });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/positions/:hour
 * Get all device positions at a specific hour
 */
app.get('/api/demo/positions/:hour', (req, res) => {
  try {
    const hour = parseInt(req.params.hour, 10);
    if (isNaN(hour) || hour < 0 || hour > 71) {
      return res.status(400).json({ success: false, error: 'Hour must be 0-71' });
    }
    const positions = getDevicePositionsAtHour(db, hour);
    res.json({
      success: true,
      hour,
      positions: positions.map((p) => ({
        deviceId: p.device_id,
        deviceName: p.device_name,
        lat: p.latitude,
        lng: p.longitude,
        towerId: p.tower_id,
        towerName: p.tower_name,
        towerCity: p.tower_city,
        ownerId: p.owner_id,
        ownerName: p.owner_name,
        ownerAlias: p.owner_alias,
        isSuspect: p.is_suspect === 1,
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/hotspots/:hour
 * Get hotspots (towers with device counts) at a specific hour
 */
app.get('/api/demo/hotspots/:hour', (req, res) => {
  try {
    const hour = parseInt(req.params.hour, 10);
    if (isNaN(hour) || hour < 0 || hour > 71) {
      return res.status(400).json({ success: false, error: 'Hour must be 0-71' });
    }
    const hotspots = getHotspotsAtHour(db, hour);
    res.json({
      success: true,
      hour,
      hotspots: hotspots.map((h) => ({
        towerId: h.tower_id,
        towerName: h.tower_name,
        lat: h.latitude,
        lng: h.longitude,
        city: h.city,
        deviceCount: h.device_count,
        suspectCount: h.suspect_count,
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/cases
 * Get all demo cases
 */
app.get('/api/demo/cases', (req, res) => {
  try {
    const cases = getAllDemoCases(db);
    res.json({
      success: true,
      cases: cases.map((c) => ({
        id: c.id,
        caseNumber: c.case_number,
        title: c.title,
        description: c.description,
        city: c.city,
        state: c.state,
        neighborhood: c.neighborhood,
        lat: c.latitude,
        lng: c.longitude,
        hour: c.hour,
        status: c.status,
        priority: c.priority,
        assignedTo: c.assigned_to,
        estimatedLoss: c.estimated_loss,
        methodOfEntry: c.method_of_entry,
        stolenItems: c.stolen_items,
        persons: c.persons,
        devices: c.devices,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/cases/:id
 * Get a single case by ID
 */
app.get('/api/demo/cases/:id', (req, res) => {
  try {
    const caseData = getDemoCaseById(db, req.params.id);
    if (!caseData) {
      return res.status(404).json({ success: false, error: 'Case not found' });
    }
    res.json({ success: true, case: caseData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/cases/at-hour/:hour
 * Get cases that occur at a specific hour (key frames)
 */
app.get('/api/demo/cases/at-hour/:hour', (req, res) => {
  try {
    const hour = parseInt(req.params.hour, 10);
    const cases = getDemoCaseByHour(db, hour);
    res.json({ success: true, hour, cases });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/demo/cases/:id/status
 * Update case status
 */
app.patch('/api/demo/cases/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    if (!['investigating', 'review', 'adjudicated'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }
    updateDemoCaseStatus(db, req.params.id, status);
    res.json({ success: true, message: `Case ${req.params.id} updated to ${status}` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/relationships
 * Get all person relationships (for graph view)
 */
app.get('/api/demo/relationships', (req, res) => {
  try {
    const relationships = getAllRelationships(db);
    res.json({
      success: true,
      relationships: relationships.map((r) => ({
        person1Id: r.person1_id,
        person1Name: r.person1_name,
        person1Alias: r.person1_alias,
        person2Id: r.person2_id,
        person2Name: r.person2_name,
        person2Alias: r.person2_alias,
        type: r.relationship_type,
        count: r.count,
        cities: r.cities,
        notes: r.notes,
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/relationships/:personId
 * Get relationships for a specific person
 */
app.get('/api/demo/relationships/:personId', (req, res) => {
  try {
    const relationships = getRelationshipsForPerson(db, req.params.personId);
    res.json({ success: true, relationships });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/graph-data
 * Get graph data for network visualization (suspects, locations, relationships)
 */
app.get('/api/demo/graph-data', (req, res) => {
  try {
    const suspects = getSuspects(db);
    const cases = getAllDemoCases(db);
    const relationships = getAllRelationships(db);

    // Build nodes: suspects
    const nodes = suspects.map((s) => ({
      id: s.id,
      name: s.name,
      alias: s.alias,
      type: 'person',
      isSuspect: true,
      threatLevel: s.threat_level,
      criminalHistory: s.criminal_history,
    }));

    // Build nodes: locations from cases
    const locationMap = new Map();
    cases.forEach((c) => {
      const locId = `loc_${c.neighborhood.toLowerCase().replace(/\s+/g, '_')}`;
      if (!locationMap.has(locId)) {
        locationMap.set(locId, {
          id: locId,
          name: c.neighborhood,
          type: 'location',
          city: c.city,
          lat: c.latitude,
          lng: c.longitude,
          caseCount: 1,
        });
      } else {
        locationMap.get(locId).caseCount++;
      }
    });
    nodes.push(...locationMap.values());

    // Build links: suspect relationships
    const links = relationships.map((r) => ({
      source: r.person1_id,
      target: r.person2_id,
      type: r.relationship_type,
      count: r.count,
      cities: r.cities,
    }));

    // Build links: suspects to locations
    suspects.forEach((s) => {
      locationMap.forEach((loc) => {
        links.push({
          source: s.id,
          target: loc.id,
          type: 'DETECTED_AT',
          count: 1,
        });
      });
    });

    res.json({ success: true, nodes, links });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/demo/evidence-card
 * Generate an evidence card summary for given suspects
 */
app.post('/api/demo/evidence-card', (req, res) => {
  try {
    const { personIds } = req.body;
    if (!personIds || !Array.isArray(personIds)) {
      return res.status(400).json({ success: false, error: 'personIds array required' });
    }

    const suspects = personIds.map((id) => getPersonById(db, id)).filter(Boolean);
    const cases = getAllDemoCases(db);
    const relationships = getAllRelationships(db).filter(
      (r) => personIds.includes(r.person1_id) || personIds.includes(r.person2_id)
    );

    const coLocations = relationships.find((r) => r.relationship_type === 'CO_LOCATED');
    const contacts = relationships.find((r) => r.relationship_type === 'CONTACTED');

    const evidenceCard = {
      title: 'Cross-Jurisdictional Burglary Crew Evidence',
      generatedAt: new Date().toISOString(),
      suspects: suspects.map((s) => ({
        id: s.id,
        name: s.name,
        alias: s.alias,
        threatLevel: s.threat_level,
        criminalHistory: s.criminal_history,
      })),
      linkedCases: cases
        .filter((c) => c.persons.some((p) => personIds.includes(p.id)))
        .map((c) => ({
          id: c.id,
          caseNumber: c.case_number,
          title: c.title,
          city: c.city,
          status: c.status,
          estimatedLoss: c.estimated_loss,
        })),
      signals: {
        geospatial: [
          {
            claim: `Suspects co-located at ${coLocations?.count || 10} different crime scenes across DC and Nashville`,
            confidence: 'High',
          },
          {
            claim: 'Both suspects present at Georgetown burglary (Hour 25) - PRIMARY INCIDENT',
            confidence: 'High',
          },
        ],
        narrative: [
          {
            claim: 'Consistent MO: "Rear window smash" entry across all linked cases',
            confidence: 'High',
          },
          {
            claim: 'Jewelry targeted in all burglaries, indicating specialized crew',
            confidence: 'High',
          },
        ],
        social: [
          {
            claim: `${contacts?.count || 47} phone contacts between suspects in investigation period`,
            confidence: 'High',
          },
          {
            claim: 'Prior arrests together in Virginia confirm known association',
            confidence: 'High',
          },
        ],
      },
      summary: `Intelligence analysis reveals a coordinated burglary crew operating across DC and Nashville. Primary suspects ${suspects.map((s) => s.name).join(' and ')} have been co-located at multiple crime scenes with consistent MO. Geospatial evidence places both at the December 1 Georgetown incident (est. loss $185K). Cross-jurisdictional pattern suggests organized operation.`,
      recommendedAction:
        'Coordinate with Nashville PD for joint investigation. Issue warrants for both suspects. Monitor for burner phone activity.',
    };

    res.json({ success: true, evidenceCard });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/demo/reset
 * Reset the database to initial state
 */
app.post('/api/demo/reset', (req, res) => {
  try {
    db.close();
    seedDatabase(true);
    db = initDatabase();
    res.json({ success: true, message: 'Database reset to initial state' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== DATABRICKS UNITY CATALOG ENDPOINTS ==============

/**
 * GET /api/databricks/tables
 * List all tables in the Unity Catalog schema
 */
app.get('/api/databricks/tables', async (req, res) => {
  try {
    const tables = await databricks.listTables();
    res.json({
      success: true,
      catalog: databricks.CATALOG,
      schema: databricks.SCHEMA,
      tables,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/databricks/tables/:name/describe
 * Describe a table's schema
 */
app.get('/api/databricks/tables/:name/describe', async (req, res) => {
  try {
    const columns = await databricks.describeTable(req.params.name);
    res.json({
      success: true,
      table: req.params.name,
      columns,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/databricks/cases
 * Get cases from Unity Catalog
 */
app.get('/api/databricks/cases', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const cases = await databricks.getCases(limit);
    res.json({ success: true, count: cases.length, cases });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/databricks/suspect-rankings
 * Get suspect rankings from Unity Catalog
 */
app.get('/api/databricks/suspect-rankings', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const rankings = await databricks.getSuspectRankings(limit);
    res.json({ success: true, count: rankings.length, rankings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/databricks/co-presence
 * Get co-presence edges (suspects seen together)
 */
app.get('/api/databricks/co-presence', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const edges = await databricks.getCoPresenceEdges(limit);
    res.json({ success: true, count: edges.length, edges });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/databricks/social-edges
 * Get social edges (communication links)
 */
app.get('/api/databricks/social-edges', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const edges = await databricks.getSocialEdges(limit);
    res.json({ success: true, count: edges.length, edges });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/databricks/cell-device-counts
 * Get cell device counts per location
 */
app.get('/api/databricks/cell-device-counts', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const counts = await databricks.getCellDeviceCounts(limit);
    res.json({ success: true, count: counts.length, counts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/databricks/location-events
 * Get location events
 */
app.get('/api/databricks/location-events', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const events = await databricks.getLocationEvents(limit);
    res.json({ success: true, count: events.length, events });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/databricks/evidence-card
 * Get evidence card data
 */
app.get('/api/databricks/evidence-card', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const data = await databricks.getEvidenceCardData(limit);
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/databricks/entity-overlap
 * Get entity case overlap
 */
app.get('/api/databricks/entity-overlap', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const overlaps = await databricks.getEntityCaseOverlap(limit);
    res.json({ success: true, count: overlaps.length, overlaps });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/databricks/handoff-candidates
 * Get handoff candidates
 */
app.get('/api/databricks/handoff-candidates', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const candidates = await databricks.getHandoffCandidates(limit);
    res.json({ success: true, count: candidates.length, candidates });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/databricks/query
 * Run a custom SELECT query (read-only)
 */
app.post('/api/databricks/query', async (req, res) => {
  try {
    const { sql } = req.body;
    if (!sql) {
      return res.status(400).json({ success: false, error: 'SQL query required' });
    }
    const results = await databricks.runCustomQuery(sql);
    res.json({ success: true, count: results.length, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== DATABRICKS UI-COMPATIBLE ENDPOINTS ==============
// These transform Databricks data to match the frontend's expected format

/**
 * GET /api/databricks/ui/config
 * Get demo configuration for UI (towers derived from location data, key frames from cases)
 */
app.get('/api/databricks/ui/config', async (req, res) => {
  try {
    const [casesResult, locationResult] = await Promise.all([
      databricks.getCases(100),
      databricks.runCustomQuery(`
        SELECT DISTINCT h3_cell, city, state, latitude, longitude 
        FROM ${databricks.CATALOG}.${databricks.SCHEMA}.location_events_silver 
        WHERE latitude IS NOT NULL 
        LIMIT 50
      `),
    ]);

    // Create virtual towers from unique H3 cells
    const towers = locationResult.map((loc, i) => ({
      id: `tower_${i}`,
      name: `Cell ${loc.h3_cell?.slice(-6) || i}`,
      latitude: loc.latitude,
      longitude: loc.longitude,
      city: loc.city || 'Unknown',
    }));

    // Create key frames from cases
    const keyFrames = casesResult.map((c, i) => ({
      id: c.case_id,
      caseNumber: c.case_id,
      hour: i * 12, // Spread cases across timeline
      lat: c.latitude,
      lng: c.longitude,
      neighborhood: c.address?.split(',')[0] || 'Unknown',
      city: c.city,
      description: c.narrative?.slice(0, 100) + '...' || c.case_type,
      priority: c.priority || 'medium',
    }));

    res.json({
      success: true,
      towers,
      keyFrames,
      timeRange: { min: 0, max: 71 },
      totalHours: 72,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/databricks/ui/cases
 * Get cases formatted for the UI kanban board
 */
app.get('/api/databricks/ui/cases', async (req, res) => {
  try {
    const cases = await databricks.getCases(100);

    const formattedCases = cases.map((c) => ({
      id: c.case_id,
      caseNumber: c.case_id,
      title: `${c.case_type} - ${c.city}`,
      description: c.narrative,
      city: c.city,
      state: c.state,
      neighborhood: c.address?.split(',')[0] || 'Unknown',
      lat: c.latitude,
      lng: c.longitude,
      hour: 25, // Default hour
      status: c.status === 'open' ? 'investigating' : c.status || 'investigating',
      priority: c.priority?.charAt(0).toUpperCase() + c.priority?.slice(1) || 'Medium',
      assignedTo: 'Analyst Team',
      estimatedLoss: c.estimated_loss,
      methodOfEntry: c.method_of_entry,
      stolenItems: c.target_items,
      persons: [], // Will be populated from suspect rankings
      devices: [],
      createdAt: c.incident_start_ts || new Date().toISOString(),
      updatedAt: c.ingestion_timestamp || new Date().toISOString(),
    }));

    res.json({ success: true, cases: formattedCases });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/databricks/ui/suspects
 * Get suspects from suspect_rankings formatted for UI
 */
app.get('/api/databricks/ui/suspects', async (req, res) => {
  try {
    const rankings = await databricks.getSuspectRankings(50);

    const suspects = rankings.map((r, i) => ({
      id: r.entity_id,
      name: `Entity ${r.entity_id}`,
      alias: r.entity_id.includes('SUSPECT') ? r.entity_id.split('_')[1] : null,
      threatLevel: r.total_score > 1.5 ? 'High' : r.total_score > 1 ? 'Medium' : 'Low',
      criminalHistory: `${r.case_count} linked cases across ${r.states_count} states`,
      isSuspect: true,
      rank: r.rank,
      totalScore: r.total_score,
      linkedCases: r.linked_cases,
      linkedCities: r.linked_cities,
    }));

    res.json({ success: true, persons: suspects });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/databricks/ui/graph-data
 * Get graph data for network visualization
 */
app.get('/api/databricks/ui/graph-data', async (req, res) => {
  try {
    const [rankings, coPresence, socialEdges] = await Promise.all([
      databricks.getSuspectRankings(20),
      databricks.getCoPresenceEdges(100),
      databricks.getSocialEdges(100),
    ]);

    // Build nodes from suspect rankings
    const nodes = rankings.map((r) => ({
      id: r.entity_id,
      name: `Entity ${r.entity_id}`,
      alias: r.entity_id.includes('SUSPECT') ? r.entity_id.split('_')[1] : null,
      type: 'person',
      isSuspect: true,
      threatLevel: r.total_score > 1.5 ? 'High' : 'Medium',
      totalScore: r.total_score,
      linkedCities: r.linked_cities,
    }));

    // Add location nodes from linked cities
    const citySet = new Set();
    rankings.forEach((r) => {
      (r.linked_cities || []).forEach((city) => citySet.add(city));
    });

    citySet.forEach((city) => {
      nodes.push({
        id: `loc_${city.toLowerCase().replace(/[^a-z]/g, '_')}`,
        name: city,
        type: 'location',
        city: city,
      });
    });

    // Build links from co-presence edges
    const links = [];

    // Co-presence links
    coPresence.forEach((edge) => {
      if (
        rankings.some((r) => r.entity_id === edge.entity_id_1) &&
        rankings.some((r) => r.entity_id === edge.entity_id_2)
      ) {
        links.push({
          source: edge.entity_id_1,
          target: edge.entity_id_2,
          type: 'CO_LOCATED',
          count: edge.co_occurrence_count,
          weight: edge.weight,
          cities: edge.city,
        });
      }
    });

    // Social edge links
    socialEdges.forEach((edge) => {
      if (edge.entity_id_1 && edge.entity_id_2) {
        links.push({
          source: edge.entity_id_1,
          target: edge.entity_id_2,
          type: edge.edge_type || 'SOCIAL',
          count: edge.interaction_count || 1,
        });
      }
    });

    // Add suspect-to-location links
    rankings.forEach((r) => {
      (r.linked_cities || []).forEach((city) => {
        links.push({
          source: r.entity_id,
          target: `loc_${city.toLowerCase().replace(/[^a-z]/g, '_')}`,
          type: 'DETECTED_AT',
          count: 1,
        });
      });
    });

    res.json({ success: true, nodes, links });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/databricks/ui/positions/:hour
 * Get device positions at a specific hour (simulated from location events)
 */
app.get('/api/databricks/ui/positions/:hour', async (req, res) => {
  try {
    const hour = parseInt(req.params.hour, 10);
    const locationEvents = await databricks.getLocationEvents(200);

    // Simulate positions based on location events
    const positions = locationEvents.slice(0, 20).map((event, i) => ({
      deviceId: `device_${event.entity_id || i}`,
      deviceName: `Device ${event.entity_id || i}`,
      lat: event.latitude + (Math.random() - 0.5) * 0.01,
      lng: event.longitude + (Math.random() - 0.5) * 0.01,
      towerId: event.h3_cell,
      towerName: `Cell ${event.h3_cell?.slice(-6) || i}`,
      towerCity: event.city,
      ownerId: event.entity_id,
      ownerName: `Entity ${event.entity_id}`,
      ownerAlias: null,
      isSuspect: event.entity_id?.includes('E_') && !event.entity_id?.includes('NOISE'),
    }));

    res.json({ success: true, hour, positions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/databricks/ui/hotspots/:hour
 * Get hotspots at a specific hour
 */
app.get('/api/databricks/ui/hotspots/:hour', async (req, res) => {
  try {
    const hour = parseInt(req.params.hour, 10);
    const cellCounts = await databricks.getCellDeviceCounts(50);

    const hotspots = cellCounts.map((c) => ({
      towerId: c.h3_cell,
      towerName: `Cell ${c.h3_cell?.slice(-6) || 'Unknown'}`,
      lat: c.latitude || 38.9,
      lng: c.longitude || -77.0,
      city: c.city || 'Unknown',
      deviceCount: c.device_count || c.entity_count || 1,
      suspectCount: c.suspect_count || 0,
    }));

    res.json({ success: true, hour, hotspots });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/databricks/ui/evidence-card/:caseId
 * Get evidence card data for a specific case
 */
app.get('/api/databricks/ui/evidence-card/:caseId', async (req, res) => {
  try {
    const caseId = req.params.caseId;
    const [evidenceData, entityOverlap, rankings] = await Promise.all([
      databricks.getEvidenceCardData(50),
      databricks.getEntityCaseOverlap(100),
      databricks.getSuspectRankings(10),
    ]);

    // Find relevant evidence for this case
    const caseEvidence = evidenceData.find((e) => e.case_id === caseId) || evidenceData[0];
    const caseOverlaps = entityOverlap.filter(
      (e) => e.case_id === caseId || e.linked_cases?.includes(caseId)
    );

    const evidenceCard = {
      title: `Evidence Summary - ${caseId}`,
      generatedAt: new Date().toISOString(),
      suspects: rankings.slice(0, 3).map((r) => ({
        id: r.entity_id,
        name: `Entity ${r.entity_id}`,
        threatLevel: r.total_score > 1.5 ? 'High' : 'Medium',
        linkedCases: r.linked_cases,
      })),
      linkedCases: caseOverlaps.map((o) => ({
        caseId: o.case_id,
        overlapScore: o.overlap_score || o.total_score,
      })),
      signals: {
        geospatial: caseEvidence?.geospatial_signals || [
          { claim: 'Multiple suspects detected at crime scene', confidence: 'High' },
        ],
        narrative: caseEvidence?.narrative_signals || [
          { claim: 'Consistent MO across linked cases', confidence: 'High' },
        ],
        social: caseEvidence?.social_signals || [
          { claim: 'Communication detected between suspects', confidence: 'Medium' },
        ],
      },
      summary: caseEvidence?.summary || 'Cross-jurisdictional analysis in progress.',
      recommendedAction: caseEvidence?.recommended_action || 'Continue monitoring suspect network.',
    };

    res.json({ success: true, evidenceCard });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/databricks/ui/relationships
 * Get all relationships for graph view
 */
app.get('/api/databricks/ui/relationships', async (req, res) => {
  try {
    const [coPresence, socialEdges] = await Promise.all([
      databricks.getCoPresenceEdges(100),
      databricks.getSocialEdges(100),
    ]);

    const relationships = [
      ...coPresence.map((e) => ({
        person1Id: e.entity_id_1,
        person1Name: `Entity ${e.entity_id_1}`,
        person2Id: e.entity_id_2,
        person2Name: `Entity ${e.entity_id_2}`,
        type: 'CO_LOCATED',
        count: e.co_occurrence_count,
        cities: e.city,
      })),
      ...socialEdges.map((e) => ({
        person1Id: e.entity_id_1,
        person1Name: `Entity ${e.entity_id_1}`,
        person2Id: e.entity_id_2,
        person2Name: `Entity ${e.entity_id_2}`,
        type: e.edge_type || 'CONTACTED',
        count: e.interaction_count || 1,
      })),
    ];

    res.json({ success: true, relationships });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== HEALTH CHECK ==============

app.get('/health', (req, res) => {
  const towers = getAllCellTowers(db).length;
  const persons = getAllPersons(db).length;
  const devices = getAllDevices(db).length;
  const cases = getAllDemoCases(db).length;

  const response = {
    status: 'ok',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    database: {
      type: 'SQLite',
      towers,
      persons,
      devices,
      cases,
    },
  };

  // Include Databricks info when running in Databricks Apps
  if (isDatabricksApp) {
    response.databricks = {
      appName: DATABRICKS_CONFIG.appName,
      appUrl: DATABRICKS_CONFIG.appUrl,
      host: DATABRICKS_CONFIG.host,
      workspaceId: DATABRICKS_CONFIG.workspaceId,
    };
  }

  res.json(response);
});

// ============== SERVE FRONTEND (SPA catch-all) ==============

// Serve index.html for all non-API routes (SPA routing)
if (fs.existsSync(indexPath)) {
  app.get('*', (req, res) => {
    // Don't serve index.html for API routes that weren't matched
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(indexPath);
  });
  logger.info({ type: 'spa_routing', status: 'enabled' });
} else {
  // Fallback: show diagnostic info if frontend not built
  app.get('/', (req, res) => {
    res.json({
      error: 'Frontend not built',
      hint: 'Run npm run build to create dist folder',
      distPath,
      indexPath,
      distExists: fs.existsSync(distPath),
      nodeEnv: process.env.NODE_ENV,
    });
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info({ type: 'server_shutdown', signal: 'SIGINT' });
  if (db) db.close();
  process.exit(0);
});

// Start server
app.listen(PORT, HOST, () => {
  const towers = getAllCellTowers(db).length;
  const persons = getAllPersons(db).length;

  const serverInfo = {
    type: 'server_started',
    host: HOST,
    port: PORT,
    localUrl: `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`,
    database: { towers, persons },
  };

  // Add Databricks-specific info when available
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
