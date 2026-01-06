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

// ============== IN-MEMORY ASSIGNEE STORE ==============
// Stores assignees locally (persisted to JSON file)
const ASSIGNEES_FILE = path.join(__dirname, 'db', 'assignees.json');

// Default assignees
const DEFAULT_ASSIGNEES = [
  {
    id: 'user_001',
    name: 'Sarah Chen',
    role: 'Lead Analyst',
    email: 'sarah.chen@agency.gov',
    active: true,
  },
  {
    id: 'user_002',
    name: 'Marcus Johnson',
    role: 'Senior Analyst',
    email: 'marcus.johnson@agency.gov',
    active: true,
  },
  {
    id: 'user_003',
    name: 'Elena Rodriguez',
    role: 'Analyst',
    email: 'elena.rodriguez@agency.gov',
    active: true,
  },
  {
    id: 'user_004',
    name: 'James Wilson',
    role: 'Junior Analyst',
    email: 'james.wilson@agency.gov',
    active: true,
  },
  { id: 'user_005', name: 'Analyst Team', role: 'Team', email: 'team@agency.gov', active: true },
];

// Load assignees from file or use defaults
function loadAssignees() {
  try {
    if (fs.existsSync(ASSIGNEES_FILE)) {
      const data = fs.readFileSync(ASSIGNEES_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    logger.warn({ type: 'assignees_load', status: 'failed', error: error.message });
  }
  return [...DEFAULT_ASSIGNEES];
}

// Save assignees to file
function saveAssignees(assignees) {
  try {
    fs.writeFileSync(ASSIGNEES_FILE, JSON.stringify(assignees, null, 2));
    return true;
  } catch (error) {
    logger.error({ type: 'assignees_save', status: 'failed', error: error.message });
    return false;
  }
}

// In-memory assignees store
let assigneesStore = loadAssignees();

// Case-to-assignee mapping (in-memory, could be persisted)
const CASE_ASSIGNMENTS_FILE = path.join(__dirname, 'db', 'case_assignments.json');

function loadCaseAssignments() {
  try {
    if (fs.existsSync(CASE_ASSIGNMENTS_FILE)) {
      const data = fs.readFileSync(CASE_ASSIGNMENTS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    logger.warn({ type: 'case_assignments_load', status: 'failed', error: error.message });
  }
  return {};
}

function saveCaseAssignments(assignments) {
  try {
    fs.writeFileSync(CASE_ASSIGNMENTS_FILE, JSON.stringify(assignments, null, 2));
    return true;
  } catch (error) {
    logger.error({ type: 'case_assignments_save', status: 'failed', error: error.message });
    return false;
  }
}

let caseAssignmentsStore = loadCaseAssignments();

// ============== ENTITY TITLES STORE ==============
// Stores custom display titles for entities without modifying their IDs
// Structure: { entityType: { entityId: { title, notes, updatedAt } } }
const ENTITY_TITLES_FILE = path.join(__dirname, 'db', 'entity_titles.json');

function loadEntityTitles() {
  try {
    if (fs.existsSync(ENTITY_TITLES_FILE)) {
      const data = fs.readFileSync(ENTITY_TITLES_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    logger.warn({ type: 'entity_titles_load', status: 'failed', error: error.message });
  }
  return { persons: {}, cases: {}, devices: {}, hotspots: {}, locations: {} };
}

function saveEntityTitles(titles) {
  try {
    fs.writeFileSync(ENTITY_TITLES_FILE, JSON.stringify(titles, null, 2));
    return true;
  } catch (error) {
    logger.error({ type: 'entity_titles_save', status: 'failed', error: error.message });
    return false;
  }
}

let entityTitlesStore = loadEntityTitles();

// ============== IN-MEMORY CACHE ==============
// Simple cache with TTL for expensive Databricks queries
const cache = {
  store: new Map(),

  // Default TTL: 5 minutes (300000ms)
  DEFAULT_TTL: 5 * 60 * 1000,

  /**
   * Get cached value if not expired
   * @param {string} key - Cache key
   * @returns {any|null} - Cached value or null if expired/missing
   */
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      logger.info({ type: 'cache_expired', key });
      return null;
    }

    logger.info({
      type: 'cache_hit',
      key,
      age: Math.round((Date.now() - entry.createdAt) / 1000) + 's',
    });
    return entry.value;
  },

  /**
   * Set cache value with TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in ms (default: 5 minutes)
   */
  set(key, value, ttl = this.DEFAULT_TTL) {
    const now = Date.now();
    this.store.set(key, {
      value,
      createdAt: now,
      expiresAt: now + ttl,
    });
    logger.info({ type: 'cache_set', key, ttl: Math.round(ttl / 1000) + 's' });
  },

  /**
   * Invalidate a specific cache key
   * @param {string} key - Cache key to invalidate
   */
  invalidate(key) {
    if (this.store.has(key)) {
      this.store.delete(key);
      logger.info({ type: 'cache_invalidate', key });
    }
  },

  /**
   * Invalidate all cache keys matching a prefix
   * @param {string} prefix - Key prefix to match
   */
  invalidatePrefix(prefix) {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        count++;
      }
    }
    if (count > 0) {
      logger.info({ type: 'cache_invalidate_prefix', prefix, count });
    }
  },

  /**
   * Clear entire cache
   */
  clear() {
    const size = this.store.size;
    this.store.clear();
    logger.info({ type: 'cache_clear', entriesCleared: size });
  },

  /**
   * Get cache statistics
   */
  stats() {
    const now = Date.now();
    let validCount = 0;
    let expiredCount = 0;

    for (const entry of this.store.values()) {
      if (now > entry.expiresAt) {
        expiredCount++;
      } else {
        validCount++;
      }
    }

    return { total: this.store.size, valid: validCount, expired: expiredCount };
  },
};

// Cache TTL settings (in milliseconds)
const CACHE_TTL = {
  GRAPH_DATA: 5 * 60 * 1000, // 5 minutes - complex query
  PERSONS: 5 * 60 * 1000, // 5 minutes
  CASES: 2 * 60 * 1000, // 2 minutes - may change more often
  CONFIG: 10 * 60 * 1000, // 10 minutes - rarely changes
  RELATIONSHIPS: 5 * 60 * 1000, // 5 minutes
  HOTSPOTS: 1 * 60 * 1000, // 1 minute - time-sensitive
  POSITIONS: 30 * 1000, // 30 seconds - frequently changing
};

// Helper to get entity title (returns custom title or null)
function getEntityTitle(entityType, entityId) {
  return entityTitlesStore[entityType]?.[entityId] || null;
}

// Helper to apply custom titles to an entity object
function applyEntityTitle(entity, entityType, idField = 'id') {
  const customTitle = getEntityTitle(entityType, entity[idField]);
  if (customTitle) {
    return {
      ...entity,
      customTitle: customTitle.title,
      customNotes: customTitle.notes,
      hasCustomTitle: true,
    };
  }
  return { ...entity, hasCustomTitle: false };
}

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
    const cacheKey = `persons-${suspectsOnly ? 'suspects' : 'all'}`;

    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ success: true, persons: cached, fromCache: true });
    }

    const rankings = await databricks.getSuspectRankings(500); // Get all

    const persons = rankings
      .filter((r) => !suspectsOnly || r.total_score > 0.5)
      .map((r) => {
        const customTitle = getEntityTitle('persons', r.entity_id);
        const originalName = r.entity_name || `Entity ${r.entity_id}`;
        return {
          id: r.entity_id,
          name: customTitle?.title || originalName,
          originalName,
          customTitle: customTitle?.title || null,
          customNotes: customTitle?.notes || null,
          hasCustomTitle: !!customTitle,
          alias: r.alias || null,
          is_suspect: r.total_score > 0.5 ? 1 : 0,
          threat_level: r.total_score > 1.5 ? 'High' : r.total_score > 1 ? 'Medium' : 'Low',
          criminal_history: `${r.case_count || 0} linked cases across ${r.states_count || 1} states`,
          notes: customTitle?.notes || null,
          properties: r.properties ? JSON.parse(r.properties) : {},
          totalScore: r.total_score,
          linkedCases: r.linked_cases,
          linkedCities: r.linked_cities,
        };
      });

    // Cache the result
    cache.set(cacheKey, persons, CACHE_TTL.PERSONS);

    res.json({ success: true, persons, fromCache: false });
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

    // Deduplicate by entity_id - only keep the first (most recent) position per entity
    const seenEntities = new Set();
    const uniqueEvents = locationEvents.filter((event) => {
      if (!event.entity_id || seenEntities.has(event.entity_id)) {
        return false;
      }
      seenEntities.add(event.entity_id);
      return true;
    });

    // Simulate positions based on location events
    const positions = uniqueEvents.slice(0, 30).map((event, i) => ({
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
    const cacheKey = 'cases';

    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ success: true, cases: cached, fromCache: true });
    }

    const cases = await databricks.getCases(100);

    const formattedCases = cases.map((c) => {
      // Get assigned user for this case
      const assigneeId = caseAssignmentsStore[c.case_id];
      let assignee = null;
      let assignedTo = 'Analyst Team';

      if (assigneeId) {
        assignee = assigneesStore.find((a) => a.id === assigneeId);
        if (assignee) {
          assignedTo = assignee.name;
        }
      }

      return {
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
        assignedTo,
        assigneeId: assigneeId || null,
        assignee: assignee || null,
        estimatedLoss: c.estimated_loss,
        methodOfEntry: c.method_of_entry,
        stolenItems: c.target_items,
        properties: c.properties ? JSON.parse(c.properties) : {},
        persons: [],
        devices: [],
        hotspot: null,
        createdAt: c.incident_start_ts || new Date().toISOString(),
        updatedAt: c.ingestion_timestamp || new Date().toISOString(),
      };
    });

    // Cache the result
    cache.set(cacheKey, formattedCases, CACHE_TTL.CASES);

    res.json({ success: true, cases: formattedCases, fromCache: false });
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

    // Get assigned user for this case
    const assigneeId = caseAssignmentsStore[caseId];
    let assignee = null;
    let assignedTo = 'Analyst Team';

    if (assigneeId) {
      assignee = assigneesStore.find((a) => a.id === assigneeId);
      if (assignee) {
        assignedTo = assignee.name;
      }
    }

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
      assignedTo,
      assigneeId: assigneeId || null,
      assignee: assignee || null,
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
    const cacheKey = 'relationships';

    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ success: true, relationships: cached, fromCache: true });
    }

    const [coPresence, socialEdges] = await Promise.all([
      databricks.getCoPresenceEdges(500),
      databricks.getSocialEdges(500),
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

    // Cache the result
    cache.set(cacheKey, relationships, CACHE_TTL.RELATIONSHIPS);

    res.json({ success: true, relationships, fromCache: false });
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
    const cacheKey = 'graph-data';

    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ success: true, ...cached, fromCache: true });
    }

    // Fetch all suspects (199) and more edges for complete visualization
    const [rankings, coPresence, socialEdges] = await Promise.all([
      databricks.getSuspectRankings(500), // Get all suspects
      databricks.getCoPresenceEdges(2000), // More co-presence edges
      databricks.getSocialEdges(500), // More social edges
    ]);

    // Build nodes from suspect rankings with custom titles
    const nodes = rankings.map((r) => {
      const customTitle = getEntityTitle('persons', r.entity_id);
      const originalName = r.entity_name || `Entity ${r.entity_id}`;
      return {
        id: r.entity_id,
        name: customTitle?.title || originalName,
        originalName,
        customTitle: customTitle?.title || null,
        customNotes: customTitle?.notes || null,
        hasCustomTitle: !!customTitle,
        alias: r.alias || (r.entity_id.includes('SUSPECT') ? r.entity_id.split('_')[1] : null),
        type: 'person',
        isSuspect: true,
        threatLevel: r.total_score > 1.5 ? 'High' : 'Medium',
        totalScore: r.total_score,
        linkedCities: r.linked_cities,
        properties: r.properties ? JSON.parse(r.properties) : {},
      };
    });

    // Add location nodes from linked cities with custom titles
    const citySet = new Set();
    rankings.forEach((r) => {
      (r.linked_cities || []).forEach((city) => citySet.add(city));
    });

    citySet.forEach((city) => {
      const locId = `loc_${city.toLowerCase().replace(/[^a-z]/g, '_')}`;
      const customTitle = getEntityTitle('locations', locId);
      nodes.push({
        id: locId,
        name: customTitle?.title || city,
        originalName: city,
        customTitle: customTitle?.title || null,
        hasCustomTitle: !!customTitle,
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

    // Cache the result
    const result = { nodes, links };
    cache.set(cacheKey, result, CACHE_TTL.GRAPH_DATA);

    res.json({ success: true, ...result, fromCache: false });
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

// ============== ASSIGNEES CRUD ENDPOINTS ==============

/**
 * GET /api/demo/assignees
 * Get all assignees
 */
app.get('/api/demo/assignees', (req, res) => {
  try {
    const activeOnly = req.query.active === 'true';
    const assignees = activeOnly ? assigneesStore.filter((a) => a.active) : assigneesStore;
    res.json({ success: true, assignees });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/assignees/:id
 * Get a single assignee by ID
 */
app.get('/api/demo/assignees/:id', (req, res) => {
  try {
    const assignee = assigneesStore.find((a) => a.id === req.params.id);
    if (!assignee) {
      return res.status(404).json({ success: false, error: 'Assignee not found' });
    }
    res.json({ success: true, assignee });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/demo/assignees
 * Create a new assignee
 * Body: { name: string, role?: string, email?: string }
 */
app.post('/api/demo/assignees', (req, res) => {
  try {
    const { name, role, email } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    const newAssignee = {
      id: `user_${Date.now()}`,
      name: name.trim(),
      role: role?.trim() || 'Analyst',
      email: email?.trim() || null,
      active: true,
      createdAt: new Date().toISOString(),
    };

    assigneesStore.push(newAssignee);
    saveAssignees(assigneesStore);

    logger.info({ type: 'assignee_created', assigneeId: newAssignee.id, name: newAssignee.name });
    res.status(201).json({ success: true, assignee: newAssignee });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/demo/assignees/:id
 * Update an assignee
 * Body: { name?: string, role?: string, email?: string, active?: boolean }
 */
app.patch('/api/demo/assignees/:id', (req, res) => {
  try {
    const { name, role, email, active } = req.body;
    const assigneeIdx = assigneesStore.findIndex((a) => a.id === req.params.id);

    if (assigneeIdx === -1) {
      return res.status(404).json({ success: false, error: 'Assignee not found' });
    }

    const assignee = assigneesStore[assigneeIdx];

    if (name !== undefined) assignee.name = name.trim();
    if (role !== undefined) assignee.role = role.trim();
    if (email !== undefined) assignee.email = email?.trim() || null;
    if (active !== undefined) assignee.active = Boolean(active);
    assignee.updatedAt = new Date().toISOString();

    assigneesStore[assigneeIdx] = assignee;
    saveAssignees(assigneesStore);

    logger.info({ type: 'assignee_updated', assigneeId: assignee.id });
    res.json({ success: true, assignee });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/demo/assignees/:id
 * Delete an assignee (soft delete - sets active to false)
 */
app.delete('/api/demo/assignees/:id', (req, res) => {
  try {
    const assigneeIdx = assigneesStore.findIndex((a) => a.id === req.params.id);

    if (assigneeIdx === -1) {
      return res.status(404).json({ success: false, error: 'Assignee not found' });
    }

    // Soft delete - just mark as inactive
    assigneesStore[assigneeIdx].active = false;
    assigneesStore[assigneeIdx].deletedAt = new Date().toISOString();
    saveAssignees(assigneesStore);

    logger.info({ type: 'assignee_deleted', assigneeId: req.params.id });
    res.json({ success: true, message: 'Assignee deactivated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== CASE ASSIGNMENT ENDPOINTS ==============

/**
 * GET /api/demo/cases/:id/assignee
 * Get the assignee for a specific case
 */
app.get('/api/demo/cases/:id/assignee', (req, res) => {
  try {
    const caseId = req.params.id;
    const assigneeId = caseAssignmentsStore[caseId];

    if (!assigneeId) {
      // Return default "Analyst Team" if no assignment
      const defaultAssignee =
        assigneesStore.find((a) => a.name === 'Analyst Team') || assigneesStore[0];
      return res.json({ success: true, assignee: defaultAssignee, isDefault: true });
    }

    const assignee = assigneesStore.find((a) => a.id === assigneeId);
    if (!assignee) {
      return res.status(404).json({ success: false, error: 'Assigned user not found' });
    }

    res.json({ success: true, assignee, isDefault: false });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/demo/cases/:id/assignee
 * Assign a case to an assignee
 * Body: { assigneeId: string }
 */
app.put('/api/demo/cases/:id/assignee', (req, res) => {
  try {
    const caseId = req.params.id;
    const { assigneeId } = req.body;

    if (!assigneeId) {
      return res.status(400).json({ success: false, error: 'assigneeId is required' });
    }

    const assignee = assigneesStore.find((a) => a.id === assigneeId);
    if (!assignee) {
      return res.status(404).json({ success: false, error: 'Assignee not found' });
    }

    if (!assignee.active) {
      return res.status(400).json({ success: false, error: 'Cannot assign to inactive user' });
    }

    caseAssignmentsStore[caseId] = assigneeId;
    saveCaseAssignments(caseAssignmentsStore);

    logger.info({ type: 'case_assigned', caseId, assigneeId, assigneeName: assignee.name });
    res.json({ success: true, caseId, assignee });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/demo/cases/:id/assignee
 * Unassign a case (reverts to default)
 */
app.delete('/api/demo/cases/:id/assignee', (req, res) => {
  try {
    const caseId = req.params.id;
    delete caseAssignmentsStore[caseId];
    saveCaseAssignments(caseAssignmentsStore);

    logger.info({ type: 'case_unassigned', caseId });
    res.json({ success: true, message: 'Case unassigned' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== ENTITY TITLES CRUD ENDPOINTS ==============

/**
 * GET /api/demo/entity-titles
 * Get all custom entity titles, optionally filtered by type
 * Query: ?type=persons|cases|devices|hotspots|locations
 */
app.get('/api/demo/entity-titles', (req, res) => {
  try {
    const { type } = req.query;
    if (type && entityTitlesStore[type]) {
      res.json({ success: true, entityType: type, titles: entityTitlesStore[type] });
    } else if (type) {
      res.status(400).json({ success: false, error: `Invalid entity type: ${type}` });
    } else {
      res.json({ success: true, titles: entityTitlesStore });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/demo/entity-titles/:type/:id
 * Get the custom title for a specific entity
 */
app.get('/api/demo/entity-titles/:type/:id', (req, res) => {
  try {
    const { type, id } = req.params;

    if (!entityTitlesStore[type]) {
      return res.status(400).json({ success: false, error: `Invalid entity type: ${type}` });
    }

    const titleInfo = entityTitlesStore[type][id];
    if (!titleInfo) {
      return res.json({
        success: true,
        entityId: id,
        entityType: type,
        title: null,
        hasCustomTitle: false,
      });
    }

    res.json({ success: true, entityId: id, entityType: type, ...titleInfo, hasCustomTitle: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/demo/entity-titles/:type/:id
 * Set or update a custom title for an entity (Create/Update)
 * Body: { title: string, notes?: string }
 */
app.put('/api/demo/entity-titles/:type/:id', (req, res) => {
  try {
    const { type, id } = req.params;
    const { title, notes } = req.body;

    if (!entityTitlesStore[type]) {
      return res.status(400).json({ success: false, error: `Invalid entity type: ${type}` });
    }

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Title is required' });
    }

    const isNew = !entityTitlesStore[type][id];

    entityTitlesStore[type][id] = {
      title: title.trim(),
      notes: notes?.trim() || null,
      createdAt: isNew ? new Date().toISOString() : entityTitlesStore[type][id].createdAt,
      updatedAt: new Date().toISOString(),
    };

    saveEntityTitles(entityTitlesStore);

    // Invalidate related caches since entity titles affect display
    cache.invalidate('graph-data');
    cache.invalidatePrefix('persons');

    logger.info({ type: 'entity_title_set', entityType: type, entityId: id, title: title.trim() });
    res.json({
      success: true,
      entityId: id,
      entityType: type,
      ...entityTitlesStore[type][id],
      isNew,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/demo/entity-titles/:type/:id
 * Partially update a custom title for an entity
 * Body: { title?: string, notes?: string }
 */
app.patch('/api/demo/entity-titles/:type/:id', (req, res) => {
  try {
    const { type, id } = req.params;
    const { title, notes } = req.body;

    if (!entityTitlesStore[type]) {
      return res.status(400).json({ success: false, error: `Invalid entity type: ${type}` });
    }

    if (!entityTitlesStore[type][id]) {
      return res.status(404).json({ success: false, error: 'Entity title not found' });
    }

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Title cannot be empty' });
      }
      entityTitlesStore[type][id].title = title.trim();
    }

    if (notes !== undefined) {
      entityTitlesStore[type][id].notes = notes?.trim() || null;
    }

    entityTitlesStore[type][id].updatedAt = new Date().toISOString();

    saveEntityTitles(entityTitlesStore);

    logger.info({ type: 'entity_title_updated', entityType: type, entityId: id });
    res.json({
      success: true,
      entityId: id,
      entityType: type,
      ...entityTitlesStore[type][id],
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/demo/entity-titles/:type/:id
 * Remove a custom title for an entity (reverts to original name)
 */
app.delete('/api/demo/entity-titles/:type/:id', (req, res) => {
  try {
    const { type, id } = req.params;

    if (!entityTitlesStore[type]) {
      return res.status(400).json({ success: false, error: `Invalid entity type: ${type}` });
    }

    if (!entityTitlesStore[type][id]) {
      return res.status(404).json({ success: false, error: 'Entity title not found' });
    }

    delete entityTitlesStore[type][id];
    saveEntityTitles(entityTitlesStore);

    // Invalidate related caches since entity titles affect display
    cache.invalidate('graph-data');
    cache.invalidatePrefix('persons');

    logger.info({ type: 'entity_title_deleted', entityType: type, entityId: id });
    res.json({ success: true, message: 'Custom title removed', entityId: id, entityType: type });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/demo/entity-titles/bulk
 * Set multiple entity titles at once
 * Body: { titles: [{ type: string, id: string, title: string, notes?: string }] }
 */
app.post('/api/demo/entity-titles/bulk', (req, res) => {
  try {
    const { titles } = req.body;

    if (!Array.isArray(titles) || titles.length === 0) {
      return res.status(400).json({ success: false, error: 'titles array is required' });
    }

    const results = [];
    const errors = [];

    for (const item of titles) {
      const { type, id, title, notes } = item;

      if (!entityTitlesStore[type]) {
        errors.push({ id, type, error: `Invalid entity type: ${type}` });
        continue;
      }

      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        errors.push({ id, type, error: 'Title is required' });
        continue;
      }

      const isNew = !entityTitlesStore[type][id];
      entityTitlesStore[type][id] = {
        title: title.trim(),
        notes: notes?.trim() || null,
        createdAt: isNew ? new Date().toISOString() : entityTitlesStore[type][id].createdAt,
        updatedAt: new Date().toISOString(),
      };

      results.push({ type, id, title: title.trim(), isNew });
    }

    saveEntityTitles(entityTitlesStore);

    logger.info({ type: 'entity_titles_bulk', count: results.length, errors: errors.length });
    res.json({ success: true, updated: results, errors: errors.length > 0 ? errors : undefined });
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

// ============== CACHE MANAGEMENT ENDPOINTS ==============

/**
 * GET /api/cache/stats
 * Get cache statistics
 */
app.get('/api/cache/stats', (req, res) => {
  const stats = cache.stats();
  const entries = [];

  for (const [key, entry] of cache.store.entries()) {
    const now = Date.now();
    entries.push({
      key,
      age: Math.round((now - entry.createdAt) / 1000) + 's',
      ttl: Math.max(0, Math.round((entry.expiresAt - now) / 1000)) + 's',
      expired: now > entry.expiresAt,
    });
  }

  res.json({
    success: true,
    stats,
    entries,
    ttlSettings: {
      GRAPH_DATA: CACHE_TTL.GRAPH_DATA / 1000 + 's',
      PERSONS: CACHE_TTL.PERSONS / 1000 + 's',
      CASES: CACHE_TTL.CASES / 1000 + 's',
      CONFIG: CACHE_TTL.CONFIG / 1000 + 's',
      RELATIONSHIPS: CACHE_TTL.RELATIONSHIPS / 1000 + 's',
      HOTSPOTS: CACHE_TTL.HOTSPOTS / 1000 + 's',
      POSITIONS: CACHE_TTL.POSITIONS / 1000 + 's',
    },
  });
});

/**
 * DELETE /api/cache
 * Clear entire cache
 */
app.delete('/api/cache', (req, res) => {
  cache.clear();
  res.json({ success: true, message: 'Cache cleared' });
});

/**
 * DELETE /api/cache/:key
 * Invalidate specific cache key
 */
app.delete('/api/cache/:key', (req, res) => {
  const { key } = req.params;
  cache.invalidate(key);
  res.json({ success: true, message: `Cache key '${key}' invalidated` });
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
