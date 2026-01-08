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
        clientId: process.env.DATABRICKS_CLIENT_ID,
        clientSecret: process.env.DATABRICKS_CLIENT_SECRET,
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
        databricks.getCases(), // Fetch all cases
        databricks.runCustomQuery(`
          SELECT h3_cell, city, state, 
                 AVG(latitude) as latitude, AVG(longitude) as longitude,
                 COUNT(*) as event_count
          FROM ${databricks.CATALOG}.${databricks.SCHEMA}.location_events_silver
          WHERE latitude IS NOT NULL
          GROUP BY h3_cell, city, state
          ORDER BY event_count DESC
          LIMIT 500
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

      // Spread cases evenly across the 72-hour timeline (no overlaps)
      // Sort by timestamp first for chronological order
      const sortedCases = [...(casesResult || [])].sort((a, b) => {
        const ta = new Date(a.incident_start_ts || a.createdAt || 0).getTime();
        const tb = new Date(b.incident_start_ts || b.createdAt || 0).getTime();
        return ta - tb;
      });

      const totalHours = 72;
      const caseCount = sortedCases.length || 1;
      const keyFrames = sortedCases.map((c, i) => {
        // Spread evenly: case 0 at hour 0, last case near hour 71
        const hour = Math.floor((i * (totalHours - 1)) / Math.max(caseCount - 1, 1));
        return {
          id: c.case_id,
          caseNumber: c.case_id,
          hour: hour,
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
      const limit = Math.min(parseInt(req.query.limit, 10) || 500, 10000);
      const offset = parseInt(req.query.offset, 10) || 0;
      const city = req.query.city || null;
      const minScore = parseFloat(req.query.minScore) || (suspectsOnly ? 0.5 : 0);

      const cacheKey = `persons-${suspectsOnly}-${limit}-${offset}-${city || 'all'}-${minScore}`;
      const cached = cache.get(cacheKey);
      if (cached) return res.json({ success: true, ...cached, fromCache: true });

      // Query with filters at the database level for better performance
      let sql = `
        SELECT * FROM ${databricks.CATALOG}.${databricks.SCHEMA}.suspect_rankings
        WHERE total_score >= ${minScore}
      `;
      if (city) {
        sql += ` AND array_contains(linked_cities, '${escapeSqlLiteral(city)}')`;
      }
      sql += ` ORDER BY total_score DESC LIMIT ${limit + 1} OFFSET ${offset}`;

      const rankings = await databricks.runCustomQuery(sql).catch(async () => {
        // Fallback to basic query if advanced query fails
        return databricks.getSuspectRankings(limit + offset + 1);
      });

      const sliced = (rankings || []).slice(0, limit);
      const hasMore = (rankings || []).length > limit;

      const persons = sliced
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
            caseCount: r.case_count || 0,
            statesCount: r.states_count || 1,
          };
        });

      const result = {
        persons,
        pagination: { limit, offset, hasMore, total: null },
      };
      cache.set(cacheKey, result, CACHE_TTL.PERSONS);
      res.json({ success: true, ...result, fromCache: false });
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

      const limit = Math.min(parseInt(req.query.limit, 10) || 1000, 10000);
      const cacheKey = `positions-${hour}-${limit}`;

      const cached = cache.get(cacheKey);
      if (cached) return res.json({ success: true, hour, ...cached, fromCache: true });

      // Try to get time-based location events
      // Hour 0-23 = Day 1, 24-47 = Day 2, 48-71 = Day 3
      const dayHour = hour % 24;

      let locationEvents;
      try {
        // Try querying with hour filter if the table supports it
        locationEvents = await databricks.runCustomQuery(`
          SELECT DISTINCT 
            entity_id, 
            latitude, 
            longitude, 
            h3_cell, 
            city, 
            state,
            entity_name
          FROM ${databricks.CATALOG}.${databricks.SCHEMA}.location_events_silver
          WHERE latitude IS NOT NULL 
            AND longitude IS NOT NULL
          ORDER BY entity_id
          LIMIT ${limit}
        `);
      } catch (err) {
        // Fallback to basic query
        locationEvents = await databricks.getLocationEvents(limit);
      }

      // Get suspect rankings for threat levels - fetch all for complete mapping
      const rankings = await databricks.getSuspectRankings().catch(() => []);
      const rankingMap = new Map((rankings || []).map((r) => [r.entity_id, r]));

      const seenEntities = new Set();
      const uniqueEvents = (locationEvents || []).filter((event) => {
        if (!event.entity_id || seenEntities.has(event.entity_id)) return false;
        seenEntities.add(event.entity_id);
        return true;
      });

      // Simulate movement based on hour using deterministic offset
      const positions = uniqueEvents.map((event, i) => {
        const ranking = rankingMap.get(event.entity_id);
        const isSuspect = ranking ? ranking.total_score > 0.5 : false;

        // Deterministic position variation based on hour and entity
        // Create a pseudo-random walk pattern that's reproducible per entity
        const entityHash = (event.entity_id || '')
          .split('')
          .reduce((a, c) => a + c.charCodeAt(0), 0);
        const seed = entityHash + hour * 137; // Prime multiplier for spread
        const pseudoRandom1 = Math.sin(seed) * 0.5 + 0.5; // 0-1
        const pseudoRandom2 = Math.cos(seed * 1.7) * 0.5 + 0.5; // 0-1

        // Movement radius: suspects move more (up to 0.02 degrees = ~2km), others less (0.005 = ~500m)
        const movementRadius = isSuspect ? 0.015 : 0.005;
        const latOffset = (pseudoRandom1 - 0.5) * movementRadius * 2;
        const lngOffset = (pseudoRandom2 - 0.5) * movementRadius * 2;

        return {
          deviceId: `device_${event.entity_id || i}`,
          deviceName: `Device ${(event.entity_id || '').slice(-6) || i}`,
          lat: event.latitude + latOffset,
          lng: event.longitude + lngOffset,
          towerId: event.h3_cell,
          towerName: `Cell ${event.h3_cell?.slice(-6) || i}`,
          towerCity: event.city,
          ownerId: event.entity_id,
          ownerName: ranking?.entity_name || event.entity_name || `Entity ${event.entity_id}`,
          ownerAlias: ranking?.alias || null,
          isSuspect,
          threatLevel: ranking
            ? ranking.total_score > 1.5
              ? 'High'
              : ranking.total_score > 1
                ? 'Medium'
                : 'Low'
            : null,
          totalScore: ranking?.total_score || null,
        };
      });

      const result = {
        positions,
        count: positions.length,
        suspectCount: positions.filter((p) => p.isSuspect).length,
      };
      cache.set(cacheKey, result, CACHE_TTL.POSITIONS);
      res.json({ success: true, hour, ...result, fromCache: false });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/demo/hotspots/:hour', async (req, res) => {
    try {
      const hour = parseInt(req.params.hour, 10);
      if (!isValidHourParam(hour))
        return res.status(400).json({ success: false, error: 'Hour must be 0-71' });

      const limit = Math.min(parseInt(req.query.limit, 10) || 200, 1000);
      const cacheKey = `hotspots-${hour}-${limit}`;

      const cached = cache.get(cacheKey);
      if (cached) return res.json({ success: true, hour, ...cached, fromCache: true });

      const cellCounts = await databricks.getCellDeviceCounts();

      // Sort by activity (device count) and take top hotspots
      const sorted = (cellCounts || [])
        .sort(
          (a, b) =>
            (b.device_count || b.entity_count || 0) - (a.device_count || a.entity_count || 0)
        )
        .slice(0, limit);

      const hotspots = sorted.map((c) => ({
        towerId: c.h3_cell,
        towerName: `Cell ${c.h3_cell?.slice(-6) || 'Unknown'}`,
        lat: c.latitude || 38.9,
        lng: c.longitude || -77.0,
        city: c.city || 'Unknown',
        deviceCount: c.device_count || c.entity_count || 1,
        suspectCount: c.suspect_count || 0,
      }));

      const result = { hotspots, totalHotspots: (cellCounts || []).length };
      cache.set(cacheKey, result, CACHE_TTL.POSITIONS);
      res.json({ success: true, hour, ...result, fromCache: false });
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
      const limit = Math.min(parseInt(req.query.limit, 10) || 500, 10000);
      const offset = parseInt(req.query.offset, 10) || 0;
      const city = req.query.city || null;
      const status = req.query.status || null;
      const enriched = req.query.enriched !== 'false'; // Default to enriched

      const cacheKey = `cases-${limit}-${offset}-${city || 'all'}-${status || 'all'}-${enriched}`;
      const cached = cache.get(cacheKey);
      if (cached) return res.json({ success: true, ...cached, fromCache: true });

      const cases = await databricks.getCases(); // Fetch all cases

      // Filter cases
      let filtered = cases || [];
      if (city) {
        filtered = filtered.filter((c) =>
          (c.city || '').toLowerCase().includes(city.toLowerCase())
        );
      }
      if (status) {
        filtered = filtered.filter((c) => c.status === status);
      }

      const sliced = filtered.slice(offset, offset + limit);
      const hasMore = filtered.length > offset + limit;

      // Get linked entities for all cases in batch (more efficient than N+1)
      let caseEntityMap = new Map();
      // Get case-level suspect counts (story / UX)
      let caseSummaryMap = new Map();
      if (enriched && sliced.length > 0) {
        try {
          const caseIds = sliced.map((c) => `'${escapeSqlLiteral(c.case_id)}'`).join(',');
          const overlaps = await databricks
            .runCustomQuery(
              `
            SELECT case_id, entity_id, overlap_score
            FROM ${databricks.CATALOG}.${databricks.SCHEMA}.entity_case_overlap
            WHERE case_id IN (${caseIds})
            ORDER BY overlap_score DESC
          `
            )
            .catch(() => []);

          // Group by case_id - no artificial limit
          (overlaps || []).forEach((o) => {
            if (!caseEntityMap.has(o.case_id)) {
              caseEntityMap.set(o.case_id, []);
            }
            caseEntityMap.get(o.case_id).push({ id: o.entity_id, overlapScore: o.overlap_score });
          });
        } catch (err) {
          logger.warn({ type: 'cases_enrichment', status: 'failed', error: err.message });
        }

        // Pull richer case summary counts from `case_summary_with_suspects` (if available)
        try {
          const caseIds = sliced.map((c) => `'${escapeSqlLiteral(c.case_id)}'`).join(',');
          const summaries = await databricks
            .runCustomQuery(
              `
            SELECT
              case_id,
              total_persons_linked,
              explicit_suspects,
              detected_at_scene,
              suspect_count,
              poi_count,
              witness_count,
              victim_count
            FROM ${databricks.CATALOG}.${databricks.SCHEMA}.case_summary_with_suspects
            WHERE case_id IN (${caseIds})
          `
            )
            .catch(() => []);
          (summaries || []).forEach((s) => {
            if (!s?.case_id) return;
            caseSummaryMap.set(s.case_id, s);
          });
        } catch (err) {
          logger.warn({ type: 'cases_summary', status: 'failed', error: err.message });
        }
      }

      let formattedCases = sliced.map((c) => {
        const linkedPersons = caseEntityMap.get(c.case_id) || [];
        const summary = caseSummaryMap.get(c.case_id);
        const suspectCount =
          typeof summary?.suspect_count === 'number'
            ? summary.suspect_count
            : typeof summary?.explicit_suspects === 'number'
              ? summary.explicit_suspects
              : linkedPersons.length;
        const deviceCount =
          typeof summary?.detected_at_scene === 'number'
            ? summary.detected_at_scene
            : linkedPersons.length;

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
          assignedTo: 'Analyst Team',
          estimatedLoss: c.estimated_loss,
          methodOfEntry: c.method_of_entry,
          stolenItems: c.target_items,
          properties: c.properties ? JSON.parse(c.properties) : {},
          persons: linkedPersons,
          personCount: linkedPersons.length,
          suspectCount,
          // Keep the old devices list for now (UI uses counts + graph deep links)
          devices: linkedPersons.map((p) => ({
            id: `device_${p.id}`,
            name: `Device ${p.id.slice(-6)}`,
          })),
          deviceCount,
          totalPersonsLinked: summary?.total_persons_linked ?? null,
          victimCount: summary?.victim_count ?? null,
          witnessCount: summary?.witness_count ?? null,
          poiCount: summary?.poi_count ?? null,
          hotspot: null,
          createdAt: c.incident_start_ts || nowIso(),
          updatedAt: c.ingestion_timestamp || nowIso(),
        };
      });

      // Include locally-created cases (from UI) as well
      const localCases = Array.isArray(localCasesStore) ? localCasesStore : [];
      if (offset === 0) {
        formattedCases = [...localCases, ...formattedCases];
      }

      // Apply overrides + assignments
      formattedCases = formattedCases.map((c) => withAssignment(applyCaseOverrides(c)));

      const result = {
        cases: formattedCases,
        pagination: { limit, offset, hasMore, total: filtered.length },
      };
      cache.set(cacheKey, result, CACHE_TTL.CASES);
      res.json({ success: true, ...result, fromCache: false });
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

      // Get suspects first to filter edges - only show relationships between known entities
      const [rankings, coPresence, socialEdges] = await Promise.all([
        databricks.getSuspectRankings(),
        databricks.getCoPresenceEdges(),
        databricks.getSocialEdges(),
      ]);

      // Build a set of known entity IDs and a map for names
      const knownEntityIds = new Set((rankings || []).map((r) => r.entity_id));
      const entityNames = new Map(
        (rankings || []).map((r) => [r.entity_id, r.entity_name || `Entity ${r.entity_id}`])
      );
      const entityAliases = new Map((rankings || []).map((r) => [r.entity_id, r.alias || null]));

      // Filter to only include edges where both entities are known suspects
      const filteredCoPresence = (coPresence || []).filter(
        (e) => knownEntityIds.has(e.entity_id_1) && knownEntityIds.has(e.entity_id_2)
      );
      const filteredSocialEdges = (socialEdges || []).filter(
        (e) => knownEntityIds.has(e.entity_id_1) || knownEntityIds.has(e.entity_id_2)
      );

      const relationships = [
        ...filteredCoPresence.map((e) => ({
          person1Id: e.entity_id_1,
          person1Name: entityNames.get(e.entity_id_1) || `Entity ${e.entity_id_1}`,
          person1Alias: entityAliases.get(e.entity_id_1),
          person2Id: e.entity_id_2,
          person2Name: entityNames.get(e.entity_id_2) || `Entity ${e.entity_id_2}`,
          person2Alias: entityAliases.get(e.entity_id_2),
          type: 'CO_LOCATED',
          count: e.co_occurrence_count,
          cities: e.city || null,
          notes: null,
        })),
        ...filteredSocialEdges.map((e) => ({
          person1Id: e.entity_id_1,
          person1Name: entityNames.get(e.entity_id_1) || `Entity ${e.entity_id_1}`,
          person1Alias: entityAliases.get(e.entity_id_1),
          person2Id: e.entity_id_2,
          person2Name: entityNames.get(e.entity_id_2) || `Entity ${e.entity_id_2}`,
          person2Alias: entityAliases.get(e.entity_id_2),
          type: e.edge_type || 'CONTACTED',
          count: e.interaction_count || 1,
          cities: null,
          notes: null,
        })),
      ];

      cache.set(cacheKey, relationships, CACHE_TTL.RELATIONSHIPS);
      res.json({ success: true, relationships, count: relationships.length, fromCache: false });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/demo/graph-data
   * Network visualization nodes/links with pagination
   */
  app.get('/api/demo/graph-data', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 10000, 50000);
      const city = req.query.city || null;
      const minScore = parseFloat(req.query.minScore) || 0;

      const cacheKey = `graph-data-${limit}-${city || 'all'}-${minScore}`;
      const cached = cache.get(cacheKey);
      if (cached) return res.json({ success: true, ...cached, fromCache: true });

      const [rankings, coPresence, socialEdges, handoffs] = await Promise.all([
        databricks.getSuspectRankings(), // Fetch all
        databricks.getCoPresenceEdges(), // Fetch all
        databricks.getSocialEdges(), // Fetch all
        databricks.getHandoffCandidates(), // Fetch all
      ]);

      // Filter by city if specified
      let filteredRankings = rankings || [];
      if (city) {
        filteredRankings = filteredRankings.filter((r) =>
          (r.linked_cities || []).some((c) => c.toLowerCase().includes(city.toLowerCase()))
        );
      }
      if (minScore > 0) {
        filteredRankings = filteredRankings.filter((r) => r.total_score >= minScore);
      }

      const rankingIds = new Set(filteredRankings.map((r) => r.entity_id));
      const rankingMap = new Map(filteredRankings.map((r) => [r.entity_id, r]));

      const nodes = filteredRankings.map((r) => {
        const customTitle = getEntityTitle('persons', r.entity_id);
        const originalName = r.entity_name || `Entity ${r.entity_id}`;
        const isSuspect = r.total_score > 0.5;
        return {
          id: r.entity_id,
          name: customTitle?.title || originalName,
          originalName,
          customTitle: customTitle?.title || null,
          customNotes: customTitle?.notes || null,
          hasCustomTitle: !!customTitle,
          alias: r.alias || null,
          type: 'person',
          isSuspect,
          threatLevel: r.total_score > 1.5 ? 'High' : r.total_score > 1 ? 'Medium' : 'Low',
          totalScore: r.total_score,
          linkedCities: r.linked_cities,
          caseCount: r.case_count || 0,
          properties: r.properties ? JSON.parse(r.properties) : {},
        };
      });

      // Track nodes we've already added
      const addedNodeIds = new Set(nodes.map((n) => n.id));

      // Location nodes (one per city)
      const citySet = new Set();
      filteredRankings.forEach((r) => {
        (r.linked_cities || []).forEach((c) => citySet.add(c));
      });
      citySet.forEach((cityName) => {
        const locId = `loc_${String(cityName)
          .toLowerCase()
          .replace(/[^a-z]/g, '_')}`;
        const customTitle = getEntityTitle('locations', locId);
        nodes.push({
          id: locId,
          name: customTitle?.title || cityName,
          originalName: cityName,
          customTitle: customTitle?.title || null,
          hasCustomTitle: !!customTitle,
          type: 'location',
          city: cityName,
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

      // Social links - also add nodes for non-ranking persons (associates)
      (socialEdges || []).forEach((edge) => {
        if (!edge?.entity_id_1 || !edge?.entity_id_2) return;
        // Skip if neither party is a known ranking
        if (!rankingIds.has(edge.entity_id_1) && !rankingIds.has(edge.entity_id_2)) return;

        // Add node for entity_id_1 if not already added (associate)
        if (!addedNodeIds.has(edge.entity_id_1)) {
          const customTitle = getEntityTitle('persons', edge.entity_id_1);
          nodes.push({
            id: edge.entity_id_1,
            name:
              customTitle?.title || edge.entity_name_1 || `Entity ${edge.entity_id_1.slice(-6)}`,
            originalName: edge.entity_name_1 || `Entity ${edge.entity_id_1}`,
            customTitle: customTitle?.title || null,
            hasCustomTitle: !!customTitle,
            alias: null,
            type: 'person',
            isSuspect: false,
            threatLevel: 'Unknown',
            totalScore: 0,
            linkedCities: [],
            caseCount: 0,
          });
          addedNodeIds.add(edge.entity_id_1);
        }

        // Add node for entity_id_2 if not already added (associate)
        if (!addedNodeIds.has(edge.entity_id_2)) {
          const customTitle = getEntityTitle('persons', edge.entity_id_2);
          nodes.push({
            id: edge.entity_id_2,
            name:
              customTitle?.title || edge.entity_name_2 || `Entity ${edge.entity_id_2.slice(-6)}`,
            originalName: edge.entity_name_2 || `Entity ${edge.entity_id_2}`,
            customTitle: customTitle?.title || null,
            hasCustomTitle: !!customTitle,
            alias: null,
            type: 'person',
            isSuspect: false,
            threatLevel: 'Unknown',
            totalScore: 0,
            linkedCities: [],
            caseCount: 0,
          });
          addedNodeIds.add(edge.entity_id_2);
        }

        links.push({
          source: edge.entity_id_1,
          target: edge.entity_id_2,
          type: edge.edge_type || 'SOCIAL',
          count: edge.interaction_count || 1,
        });
      });

      // Handoff links (cross-jurisdiction movement)
      (handoffs || []).forEach((h) => {
        if (!h?.entity_id) return;
        if (!rankingIds.has(h.entity_id)) return;
        const originLoc = `loc_${String(h.origin_city || h.from_city || '')
          .toLowerCase()
          .replace(/[^a-z]/g, '_')}`;
        const destLoc = `loc_${String(h.destination_city || h.to_city || '')
          .toLowerCase()
          .replace(/[^a-z]/g, '_')}`;
        if (originLoc && destLoc && originLoc !== destLoc) {
          links.push({
            source: originLoc,
            target: destLoc,
            type: 'HANDOFF',
            entityId: h.entity_id,
            count: 1,
          });
        }
      });

      // Suspect-to-location links
      filteredRankings.forEach((r) => {
        (r.linked_cities || []).forEach((cityName) => {
          links.push({
            source: r.entity_id,
            target: `loc_${String(cityName)
              .toLowerCase()
              .replace(/[^a-z]/g, '_')}`,
            type: 'DETECTED_AT',
            count: 1,
          });
        });
      });

      const result = {
        nodes,
        links,
        stats: {
          nodeCount: nodes.length,
          linkCount: links.length,
          personCount: nodes.filter((n) => n.type === 'person').length,
          locationCount: nodes.filter((n) => n.type === 'location').length,
          coLocationLinks: links.filter((l) => l.type === 'CO_LOCATED').length,
          socialLinks: links.filter((l) => l.type === 'SOCIAL').length,
          handoffLinks: links.filter((l) => l.type === 'HANDOFF').length,
        },
      };
      cache.set(cacheKey, result, CACHE_TTL.GRAPH_DATA);
      res.json({ success: true, ...result, fromCache: false });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/demo/colocation-log
   * Given a set of entity IDs, return a log of where they were co-present.
   *
   * This is best-effort:
   * - If the location events table has a timestamp column, we bucket by time.
   * - If it doesn't, we still group by location (h3/city/state) and return "time: null".
   */
  app.post('/api/demo/colocation-log', async (req, res) => {
    try {
      const body = req.body || {};
      const entityIds = Array.isArray(body.entityIds) ? body.entityIds.map(String) : [];
      const mode = body.mode === 'all' ? 'all' : 'any'; // "any" (>=2 selected) or "all" (all selected)
      const limit = Math.min(Number.parseInt(body.limit, 10) || 5000, 20000);
      const bucketMinutes = Math.min(Number.parseInt(body.bucketMinutes, 10) || 60, 24 * 60);

      const uniqueIds = Array.from(new Set(entityIds.map((s) => s.trim()).filter(Boolean)));
      if (uniqueIds.length < 2) {
        return res
          .status(400)
          .json({ success: false, error: 'entityIds must contain at least 2 IDs' });
      }

      const cacheKey = `colocation-log:${mode}:${bucketMinutes}:${limit}:${uniqueIds.sort().join(',')}`;
      const cached = cache.get(cacheKey);
      if (cached) return res.json({ success: true, ...cached, fromCache: true });

      // Detect if we have a usable timestamp column on location_events_silver
      const columns = await databricks.describeTable('location_events_silver').catch(() => []);
      const colNames = new Set(
        (columns || [])
          .map((c) => c.col_name || c.colName || c.column_name || c.name)
          .filter((v) => typeof v === 'string' && v.trim().length > 0)
      );

      const candidateTimeCols = [
        'event_timestamp',
        'event_ts',
        'event_time',
        'timestamp',
        'ts',
        'observed_at',
        'ingestion_timestamp',
        'created_at',
      ];
      const timeCol = candidateTimeCols.find((c) => colNames.has(c)) || null;

      const candidateNameCols = ['entity_name', 'person_name', 'display_name', 'name'];
      const nameCol = candidateNameCols.find((c) => colNames.has(c)) || null;

      const safeIds = uniqueIds.map((id) => `'${escapeSqlLiteral(id)}'`).join(',');
      const selectCols = ['entity_id', 'latitude', 'longitude', 'h3_cell', 'city', 'state'];
      if (nameCol) selectCols.push(nameCol);
      if (timeCol) selectCols.push(timeCol);

      const sql = `
        SELECT ${selectCols.join(', ')}
        FROM ${databricks.CATALOG}.${databricks.SCHEMA}.location_events_silver
        WHERE entity_id IN (${safeIds})
          AND latitude IS NOT NULL
          AND longitude IS NOT NULL
        LIMIT ${limit}
      `;

      const rows = await databricks.runCustomQuery(sql);

      // If the location table doesn't have a name column, try to resolve names from suspect_rankings
      const entityNameMap = new Map();
      if (!nameCol) {
        try {
          const nameRows = await databricks.runCustomQuery(`
            SELECT entity_id, entity_name
            FROM ${databricks.CATALOG}.${databricks.SCHEMA}.suspect_rankings
            WHERE entity_id IN (${safeIds})
          `);
          (nameRows || []).forEach((r) => {
            const id = r.entity_id != null ? String(r.entity_id) : '';
            const nm = r.entity_name != null ? String(r.entity_name) : '';
            if (id && nm) entityNameMap.set(id, nm);
          });
        } catch (err) {
          // best-effort: leave map empty
        }
      }

      const toIsoBucket = (ts) => {
        if (!ts) return null;
        const d = ts instanceof Date ? ts : new Date(ts);
        if (Number.isNaN(d.getTime())) return null;
        const ms = bucketMinutes * 60 * 1000;
        const bucketMs = Math.floor(d.getTime() / ms) * ms;
        return new Date(bucketMs).toISOString();
      };

      const groups = new Map();
      for (const r of rows || []) {
        const entityId = r.entity_id != null ? String(r.entity_id) : '';
        if (!entityId) continue;
        if (!uniqueIds.includes(entityId)) continue;

        const h3 = r.h3_cell != null ? String(r.h3_cell) : null;
        const city = r.city != null ? String(r.city) : null;
        const state = r.state != null ? String(r.state) : null;
        const lat = typeof r.latitude === 'number' ? r.latitude : Number(r.latitude);
        const lng = typeof r.longitude === 'number' ? r.longitude : Number(r.longitude);
        const timeIso = timeCol ? toIsoBucket(r[timeCol]) : null;

        const key = `${timeIso || 'no_time'}|${h3 || ''}|${city || ''}|${state || ''}`;
        let g = groups.get(key);
        if (!g) {
          g = {
            time: timeIso,
            h3Cell: h3,
            city,
            state,
            latSum: 0,
            lngSum: 0,
            coordCount: 0,
            evidenceCount: 0,
            participants: new Map(),
          };
          groups.set(key, g);
        }

        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          g.latSum += lat;
          g.lngSum += lng;
          g.coordCount += 1;
        }
        g.evidenceCount += 1;

        const rowName =
          nameCol && r[nameCol] != null && String(r[nameCol]).trim() ? String(r[nameCol]) : null;
        const name = rowName || entityNameMap.get(entityId) || `Entity ${entityId}`;
        if (!g.participants.has(entityId)) {
          g.participants.set(entityId, { id: entityId, name });
        }
      }

      const requiredCount = mode === 'all' ? uniqueIds.length : 2;
      const entries = Array.from(groups.values())
        .map((g) => ({
          time: g.time,
          city: g.city,
          state: g.state,
          h3Cell: g.h3Cell,
          latitude: g.coordCount ? g.latSum / g.coordCount : null,
          longitude: g.coordCount ? g.lngSum / g.coordCount : null,
          participantCount: g.participants.size,
          evidenceCount: g.evidenceCount,
          participants: Array.from(g.participants.values()),
        }))
        .filter((e) => e.participantCount >= requiredCount)
        .sort((a, b) => {
          // Prefer chronological sorting when time is present, otherwise by evidence count
          if (a.time && b.time) return b.time.localeCompare(a.time);
          if (a.time && !b.time) return -1;
          if (!a.time && b.time) return 1;
          return (b.evidenceCount || 0) - (a.evidenceCount || 0);
        })
        .slice(0, 500);

      const payload = {
        entityIds: uniqueIds,
        mode,
        bucketMinutes,
        timeColumn: timeCol,
        nameColumn: nameCol,
        entries,
      };
      cache.set(cacheKey, payload, CACHE_TTL.RELATIONSHIPS);
      res.json({ success: true, ...payload, fromCache: false });
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

      // First try: the richer case summary table with linked suspects/persons (best story)
      try {
        const summaryRows = await databricks.runCustomQuery(`
          SELECT *
          FROM ${databricks.CATALOG}.${databricks.SCHEMA}.case_summary_with_suspects
          WHERE case_id = '${safeCaseId}'
          LIMIT 1
        `);
        const summary = summaryRows?.[0];
        if (summary && Array.isArray(summary.linked_persons)) {
          const linkedEntities = summary.linked_persons.slice(0, 50).map((p) => {
            const deviceId = p.device_id || null;
            const personId = p.person_id || null;
            const id = deviceId || personId || `unknown_${Math.random().toString(16).slice(2)}`;
            const confidence = typeof p.confidence === 'number' ? p.confidence : null;
            const notes = typeof p.notes === 'string' ? p.notes : null;
            const confidenceLabel =
              confidence == null
                ? null
                : confidence >= 0.85
                  ? 'High'
                  : confidence >= 0.7
                    ? 'Medium'
                    : 'Low';

            return {
              id,
              personId,
              deviceId,
              name: p.display_name || p.alias || personId || deviceId || `Entity ${id}`,
              originalName: p.display_name || null,
              alias: p.alias || null,
              personRole: p.person_role || null,
              caseRole: p.case_role || null,
              linkSource: p.link_source || null,
              notes,
              confidence,
              // Keep legacy fields used by UI components
              overlapScore: confidence == null ? undefined : confidence,
              geoEvidence: notes
                ? [
                    {
                      claim: notes,
                      confidence: confidenceLabel || 'Unknown',
                    },
                  ]
                : null,
            };
          });

          const payload = { case: baseCase, linkedEntities };
          cache.set(cacheKey, payload, CACHE_TTL.CASES);
          return res.json({ success: true, ...payload, fromCache: false });
        }
      } catch (err) {
        logger.warn({
          type: 'case_detail_summary',
          status: 'failed',
          caseId,
          error: err.message,
        });
      }

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

      const entityIds = overlaps.map((r) => r.entity_id);
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

      const entityLimit = Math.min(parseInt(req.query.entityLimit, 10) || 500, 5000);
      const linkedEntities = overlaps.slice(0, entityLimit).map((r) => {
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
        databricks.getSuspectRankings(), // Fetch all
        databricks.getCoPresenceEdges(), // Fetch all
        databricks.getCases(), // Fetch all
      ]);

      const suspects = (rankings || []).filter((r) => personIds.includes(r.entity_id));
      const relevantCoPresence = (coPresence || []).filter(
        (e) => personIds.includes(e.entity_id_1) || personIds.includes(e.entity_id_2)
      );

      // Find cases linked to the suspects
      const suspectCities = new Set(suspects.flatMap((s) => s.linked_cities || []));
      const linkedCases = (cases || []).filter((c) => suspectCities.has(c.city));

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
        linkedCases: linkedCases.map((c) => ({
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

  // ============== NEW DATA ENDPOINTS ==============

  /**
   * GET /api/demo/handoff-candidates
   * Shows suspects detected moving between jurisdictions
   */
  app.get('/api/demo/handoff-candidates', async (req, res) => {
    try {
      const cacheKey = 'handoff-candidates';
      const cached = cache.get(cacheKey);
      if (cached) return res.json({ success: true, candidates: cached, fromCache: true });

      // Get suspects to filter handoffs to known entities only
      const [rankings, candidates] = await Promise.all([
        databricks.getSuspectRankings(),
        databricks.getHandoffCandidates(),
      ]);

      const knownEntityIds = new Set((rankings || []).map((r) => r.entity_id));
      const entityNames = new Map(
        (rankings || []).map((r) => [r.entity_id, r.entity_name || `Entity ${r.entity_id}`])
      );

      // Filter to known suspects and deduplicate by entity+cities
      const seen = new Set();
      const filtered = (candidates || [])
        .filter((c) => knownEntityIds.has(c.entity_id))
        .filter((c) => {
          const key = `${c.entity_id}-${c.origin_city || c.from_city}-${c.destination_city || c.to_city}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

      const formatted = filtered.map((c) => ({
        entityId: c.entity_id,
        entityName: entityNames.get(c.entity_id) || c.entity_name || `Entity ${c.entity_id}`,
        originCity: c.origin_city || c.from_city || 'Unknown',
        destinationCity: c.destination_city || c.to_city || 'Unknown',
        originState: c.origin_state || c.from_state || null,
        destinationState: c.destination_state || c.to_state || null,
        detectedAt: c.detected_at || c.timestamp || null,
        confidence: c.confidence || c.score || null,
        timeDeltaHours: c.time_delta_hours || c.hours_between || null,
      }));

      cache.set(cacheKey, formatted, CACHE_TTL.RELATIONSHIPS);
      res.json({ success: true, candidates: formatted, total: formatted.length, fromCache: false });
    } catch (error) {
      // Return empty array if table doesn't exist or query fails
      logger.warn({ type: 'handoff_candidates', status: 'failed', error: error.message });
      res.json({ success: true, candidates: [], error: error.message });
    }
  });

  /**
   * GET /api/demo/devices
   * Device tracking information with pagination
   */
  app.get('/api/demo/devices', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 500, 10000);
      const offset = parseInt(req.query.offset, 10) || 0;
      const cacheKey = `devices-${limit}-${offset}`;

      const cached = cache.get(cacheKey);
      if (cached) return res.json({ success: true, ...cached, fromCache: true });

      // Get suspects which represent device owners - fetch all
      const rankings = await databricks.getSuspectRankings();
      const sliced = (rankings || []).slice(offset, offset + limit);

      const devices = sliced.map((r) => ({
        id: `device_${r.entity_id}`,
        deviceId: `device_${r.entity_id}`,
        name: `Device ${(r.entity_id || '').slice(-6)}`,
        deviceType: r.device_type || 'mobile',
        ownerId: r.entity_id,
        ownerName: r.entity_name || `Entity ${r.entity_id}`,
        ownerAlias: r.alias || null,
        isBurner: r.is_burner || false,
        linkedCities: r.linked_cities || [],
        lastSeen: r.last_seen || null,
        threatLevel: r.total_score > 1.5 ? 'High' : r.total_score > 1 ? 'Medium' : 'Low',
      }));

      const result = {
        devices,
        pagination: { limit, offset, hasMore: rankings.length > offset + limit },
      };
      cache.set(cacheKey, result, CACHE_TTL.POSITIONS);
      res.json({ success: true, ...result, fromCache: false });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/demo/evidence/:entityId
   * Full evidence card data for a specific entity
   */
  app.get('/api/demo/evidence/:entityId', async (req, res) => {
    try {
      const entityId = req.params.entityId;
      const safeId = escapeSqlLiteral(entityId);
      const cacheKey = `evidence-${entityId}`;

      const cached = cache.get(cacheKey);
      if (cached) return res.json({ success: true, evidence: cached, fromCache: true });

      const [evidenceRows, rankingRows, caseOverlaps] = await Promise.all([
        databricks
          .runCustomQuery(
            `
          SELECT * FROM ${databricks.CATALOG}.${databricks.SCHEMA}.evidence_card_data
          WHERE entity_id = '${safeId}'
          LIMIT 1
        `
          )
          .catch(() => []),
        databricks
          .runCustomQuery(
            `
          SELECT * FROM ${databricks.CATALOG}.${databricks.SCHEMA}.suspect_rankings
          WHERE entity_id = '${safeId}'
          LIMIT 1
        `
          )
          .catch(() => []),
        databricks
          .runCustomQuery(
            `
          SELECT * FROM ${databricks.CATALOG}.${databricks.SCHEMA}.entity_case_overlap
          WHERE entity_id = '${safeId}'
          ORDER BY overlap_score DESC
          LIMIT 20
        `
          )
          .catch(() => []),
      ]);

      const evidenceRow = evidenceRows[0] || {};
      const rankingRow = rankingRows[0] || {};

      // Parse geo_evidence if it's a string
      let geoEvidence = evidenceRow.geo_evidence || evidenceRow.geoEvidence || null;
      if (typeof geoEvidence === 'string') {
        try {
          geoEvidence = JSON.parse(geoEvidence);
        } catch {
          /* keep raw */
        }
      }

      const evidence = {
        entityId,
        entityName: rankingRow.entity_name || evidenceRow.entity_name || `Entity ${entityId}`,
        alias: rankingRow.alias || evidenceRow.alias || null,
        threatLevel:
          rankingRow.total_score > 1.5 ? 'High' : rankingRow.total_score > 1 ? 'Medium' : 'Low',
        totalScore: rankingRow.total_score || null,
        linkedCities: rankingRow.linked_cities || [],
        linkedCases: (caseOverlaps || []).map((o) => ({
          caseId: o.case_id,
          overlapScore: o.overlap_score,
          timeBucket: o.time_bucket,
        })),
        geoEvidence,
        signals: {
          geospatial: evidenceRow.geo_signals || [],
          narrative: evidenceRow.narrative_signals || [],
          social: evidenceRow.social_signals || [],
        },
        criminalHistory:
          rankingRow.criminal_history || `${rankingRow.case_count || 0} linked cases`,
        properties: rankingRow.properties ? JSON.parse(rankingRow.properties) : {},
      };

      cache.set(cacheKey, evidence, CACHE_TTL.PERSONS);
      res.json({ success: true, evidence, fromCache: false });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/demo/stats
   * Aggregated statistics for dashboard
   */
  app.get('/api/demo/stats', async (req, res) => {
    try {
      const cacheKey = 'stats';
      const cached = cache.get(cacheKey);
      if (cached) return res.json({ success: true, stats: cached, fromCache: true });

      const [cases, suspects, coPresence, handoffs] = await Promise.all([
        databricks.getCases(), // Fetch all
        databricks.getSuspectRankings(), // Fetch all
        databricks.getCoPresenceEdges(), // Fetch all
        databricks.getHandoffCandidates().catch(() => []), // Fetch all
      ]);

      const stats = {
        totalCases: (cases || []).length,
        activeCases: (cases || []).filter(
          (c) => c.status === 'open' || c.status === 'investigating'
        ).length,
        totalSuspects: (suspects || []).length,
        highThreatSuspects: (suspects || []).filter((s) => s.total_score > 1.5).length,
        mediumThreatSuspects: (suspects || []).filter(
          (s) => s.total_score > 1 && s.total_score <= 1.5
        ).length,
        totalCoLocations: (coPresence || []).length,
        crossJurisdictionHandoffs: (handoffs || []).length,
        cities: [...new Set((suspects || []).flatMap((s) => s.linked_cities || []))],
        totalEstimatedLoss: (cases || []).reduce((sum, c) => sum + (c.estimated_loss || 0), 0),
      };

      cache.set(cacheKey, stats, CACHE_TTL.CONFIG);
      res.json({ success: true, stats, fromCache: false });
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

  // Best-effort metadata:
  // - For Delta tables: DESCRIBE DETAIL
  // - For views: fall back to DESCRIBE EXTENDED
  app.get('/api/databricks/tables/:name/detail', async (req, res) => {
    try {
      const table = req.params.name;
      const fqn = `${databricks.CATALOG}.${databricks.SCHEMA}.${table}`;
      try {
        const details = await databricks.executeQuery(`DESCRIBE DETAIL ${fqn}`);
        return res.json({ success: true, table, fqn, kind: 'detail', details });
      } catch (err) {
        // Common for UC objects that are views
        const extended = await databricks.executeQuery(`DESCRIBE EXTENDED ${fqn}`);
        return res.json({
          success: true,
          table,
          fqn,
          kind: 'extended',
          details: extended,
          detailError: err.message,
        });
      }
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
