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

const app = express();
const PORT = process.env.PORT || 3000;

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
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../dist');
  logger.info({ type: 'static_files', distPath, exists: fs.existsSync(distPath) });
  app.use(
    express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      },
    })
  );
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

// ============== HEALTH CHECK ==============

app.get('/health', (req, res) => {
  const towers = getAllCellTowers(db).length;
  const persons = getAllPersons(db).length;
  const devices = getAllDevices(db).length;
  const cases = getAllDemoCases(db).length;

  res.json({
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
  });
});

// ============== SERVE FRONTEND ==============

if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, '../dist/index.html');
    if (!fs.existsSync(indexPath)) {
      return res.status(404).json({ error: 'Frontend not found' });
    }
    res.sendFile(indexPath);
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info({ type: 'server_shutdown', signal: 'SIGINT' });
  if (db) db.close();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  const towers = getAllCellTowers(db).length;
  const persons = getAllPersons(db).length;

  logger.info({
    type: 'server_started',
    url: `http://localhost:${PORT}`,
    database: { towers, persons },
  });
});
