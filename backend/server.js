/**
 * Express Backend Server for Cross-Jurisdictional Investigative Analytics
 * All data is sourced from Databricks Unity Catalog.
 */

const express = require('express');
const cors = require('cors');
const logger = require('./utils/logger');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Databricks connector - primary data source
const databricks = require('./db/databricks');

const app = express();

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

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    if (!req.path.startsWith('/api/demo/positions')) {
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

// ============== DEMO DATA ENDPOINTS (Databricks-backed) ==============

/**
 * GET /api/demo/config
 * Get demo configuration (towers from locations, key frames from cases)
 */
app.get('/api/demo/config', async (req, res) => {
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
      properties: {},
    }));

    // Create key frames from cases
    const keyFrames = casesResult.map((c, i) => ({
      id: c.case_id,
      caseNumber: c.case_id,
      hour: i * 12,
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
 * GET /api/demo/towers
 * Get all cell towers (derived from location data)
 */
app.get('/api/demo/towers', async (req, res) => {
  try {
    const locationResult = await databricks.runCustomQuery(`
      SELECT DISTINCT h3_cell, city, state, 
             AVG(latitude) as latitude, AVG(longitude) as longitude
      FROM ${databricks.CATALOG}.${databricks.SCHEMA}.location_events_silver 
      WHERE latitude IS NOT NULL 
      GROUP BY h3_cell, city, state
      LIMIT 50
    `);

    const towers = locationResult.map((loc, i) => ({
      id: `tower_${loc.h3_cell || i}`,
      name: `Cell ${loc.h3_cell?.slice(-6) || i}`,
      latitude: loc.latitude,
      longitude: loc.longitude,
      city: loc.city || 'Unknown',
      state: loc.state,
      properties: {},
    }));

    res.json({ success: true, towers });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/persons
 * Get all persons (from suspect rankings)
 */
app.get('/api/demo/persons', async (req, res) => {
  try {
    const suspectsOnly = req.query.suspects === 'true';
    const rankings = await databricks.getSuspectRankings(100);

    const persons = rankings
      .filter((r) => !suspectsOnly || r.total_score > 0.5)
      .map((r) => ({
        id: r.entity_id,
        name: r.entity_name || `Entity ${r.entity_id}`,
        alias: r.alias || null,
        is_suspect: r.total_score > 0.5 ? 1 : 0,
        threat_level: r.total_score > 1.5 ? 'High' : r.total_score > 1 ? 'Medium' : 'Low',
        criminal_history: `${r.case_count || 0} linked cases across ${r.states_count || 1} states`,
        notes: null,
        properties: r.properties ? JSON.parse(r.properties) : {},
        totalScore: r.total_score,
        linkedCases: r.linked_cases,
        linkedCities: r.linked_cities,
      }));

    res.json({ success: true, persons });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/persons/:id
 * Get a single person by ID
 */
app.get('/api/demo/persons/:id', async (req, res) => {
  try {
    const entityId = req.params.id;
    const rankings = await databricks.runCustomQuery(`
      SELECT * FROM ${databricks.CATALOG}.${databricks.SCHEMA}.suspect_rankings 
      WHERE entity_id = '${entityId}' 
      LIMIT 1
    `);

    if (rankings.length === 0) {
      return res.status(404).json({ success: false, error: 'Person not found' });
    }

    const r = rankings[0];
    const person = {
      id: r.entity_id,
      name: r.entity_name || `Entity ${r.entity_id}`,
      alias: r.alias || null,
      is_suspect: r.total_score > 0.5 ? 1 : 0,
      threat_level: r.total_score > 1.5 ? 'High' : r.total_score > 1 ? 'Medium' : 'Low',
      criminal_history: `${r.case_count || 0} linked cases across ${r.states_count || 1} states`,
      properties: r.properties ? JSON.parse(r.properties) : {},
      totalScore: r.total_score,
      linkedCases: r.linked_cases,
      linkedCities: r.linked_cities,
    };

    res.json({ success: true, person });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/devices
 * Get all devices (from location events)
 */
app.get('/api/demo/devices', async (req, res) => {
  try {
    const devices = await databricks.runCustomQuery(`
      SELECT DISTINCT entity_id, device_type, city
      FROM ${databricks.CATALOG}.${databricks.SCHEMA}.location_events_silver 
      WHERE entity_id IS NOT NULL
      LIMIT 100
    `);

    const deviceList = devices.map((d, i) => ({
      id: `device_${d.entity_id || i}`,
      name: `Device ${d.entity_id || i}`,
      device_type: d.device_type || 'smartphone',
      owner_id: d.entity_id,
      is_burner: 0,
      properties: {},
    }));

    res.json({ success: true, devices: deviceList });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/devices/:id
 * Get a single device by ID
 */
app.get('/api/demo/devices/:id', async (req, res) => {
  try {
    const deviceId = req.params.id;
    const entityId = deviceId.replace('device_', '');

    const devices = await databricks.runCustomQuery(`
      SELECT DISTINCT entity_id, device_type, city
      FROM ${databricks.CATALOG}.${databricks.SCHEMA}.location_events_silver 
      WHERE entity_id = '${entityId}'
      LIMIT 1
    `);

    if (devices.length === 0) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    const d = devices[0];
    const device = {
      id: `device_${d.entity_id}`,
      name: `Device ${d.entity_id}`,
      device_type: d.device_type || 'smartphone',
      owner_id: d.entity_id,
      is_burner: 0,
      properties: {},
    };

    res.json({ success: true, device });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/positions/:hour
 * Get all device positions at a specific hour
 */
app.get('/api/demo/positions/:hour', async (req, res) => {
  try {
    const hour = parseInt(req.params.hour, 10);
    if (isNaN(hour) || hour < 0 || hour > 71) {
      return res.status(400).json({ success: false, error: 'Hour must be 0-71' });
    }

    const locationEvents = await databricks.getLocationEvents(200);

    // Simulate positions based on location events
    const positions = locationEvents.slice(0, 30).map((event, i) => ({
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
 * GET /api/demo/hotspots/:hour
 * Get hotspots (towers with device counts) at a specific hour
 */
app.get('/api/demo/hotspots/:hour', async (req, res) => {
  try {
    const hour = parseInt(req.params.hour, 10);
    if (isNaN(hour) || hour < 0 || hour > 71) {
      return res.status(400).json({ success: false, error: 'Hour must be 0-71' });
    }

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
 * GET /api/demo/cases
 * Get all cases
 */
app.get('/api/demo/cases', async (req, res) => {
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
      hour: 25,
      status: c.status === 'open' ? 'investigating' : c.status || 'investigating',
      priority: c.priority?.charAt(0).toUpperCase() + c.priority?.slice(1) || 'Medium',
      assignedTo: 'Analyst Team',
      estimatedLoss: c.estimated_loss,
      methodOfEntry: c.method_of_entry,
      stolenItems: c.target_items,
      properties: c.properties ? JSON.parse(c.properties) : {},
      persons: [],
      devices: [],
      hotspot: null,
      createdAt: c.incident_start_ts || new Date().toISOString(),
      updatedAt: c.ingestion_timestamp || new Date().toISOString(),
    }));

    res.json({ success: true, cases: formattedCases });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/cases/:id
 * Get a single case by ID
 */
app.get('/api/demo/cases/:id', async (req, res) => {
  try {
    const caseId = req.params.id;
    const cases = await databricks.runCustomQuery(`
      SELECT * FROM ${databricks.CATALOG}.${databricks.SCHEMA}.cases_silver 
      WHERE case_id = '${caseId}' 
      LIMIT 1
    `);

    if (cases.length === 0) {
      return res.status(404).json({ success: false, error: 'Case not found' });
    }

    const c = cases[0];
    const caseData = {
      id: c.case_id,
      caseNumber: c.case_id,
      title: `${c.case_type} - ${c.city}`,
      description: c.narrative,
      city: c.city,
      state: c.state,
      neighborhood: c.address?.split(',')[0] || 'Unknown',
      lat: c.latitude,
      lng: c.longitude,
      hour: 25,
      status: c.status === 'open' ? 'investigating' : c.status || 'investigating',
      priority: c.priority?.charAt(0).toUpperCase() + c.priority?.slice(1) || 'Medium',
      assignedTo: 'Analyst Team',
      estimatedLoss: c.estimated_loss,
      methodOfEntry: c.method_of_entry,
      stolenItems: c.target_items,
      properties: c.properties ? JSON.parse(c.properties) : {},
      persons: [],
      devices: [],
    };

    res.json({ success: true, case: caseData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/cases/at-hour/:hour
 * Get cases that occur at a specific hour
 */
app.get('/api/demo/cases/at-hour/:hour', async (req, res) => {
  try {
    const hour = parseInt(req.params.hour, 10);
    const cases = await databricks.getCases(100);

    // Filter cases by simulated hour (since Databricks data might not have hour field)
    const filteredCases = cases.filter((_, i) => i * 12 === hour || Math.abs(i * 12 - hour) < 6);

    res.json({ success: true, hour, cases: filteredCases });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/relationships
 * Get all person relationships
 */
app.get('/api/demo/relationships', async (req, res) => {
  try {
    const [coPresence, socialEdges] = await Promise.all([
      databricks.getCoPresenceEdges(100),
      databricks.getSocialEdges(100),
    ]);

    const relationships = [
      ...coPresence.map((e) => ({
        person1Id: e.entity_id_1,
        person1Name: `Entity ${e.entity_id_1}`,
        person1Alias: null,
        person2Id: e.entity_id_2,
        person2Name: `Entity ${e.entity_id_2}`,
        person2Alias: null,
        type: 'CO_LOCATED',
        count: e.co_occurrence_count,
        cities: e.city,
        notes: null,
      })),
      ...socialEdges.map((e) => ({
        person1Id: e.entity_id_1,
        person1Name: `Entity ${e.entity_id_1}`,
        person1Alias: null,
        person2Id: e.entity_id_2,
        person2Name: `Entity ${e.entity_id_2}`,
        person2Alias: null,
        type: e.edge_type || 'CONTACTED',
        count: e.interaction_count || 1,
        cities: null,
        notes: null,
      })),
    ];

    res.json({ success: true, relationships });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/relationships/:personId
 * Get relationships for a specific person
 */
app.get('/api/demo/relationships/:personId', async (req, res) => {
  try {
    const personId = req.params.personId;
    const [coPresence, socialEdges] = await Promise.all([
      databricks.getCoPresenceEdges(100),
      databricks.getSocialEdges(100),
    ]);

    const relationships = [
      ...coPresence
        .filter((e) => e.entity_id_1 === personId || e.entity_id_2 === personId)
        .map((e) => ({
          person1Id: e.entity_id_1,
          person2Id: e.entity_id_2,
          type: 'CO_LOCATED',
          count: e.co_occurrence_count,
        })),
      ...socialEdges
        .filter((e) => e.entity_id_1 === personId || e.entity_id_2 === personId)
        .map((e) => ({
          person1Id: e.entity_id_1,
          person2Id: e.entity_id_2,
          type: e.edge_type || 'CONTACTED',
          count: e.interaction_count || 1,
        })),
    ];

    res.json({ success: true, relationships });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/graph-data
 * Get graph data for network visualization
 */
app.get('/api/demo/graph-data', async (req, res) => {
  try {
    const [rankings, coPresence, socialEdges] = await Promise.all([
      databricks.getSuspectRankings(20),
      databricks.getCoPresenceEdges(100),
      databricks.getSocialEdges(100),
    ]);

    // Build nodes from suspect rankings
    const nodes = rankings.map((r) => ({
      id: r.entity_id,
      name: r.entity_name || `Entity ${r.entity_id}`,
      alias: r.alias || (r.entity_id.includes('SUSPECT') ? r.entity_id.split('_')[1] : null),
      type: 'person',
      isSuspect: true,
      threatLevel: r.total_score > 1.5 ? 'High' : 'Medium',
      totalScore: r.total_score,
      linkedCities: r.linked_cities,
      properties: r.properties ? JSON.parse(r.properties) : {},
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

    // Build links
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
 * POST /api/demo/evidence-card
 * Generate an evidence card summary for given suspects
 */
app.post('/api/demo/evidence-card', async (req, res) => {
  try {
    const { personIds } = req.body;
    if (!personIds || !Array.isArray(personIds)) {
      return res.status(400).json({ success: false, error: 'personIds array required' });
    }

    const [rankings, coPresence, cases] = await Promise.all([
      databricks.getSuspectRankings(50),
      databricks.getCoPresenceEdges(100),
      databricks.getCases(50),
    ]);

    const suspects = rankings.filter((r) => personIds.includes(r.entity_id));
    const relevantCoPresence = coPresence.filter(
      (e) => personIds.includes(e.entity_id_1) || personIds.includes(e.entity_id_2)
    );

    const evidenceCard = {
      title: 'Cross-Jurisdictional Analysis Evidence',
      generatedAt: new Date().toISOString(),
      suspects: suspects.map((s) => ({
        id: s.entity_id,
        name: s.entity_name || `Entity ${s.entity_id}`,
        alias: s.alias,
        threatLevel: s.total_score > 1.5 ? 'High' : 'Medium',
        criminalHistory: `${s.case_count || 0} linked cases`,
        properties: s.properties ? JSON.parse(s.properties) : {},
      })),
      linkedCases: cases.slice(0, 5).map((c) => ({
        id: c.case_id,
        caseNumber: c.case_id,
        title: `${c.case_type} - ${c.city}`,
        city: c.city,
        status: c.status,
        estimatedLoss: c.estimated_loss,
      })),
      signals: {
        geospatial: [
          {
            claim: `Suspects co-located at ${relevantCoPresence.length} different locations`,
            confidence: 'High',
          },
        ],
        narrative: [
          {
            claim: 'Cross-jurisdictional pattern detected',
            confidence: 'High',
          },
        ],
        social: [
          {
            claim: 'Communication links detected between suspects',
            confidence: 'Medium',
          },
        ],
      },
      summary: `Intelligence analysis reveals coordinated activity. ${suspects.length} entities identified with cross-jurisdictional presence.`,
      recommendedAction:
        'Continue monitoring suspect network. Coordinate with relevant jurisdictions.',
    };

    res.json({ success: true, evidenceCard });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== ENTITY NAMING/PROPERTIES ENDPOINTS ==============

/**
 * PATCH /api/demo/persons/:id/properties
 * Update properties for a person (e.g., set display name)
 * Body: { properties: { display_name: "John Doe", ... } }
 */
app.patch('/api/demo/persons/:id/properties', async (req, res) => {
  try {
    const entityId = req.params.id;
    const { properties } = req.body;

    if (!properties || typeof properties !== 'object') {
      return res.status(400).json({ success: false, error: 'properties object required' });
    }

    const updated = await databricks.updateEntityProperties(
      'suspect_rankings',
      'entity_id',
      entityId,
      properties
    );

    res.json({ success: true, entityId, properties: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/demo/persons/:id/name
 * Set display name for a person
 * Body: { name: "John Doe" }
 */
app.patch('/api/demo/persons/:id/name', async (req, res) => {
  try {
    const entityId = req.params.id;
    const { name } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ success: false, error: 'name string required' });
    }

    const updated = await databricks.setEntityName('suspect_rankings', 'entity_id', entityId, name);

    res.json({ success: true, entityId, properties: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/demo/cases/:id/properties
 * Update properties for a case
 * Body: { properties: { display_name: "Operation Ghost", ... } }
 */
app.patch('/api/demo/cases/:id/properties', async (req, res) => {
  try {
    const caseId = req.params.id;
    const { properties } = req.body;

    if (!properties || typeof properties !== 'object') {
      return res.status(400).json({ success: false, error: 'properties object required' });
    }

    const updated = await databricks.updateEntityProperties(
      'cases_silver',
      'case_id',
      caseId,
      properties
    );

    res.json({ success: true, caseId, properties: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== HOTSPOT ENTITY ENDPOINTS ==============

/**
 * GET /api/demo/hotspots-entity
 * Get all hotspots (from cell device counts)
 */
app.get('/api/demo/hotspots-entity', async (req, res) => {
  try {
    const cellCounts = await databricks.getCellDeviceCounts(50);

    const hotspots = cellCounts.map((c, i) => ({
      id: `hotspot_${c.h3_cell || i}`,
      name: `Zone ${c.h3_cell?.slice(-6) || i}`,
      lat: c.latitude || 38.9,
      lng: c.longitude || -77.0,
      radiusKm: 0.5,
      city: c.city || 'Unknown',
      state: c.state,
      status: 'active',
      mergedIntoId: null,
      notes: null,
      caseIds: [],
      properties: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    res.json({ success: true, hotspots });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/hotspots-entity/:id
 * Get a single hotspot by ID
 */
app.get('/api/demo/hotspots-entity/:id', async (req, res) => {
  try {
    const hotspotId = req.params.id;
    const h3Cell = hotspotId.replace('hotspot_', '');

    const cellCounts = await databricks.getCellDeviceCounts(50);
    const hotspot = cellCounts.find((c) => c.h3_cell === h3Cell);

    if (!hotspot) {
      return res.status(404).json({ success: false, error: 'Hotspot not found' });
    }

    res.json({
      success: true,
      hotspot: {
        id: hotspotId,
        name: `Zone ${h3Cell.slice(-6)}`,
        lat: hotspot.latitude,
        lng: hotspot.longitude,
        radiusKm: 0.5,
        city: hotspot.city,
        status: 'active',
        notes: null,
        cases: [],
        properties: {},
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== DATABRICKS DIRECT ENDPOINTS ==============

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
 * Get co-presence edges
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
 * Get social edges
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

// ============== HEALTH CHECK ==============

app.get('/health', async (req, res) => {
  let databricksStatus = 'disconnected';
  let tableCount = 0;

  try {
    const tables = await databricks.listTables();
    databricksStatus = 'connected';
    tableCount = tables.length;
  } catch (error) {
    databricksStatus = `error: ${error.message}`;
  }

  const response = {
    status: databricksStatus === 'connected' ? 'ok' : 'degraded',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    database: {
      type: 'Databricks',
      catalog: databricks.CATALOG,
      schema: databricks.SCHEMA,
      status: databricksStatus,
      tableCount,
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
