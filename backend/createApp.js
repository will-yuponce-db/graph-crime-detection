/**
 * Express app factory.
 *
 * Why this exists:
 * - `server.js` currently starts listening immediately, which makes integration testing hard.
 * - This factory allows tests to inject a stubbed Databricks client and use temp data dirs.
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { buildSystemPrompt, ALLOWED_PATHS, ALLOWED_QUERY_KEYS } = require('./agent/prompt');
const { invokeAgentModel } = require('./agent/databricksModelClient');

function ensureDirExists(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch {
    // ignore
  }
}

function safeReadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function safeWriteJson(filePath, data) {
  try {
    ensureDirExists(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch {
    return false;
  }
}

function escapeSqlLiteral(value) {
  // Escape for inclusion inside single quotes in SQL: ' -> ''
  return String(value).replace(/'/g, "''");
}

function clampHourToDemoWindow(hour) {
  const h = Number(hour);
  if (!Number.isFinite(h)) return null;
  const normalized = Math.round(h) % 72;
  return normalized < 0 ? normalized + 72 : normalized;
}

function isValidHourParam(hour) {
  return Number.isInteger(hour) && hour >= 0 && hour <= 71;
}

function nowIso() {
  return new Date().toISOString();
}

function safeParseSearchParams(search) {
  try {
    const raw = typeof search === 'string' ? search : '';
    const s = raw.startsWith('?') ? raw.slice(1) : raw;
    const sp = new URLSearchParams(s);
    const out = {};
    for (const [k, v] of sp.entries()) out[k] = v;
    return out;
  } catch {
    return {};
  }
}

function parseEntityIds(entityIdsRaw) {
  if (typeof entityIdsRaw !== 'string' || !entityIdsRaw.trim()) return [];
  return entityIdsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function parseHour(hourRaw) {
  if (typeof hourRaw !== 'string' || !hourRaw.trim()) return null;
  const m = hourRaw.match(/-?\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  if (!Number.isFinite(n)) return null;
  const normalized = ((Math.round(n) % 72) + 72) % 72;
  return normalized;
}

async function buildAgentDataContext({ databricks, cache, logger, uiContext }) {
  const path = typeof uiContext?.path === 'string' ? uiContext.path : '';
  const searchObj = safeParseSearchParams(uiContext?.search);

  const city = typeof searchObj.city === 'string' ? searchObj.city : null;
  const hour = parseHour(searchObj.hour);
  const caseId =
    typeof searchObj.case_id === 'string'
      ? searchObj.case_id
      : typeof searchObj.caseId === 'string'
        ? searchObj.caseId
        : typeof searchObj.case === 'string'
          ? searchObj.case
          : null;
  const entityIds = parseEntityIds(searchObj.entityIds);

  const ctx = {
    ui: {
      path,
      searchParams: searchObj,
      derived: { city, hour, caseId, entityIds },
    },
    data: {},
  };

  // Compact, cached summaries to help the agent make sensible suggestions.
  // Keep these small to avoid ballooning token usage.
  try {
    const suspectsCacheKey = `agentctx-suspects-top`;
    let suspectsTop = cache.get(suspectsCacheKey);
    if (!suspectsTop) {
      const rankings = await databricks.getSuspectRankings(30);
      suspectsTop = (rankings || []).slice(0, 12).map((r) => ({
        id: r.entity_id,
        name: r.entity_name || `Entity ${r.entity_id}`,
        alias: r.alias || null,
        totalScore: r.total_score,
        threatLevel: r.total_score > 1.5 ? 'High' : r.total_score > 1 ? 'Medium' : 'Low',
        linkedCities: r.linked_cities || null,
        linkedCases: r.linked_cases || null,
      }));
      cache.set(suspectsCacheKey, suspectsTop, 2 * 60 * 1000);
    }
    ctx.data.suspectsTop = suspectsTop;
  } catch (e) {
    logger.warn({ type: 'agent_context', section: 'suspectsTop', error: e.message });
  }

  try {
    const casesCacheKey = `agentctx-cases-top-${city || 'all'}`;
    let casesTop = cache.get(casesCacheKey);
    if (!casesTop) {
      const cases = await databricks.getCases(80);
      const filtered = city
        ? (cases || []).filter((c) =>
            String(c.city || '')
              .toLowerCase()
              .includes(city.toLowerCase())
          )
        : cases || [];
      casesTop = filtered.slice(0, 12).map((c) => ({
        id: c.case_id,
        city: c.city,
        priority: c.priority,
        status: c.status,
        caseType: c.case_type,
        address: c.address,
      }));
      cache.set(casesCacheKey, casesTop, 2 * 60 * 1000);
    }
    ctx.data.casesTop = casesTop;
  } catch (e) {
    logger.warn({ type: 'agent_context', section: 'casesTop', error: e.message });
  }

  return ctx;
}

function safeJsonParse(maybeJson) {
  if (typeof maybeJson !== 'string') return null;
  const s = maybeJson.trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    // Try to recover from extra text by extracting the first JSON object block
    const first = s.indexOf('{');
    const last = s.lastIndexOf('}');
    if (first >= 0 && last > first) {
      const slice = s.slice(first, last + 1);
      try {
        return JSON.parse(slice);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validateAndSanitizeActions(actions, { maxActions }) {
  if (!Array.isArray(actions)) return [];
  const out = [];

  for (const a of actions) {
    if (out.length >= maxActions) break;
    if (!isPlainObject(a)) continue;
    const type = a.type;
    if (type === 'navigate') {
      const path = a.path;
      if (typeof path !== 'string' || !ALLOWED_PATHS.includes(path)) continue;
      const searchParams = isPlainObject(a.searchParams) ? a.searchParams : undefined;
      const cleanParams = {};
      if (searchParams) {
        for (const [k, v] of Object.entries(searchParams)) {
          if (!ALLOWED_QUERY_KEYS.includes(k)) continue;
          if (typeof v !== 'string') continue;
          cleanParams[k] = v;
        }
      }
      out.push(
        Object.keys(cleanParams).length ? { type, path, searchParams: cleanParams } : { type, path }
      );
      continue;
    }

    if (type === 'setSearchParams') {
      const sp = a.searchParams;
      if (!isPlainObject(sp)) continue;
      const clean = {};
      for (const [k, v] of Object.entries(sp)) {
        if (!ALLOWED_QUERY_KEYS.includes(k)) continue;
        if (typeof v === 'string' || v === null) clean[k] = v;
      }
      out.push({ type, searchParams: clean });
      continue;
    }

    if (type === 'selectEntities') {
      const ids = a.entityIds;
      if (!Array.isArray(ids)) continue;
      const cleanIds = ids.filter((x) => typeof x === 'string' && x.trim()).slice(0, 50);
      out.push({ type, entityIds: cleanIds });
      continue;
    }

    if (type === 'generateEvidenceCard') {
      const ids = a.personIds;
      if (!Array.isArray(ids)) continue;
      const cleanIds = ids.filter((x) => typeof x === 'string' && x.trim()).slice(0, 50);
      const navigateToEvidenceCard =
        typeof a.navigateToEvidenceCard === 'boolean' ? a.navigateToEvidenceCard : undefined;
      out.push(
        navigateToEvidenceCard !== undefined
          ? { type, personIds: cleanIds, navigateToEvidenceCard }
          : { type, personIds: cleanIds }
      );
      continue;
    }
  }

  return out;
}

function createApp(options = {}) {
  const logger = options.logger || require('./utils/logger');
  const databricks = options.databricks || require('./db/databricks');

  const app = express();
  app.use(cors());
  app.use(express.json());

  // ============== FILE-BACKED STORES (demo persistence) ==============
  const dataDir = options.dataDir || path.join(__dirname, 'db');
  ensureDirExists(dataDir);

  const ASSIGNEES_FILE = path.join(dataDir, 'assignees.json');
  const CASE_ASSIGNMENTS_FILE = path.join(dataDir, 'case_assignments.json');
  const ENTITY_TITLES_FILE = path.join(dataDir, 'entity_titles.json');
  const LOCAL_CASES_FILE = path.join(dataDir, 'local_cases.json');
  const CASE_OVERRIDES_FILE = path.join(dataDir, 'case_overrides.json');

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

  let assigneesStore = safeReadJson(ASSIGNEES_FILE, DEFAULT_ASSIGNEES);
  let caseAssignmentsStore = safeReadJson(CASE_ASSIGNMENTS_FILE, {});
  let entityTitlesStore = safeReadJson(ENTITY_TITLES_FILE, {
    persons: {},
    cases: {},
    devices: {},
    hotspots: {},
    locations: {},
  });
  let localCasesStore = safeReadJson(LOCAL_CASES_FILE, []);
  let caseOverridesStore = safeReadJson(CASE_OVERRIDES_FILE, {});

  function saveAssignees() {
    return safeWriteJson(ASSIGNEES_FILE, assigneesStore);
  }
  function saveCaseAssignments() {
    return safeWriteJson(CASE_ASSIGNMENTS_FILE, caseAssignmentsStore);
  }
  function saveEntityTitles() {
    return safeWriteJson(ENTITY_TITLES_FILE, entityTitlesStore);
  }
  function saveLocalCases() {
    return safeWriteJson(LOCAL_CASES_FILE, localCasesStore);
  }
  function saveCaseOverrides() {
    return safeWriteJson(CASE_OVERRIDES_FILE, caseOverridesStore);
  }

  // ============== IN-MEMORY CACHE ==============
  const cache = {
    store: new Map(),
    DEFAULT_TTL: 5 * 60 * 1000,
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
    set(key, value, ttl = this.DEFAULT_TTL) {
      const now = Date.now();
      this.store.set(key, { value, createdAt: now, expiresAt: now + ttl });
      logger.info({ type: 'cache_set', key, ttl: Math.round(ttl / 1000) + 's' });
    },
    invalidate(key) {
      if (this.store.has(key)) {
        this.store.delete(key);
        logger.info({ type: 'cache_invalidate', key });
      }
    },
    invalidatePrefix(prefix) {
      let count = 0;
      for (const key of this.store.keys()) {
        if (key.startsWith(prefix)) {
          this.store.delete(key);
          count++;
        }
      }
      if (count > 0) logger.info({ type: 'cache_invalidate_prefix', prefix, count });
    },
    clear() {
      const size = this.store.size;
      this.store.clear();
      logger.info({ type: 'cache_clear', entriesCleared: size });
    },
    stats() {
      const now = Date.now();
      let validCount = 0;
      let expiredCount = 0;
      for (const entry of this.store.values()) {
        if (now > entry.expiresAt) expiredCount++;
        else validCount++;
      }
      return { total: this.store.size, valid: validCount, expired: expiredCount };
    },
  };

  const CACHE_TTL = {
    GRAPH_DATA: 5 * 60 * 1000,
    PERSONS: 5 * 60 * 1000,
    CASES: 2 * 60 * 1000,
    CONFIG: 10 * 60 * 1000,
    RELATIONSHIPS: 5 * 60 * 1000,
    HOTSPOTS: 1 * 60 * 1000,
    POSITIONS: 30 * 1000,
  };

  function getEntityTitle(entityType, entityId) {
    return entityTitlesStore?.[entityType]?.[entityId] || null;
  }

  // Request logging middleware (skip noisy positions endpoint)
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

  // ============== STATIC FILES + SPA ROUTING (monolith mode) ==============
  const distPath = options.distPath || path.join(__dirname, '../dist');
  const indexPath = options.indexPath || path.join(distPath, 'index.html');

  logger.info({
    type: 'static_files_config',
    distPath,
    indexPath,
    distExists: fs.existsSync(distPath),
    indexExists: fs.existsSync(indexPath),
    nodeEnv: process.env.NODE_ENV,
  });

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

  // ============== DEMO DATA ENDPOINTS (Databricks-backed + local overrides) ==============

  /**
   * POST /api/demo/agent/step
   * LLM-driven UI agent step.
   *
   * Request:
   *  { sessionId, history, uiContext, answer }
   *
   * Response:
   *  { success: true, assistantMessage, actions }
   */
  app.post('/api/demo/agent/step', async (req, res) => {
    try {
      const { sessionId, history, uiContext, answer } = req.body || {};

      if (typeof answer !== 'string' || !answer.trim()) {
        return res.status(400).json({ success: false, error: 'answer (string) is required' });
      }

      const maxActionsRaw = process.env.DATABRICKS_AGENT_MAX_ACTIONS;
      const maxActions =
        typeof maxActionsRaw === 'string' && maxActionsRaw.trim()
          ? Math.max(0, Math.min(10, parseInt(maxActionsRaw, 10) || 5))
          : 5;

      const agentDataContext = await buildAgentDataContext({
        databricks,
        cache,
        logger,
        uiContext,
      });

      const systemPrompt = buildSystemPrompt({ maxActions });
      const messages = [
        { role: 'system', content: systemPrompt },
        {
          role: 'system',
          content: `APP_CONTEXT_JSON (use it, do not echo verbatim): ${JSON.stringify({
            sessionId: typeof sessionId === 'string' ? sessionId : null,
            uiContext: uiContext || null,
            history: Array.isArray(history) ? history.slice(-20) : null,
            agentDataContext,
          })}`,
        },
        { role: 'user', content: answer.trim() },
      ];

      const { text, raw } = await invokeAgentModel({
        host: process.env.DATABRICKS_HOST,
        token: process.env.DATABRICKS_TOKEN,
        // Default to an existing endpoint name commonly present in Databricks environments,
        // so the UI can work with minimal configuration.
        endpointName: process.env.DATABRICKS_AGENT_ENDPOINT || 'databricks-gpt-5-2',
        messages,
        temperature: 0.2,
        maxTokens: 700,
      });

      const parsed = safeJsonParse(text);
      const assistantMessage =
        typeof parsed?.assistantMessage === 'string' && parsed.assistantMessage.trim()
          ? parsed.assistantMessage.trim()
          : typeof text === 'string' && text.trim()
            ? text.trim().slice(0, 500)
            : 'I could not generate a response.';

      const actions = validateAndSanitizeActions(parsed?.actions, { maxActions });

      // Helpful audit log (no secrets)
      logger.info({
        type: 'agent_step',
        sessionId: typeof sessionId === 'string' ? sessionId : undefined,
        actionsCount: actions.length,
        uiPath: uiContext?.path,
      });

      res.json({ success: true, assistantMessage, actions, rawModelResponse: raw });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

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

      const towers = locationResult.map((loc, i) => ({
        id: `tower_${i}`,
        name: `Cell ${loc.h3_cell?.slice(-6) || i}`,
        latitude: loc.latitude,
        longitude: loc.longitude,
        city: loc.city || 'Unknown',
        properties: {},
      }));

      // IMPORTANT: Keep keyFrame hours inside 0-71 to match UI time window.
      const keyFrames = casesResult.map((c, i) => {
        const hour = clampHourToDemoWindow(i * 12);
        return {
          id: c.case_id,
          caseNumber: c.case_id,
          hour: hour == null ? 0 : hour,
          lat: c.latitude,
          lng: c.longitude,
          neighborhood: c.address?.split(',')[0] || 'Unknown',
          city: c.city,
          description: (c.narrative ? c.narrative.slice(0, 100) + '...' : null) || c.case_type,
          priority: c.priority || 'medium',
        };
      });

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

  app.get('/api/demo/persons', async (req, res) => {
    try {
      const suspectsOnly = req.query.suspects === 'true';
      const cacheKey = `persons-${suspectsOnly ? 'suspects' : 'all'}`;
      const cached = cache.get(cacheKey);
      if (cached) return res.json({ success: true, persons: cached, fromCache: true });

      const rankings = await databricks.getSuspectRankings(500);
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

      cache.set(cacheKey, persons, CACHE_TTL.PERSONS);
      res.json({ success: true, persons, fromCache: false });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/demo/persons/:id', async (req, res) => {
    try {
      const entityId = req.params.id;
      const safeId = escapeSqlLiteral(entityId);
      const rankings = await databricks.runCustomQuery(`
        SELECT * FROM ${databricks.CATALOG}.${databricks.SCHEMA}.suspect_rankings
        WHERE entity_id = '${safeId}'
        LIMIT 1
      `);

      if (rankings.length === 0)
        return res.status(404).json({ success: false, error: 'Person not found' });

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

  app.get('/api/demo/positions/:hour', async (req, res) => {
    try {
      const hour = parseInt(req.params.hour, 10);
      if (!isValidHourParam(hour))
        return res.status(400).json({ success: false, error: 'Hour must be 0-71' });

      const locationEvents = await databricks.getLocationEvents(200);
      const seenEntities = new Set();
      const uniqueEvents = locationEvents.filter((event) => {
        if (!event.entity_id || seenEntities.has(event.entity_id)) return false;
        seenEntities.add(event.entity_id);
        return true;
      });

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

  app.get('/api/demo/hotspots/:hour', async (req, res) => {
    try {
      const hour = parseInt(req.params.hour, 10);
      if (!isValidHourParam(hour))
        return res.status(400).json({ success: false, error: 'Hour must be 0-71' });

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

  function applyCaseOverrides(caseObj) {
    const override = caseOverridesStore?.[caseObj.id];
    if (!override) return caseObj;
    return {
      ...caseObj,
      status: override.status || caseObj.status,
      priority: override.priority || caseObj.priority,
      updatedAt: override.updatedAt || caseObj.updatedAt,
    };
  }

  function withAssignment(caseObj) {
    const assigneeId = caseAssignmentsStore?.[caseObj.id];
    const assignee = assigneeId ? assigneesStore.find((a) => a.id === assigneeId) : null;
    const assignedTo = assignee?.name || caseObj.assignedTo || 'Analyst Team';
    return {
      ...caseObj,
      assignedTo,
      assigneeId: assigneeId || null,
      assignee: assignee || null,
    };
  }

  app.get('/api/demo/cases', async (req, res) => {
    try {
      const cacheKey = 'cases';
      const cached = cache.get(cacheKey);
      if (cached) return res.json({ success: true, cases: cached, fromCache: true });

      const cases = await databricks.getCases(100);
      let formattedCases = cases.map((c) => ({
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
        createdAt: c.incident_start_ts || nowIso(),
        updatedAt: c.ingestion_timestamp || nowIso(),
      }));

      // Include locally-created cases (from UI) as well
      const localCases = Array.isArray(localCasesStore) ? localCasesStore : [];
      formattedCases = [...localCases, ...formattedCases];

      // Apply overrides + assignments
      formattedCases = formattedCases.map((c) => withAssignment(applyCaseOverrides(c)));

      cache.set(cacheKey, formattedCases, CACHE_TTL.CASES);
      res.json({ success: true, cases: formattedCases, fromCache: false });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Create a new local case (demo persistence; does not write to Databricks)
  app.post('/api/demo/cases', (req, res) => {
    try {
      const { title, neighborhood, city, state, priority, description, estimatedLoss, assigneeId } =
        req.body || {};

      if (!city || typeof city !== 'string' || city.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'city is required' });
      }
      if (!neighborhood || typeof neighborhood !== 'string' || neighborhood.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'neighborhood is required' });
      }

      const id = `case_${Date.now()}`;
      const caseNumber = `CASE_${city
        .toUpperCase()
        .replace(/[^A-Z]/g, '')
        .slice(0, 2)}_${String(localCasesStore.length + 1).padStart(3, '0')}`;

      const createdAt = nowIso();
      const newCase = {
        id,
        caseNumber,
        title:
          typeof title === 'string' && title.trim().length > 0
            ? title.trim()
            : `${priority || 'Medium'} priority case`,
        city: city.trim(),
        state: typeof state === 'string' ? state.trim() : '',
        neighborhood: neighborhood.trim(),
        status: 'investigating',
        priority:
          typeof priority === 'string' && priority.trim().length > 0 ? priority.trim() : 'Medium',
        createdAt,
        updatedAt: createdAt,
        assignedTo: 'Analyst Team',
        estimatedLoss:
          typeof estimatedLoss === 'number'
            ? estimatedLoss
            : estimatedLoss
              ? Number(estimatedLoss)
              : undefined,
        description: typeof description === 'string' ? description : '',
        persons: [],
        devices: [],
        properties: {},
      };

      localCasesStore = [newCase, ...localCasesStore];
      saveLocalCases();

      // If an assigneeId was provided, persist the assignment
      if (assigneeId) {
        const assignee = assigneesStore.find((a) => a.id === assigneeId);
        if (!assignee) {
          return res.status(404).json({ success: false, error: 'Assignee not found' });
        }
        if (!assignee.active) {
          return res.status(400).json({ success: false, error: 'Cannot assign to inactive user' });
        }
        caseAssignmentsStore[id] = assigneeId;
        saveCaseAssignments();
      }

      cache.invalidate('cases');
      logger.info({ type: 'case_created', caseId: id, caseNumber });

      res.status(201).json({ success: true, case: withAssignment(newCase) });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Persist status updates as local overrides (demo persistence)
  app.patch('/api/demo/cases/:id/status', (req, res) => {
    try {
      const caseId = req.params.id;
      const { status } = req.body || {};
      const allowed = new Set(['investigating', 'review', 'adjudicated']);
      if (!allowed.has(status)) {
        return res
          .status(400)
          .json({ success: false, error: 'status must be investigating|review|adjudicated' });
      }
      caseOverridesStore[caseId] = {
        ...(caseOverridesStore[caseId] || {}),
        status,
        updatedAt: nowIso(),
      };
      saveCaseOverrides();
      cache.invalidate('cases');
      logger.info({ type: 'case_status_updated', caseId, status });
      res.json({ success: true, caseId, status });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/demo/relationships
   * Relationships across entities (co-presence + social edges)
   */
  app.get('/api/demo/relationships', async (req, res) => {
    try {
      const cacheKey = 'relationships';
      const cached = cache.get(cacheKey);
      if (cached) return res.json({ success: true, relationships: cached, fromCache: true });

      const [coPresence, socialEdges] = await Promise.all([
        databricks.getCoPresenceEdges(2000),
        databricks.getSocialEdges(2000),
      ]);

      const relationships = [
        ...(coPresence || []).map((e) => ({
          person1Id: e.entity_id_1,
          person1Name: `Entity ${e.entity_id_1}`,
          person1Alias: null,
          person2Id: e.entity_id_2,
          person2Name: `Entity ${e.entity_id_2}`,
          person2Alias: null,
          type: 'CO_LOCATED',
          count: e.co_occurrence_count,
          cities: e.city || null,
          notes: null,
        })),
        ...(socialEdges || []).map((e) => ({
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

      cache.set(cacheKey, relationships, CACHE_TTL.RELATIONSHIPS);
      res.json({ success: true, relationships, fromCache: false });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/demo/graph-data
   * Network visualization nodes/links
   */
  app.get('/api/demo/graph-data', async (req, res) => {
    try {
      const cacheKey = 'graph-data';
      const cached = cache.get(cacheKey);
      if (cached) return res.json({ success: true, ...cached, fromCache: true });

      const [rankings, coPresence, socialEdges] = await Promise.all([
        databricks.getSuspectRankings(500),
        databricks.getCoPresenceEdges(5000),
        databricks.getSocialEdges(5000),
      ]);

      const rankingIds = new Set((rankings || []).map((r) => r.entity_id));

      const nodes = (rankings || []).map((r) => {
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
          type: 'person',
          isSuspect: true,
          threatLevel: r.total_score > 1.5 ? 'High' : r.total_score > 1 ? 'Medium' : 'Low',
          totalScore: r.total_score,
          linkedCities: r.linked_cities,
          properties: r.properties ? JSON.parse(r.properties) : {},
        };
      });

      // Location nodes (one per city)
      const citySet = new Set();
      (rankings || []).forEach((r) => {
        (r.linked_cities || []).forEach((city) => citySet.add(city));
      });
      citySet.forEach((city) => {
        const locId = `loc_${String(city)
          .toLowerCase()
          .replace(/[^a-z]/g, '_')}`;
        const customTitle = getEntityTitle('locations', locId);
        nodes.push({
          id: locId,
          name: customTitle?.title || city,
          originalName: city,
          customTitle: customTitle?.title || null,
          hasCustomTitle: !!customTitle,
          type: 'location',
          city,
        });
      });

      const links = [];
      // Co-presence links between known ranking nodes only
      (coPresence || []).forEach((edge) => {
        if (!edge?.entity_id_1 || !edge?.entity_id_2) return;
        if (!rankingIds.has(edge.entity_id_1) || !rankingIds.has(edge.entity_id_2)) return;
        links.push({
          source: edge.entity_id_1,
          target: edge.entity_id_2,
          type: 'CO_LOCATED',
          count: edge.co_occurrence_count,
          weight: edge.weight,
          cities: edge.city || null,
        });
      });

      // Social links (keep as-is; UI will filter)
      (socialEdges || []).forEach((edge) => {
        if (!edge?.entity_id_1 || !edge?.entity_id_2) return;
        links.push({
          source: edge.entity_id_1,
          target: edge.entity_id_2,
          type: edge.edge_type || 'SOCIAL',
          count: edge.interaction_count || 1,
        });
      });

      // Suspect-to-location links
      (rankings || []).forEach((r) => {
        (r.linked_cities || []).forEach((city) => {
          links.push({
            source: r.entity_id,
            target: `loc_${String(city)
              .toLowerCase()
              .replace(/[^a-z]/g, '_')}`,
            type: 'DETECTED_AT',
            count: 1,
          });
        });
      });

      const result = { nodes, links };
      cache.set(cacheKey, result, CACHE_TTL.GRAPH_DATA);
      res.json({ success: true, ...result, fromCache: false });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/demo/cases/:id/detail
   * Case detail payload for UI: linked entities + geo evidence (best-effort)
   */
  app.get('/api/demo/cases/:id/detail', async (req, res) => {
    try {
      const caseId = req.params.id;
      const cacheKey = `case-detail:${caseId}`;
      const cached = cache.get(cacheKey);
      if (cached) return res.json({ success: true, ...cached, fromCache: true });

      const safeCaseId = escapeSqlLiteral(caseId);
      const rows = await databricks.runCustomQuery(`
        SELECT * FROM ${databricks.CATALOG}.${databricks.SCHEMA}.cases_silver
        WHERE case_id = '${safeCaseId}'
        LIMIT 1
      `);
      if (!rows || rows.length === 0)
        return res.status(404).json({ success: false, error: 'Case not found' });
      const c = rows[0];

      const baseCase = withAssignment(
        applyCaseOverrides({
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
          createdAt: c.incident_start_ts || nowIso(),
          updatedAt: c.ingestion_timestamp || nowIso(),
        })
      );

      // entity_case_overlap
      let overlaps = [];
      try {
        overlaps = await databricks.runCustomQuery(`
          SELECT *
          FROM ${databricks.CATALOG}.${databricks.SCHEMA}.entity_case_overlap
          WHERE case_id = '${safeCaseId}'
        `);
      } catch (err) {
        logger.warn({ type: 'case_detail_overlap', status: 'failed', caseId, error: err.message });
        overlaps = [];
      }

      overlaps = (Array.isArray(overlaps) ? overlaps : [])
        .filter((r) => r && r.entity_id)
        .sort((a, b) => (b.overlap_score || 0) - (a.overlap_score || 0));

      const entityIds = overlaps.map((r) => r.entity_id).slice(0, 50);
      const quotedEntityIds = entityIds.map((id) => `'${escapeSqlLiteral(id)}'`).join(',');

      // suspect_rankings enrichment
      const rankingsByEntityId = new Map();
      if (entityIds.length > 0) {
        try {
          const rankingRows = await databricks.runCustomQuery(`
            SELECT entity_id, entity_name, alias, total_score, linked_cities, properties
            FROM ${databricks.CATALOG}.${databricks.SCHEMA}.suspect_rankings
            WHERE entity_id IN (${quotedEntityIds})
          `);
          (rankingRows || []).forEach((r) => {
            rankingsByEntityId.set(r.entity_id, r);
          });
        } catch (err) {
          logger.warn({
            type: 'case_detail_rankings',
            status: 'failed',
            caseId,
            error: err.message,
          });
        }
      }

      // evidence_card_data (best-effort)
      const evidenceByEntityId = new Map();
      if (entityIds.length > 0) {
        try {
          const evidenceRows = await databricks.runCustomQuery(`
            SELECT *
            FROM ${databricks.CATALOG}.${databricks.SCHEMA}.evidence_card_data
            WHERE entity_id IN (${quotedEntityIds})
            LIMIT 500
          `);
          (evidenceRows || []).forEach((row) => {
            if (!row?.entity_id) return;
            if (!evidenceByEntityId.has(row.entity_id)) evidenceByEntityId.set(row.entity_id, row);
          });
        } catch (err) {
          logger.warn({
            type: 'case_detail_evidence',
            status: 'failed',
            caseId,
            error: err.message,
          });
        }
      }

      const linkedEntities = overlaps.slice(0, 12).map((r) => {
        const entityId = r.entity_id;
        const ranking = rankingsByEntityId.get(entityId);
        const customTitle = getEntityTitle('persons', entityId);

        const originalName = ranking?.entity_name || `Entity ${entityId}`;
        const name = customTitle?.title || originalName;

        const totalScore =
          typeof ranking?.total_score === 'number' ? ranking.total_score : undefined;
        const threatLevel =
          typeof totalScore === 'number'
            ? totalScore > 1.5
              ? 'High'
              : totalScore > 1
                ? 'Medium'
                : 'Low'
            : 'Unknown';

        const evidenceRow = evidenceByEntityId.get(entityId);
        let geoEvidence = evidenceRow?.geo_evidence ?? evidenceRow?.geoEvidence ?? null;
        if (typeof geoEvidence === 'string') {
          try {
            geoEvidence = JSON.parse(geoEvidence);
          } catch {
            // keep raw string
          }
        }

        return {
          id: entityId,
          name,
          originalName,
          alias: ranking?.alias || null,
          overlapScore: r.overlap_score,
          timeBucket: r.time_bucket ?? null,
          threatLevel,
          totalScore,
          linkedCities: ranking?.linked_cities || null,
          geoEvidence,
        };
      });

      const payload = { case: baseCase, linkedEntities };
      cache.set(cacheKey, payload, CACHE_TTL.CASES);
      res.json({ success: true, ...payload, fromCache: false });
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
      const { personIds } = req.body || {};
      if (!personIds || !Array.isArray(personIds)) {
        return res.status(400).json({ success: false, error: 'personIds array required' });
      }

      const [rankings, coPresence, cases] = await Promise.all([
        databricks.getSuspectRankings(200),
        databricks.getCoPresenceEdges(500),
        databricks.getCases(50),
      ]);

      const suspects = (rankings || []).filter((r) => personIds.includes(r.entity_id));
      const relevantCoPresence = (coPresence || []).filter(
        (e) => personIds.includes(e.entity_id_1) || personIds.includes(e.entity_id_2)
      );

      const evidenceCard = {
        title: 'Cross-Jurisdictional Analysis Evidence',
        generatedAt: nowIso(),
        suspects: suspects.map((s) => ({
          id: s.entity_id,
          name: s.entity_name || `Entity ${s.entity_id}`,
          alias: s.alias,
          threatLevel: s.total_score > 1.5 ? 'High' : s.total_score > 1 ? 'Medium' : 'Low',
          criminalHistory: `${s.case_count || 0} linked cases`,
          properties: s.properties ? JSON.parse(s.properties) : {},
        })),
        linkedCases: (cases || []).slice(0, 5).map((c) => ({
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
  app.get('/api/demo/assignees', (req, res) => {
    try {
      const activeOnly = req.query.active === 'true';
      const assignees = activeOnly ? assigneesStore.filter((a) => a.active) : assigneesStore;
      res.json({ success: true, assignees });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/demo/assignees/:id', (req, res) => {
    try {
      const assignee = assigneesStore.find((a) => a.id === req.params.id);
      if (!assignee) return res.status(404).json({ success: false, error: 'Assignee not found' });
      res.json({ success: true, assignee });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/demo/assignees', (req, res) => {
    try {
      const { name, role, email } = req.body || {};
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Name is required' });
      }
      const newAssignee = {
        id: `user_${Date.now()}`,
        name: name.trim(),
        role: typeof role === 'string' && role.trim() ? role.trim() : 'Analyst',
        email: typeof email === 'string' && email.trim() ? email.trim() : null,
        active: true,
        createdAt: nowIso(),
      };
      assigneesStore.push(newAssignee);
      saveAssignees();
      logger.info({ type: 'assignee_created', assigneeId: newAssignee.id, name: newAssignee.name });
      res.status(201).json({ success: true, assignee: newAssignee });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.patch('/api/demo/assignees/:id', (req, res) => {
    try {
      const { name, role, email, active } = req.body || {};
      const idx = assigneesStore.findIndex((a) => a.id === req.params.id);
      if (idx === -1) return res.status(404).json({ success: false, error: 'Assignee not found' });
      const assignee = { ...assigneesStore[idx] };
      if (name !== undefined) assignee.name = String(name).trim();
      if (role !== undefined) assignee.role = String(role).trim();
      if (email !== undefined) assignee.email = email ? String(email).trim() : null;
      if (active !== undefined) assignee.active = Boolean(active);
      assignee.updatedAt = nowIso();
      assigneesStore[idx] = assignee;
      saveAssignees();
      logger.info({ type: 'assignee_updated', assigneeId: assignee.id });
      res.json({ success: true, assignee });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.delete('/api/demo/assignees/:id', (req, res) => {
    try {
      const idx = assigneesStore.findIndex((a) => a.id === req.params.id);
      if (idx === -1) return res.status(404).json({ success: false, error: 'Assignee not found' });
      assigneesStore[idx] = { ...assigneesStore[idx], active: false, deletedAt: nowIso() };
      saveAssignees();
      logger.info({ type: 'assignee_deleted', assigneeId: req.params.id });
      res.json({ success: true, message: 'Assignee deactivated' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============== CASE ASSIGNMENT ENDPOINTS ==============
  app.get('/api/demo/cases/:id/assignee', (req, res) => {
    try {
      const caseId = req.params.id;
      const assigneeId = caseAssignmentsStore[caseId];
      if (!assigneeId) {
        const defaultAssignee =
          assigneesStore.find((a) => a.name === 'Analyst Team') || assigneesStore[0];
        return res.json({ success: true, assignee: defaultAssignee, isDefault: true });
      }
      const assignee = assigneesStore.find((a) => a.id === assigneeId);
      if (!assignee)
        return res.status(404).json({ success: false, error: 'Assigned user not found' });
      res.json({ success: true, assignee, isDefault: false });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.put('/api/demo/cases/:id/assignee', (req, res) => {
    try {
      const caseId = req.params.id;
      const { assigneeId } = req.body || {};
      if (!assigneeId)
        return res.status(400).json({ success: false, error: 'assigneeId is required' });
      const assignee = assigneesStore.find((a) => a.id === assigneeId);
      if (!assignee) return res.status(404).json({ success: false, error: 'Assignee not found' });
      if (!assignee.active)
        return res.status(400).json({ success: false, error: 'Cannot assign to inactive user' });
      caseAssignmentsStore[caseId] = assigneeId;
      saveCaseAssignments();
      logger.info({ type: 'case_assigned', caseId, assigneeId, assigneeName: assignee.name });
      cache.invalidate('cases');
      res.json({ success: true, caseId, assignee });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.delete('/api/demo/cases/:id/assignee', (req, res) => {
    try {
      const caseId = req.params.id;
      delete caseAssignmentsStore[caseId];
      saveCaseAssignments();
      logger.info({ type: 'case_unassigned', caseId });
      cache.invalidate('cases');
      res.json({ success: true, message: 'Case unassigned' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============== ENTITY TITLES CRUD ENDPOINTS ==============
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
      res.json({
        success: true,
        entityId: id,
        entityType: type,
        ...titleInfo,
        hasCustomTitle: true,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.put('/api/demo/entity-titles/:type/:id', (req, res) => {
    try {
      const { type, id } = req.params;
      const { title, notes } = req.body || {};
      if (!entityTitlesStore[type]) {
        return res.status(400).json({ success: false, error: `Invalid entity type: ${type}` });
      }
      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Title is required' });
      }
      const isNew = !entityTitlesStore[type][id];
      entityTitlesStore[type][id] = {
        title: title.trim(),
        notes: typeof notes === 'string' ? notes.trim() : null,
        createdAt: isNew ? nowIso() : entityTitlesStore[type][id].createdAt,
        updatedAt: nowIso(),
      };
      saveEntityTitles();
      cache.invalidate('graph-data');
      cache.invalidatePrefix('persons');
      logger.info({
        type: 'entity_title_set',
        entityType: type,
        entityId: id,
        title: title.trim(),
      });
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

  app.patch('/api/demo/entity-titles/:type/:id', (req, res) => {
    try {
      const { type, id } = req.params;
      const { title, notes } = req.body || {};
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
        entityTitlesStore[type][id].notes =
          typeof notes === 'string' && notes.trim() ? notes.trim() : null;
      }
      entityTitlesStore[type][id].updatedAt = nowIso();
      saveEntityTitles();
      cache.invalidate('graph-data');
      cache.invalidatePrefix('persons');
      logger.info({ type: 'entity_title_updated', entityType: type, entityId: id });
      res.json({ success: true, entityId: id, entityType: type, ...entityTitlesStore[type][id] });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

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
      saveEntityTitles();
      cache.invalidate('graph-data');
      cache.invalidatePrefix('persons');
      logger.info({ type: 'entity_title_deleted', entityType: type, entityId: id });
      res.json({ success: true, message: 'Custom title removed', entityId: id, entityType: type });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============== DATABRICKS DIRECT ENDPOINTS ==============
  app.get('/api/databricks/tables', async (req, res) => {
    try {
      const tables = await databricks.listTables();
      res.json({ success: true, catalog: databricks.CATALOG, schema: databricks.SCHEMA, tables });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/databricks/tables/:name/describe', async (req, res) => {
    try {
      const columns = await databricks.describeTable(req.params.name);
      res.json({ success: true, table: req.params.name, columns });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/databricks/query', async (req, res) => {
    try {
      const { sql } = req.body || {};
      if (!sql) return res.status(400).json({ success: false, error: 'SQL query required' });
      const results = await databricks.runCustomQuery(sql);
      res.json({ success: true, count: results.length, results });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============== CACHE MANAGEMENT ENDPOINTS ==============
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
      ttlSettings: Object.fromEntries(
        Object.entries(CACHE_TTL).map(([k, v]) => [k, v / 1000 + 's'])
      ),
    });
  });

  app.delete('/api/cache', (req, res) => {
    cache.clear();
    res.json({ success: true, message: 'Cache cleared' });
  });

  app.delete('/api/cache/:key', (req, res) => {
    cache.invalidate(req.params.key);
    res.json({ success: true, message: `Cache key '${req.params.key}' invalidated` });
  });

  // ============== HEALTH CHECK ==============
  const DATABRICKS_CONFIG = {
    appName: process.env.DATABRICKS_APP_NAME,
    appUrl: process.env.DATABRICKS_APP_URL,
    host: process.env.DATABRICKS_HOST,
    workspaceId: process.env.DATABRICKS_WORKSPACE_ID,
    clientId: process.env.DATABRICKS_CLIENT_ID,
  };
  const isDatabricksApp = !!DATABRICKS_CONFIG.appName;

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
      timestamp: nowIso(),
      database: {
        type: 'Databricks',
        catalog: databricks.CATALOG,
        schema: databricks.SCHEMA,
        status: databricksStatus,
        tableCount,
      },
    };
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

  // SPA catch-all
  if (fs.existsSync(indexPath)) {
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/'))
        return res.status(404).json({ error: 'API endpoint not found' });
      res.sendFile(indexPath);
    });
    logger.info({ type: 'spa_routing', status: 'enabled' });
  } else {
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

  return { app, cache };
}

module.exports = { createApp };
