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

/**
 * Returns true if a name looks like a generic placeholder that shouldn't be displayed.
 * Falls back to entity ID in these cases for clarity.
 */
function isGenericPlaceholderName(name) {
  if (!name || typeof name !== 'string') return true;
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return true;
  // Match patterns like "unknown suspect #N", "entity E_12345", "suspect N", etc.
  if (/^unknown\s*(suspect|entity|person)?\s*#?\d*$/i.test(trimmed)) return true;
  // Match "suspect", "entity", "person" alone OR with optional # and digits
  if (/^(suspect|entity|person)\s*#?\d*$/i.test(trimmed)) return true;
  if (/^e_\d+$/i.test(trimmed)) return true;
  return false;
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
      
      // Sort cases chronologically (same logic as keyframes in /api/demo/config)
      const sortedCases = [...filtered].sort((a, b) => {
        const ta = new Date(a.incident_start_ts || a.incident_time_bucket || a.createdAt || 0).getTime();
        const tb = new Date(b.incident_start_ts || b.incident_time_bucket || b.createdAt || 0).getTime();
        return ta - tb;
      });
      
      // Spread cases evenly across 72 hours (0-71), matching keyframe calculation
      const totalHours = 72;
      const caseCount = sortedCases.length || 1;
      
      casesTop = sortedCases.slice(0, 12).map((c, i) => {
        // Calculate the hour index (0-71) for this case
        const hour = Math.floor((i * (totalHours - 1)) / Math.max(caseCount - 1, 1));
        return {
          id: c.case_id,
          city: c.city,
          priority: c.priority,
          status: c.status,
          caseType: c.case_type,
          address: c.address,
          hour: hour, // The mapped hour (0-71) for time window clamping
        };
      });
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
  const databricks = options.databricks || require('./db/postgres');

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
  const CASE_ENTITIES_FILE = path.join(dataDir, 'case_entities.json');
  const DEVICE_PERSON_LINKS_FILE = path.join(dataDir, 'device_person_links.json');

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
    {
      id: 'user_006',
      name: 'William Jeffery',
      role: 'Investigator',
      email: 'william.jeffery@agency.gov',
      active: true,
    },
    {
      id: 'user_007',
      name: 'Will Yuponce',
      role: 'Investigator',
      email: 'will.yuponce@agency.gov',
      active: true,
    },
    {
      id: 'user_008',
      name: 'Anand Trivedi',
      role: 'Investigator',
      email: 'anand.trivedi@agency.gov',
      active: true,
    },
    {
      id: 'user_009',
      name: 'Scott Johnson',
      role: 'Investigator',
      email: 'scott.johnson@agency.gov',
      active: true,
    },
  ];

  let assigneesStore = safeReadJson(ASSIGNEES_FILE, DEFAULT_ASSIGNEES);
  let caseAssignmentsStore = safeReadJson(CASE_ASSIGNMENTS_FILE, {});
  let entityTitlesStore = safeReadJson(ENTITY_TITLES_FILE, {
    persons: {},
    cases: {},
    devices: {},
    hotspots: {},
  });
  let localCasesStore = safeReadJson(LOCAL_CASES_FILE, []);
  let caseOverridesStore = safeReadJson(CASE_OVERRIDES_FILE, {});
  // Case-entity links: { [caseId]: [{ entityId, role, notes, addedAt, addedBy }] }
  let caseEntitiesStore = safeReadJson(CASE_ENTITIES_FILE, {});
  // Device-person links: { links: [...], rejectedSuggestions: [...] }
  let devicePersonLinksStore = safeReadJson(DEVICE_PERSON_LINKS_FILE, {
    links: [],
    rejectedSuggestions: [],
  });

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
  function saveCaseEntities() {
    return safeWriteJson(CASE_ENTITIES_FILE, caseEntitiesStore);
  }
  function saveDevicePersonLinks() {
    return safeWriteJson(DEVICE_PERSON_LINKS_FILE, devicePersonLinksStore);
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
    GRAPH_DATA: 10 * 60 * 1000, // 10 min
    PERSONS: 5 * 60 * 1000,
    CASES: 2 * 60 * 1000,
    CONFIG: 10 * 60 * 1000,
    RELATIONSHIPS: 10 * 60 * 1000,
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
          FROM ${databricks.getTableName('location_events_silver')}
          WHERE latitude IS NOT NULL
          GROUP BY h3_cell, city, state
          ORDER BY event_count DESC
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
        SELECT * FROM ${databricks.getTableName('suspect_rankings')}
        WHERE total_score >= ${minScore}
      `;
      if (city) {
        sql += ` AND linked_cities @> '"${escapeSqlLiteral(city)}"'::jsonb`;
      }
      sql += ` ORDER BY total_score DESC OFFSET ${offset}`;

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
        SELECT * FROM ${databricks.getTableName('suspect_rankings')}
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

  /**
   * GET /api/demo/positions/bulk
   * Fetches positions for ALL hours (0-71) in a single request for smooth playback.
   * Returns a map of hour -> positions array.
   * NOTE: This route MUST be defined before /api/demo/positions/:hour
   *       so Express matches the specific path first before the parameterized one.
   */
  app.get('/api/demo/positions/bulk', async (req, res) => {
    try {
      const cacheKey = 'positions-bulk-story';

      const cached = cache.get(cacheKey);
      if (cached) return res.json({ success: true, ...cached, fromCache: true });

      // Step 1: Get rankings + edges to pick story-relevant entities
      const [rankings, socialEdges, coPresenceAssocs] = await Promise.all([
        databricks.getSuspectRankings().catch(() => []),
        databricks.getSocialEdges().catch(() => []),
        // We'll fill this after we know suspectIds — see below
      ]);

      const rankingMap = new Map((rankings || []).map((r) => [r.entity_id, r]));

      // All suspects by score
      const topSuspects = (rankings || [])
        .filter((r) => r.total_score > 0.5)
        .sort((a, b) => b.total_score - a.total_score);
      const suspectIds = new Set(topSuspects.map((r) => r.entity_id));

      // Score associates: social edges (in-memory, small table) + co-presence (SQL aggregation)
      const associateEdgeCount = new Map();
      for (const edge of (socialEdges || [])) {
        const id1 = edge.entity_id_1;
        const id2 = edge.entity_id_2;
        if (suspectIds.has(id1) && !suspectIds.has(id2)) {
          associateEdgeCount.set(id2, (associateEdgeCount.get(id2) || 0) + 1);
        }
        if (suspectIds.has(id2) && !suspectIds.has(id1)) {
          associateEdgeCount.set(id1, (associateEdgeCount.get(id1) || 0) + 1);
        }
      }

      // Co-presence associate counts — aggregated in SQL, returns top 200
      const cpAssocs = await databricks.getCoPresenceAssociateCounts(Array.from(suspectIds)).catch(() => []);
      for (const row of (cpAssocs || [])) {
        associateEdgeCount.set(row.entity_id,
          (associateEdgeCount.get(row.entity_id) || 0) + parseInt(row.connection_count || 0, 10));
      }

      // All associates by connection count
      const topAssociateIds = Array.from(associateEdgeCount.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id);

      const storyEntityIds = [...Array.from(suspectIds), ...topAssociateIds];

      logger.info({
        type: 'positions_bulk_selection',
        suspects: suspectIds.size,
        associates: topAssociateIds.length,
        totalEntities: storyEntityIds.length,
      });

      // Step 2: Fetch location events for suspects + a sample of non-suspect entities
      //         for a realistic mix on the map
      let locationEvents = [];

      // 2a: Fetch locations for all suspect/associate entities
      if (storyEntityIds.length > 0) {
        const batchSize = 200;
        const batches = [];
        for (let i = 0; i < storyEntityIds.length; i += batchSize) {
          batches.push(storyEntityIds.slice(i, i + batchSize));
        }
        const batchResults = await Promise.all(
          batches.map((batch) => {
            const safeIds = batch.map((id) => `'${escapeSqlLiteral(id)}'`).join(',');
            return databricks.runCustomQuery(`
              SELECT DISTINCT entity_id, latitude, longitude, h3_cell, city, state
              FROM ${databricks.getTableName('location_events_silver')}
              WHERE entity_id IN (${safeIds})
                AND latitude IS NOT NULL AND longitude IS NOT NULL
            `).catch(() => []);
          })
        );
        locationEvents = batchResults.flat();
      }

      // 2b: Also fetch a broader sample of non-suspect entities so the map
      //     has realistic background traffic (not just all red dots)
      const existingEntityIds = new Set(locationEvents.map((e) => e.entity_id));
      const NON_SUSPECT_TARGET = Math.max(storyEntityIds.length * 3, 500);
      const bgEvents = await databricks.runCustomQuery(`
        SELECT DISTINCT ON (entity_id) entity_id, latitude, longitude, h3_cell, city, state
        FROM ${databricks.getTableName('location_events_silver')}
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL
        ORDER BY entity_id, h3_cell
        LIMIT ${NON_SUSPECT_TARGET + storyEntityIds.length}
      `).catch(() => []);
      const bgFiltered = (bgEvents || []).filter((e) => !existingEntityIds.has(e.entity_id));
      locationEvents = locationEvents.concat(bgFiltered.slice(0, NON_SUSPECT_TARGET));

      // Deduplicate per entity
      const seenEntities = new Set();
      const uniqueEvents = (locationEvents || []).filter((event) => {
        if (!event.entity_id || seenEntities.has(event.entity_id)) return false;
        seenEntities.add(event.entity_id);
        return true;
      });

      logger.info({
        type: 'positions_bulk_entities',
        locationRows: locationEvents.length,
        uniqueEntities: uniqueEvents.length,
      });

      // Generate positions for all 72 hours based on deterministic movement
      const positionsByHour = {};
      for (let hour = 0; hour < 72; hour++) {
        positionsByHour[hour] = uniqueEvents.map((event, i) => {
          const ranking = rankingMap.get(event.entity_id);
          const isSuspect = ranking ? ranking.total_score > 0.5 : false;

          // Deterministic position variation based on hour and entity
          const entityHash = (event.entity_id || '')
            .split('')
            .reduce((a, c) => a + c.charCodeAt(0), 0);
          const seed = entityHash + hour * 137;
          const pseudoRandom1 = Math.sin(seed) * 0.5 + 0.5;
          const pseudoRandom2 = Math.cos(seed * 1.7) * 0.5 + 0.5;

          const movementRadius = isSuspect ? 0.015 : 0.005;
          const latOffset = (pseudoRandom1 - 0.5) * movementRadius * 2;
          const lngOffset = (pseudoRandom2 - 0.5) * movementRadius * 2;

          // Get custom title or fall back to raw names, using same logic as graph endpoint
          const customTitle = getEntityTitle('persons', event.entity_id);
          const rawName = ranking?.entity_name || event.entity_name || null;
          const fallbackName = isGenericPlaceholderName(rawName)
            ? `Entity ${event.entity_id}`
            : rawName;

          return {
            deviceId: `device_${event.entity_id || i}`,
            deviceName: `Device ${(event.entity_id || '').slice(-6) || i}`,
            lat: event.latitude + latOffset,
            lng: event.longitude + lngOffset,
            towerId: event.h3_cell,
            towerName: `Cell ${event.h3_cell?.slice(-6) || i}`,
            towerCity: event.city,
            ownerId: event.entity_id,
            ownerName: customTitle?.title || fallbackName,
            ownerAlias: ranking?.alias || null,
            isSuspect,
            isBurner: ranking?.is_burner || event.is_burner || false,
            deviceType: ranking?.device_type || event.device_type || 'mobile',
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
      }

      const result = {
        positionsByHour,
        totalHours: 72,
        entitiesPerHour: uniqueEvents.length,
      };
      // Cache for 5 minutes since this is expensive
      cache.set(cacheKey, result, 5 * 60 * 1000);
      res.json({ success: true, ...result, fromCache: false });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/demo/positions/:hour', async (req, res) => {
    try {
      const hour = parseInt(req.params.hour, 10);
      if (!isValidHourParam(hour))
        return res.status(400).json({ success: false, error: 'Hour must be 0-71' });

      const cacheKey = `positions-${hour}-story`;

      const cached = cache.get(cacheKey);
      if (cached) return res.json({ success: true, hour, ...cached, fromCache: true });

      // Reuse the bulk cache if available (it has all entities for all hours)
      const bulkCached = cache.get('positions-bulk-story');
      if (bulkCached?.positionsByHour?.[hour]) {
        const positions = bulkCached.positionsByHour[hour];
        const result = {
          positions,
          count: positions.length,
          suspectCount: positions.filter((p) => p.isSuspect).length,
        };
        cache.set(cacheKey, result, CACHE_TTL.POSITIONS);
        return res.json({ success: true, hour, ...result, fromCache: true });
      }

      // Fallback: use same smart entity selection as bulk endpoint
      const [rankings, socialEdges] = await Promise.all([
        databricks.getSuspectRankings().catch(() => []),
        databricks.getSocialEdges().catch(() => []),
      ]);

      const rankingMap = new Map((rankings || []).map((r) => [r.entity_id, r]));

      const topSuspects = (rankings || [])
        .filter((r) => r.total_score > 0.5)
        .sort((a, b) => b.total_score - a.total_score);
      const suspectIds = new Set(topSuspects.map((r) => r.entity_id));

      // Score associates via social edges + co-presence SQL aggregation
      const assocCount = new Map();
      for (const edge of (socialEdges || [])) {
        if (suspectIds.has(edge.entity_id_1) && !suspectIds.has(edge.entity_id_2))
          assocCount.set(edge.entity_id_2, (assocCount.get(edge.entity_id_2) || 0) + 1);
        if (suspectIds.has(edge.entity_id_2) && !suspectIds.has(edge.entity_id_1))
          assocCount.set(edge.entity_id_1, (assocCount.get(edge.entity_id_1) || 0) + 1);
      }
      const cpAssocs = await databricks.getCoPresenceAssociateCounts(Array.from(suspectIds)).catch(() => []);
      for (const row of (cpAssocs || [])) {
        assocCount.set(row.entity_id, (assocCount.get(row.entity_id) || 0) + parseInt(row.connection_count || 0, 10));
      }
      const topAssocIds = Array.from(assocCount.entries())
        .sort((a, b) => b[1] - a[1]).map(([id]) => id);

      const storyIds = [...Array.from(suspectIds), ...topAssocIds];
      let locationEvents = [];
      if (storyIds.length > 0) {
        const safeIds = storyIds.map((id) => `'${escapeSqlLiteral(id)}'`).join(',');
        locationEvents = await databricks.runCustomQuery(`
          SELECT DISTINCT entity_id, latitude, longitude, h3_cell, city, state
          FROM ${databricks.getTableName('location_events_silver')}
          WHERE entity_id IN (${safeIds})
            AND latitude IS NOT NULL AND longitude IS NOT NULL
        `).catch(() => []);
      }

      // Also fetch non-suspect entities for realistic background traffic
      const existingIds = new Set(locationEvents.map((e) => e.entity_id));
      const bgTarget = Math.max(storyIds.length * 3, 500);
      const bgEvents = await databricks.runCustomQuery(`
        SELECT DISTINCT ON (entity_id) entity_id, latitude, longitude, h3_cell, city, state
        FROM ${databricks.getTableName('location_events_silver')}
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL
        ORDER BY entity_id, h3_cell
        LIMIT ${bgTarget + storyIds.length}
      `).catch(() => []);
      const bgFiltered = (bgEvents || []).filter((e) => !existingIds.has(e.entity_id));
      locationEvents = locationEvents.concat(bgFiltered.slice(0, bgTarget));

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

        // Get custom title or fall back to raw names, using same logic as graph endpoint
        const customTitle = getEntityTitle('persons', event.entity_id);
        const rawName = ranking?.entity_name || event.entity_name || null;
        const fallbackName = isGenericPlaceholderName(rawName)
          ? `Entity ${event.entity_id}`
          : rawName;

        return {
          deviceId: `device_${event.entity_id || i}`,
          deviceName: `Device ${(event.entity_id || '').slice(-6) || i}`,
          lat: event.latitude + latOffset,
          lng: event.longitude + lngOffset,
          towerId: event.h3_cell,
          towerName: `Cell ${event.h3_cell?.slice(-6) || i}`,
          towerCity: event.city,
          ownerId: event.entity_id,
          ownerName: customTitle?.title || fallbackName,
          ownerAlias: ranking?.alias || null,
          isSuspect,
          isBurner: ranking?.is_burner || event.is_burner || false,
          deviceType: ranking?.device_type || event.device_type || 'mobile',
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

  /**
   * GET /api/demo/device-tail/:deviceId
   * Returns the historical movement trail for a specific device across all hours (0-71).
   * Used for "tailing" a device to visualize their movement pattern over time.
   */
  app.get('/api/demo/device-tail/:deviceId', async (req, res) => {
    try {
      const { deviceId } = req.params;
      if (!deviceId) {
        return res.status(400).json({ success: false, error: 'deviceId is required' });
      }

      // Extract entity ID from device ID (device_E_XXXX -> E_XXXX)
      const entityId = deviceId.startsWith('device_') ? deviceId.slice(7) : deviceId;
      const cacheKey = `device-tail-${entityId}`;

      const cached = cache.get(cacheKey);
      if (cached) return res.json({ success: true, ...cached, fromCache: true });

      // Fetch location events for this specific entity
      let locationEvents;
      try {
        locationEvents = await databricks.runCustomQuery(`
          SELECT DISTINCT 
            entity_id, 
            latitude, 
            longitude, 
            h3_cell, 
            city, 
            state
          FROM ${databricks.getTableName('location_events_silver')}
          WHERE entity_id = '${entityId.replace(/'/g, "''")}'
            AND latitude IS NOT NULL 
            AND longitude IS NOT NULL
          LIMIT 1
        `);
      } catch (err) {
        logger.warn({ type: 'device_tail', status: 'query_failed', error: err.message });
        locationEvents = [];
      }

      if (!locationEvents || locationEvents.length === 0) {
        return res.json({
          success: true,
          deviceId,
          entityId,
          trail: [],
          totalPoints: 0,
          message: 'No location data found for this device',
        });
      }

      const event = locationEvents[0];

      // Get suspect ranking info for this entity
      const rankings = await databricks.getSuspectRankings().catch(() => []);
      const ranking = (rankings || []).find((r) => r.entity_id === entityId);
      const isSuspect = ranking ? ranking.total_score > 0.5 : false;

      // Generate trail points for all 72 hours using same deterministic movement as positions endpoint
      const trail = [];
      for (let hour = 0; hour < 72; hour++) {
        const entityHash = (entityId || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        const seed = entityHash + hour * 137;
        const pseudoRandom1 = Math.sin(seed) * 0.5 + 0.5;
        const pseudoRandom2 = Math.cos(seed * 1.7) * 0.5 + 0.5;

        const movementRadius = isSuspect ? 0.015 : 0.005;
        const latOffset = (pseudoRandom1 - 0.5) * movementRadius * 2;
        const lngOffset = (pseudoRandom2 - 0.5) * movementRadius * 2;

        trail.push({
          hour,
          lat: event.latitude + latOffset,
          lng: event.longitude + lngOffset,
          city: event.city,
          h3Cell: event.h3_cell,
        });
      }

      const result = {
        deviceId,
        entityId,
        entityName: ranking?.entity_name || event.entity_name || `Entity ${entityId}`,
        alias: ranking?.alias || null,
        isSuspect,
        threatLevel: ranking
          ? ranking.total_score > 1.5
            ? 'High'
            : ranking.total_score > 1
              ? 'Medium'
              : 'Low'
          : null,
        trail,
        totalPoints: trail.length,
        baseLocation: {
          lat: event.latitude,
          lng: event.longitude,
          city: event.city,
          state: event.state,
        },
      };

      cache.set(cacheKey, result, CACHE_TTL.POSITIONS);
      res.json({ success: true, ...result, fromCache: false });
    } catch (error) {
      logger.error({ type: 'device_tail', status: 'error', error: error.message });
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/demo/hotspots/:hour', async (req, res) => {
    try {
      const hour = parseInt(req.params.hour, 10);
      if (!isValidHourParam(hour))
        return res.status(400).json({ success: false, error: 'Hour must be 0-71' });

      // Allow optional start/end hour window while keeping :hour route shape
      const hasWindow = req.query.startHour !== undefined || req.query.endHour !== undefined;
      const startHourRaw = hasWindow ? parseInt(req.query.startHour, 10) : hour;
      const endHourRaw = hasWindow
        ? parseInt(req.query.endHour !== undefined ? req.query.endHour : req.query.startHour, 10)
        : hour;

      if (
        Number.isNaN(startHourRaw) ||
        Number.isNaN(endHourRaw) ||
        startHourRaw < 0 ||
        endHourRaw < 0 ||
        startHourRaw > 71 ||
        endHourRaw > 71
      ) {
        return res
          .status(400)
          .json({ success: false, error: 'startHour/endHour must be between 0-71' });
      }

      const startHour = Math.min(startHourRaw, endHourRaw);
      const endHour = Math.max(startHourRaw, endHourRaw);

      const limit = Math.min(parseInt(req.query.limit, 10) || 200, 1000);
      const cacheKey = `hotspots-${startHour}-${endHour}-${limit}`;

      const cached = cache.get(cacheKey);
      if (cached) return res.json({ success: true, hour, ...cached, fromCache: true });

      // Fetch cell counts and suspect rankings in parallel
      const [cellCounts, suspectRankings] = await Promise.all([
        databricks.getCellDeviceCounts(),
        databricks.getSuspectRankings(),
      ]);

      // Build set of suspect entity IDs for fast lookup
      const suspectIds = new Set((suspectRankings || []).map((s) => s.entity_id));

      // Map time_bucket -> hour index based on chronological order (if present)
      const buckets = Array.from(
        new Set((cellCounts || []).map((r) => r.time_bucket).filter(Boolean))
      ).sort();
      const bucketToHour = new Map(buckets.map((b, i) => [b, i]));
      // Clamp requested window to available buckets if any
      const maxBucketIndex = buckets.length > 0 ? buckets.length - 1 : 71;
      const windowStart = Math.min(Math.max(startHour, 0), maxBucketIndex);
      const windowEnd = Math.min(Math.max(endHour, windowStart), maxBucketIndex);

      const cellMap = new Map();
      for (const row of cellCounts || []) {
        // If we have time buckets, filter rows outside the requested window
        if (bucketToHour.size) {
          const idx = bucketToHour.get(row.time_bucket);
          if (idx === undefined || idx < windowStart || idx > windowEnd) continue;
        }

        const cellId = row.h3_cell;
        if (!cellId) continue;

        const existing = cellMap.get(cellId);
        if (existing) {
          // Merge: sum device counts, union entity_ids
          existing.deviceCount += row.device_count || 0;
          const entityIds = Array.isArray(row.entity_ids) ? row.entity_ids : [];
          for (const eid of entityIds) existing.entityIds.add(eid);
        } else {
          const entityIds = Array.isArray(row.entity_ids) ? row.entity_ids : [];
          cellMap.set(cellId, {
            h3_cell: cellId,
            // Use correct column names: center_lat/center_lon
            lat: row.center_lat || row.latitude || 38.9,
            lng: row.center_lon || row.longitude || -77.0,
            city: row.city || 'Unknown',
            state: row.state || '',
            deviceCount: row.device_count || 0,
            entityIds: new Set(entityIds),
            isHighActivity: row.is_high_activity || false,
          });
        }
      }

      // Convert map to array and calculate suspect counts
      const aggregated = Array.from(cellMap.values()).map((cell) => {
        const entityIdArray = Array.from(cell.entityIds);
        const suspectCount = entityIdArray.filter((eid) => suspectIds.has(eid)).length;
        return {
          ...cell,
          entityIds: entityIdArray,
          suspectCount,
        };
      });

      // Sort by activity (device count) and take top hotspots
      const sorted = aggregated.sort((a, b) => b.deviceCount - a.deviceCount).slice(0, limit);

      // Track name occurrences to disambiguate duplicates
      const nameCount = new Map();
      const hotspots = sorted.map((c) => {
        // Use last 8 chars for better uniqueness (was 6)
        const baseName = `Cell ${c.h3_cell?.slice(-8) || 'Unknown'}`;
        const count = nameCount.get(baseName) || 0;
        nameCount.set(baseName, count + 1);
        // Add suffix only if there are duplicates
        const towerName = count > 0 ? `${baseName} #${count + 1}` : baseName;

        return {
          towerId: c.h3_cell,
          towerName,
          lat: c.lat,
          lng: c.lng,
          city: c.city,
          state: c.state,
          deviceCount: c.deviceCount,
          suspectCount: c.suspectCount,
          entityIds: c.entityIds,
          isHighActivity: c.isHighActivity,
        };
      });

      const result = {
        hotspots,
        totalHotspots: cellMap.size,
        totalSuspects: suspectIds.size,
        startHour: windowStart,
        endHour: windowEnd,
      };
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
            FROM ${databricks.getTableName('entity_case_overlap')}
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
            FROM ${databricks.getTableName('case_summary_with_suspects')}
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

  // Persist priority updates as local overrides (demo persistence)
  app.patch('/api/demo/cases/:id/priority', (req, res) => {
    try {
      const caseId = req.params.id;
      const { priority } = req.body || {};
      const allowed = new Set(['low', 'medium', 'high', 'critical']);
      const normalized =
        typeof priority === 'string' && priority.trim().length > 0
          ? priority.trim().toLowerCase()
          : '';

      if (!allowed.has(normalized)) {
        return res
          .status(400)
          .json({ success: false, error: 'priority must be low|medium|high|critical' });
      }

      const titleCased = normalized.charAt(0).toUpperCase() + normalized.slice(1);

      caseOverridesStore[caseId] = {
        ...(caseOverridesStore[caseId] || {}),
        priority: titleCased,
        updatedAt: nowIso(),
      };
      saveCaseOverrides();
      cache.invalidate('cases');
      logger.info({ type: 'case_priority_updated', caseId, priority: titleCased });
      res.json({ success: true, caseId, priority: titleCased });
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
      const [rankings, socialEdges] = await Promise.all([
        databricks.getSuspectRankings(),
        databricks.getSocialEdges(),
      ]);

      // Build a set of known entity IDs and a map for names
      const knownEntityIds = new Set((rankings || []).map((r) => r.entity_id));

      // Fetch co-presence scoped to known entities
      const coPresence = await databricks.getCoPresenceEdges(Array.from(knownEntityIds)).catch(() => []);
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
      const limit = Math.min(parseInt(req.query.limit, 10) || 15000, 50000);
      const city = req.query.city || null;
      const minScore = parseFloat(req.query.minScore) || 0;

      const cacheKey = `graph-data-${limit}-${city || 'all'}-${minScore}`;
      const cached = cache.get(cacheKey);
      if (cached) return res.json({ success: true, ...cached, fromCache: true });

      // Fetch rankings first so we can scope co-presence to relevant entities
      const [rankings, socialEdges, devicePersonLinks] = await Promise.all([
        databricks.getSuspectRankings(),
        databricks.getSocialEdges(),
        databricks.getDevicePersonLinks(),
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

      // Fetch co-presence edges scoped to ranking entities only
      const coPresence = await databricks.getCoPresenceEdges(Array.from(rankingIds)).catch(() => []);

      const nodes = filteredRankings.map((r) => {
        const customTitle = getEntityTitle('persons', r.entity_id);
        const rawName = r.entity_name || null;
        const originalName = isGenericPlaceholderName(rawName) ? `Entity ${r.entity_id}` : rawName;
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

      // Device nodes from device-person links
      // Build a map of device -> person for creating edges
      const deviceToPersonMap = new Map();
      (devicePersonLinks || []).forEach((link) => {
        if (!link?.device_id || !link?.person_id) return;
        deviceToPersonMap.set(link.device_id, {
          personId: link.person_id,
          relationship: link.relationship || 'linked',
          confidence: link.confidence || 0.5,
          isCurrent: link.is_current !== false,
        });
      });

      // Add device nodes for devices that have linked persons in our graph
      const addedDeviceIds = new Set();
      (devicePersonLinks || []).forEach((link) => {
        if (!link?.device_id) return;
        // Skip if we already added this device
        if (addedDeviceIds.has(link.device_id)) return;

        const customTitle = getEntityTitle('devices', link.device_id);
        const deviceName = `Device ${link.device_id}`;
        nodes.push({
          id: link.device_id,
          name: customTitle?.title || deviceName,
          originalName: deviceName,
          customTitle: customTitle?.title || null,
          hasCustomTitle: !!customTitle,
          type: 'device',
          relationship: link.relationship || 'linked',
          ownerId: link.person_id || null,
          confidence: link.confidence || 0.5,
          isCurrent: link.is_current !== false,
          isBurner: link.relationship === 'suspected_owner' || link.notes?.includes('Burner'),
        });
        addedDeviceIds.add(link.device_id);
        addedNodeIds.add(link.device_id);
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
          const rawName1 = edge.entity_name_1 || null;
          const fallbackName1 = isGenericPlaceholderName(rawName1)
            ? `Entity ${edge.entity_id_1}`
            : rawName1;
          nodes.push({
            id: edge.entity_id_1,
            name: customTitle?.title || fallbackName1,
            originalName: fallbackName1,
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
          const rawName2 = edge.entity_name_2 || null;
          const fallbackName2 = isGenericPlaceholderName(rawName2)
            ? `Entity ${edge.entity_id_2}`
            : rawName2;
          nodes.push({
            id: edge.entity_id_2,
            name: customTitle?.title || fallbackName2,
            originalName: fallbackName2,
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

      // Device-to-person (OWNS) links
      (devicePersonLinks || []).forEach((link) => {
        if (!link?.device_id || !link?.person_id) return;
        // Only create edge if person exists in our graph
        if (!addedNodeIds.has(link.person_id)) return;

        links.push({
          source: link.person_id,
          target: link.device_id,
          type: 'OWNS',
          relationship: link.relationship || 'linked',
          confidence: link.confidence || 0.5,
          isCurrent: link.is_current !== false,
        });
      });

      const result = {
        nodes,
        links,
        stats: {
          nodeCount: nodes.length,
          linkCount: links.length,
          personCount: nodes.filter((n) => n.type === 'person').length,
          deviceCount: nodes.filter((n) => n.type === 'device').length,
          coLocationLinks: links.filter((l) => l.type === 'CO_LOCATED').length,
          socialLinks: links.filter((l) => l.type === 'SOCIAL').length,
          ownsLinks: links.filter((l) => l.type === 'OWNS').length,
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
        FROM ${databricks.getTableName('location_events_silver')}
        WHERE entity_id IN (${safeIds})
          AND latitude IS NOT NULL
          AND longitude IS NOT NULL
      `;

      const rows = await databricks.runCustomQuery(sql);

      // If the location table doesn't have a name column, try to resolve names from suspect_rankings
      const entityNameMap = new Map();
      if (!nameCol) {
        try {
          const nameRows = await databricks.runCustomQuery(`
            SELECT entity_id, entity_name
            FROM ${databricks.getTableName('suspect_rankings')}
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
   * POST /api/demo/social-log
   * Given a set of entity IDs, return social connections (calls, messages) between them.
   */
  app.post('/api/demo/social-log', async (req, res) => {
    try {
      const body = req.body || {};
      const entityIds = Array.isArray(body.entityIds) ? body.entityIds.map(String) : [];
      const limit = Math.min(Number.parseInt(body.limit, 10) || 5000, 20000);

      const uniqueIds = Array.from(new Set(entityIds.map((s) => s.trim()).filter(Boolean)));
      if (uniqueIds.length < 2) {
        return res
          .status(400)
          .json({ success: false, error: 'entityIds must contain at least 2 IDs' });
      }

      const cacheKey = `social-log:${limit}:${uniqueIds.sort().join(',')}`;
      const cached = cache.get(cacheKey);
      if (cached) return res.json({ success: true, ...cached, fromCache: true });

      // Get social edges from the database
      const [socialEdges, rankings] = await Promise.all([
        databricks.getSocialEdges(),
        databricks.getSuspectRankings(),
      ]);

      // Build entity name map
      const entityNames = new Map(
        (rankings || []).map((r) => [r.entity_id, r.entity_name || `Entity ${r.entity_id}`])
      );
      const entityAliases = new Map((rankings || []).map((r) => [r.entity_id, r.alias || null]));

      // Filter to edges where both entities are in the selection
      const selectedSet = new Set(uniqueIds);
      const filteredEdges = (socialEdges || []).filter(
        (e) => selectedSet.has(e.entity_id_1) && selectedSet.has(e.entity_id_2)
      );

      // Format entries
      const entries = filteredEdges.slice(0, limit).map((e) => ({
        person1Id: e.entity_id_1,
        person1Name: entityNames.get(e.entity_id_1) || e.entity_name_1 || `Entity ${e.entity_id_1}`,
        person1Alias: entityAliases.get(e.entity_id_1) || null,
        person2Id: e.entity_id_2,
        person2Name: entityNames.get(e.entity_id_2) || e.entity_name_2 || `Entity ${e.entity_id_2}`,
        person2Alias: entityAliases.get(e.entity_id_2) || null,
        type: e.edge_type || 'CONTACTED',
        count: e.interaction_count || 1,
        firstContact: e.first_contact || e.first_interaction || null,
        lastContact: e.last_contact || e.last_interaction || null,
      }));

      const payload = {
        entityIds: uniqueIds,
        entries,
        totalConnections: filteredEdges.length,
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
    // Helper to merge local entity links with Databricks-derived entities
    function mergeLocalEntities(caseId, databricksEntities) {
      const localLinks = caseEntitiesStore[caseId] || [];
      if (localLinks.length === 0) return databricksEntities;

      const existingIds = new Set(databricksEntities.map((e) => e.id));
      const localEntities = localLinks
        .filter((link) => !existingIds.has(link.entityId))
        .map((link) => ({
          id: link.entityId,
          name: getEntityTitle('persons', link.entityId)?.title || `Entity ${link.entityId}`,
          originalName: `Entity ${link.entityId}`,
          alias: null,
          caseRole: link.role,
          linkSource: 'manual',
          notes: link.notes,
          addedAt: link.addedAt,
          // No computed scores for manually-linked entities
          overlapScore: null,
          confidence: null,
          threatLevel: 'Unknown',
          totalScore: null,
          linkedCities: null,
          geoEvidence: link.notes ? [{ claim: link.notes, confidence: 'Manual' }] : null,
        }));

      return [...databricksEntities, ...localEntities];
    }

    try {
      const caseId = req.params.id;
      const cacheKey = `case-detail:${caseId}`;
      const cached = cache.get(cacheKey);
      if (cached) return res.json({ success: true, ...cached, fromCache: true });

      const safeCaseId = escapeSqlLiteral(caseId);
      const rows = await databricks.runCustomQuery(`
        SELECT * FROM ${databricks.getTableName('cases_silver')}
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
          FROM ${databricks.getTableName('case_summary_with_suspects')}
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

            // Prefer real names; fall back to entity ID if name is a generic placeholder
            const rawName = p.display_name || p.alias || null;
            const displayName = isGenericPlaceholderName(rawName)
              ? `Entity ${personId || deviceId || id}`
              : rawName;

            return {
              id,
              personId,
              deviceId,
              name: displayName,
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
          FROM ${databricks.getTableName('entity_case_overlap')}
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
            FROM ${databricks.getTableName('suspect_rankings')}
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
            FROM ${databricks.getTableName('evidence_card_data')}
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

        // Prefer real names; fall back to entity ID if name is a generic placeholder
        const rawName = ranking?.entity_name || null;
        const originalName = isGenericPlaceholderName(rawName) ? `Entity ${entityId}` : rawName;
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
        databricks.getCoPresenceEdges(personIds), // Scoped to requested persons
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

  // ============== CASE ENTITY LINKS (Evidence) ==============

  /**
   * GET /api/demo/cases/:id/entities
   * List entities linked to a case (local overrides only; Databricks links come via /detail)
   */
  app.get('/api/demo/cases/:id/entities', (req, res) => {
    try {
      const caseId = req.params.id;
      const entities = caseEntitiesStore[caseId] || [];
      res.json({ success: true, caseId, entities, count: entities.length });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/demo/cases/:id/entities
   * Link an entity (person/device) to a case as evidence
   */
  app.post('/api/demo/cases/:id/entities', (req, res) => {
    try {
      const caseId = req.params.id;
      const { entityId, role, notes } = req.body || {};

      if (!entityId || typeof entityId !== 'string' || !entityId.trim()) {
        return res.status(400).json({ success: false, error: 'entityId is required' });
      }

      const trimmedEntityId = entityId.trim();

      // Initialize array for this case if needed
      if (!caseEntitiesStore[caseId]) {
        caseEntitiesStore[caseId] = [];
      }

      // Check for duplicate
      const existing = caseEntitiesStore[caseId].find((e) => e.entityId === trimmedEntityId);
      if (existing) {
        return res.status(409).json({
          success: false,
          error: 'Entity already linked to this case',
          existing,
        });
      }

      const VALID_ROLES = [
        'suspect',
        'witness',
        'victim',
        'person_of_interest',
        'associate',
        'other',
      ];
      const validRole =
        typeof role === 'string' && VALID_ROLES.includes(role.toLowerCase())
          ? role.toLowerCase()
          : 'person_of_interest';

      const newLink = {
        entityId: trimmedEntityId,
        role: validRole,
        notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
        addedAt: nowIso(),
        linkSource: 'manual',
      };

      caseEntitiesStore[caseId].push(newLink);
      saveCaseEntities();

      // Invalidate related caches
      cache.invalidate(`case-detail:${caseId}`);
      cache.invalidatePrefix('cases');

      logger.info({
        type: 'case_entity_linked',
        caseId,
        entityId: trimmedEntityId,
        role: validRole,
      });
      res.status(201).json({ success: true, caseId, entity: newLink });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * PATCH /api/demo/cases/:id/entities/:entityId
   * Update the role or notes for a linked entity
   */
  app.patch('/api/demo/cases/:id/entities/:entityId', (req, res) => {
    try {
      const { id: caseId, entityId } = req.params;
      const { role, notes } = req.body || {};

      if (!caseEntitiesStore[caseId]) {
        return res.status(404).json({ success: false, error: 'No entities linked to this case' });
      }

      const idx = caseEntitiesStore[caseId].findIndex((e) => e.entityId === entityId);
      if (idx === -1) {
        return res.status(404).json({ success: false, error: 'Entity not linked to this case' });
      }

      const VALID_ROLES = [
        'suspect',
        'witness',
        'victim',
        'person_of_interest',
        'associate',
        'other',
      ];
      const entity = { ...caseEntitiesStore[caseId][idx] };

      if (role !== undefined) {
        entity.role =
          typeof role === 'string' && VALID_ROLES.includes(role.toLowerCase())
            ? role.toLowerCase()
            : entity.role;
      }
      if (notes !== undefined) {
        entity.notes = typeof notes === 'string' && notes.trim() ? notes.trim() : null;
      }
      entity.updatedAt = nowIso();

      caseEntitiesStore[caseId][idx] = entity;
      saveCaseEntities();

      cache.invalidate(`case-detail:${caseId}`);
      cache.invalidatePrefix('cases');

      logger.info({ type: 'case_entity_updated', caseId, entityId });
      res.json({ success: true, caseId, entity });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * DELETE /api/demo/cases/:id/entities/:entityId
   * Unlink an entity from a case
   */
  app.delete('/api/demo/cases/:id/entities/:entityId', (req, res) => {
    try {
      const { id: caseId, entityId } = req.params;

      if (!caseEntitiesStore[caseId]) {
        return res.status(404).json({ success: false, error: 'No entities linked to this case' });
      }

      const idx = caseEntitiesStore[caseId].findIndex((e) => e.entityId === entityId);
      if (idx === -1) {
        return res.status(404).json({ success: false, error: 'Entity not linked to this case' });
      }

      caseEntitiesStore[caseId].splice(idx, 1);

      // Clean up empty arrays
      if (caseEntitiesStore[caseId].length === 0) {
        delete caseEntitiesStore[caseId];
      }

      saveCaseEntities();

      cache.invalidate(`case-detail:${caseId}`);
      cache.invalidatePrefix('cases');

      logger.info({ type: 'case_entity_unlinked', caseId, entityId });
      res.json({ success: true, message: 'Entity unlinked from case', caseId, entityId });
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
          SELECT * FROM ${databricks.getTableName('evidence_card_data')}
          WHERE entity_id = '${safeId}'
          LIMIT 1
        `
          )
          .catch(() => []),
        databricks
          .runCustomQuery(
            `
          SELECT * FROM ${databricks.getTableName('suspect_rankings')}
          WHERE entity_id = '${safeId}'
          LIMIT 1
        `
          )
          .catch(() => []),
        databricks
          .runCustomQuery(
            `
          SELECT * FROM ${databricks.getTableName('entity_case_overlap')}
          WHERE entity_id = '${safeId}'
          ORDER BY overlap_score DESC
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

      const [cases, suspects, coPresenceCount] = await Promise.all([
        databricks.getCases(), // Fetch all
        databricks.getSuspectRankings(), // Fetch all
        databricks.getCoPresenceCount(), // Just count, don't fetch 7M+ rows
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
        totalCoLocations: coPresenceCount || 0,
        crossJurisdictionHandoffs: 0, // Handoff alerts removed
        cities: [...new Set((suspects || []).flatMap((s) => s.linked_cities || []))],
        totalEstimatedLoss: (cases || []).reduce((sum, c) => sum + (c.estimated_loss || 0), 0),
      };

      cache.set(cacheKey, stats, CACHE_TTL.CONFIG);
      res.json({ success: true, stats, fromCache: false });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============== DATABASE DIRECT ENDPOINTS ==============
  app.get('/api/databricks/tables', async (req, res) => {
    try {
      const tables = await databricks.listTables();
      res.json({ success: true, schema: databricks.SCHEMA, tables });
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
      const fqn = databricks.getTableName(table);
      try {
        // Query column metadata from information_schema (Postgres equivalent of DESCRIBE)
        const details = await databricks.executeQuery(`
          SELECT column_name as col_name, data_type, ordinal_position,
                 CASE WHEN is_nullable = 'YES' THEN 'true' ELSE 'false' END as nullable,
                 column_default
          FROM information_schema.columns
          WHERE table_schema = '${databricks.SCHEMA}'
            AND table_name = '${escapeSqlLiteral(table)}'
          ORDER BY ordinal_position
        `);
        return res.json({ success: true, table, fqn, kind: 'detail', details });
      } catch (err) {
        // Fallback: try pg_catalog
        const extended = await databricks.executeQuery(`
          SELECT a.attname as col_name,
                 pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
                 a.attnum as ordinal_position
          FROM pg_catalog.pg_attribute a
          JOIN pg_catalog.pg_class c ON a.attrelid = c.oid
          JOIN pg_catalog.pg_namespace n ON c.relnamespace = n.oid
          WHERE n.nspname = '${databricks.SCHEMA}'
            AND c.relname = '${escapeSqlLiteral(table)}'
            AND a.attnum > 0
            AND NOT a.attisdropped
          ORDER BY a.attnum
        `);
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

  // ============== DEVICE-PERSON LINKS (Identity Resolution) ==============

  /**
   * GET /api/demo/device-person-links
   * List all user-confirmed device-person links
   */
  app.get('/api/demo/device-person-links', (req, res) => {
    try {
      const links = devicePersonLinksStore.links || [];
      res.json({ success: true, links, count: links.length });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/demo/device-person-links
   * Create a new device-person link
   */
  app.post('/api/demo/device-person-links', (req, res) => {
    try {
      const { deviceId, personId, relationship, confidence, notes, validFrom, validTo } =
        req.body || {};

      if (!deviceId || typeof deviceId !== 'string' || !deviceId.trim()) {
        return res.status(400).json({ success: false, error: 'deviceId is required' });
      }
      if (!personId || typeof personId !== 'string' || !personId.trim()) {
        return res.status(400).json({ success: false, error: 'personId is required' });
      }

      const trimmedDeviceId = deviceId.trim();
      const trimmedPersonId = personId.trim();

      // Check for existing link (same device-person pair)
      const existing = devicePersonLinksStore.links.find(
        (l) => l.deviceId === trimmedDeviceId && l.personId === trimmedPersonId
      );
      if (existing) {
        return res.status(409).json({
          success: false,
          error: 'Link already exists between this device and person',
          existing,
        });
      }

      const VALID_RELATIONSHIPS = ['owner', 'suspected_owner', 'burner', 'shared', 'temporary'];
      const validRelationship =
        typeof relationship === 'string' && VALID_RELATIONSHIPS.includes(relationship.toLowerCase())
          ? relationship.toLowerCase()
          : 'suspected_owner';

      const linkId = `DPL_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const newLink = {
        linkId,
        deviceId: trimmedDeviceId,
        personId: trimmedPersonId,
        relationship: validRelationship,
        confidence: typeof confidence === 'number' ? Math.max(0, Math.min(1, confidence)) : 0.5,
        validFrom: validFrom || nowIso().split('T')[0],
        validTo: validTo || null,
        notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
        source: 'manual',
        createdAt: nowIso(),
      };

      devicePersonLinksStore.links.push(newLink);
      saveDevicePersonLinks();

      // Invalidate related caches
      cache.invalidatePrefix('persons');
      cache.invalidatePrefix('devices');
      cache.invalidatePrefix('graph');
      cache.invalidatePrefix('link-suggestions');

      logger.info({
        type: 'device_person_linked',
        linkId,
        deviceId: trimmedDeviceId,
        personId: trimmedPersonId,
        relationship: validRelationship,
      });
      res.status(201).json({ success: true, link: newLink });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * PATCH /api/demo/device-person-links/:linkId
   * Update an existing device-person link
   */
  app.patch('/api/demo/device-person-links/:linkId', (req, res) => {
    try {
      const { linkId } = req.params;
      const { relationship, confidence, notes, validTo } = req.body || {};

      const idx = devicePersonLinksStore.links.findIndex((l) => l.linkId === linkId);
      if (idx === -1) {
        return res.status(404).json({ success: false, error: 'Link not found' });
      }

      const link = { ...devicePersonLinksStore.links[idx] };
      const VALID_RELATIONSHIPS = ['owner', 'suspected_owner', 'burner', 'shared', 'temporary'];

      if (relationship !== undefined) {
        link.relationship =
          typeof relationship === 'string' &&
          VALID_RELATIONSHIPS.includes(relationship.toLowerCase())
            ? relationship.toLowerCase()
            : link.relationship;
      }
      if (confidence !== undefined) {
        link.confidence =
          typeof confidence === 'number' ? Math.max(0, Math.min(1, confidence)) : link.confidence;
      }
      if (notes !== undefined) {
        link.notes = typeof notes === 'string' && notes.trim() ? notes.trim() : null;
      }
      if (validTo !== undefined) {
        link.validTo = validTo;
      }
      link.updatedAt = nowIso();

      devicePersonLinksStore.links[idx] = link;
      saveDevicePersonLinks();

      cache.invalidatePrefix('persons');
      cache.invalidatePrefix('devices');
      cache.invalidatePrefix('graph');

      logger.info({ type: 'device_person_link_updated', linkId });
      res.json({ success: true, link });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * DELETE /api/demo/device-person-links/:linkId
   * Remove a device-person link
   */
  app.delete('/api/demo/device-person-links/:linkId', (req, res) => {
    try {
      const { linkId } = req.params;

      const idx = devicePersonLinksStore.links.findIndex((l) => l.linkId === linkId);
      if (idx === -1) {
        return res.status(404).json({ success: false, error: 'Link not found' });
      }

      const removed = devicePersonLinksStore.links.splice(idx, 1)[0];
      saveDevicePersonLinks();

      cache.invalidatePrefix('persons');
      cache.invalidatePrefix('devices');
      cache.invalidatePrefix('graph');

      logger.info({ type: 'device_person_link_removed', linkId });
      res.json({ success: true, message: 'Link removed', link: removed });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/demo/link-suggestions
   * Get AI-suggested device-person links based on handoff patterns and co-presence
   */
  app.get('/api/demo/link-suggestions', async (req, res) => {
    try {
      const cacheKey = 'link-suggestions';
      const cached = cache.get(cacheKey);
      if (cached) return res.json({ success: true, suggestions: cached, fromCache: true });

      // Get existing links and rejected suggestions to filter them out
      const existingLinks = new Set(
        devicePersonLinksStore.links.map((l) => `${l.deviceId}:${l.personId}`)
      );
      const rejectedKeys = new Set(
        (devicePersonLinksStore.rejectedSuggestions || []).map(
          (r) => `${r.oldEntityId}:${r.newEntityId}`
        )
      );

      // Fetch handoff candidates and person-device links from Databricks
      const [handoffRows, personDeviceRows, personsRows] = await Promise.all([
        databricks
          .runCustomQuery(
            `SELECT old_entity_id, new_entity_id, h3_cell, old_last_bucket, new_first_bucket,
                    time_diff_minutes, shared_partner_count, handoff_score, rank
             FROM ${databricks.getTableName('handoff_candidates')}
             WHERE handoff_score >= 0.7 AND rank <= 3
             ORDER BY handoff_score DESC`
          )
          .catch(() => []),
        databricks
          .runCustomQuery(
            `SELECT device_id, person_id, relationship, confidence, notes
             FROM ${databricks.getTableName('person_device_links_silver')}`
          )
          .catch(() => []),
        databricks
          .runCustomQuery(
            `SELECT person_id, display_name, alias, role, risk_level
             FROM ${databricks.getTableName('persons_silver')}`
          )
          .catch(() => []),
      ]);

      // Build lookup maps
      const deviceToPersonMap = new Map();
      for (const row of personDeviceRows || []) {
        deviceToPersonMap.set(row.device_id, {
          personId: row.person_id,
          relationship: row.relationship,
          confidence: row.confidence,
        });
      }

      const personInfoMap = new Map();
      for (const row of personsRows || []) {
        personInfoMap.set(row.person_id, {
          displayName: row.display_name,
          alias: row.alias,
          role: row.role,
          riskLevel: row.risk_level,
        });
      }

      // Generate suggestions from handoff candidates
      const suggestions = [];
      for (const h of handoffRows || []) {
        const oldDevice = h.old_entity_id;
        const newDevice = h.new_entity_id;

        // Check if old device has a known person
        const knownLink = deviceToPersonMap.get(oldDevice);
        if (!knownLink) continue;

        const personId = knownLink.personId;
        const personInfo = personInfoMap.get(personId) || {};

        // Skip if already linked or rejected
        const suggestionKey = `${newDevice}:${personId}`;
        if (existingLinks.has(suggestionKey) || rejectedKeys.has(`${oldDevice}:${newDevice}`)) {
          continue;
        }

        suggestions.push({
          id: `SUG_${oldDevice}_${newDevice}`,
          suggestedDeviceId: newDevice,
          suggestedPersonId: personId,
          personName: personInfo.displayName || `Person ${personId}`,
          personAlias: personInfo.alias || null,
          personRole: personInfo.role || null,
          riskLevel: personInfo.riskLevel || null,
          knownDeviceId: oldDevice,
          evidence: {
            type: 'handoff',
            handoffScore: h.handoff_score,
            sharedPartners: h.shared_partner_count,
            timeDiffMinutes: h.time_diff_minutes,
            h3Cell: h.h3_cell,
            oldLastSeen: h.old_last_bucket,
            newFirstSeen: h.new_first_bucket,
          },
          confidence: Math.min(
            0.95,
            (h.handoff_score || 0) * 0.9 + (knownLink.confidence || 0.5) * 0.1
          ),
          reason: `Device ${newDevice} appeared ${h.time_diff_minutes || 0} minutes after ${oldDevice} went dark. ${h.shared_partner_count || 0} shared co-presence partners.`,
        });
      }

      // Sort by confidence
      suggestions.sort((a, b) => b.confidence - a.confidence);

      cache.set(cacheKey, suggestions, CACHE_TTL.RELATIONSHIPS);
      res.json({ success: true, suggestions, total: suggestions.length, fromCache: false });
    } catch (error) {
      logger.warn({ type: 'link_suggestions', status: 'failed', error: error.message });
      res.json({ success: true, suggestions: [], error: error.message });
    }
  });

  /**
   * POST /api/demo/link-suggestions/:id/confirm
   * Confirm a suggested link - creates a new device-person link
   */
  app.post('/api/demo/link-suggestions/:id/confirm', async (req, res) => {
    try {
      const suggestionId = req.params.id;
      const { notes } = req.body || {};

      // Parse suggestion ID to get device IDs
      const parts = suggestionId.split('_');
      if (parts.length < 3) {
        return res.status(400).json({ success: false, error: 'Invalid suggestion ID' });
      }

      // Re-fetch the suggestion to get current data
      const cacheKey = 'link-suggestions';
      let suggestions = cache.get(cacheKey);

      if (!suggestions) {
        // If not cached, trigger a refresh
        return res.status(404).json({
          success: false,
          error: 'Suggestion not found. Please refresh suggestions.',
        });
      }

      const suggestion = suggestions.find((s) => s.id === suggestionId);
      if (!suggestion) {
        return res.status(404).json({ success: false, error: 'Suggestion not found' });
      }

      // Create the link
      const linkId = `DPL_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const newLink = {
        linkId,
        deviceId: suggestion.suggestedDeviceId,
        personId: suggestion.suggestedPersonId,
        relationship: 'suspected_owner',
        confidence: suggestion.confidence,
        validFrom: suggestion.evidence?.newFirstSeen?.split('T')[0] || nowIso().split('T')[0],
        validTo: null,
        notes: notes || suggestion.reason,
        source: 'suggestion_confirmed',
        suggestionId,
        createdAt: nowIso(),
      };

      devicePersonLinksStore.links.push(newLink);
      saveDevicePersonLinks();

      // Invalidate caches
      cache.invalidate(cacheKey);
      cache.invalidatePrefix('persons');
      cache.invalidatePrefix('devices');
      cache.invalidatePrefix('graph');

      logger.info({
        type: 'link_suggestion_confirmed',
        suggestionId,
        linkId,
        deviceId: suggestion.suggestedDeviceId,
        personId: suggestion.suggestedPersonId,
      });

      res.status(201).json({ success: true, link: newLink });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/demo/link-suggestions/:id/reject
   * Reject a suggestion - hides it from future results
   */
  app.post('/api/demo/link-suggestions/:id/reject', (req, res) => {
    try {
      const suggestionId = req.params.id;
      const { reason } = req.body || {};

      // Parse to get entity IDs
      const parts = suggestionId.split('_');
      if (parts.length < 3) {
        return res.status(400).json({ success: false, error: 'Invalid suggestion ID' });
      }

      const oldEntityId = parts[1];
      const newEntityId = parts.slice(2).join('_');

      // Check if already rejected
      const alreadyRejected = devicePersonLinksStore.rejectedSuggestions.find(
        (r) => r.oldEntityId === oldEntityId && r.newEntityId === newEntityId
      );
      if (alreadyRejected) {
        return res.json({ success: true, message: 'Already rejected', rejection: alreadyRejected });
      }

      const rejection = {
        oldEntityId,
        newEntityId,
        suggestionId,
        reason: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
        rejectedAt: nowIso(),
      };

      devicePersonLinksStore.rejectedSuggestions.push(rejection);
      saveDevicePersonLinks();

      // Invalidate cache so suggestion is filtered out
      cache.invalidate('link-suggestions');

      logger.info({ type: 'link_suggestion_rejected', suggestionId, oldEntityId, newEntityId });
      res.json({ success: true, message: 'Suggestion rejected', rejection });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/demo/entities-with-link-status
   * Get all devices and persons with their link status for the graph explorer
   */
  app.get('/api/demo/entities-with-link-status', async (req, res) => {
    try {
      const cacheKey = 'entities-with-link-status';
      const cached = cache.get(cacheKey);
      if (cached) return res.json({ success: true, ...cached, fromCache: true });

      // Fetch from Databricks
      const [personsRows, devicesRows, databricksLinksRows] = await Promise.all([
        databricks
          .runCustomQuery(
            `SELECT person_id, display_name, alias, role, risk_level, criminal_history, is_suspect
             FROM ${databricks.getTableName('persons_silver')}`
          )
          .catch(() => []),
        databricks
          .runCustomQuery(
            `SELECT DISTINCT entity_id, linked_cases, linked_cities, total_score, rank
             FROM ${databricks.getTableName('suspect_rankings')}
             ORDER BY total_score DESC`
          )
          .catch(() => []),
        databricks
          .runCustomQuery(
            `SELECT device_id, person_id, relationship, confidence, is_current
             FROM ${databricks.getTableName('person_device_links_silver')}`
          )
          .catch(() => []),
      ]);

      // Build maps
      const databricksLinks = new Map();
      for (const row of databricksLinksRows || []) {
        databricksLinks.set(row.device_id, {
          personId: row.person_id,
          relationship: row.relationship,
          confidence: row.confidence,
          isCurrent: row.is_current,
          source: 'databricks',
        });
      }

      // Add local links
      const localLinks = new Map();
      for (const link of devicePersonLinksStore.links) {
        localLinks.set(link.deviceId, {
          personId: link.personId,
          relationship: link.relationship,
          confidence: link.confidence,
          source: 'local',
          linkId: link.linkId,
        });
      }

      // Build persons list
      const persons = (personsRows || []).map((p) => ({
        id: p.person_id,
        type: 'person',
        name: p.display_name || `Person ${p.person_id}`,
        alias: p.alias || null,
        role: p.role || null,
        riskLevel: p.risk_level || null,
        criminalHistory: p.criminal_history || null,
        isSuspect: p.is_suspect || false,
        linkedDevices: [],
      }));

      // Build persons lookup
      const personsMap = new Map(persons.map((p) => [p.id, p]));

      // Build devices list with link status
      const devices = (devicesRows || []).map((d) => {
        const deviceId = d.entity_id;
        const databricksLink = databricksLinks.get(deviceId);
        const localLink = localLinks.get(deviceId);
        const activeLink = localLink || databricksLink;

        const device = {
          id: deviceId,
          type: 'device',
          name: `Device ${deviceId.slice(-6)}`,
          linkedCases: d.linked_cases || [],
          linkedCities: d.linked_cities || [],
          totalScore: d.total_score || 0,
          rank: d.rank || null,
          // Link status
          isLinked: !!activeLink,
          linkedPersonId: activeLink?.personId || null,
          linkedPersonName: null,
          linkRelationship: activeLink?.relationship || null,
          linkConfidence: activeLink?.confidence || null,
          linkSource: activeLink?.source || null,
          linkId: activeLink?.linkId || null,
        };

        // Add person name if linked
        if (device.linkedPersonId) {
          const person = personsMap.get(device.linkedPersonId);
          device.linkedPersonName = person?.name || `Person ${device.linkedPersonId}`;
          // Also add to person's linkedDevices
          if (person) {
            person.linkedDevices.push({
              deviceId,
              relationship: device.linkRelationship,
              source: device.linkSource,
            });
          }
        }

        return device;
      });

      const result = {
        persons,
        devices,
        stats: {
          totalPersons: persons.length,
          totalDevices: devices.length,
          linkedDevices: devices.filter((d) => d.isLinked).length,
          unlinkedDevices: devices.filter((d) => !d.isLinked).length,
          databricksLinks: databricksLinksRows?.length || 0,
          localLinks: devicePersonLinksStore.links.length,
        },
      };

      cache.set(cacheKey, result, CACHE_TTL.PERSONS);
      res.json({ success: true, ...result, fromCache: false });
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
  const APP_CONFIG = {
    appName: process.env.DATABRICKS_APP_NAME,
    appUrl: process.env.DATABRICKS_APP_URL,
    host: process.env.DATABRICKS_HOST,
    workspaceId: process.env.DATABRICKS_WORKSPACE_ID,
  };
  const isDatabricksApp = !!APP_CONFIG.appName;

  app.get('/health', async (req, res) => {
    let dbStatus = 'disconnected';
    let tableCount = 0;
    try {
      const tables = await databricks.listTables();
      dbStatus = 'connected';
      tableCount = tables.length;
    } catch (error) {
      dbStatus = `error: ${error.message}`;
    }

    const response = {
      status: dbStatus === 'connected' ? 'ok' : 'degraded',
      environment: process.env.NODE_ENV || 'development',
      timestamp: nowIso(),
      database: {
        type: 'Lakebase Postgres',
        schema: databricks.SCHEMA,
        status: dbStatus,
        tableCount,
      },
    };
    if (isDatabricksApp) {
      response.app = {
        appName: APP_CONFIG.appName,
        appUrl: APP_CONFIG.appUrl,
        host: APP_CONFIG.host,
        workspaceId: APP_CONFIG.workspaceId,
      };
    }
    res.json(response);
  });

  // ============== AI INSIGHTS ENDPOINT ==============
  // Generates contextual AI-powered insights for different parts of the app
  app.post('/api/demo/insights', async (req, res) => {
    try {
      const { insightType, context } = req.body || {};

      if (!insightType || typeof insightType !== 'string') {
        return res.status(400).json({ success: false, error: 'insightType is required' });
      }

      // Gather relevant data based on insight type
      let dataContext = {};
      let systemPromptAddition = '';

      switch (insightType) {
        case 'hotspot_anomaly': {
          // Analyze hotspot activity for anomalies
          const hour = context?.hour ?? 25;
          const city = context?.city || null;

          const [rankings, hotspotData] = await Promise.all([
            databricks.getSuspectRankings(50),
            databricks.getHotspotsForHour(hour),
          ]);

          const hotspots = (hotspotData || []).filter((h) => !city || h.city === city);
          const avgDeviceCount =
            hotspots.reduce((sum, h) => sum + (h.device_count || 0), 0) /
            Math.max(hotspots.length, 1);
          const maxHotspot = hotspots.reduce(
            (max, h) => ((h.device_count || 0) > (max?.device_count || 0) ? h : max),
            null
          );

          dataContext = {
            hour,
            city,
            hotspotCount: hotspots.length,
            avgDeviceCount: avgDeviceCount.toFixed(1),
            maxHotspot: maxHotspot
              ? {
                  name: maxHotspot.tower_name || maxHotspot.name,
                  deviceCount: maxHotspot.device_count,
                  suspectCount: maxHotspot.suspect_count,
                  city: maxHotspot.city,
                }
              : null,
            topSuspects: (rankings || []).slice(0, 5).map((r) => ({
              name: r.entity_name || r.entity_id,
              alias: r.alias,
              score: r.total_score,
            })),
          };

          systemPromptAddition = `
You are analyzing hotspot activity data for a crime investigation platform.
Given the current hour and hotspot data, identify any anomalies, unusual patterns, or areas of concern.
Focus on actionable insights that would help an investigator prioritize their attention.
Consider: unusual device concentrations, high suspect density, timing patterns.
Be concise and specific. Use the actual data provided.`;
          break;
        }

        case 'entity_relationships': {
          // Analyze relationships between selected entities
          const entityIds = context?.entityIds || [];
          if (entityIds.length < 2) {
            return res.json({
              success: true,
              insight: {
                type: insightType,
                title: 'Select More Entities',
                summary: 'Select at least 2 entities to analyze their relationships.',
                confidence: 'N/A',
                generatedAt: nowIso(),
              },
            });
          }

          const [rankings, coPresence, relationships] = await Promise.all([
            databricks.getSuspectRankings(),
            databricks.getCoPresenceEdges(entityIds),
            databricks.getRelationships(),
          ]);

          const selectedEntities = (rankings || []).filter((r) => entityIds.includes(r.entity_id));
          const relevantCoPresence = (coPresence || []).filter(
            (e) => entityIds.includes(e.entity_id_1) && entityIds.includes(e.entity_id_2)
          );
          const relevantRelationships = (relationships || []).filter(
            (r) =>
              entityIds.includes(r.person1_id || r.entity_id_1) &&
              entityIds.includes(r.person2_id || r.entity_id_2)
          );

          dataContext = {
            entityCount: entityIds.length,
            entities: selectedEntities.map((e) => ({
              id: e.entity_id,
              name: e.entity_name || e.entity_id,
              alias: e.alias,
              score: e.total_score,
              linkedCities: e.linked_cities,
            })),
            coPresenceCount: relevantCoPresence.length,
            coPresenceLocations: [...new Set(relevantCoPresence.map((c) => c.city))],
            relationshipCount: relevantRelationships.length,
            relationshipTypes: [...new Set(relevantRelationships.map((r) => r.type))],
          };

          systemPromptAddition = `
You are analyzing relationships between entities in a crime investigation network.
Explain how these entities might be connected based on their co-location patterns, communication records, and shared characteristics.
Identify potential coordination, hierarchy, or patterns of concern.
Be specific about what the data shows and what it might mean for the investigation.`;
          break;
        }

        case 'case_summary': {
          // Generate intelligent case summary
          const caseId = context?.caseId;
          if (!caseId) {
            return res
              .status(400)
              .json({ success: false, error: 'caseId required for case_summary' });
          }

          const [cases, rankings] = await Promise.all([
            databricks.getCases(),
            databricks.getSuspectRankings(),
          ]);

          const caseData = (cases || []).find((c) => c.case_id === caseId || c.id === caseId);
          if (!caseData) {
            return res.status(404).json({ success: false, error: 'Case not found' });
          }

          // Find entities linked to this case's location
          const caseCity = caseData.city;
          const linkedEntities = (rankings || []).filter((r) =>
            (r.linked_cities || []).includes(caseCity)
          );

          // Fetch co-presence scoped to linked entities
          const linkedEntityIds = linkedEntities.map((e) => e.entity_id);
          const coPresence = await databricks.getCoPresenceEdges(linkedEntityIds).catch(() => []);

          dataContext = {
            caseId,
            caseNumber: caseData.case_id,
            title: caseData.title || `${caseData.case_type} - ${caseData.city}`,
            city: caseData.city,
            state: caseData.state,
            status: caseData.status,
            priority: caseData.priority,
            estimatedLoss: caseData.estimated_loss,
            linkedEntityCount: linkedEntities.length,
            highThreatEntities: linkedEntities
              .filter((e) => e.total_score > 1.5)
              .slice(0, 5)
              .map((e) => ({
                name: e.entity_name || e.entity_id,
                alias: e.alias,
                score: e.total_score,
              })),
          };

          systemPromptAddition = `
You are generating an executive summary for a criminal investigation case.
Synthesize the case details and linked entity information into a clear, actionable summary.
Include: key facts, risk assessment, linked persons of interest, and recommended next steps.
Be professional and concise - this is for law enforcement use.`;
          break;
        }

        case 'handoff_analysis': {
          // Analyze cross-jurisdiction movements
          const entityId = context?.entityId;

          const [handoffs, rankings] = await Promise.all([
            databricks.getHandoffCandidates(),
            databricks.getSuspectRankings(),
          ]);

          const relevantHandoffs = entityId
            ? (handoffs || []).filter((h) => h.entity_id === entityId)
            : (handoffs || []).slice(0, 20);

          const entityInfo = entityId
            ? (rankings || []).find((r) => r.entity_id === entityId)
            : null;

          dataContext = {
            targetEntity: entityInfo
              ? {
                  id: entityInfo.entity_id,
                  name: entityInfo.entity_name,
                  alias: entityInfo.alias,
                  score: entityInfo.total_score,
                }
              : null,
            handoffCount: relevantHandoffs.length,
            handoffs: relevantHandoffs.slice(0, 10).map((h) => ({
              entityName: h.entity_name,
              from: h.origin_city,
              to: h.destination_city,
              timeDeltaHours: h.time_delta_hours,
            })),
            citiesInvolved: [
              ...new Set([
                ...relevantHandoffs.map((h) => h.origin_city),
                ...relevantHandoffs.map((h) => h.destination_city),
              ]),
            ],
          };

          systemPromptAddition = `
You are analyzing cross-jurisdiction movement patterns for criminal suspects.
Identify patterns, timing significance, and potential coordination between jurisdictions.
Recommend which jurisdictions should be alerted and what follow-up actions are appropriate.
Consider flight risk and evidence preservation needs.`;
          break;
        }

        case 'timeline_narration': {
          // Narrate what happened during a time window
          const startHour = context?.startHour ?? 0;
          const endHour = context?.endHour ?? 71;
          const entityIds = context?.entityIds || [];
          const city = context?.city || null;

          const [positions, rankings, cases] = await Promise.all([
            // Get positions for key hours in the range
            Promise.all(
              [startHour, Math.floor((startHour + endHour) / 2), endHour].map((h) =>
                databricks.getPositionsForHour(h).catch(() => [])
              )
            ),
            databricks.getSuspectRankings(),
            databricks.getCases(),
          ]);

          const flatPositions = positions.flat();
          const relevantPositions =
            entityIds.length > 0
              ? flatPositions.filter((p) => entityIds.includes(p.owner_id || p.entity_id))
              : flatPositions.filter((p) => p.is_suspect);

          const citiesObserved = [...new Set(relevantPositions.map((p) => p.city).filter(Boolean))];
          const casesInWindow = (cases || []).filter((c) => !city || c.city === city);

          dataContext = {
            timeWindow: { startHour, endHour },
            city,
            entityIds: entityIds.slice(0, 10),
            positionsObserved: relevantPositions.length,
            citiesObserved,
            suspectActivity: relevantPositions.filter((p) => p.is_suspect).length,
            casesInArea: casesInWindow.length,
          };

          systemPromptAddition = `
You are narrating the timeline of activity for a criminal investigation.
Describe what happened during this time window in a narrative format.
Focus on suspect movements, location patterns, and any notable events.
Write as if briefing a detective on what they need to know.`;
          break;
        }

        case 'network_patterns': {
          // Analyze network graph for patterns
          const city = context?.city || null;

          // Fetch each query separately with error handling to identify failures
          let rankings = [];
          let coPresence = [];
          let relationships = [];

          try {
            rankings = await databricks.getSuspectRankings();
          } catch (err) {
            logger.error({
              type: 'network_patterns',
              query: 'getSuspectRankings',
              error: err.message,
            });
            throw new Error(`Failed to fetch suspect rankings: ${err.message}`);
          }

          const suspects = city
            ? (rankings || []).filter((r) => (r.linked_cities || []).includes(city))
            : (rankings || []).slice(0, 50);

          const suspectIds = new Set(suspects.map((s) => s.entity_id));

          try {
            coPresence = await databricks.getCoPresenceEdges(Array.from(suspectIds));
          } catch (err) {
            logger.error({
              type: 'network_patterns',
              query: 'getCoPresenceEdges',
              error: err.message,
            });
            throw new Error(`Failed to fetch co-presence edges: ${err.message}`);
          }

          try {
            relationships = await databricks.getRelationships();
          } catch (err) {
            logger.error({
              type: 'network_patterns',
              query: 'getRelationships',
              error: err.message,
            });
            throw new Error(`Failed to fetch relationships: ${err.message}`);
          }

          const relevantCoPresence = (coPresence || []).filter(
            (c) => suspectIds.has(c.entity_id_1) || suspectIds.has(c.entity_id_2)
          );

          // Find most connected entities
          const connectionCounts = new Map();
          for (const c of relevantCoPresence) {
            connectionCounts.set(c.entity_id_1, (connectionCounts.get(c.entity_id_1) || 0) + 1);
            connectionCounts.set(c.entity_id_2, (connectionCounts.get(c.entity_id_2) || 0) + 1);
          }
          const sortedByConnections = [...connectionCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

          const hubEntities = sortedByConnections.map(([id, count]) => {
            const entity = suspects.find((s) => s.entity_id === id);
            return {
              id,
              name: entity?.entity_name || id,
              alias: entity?.alias,
              connectionCount: count,
            };
          });

          dataContext = {
            city,
            suspectCount: suspects.length,
            coPresenceEdges: relevantCoPresence.length,
            relationshipEdges: (relationships || []).length,
            hubEntities,
            avgConnections:
              suspectIds.size > 0 ? (relevantCoPresence.length / suspectIds.size).toFixed(1) : '0',
          };

          systemPromptAddition = `
You are analyzing a criminal network graph for patterns and structure.
Identify: central figures (hubs), potential sub-groups, communication patterns, and network vulnerabilities.
Recommend which entities to prioritize for surveillance or intervention.
Use network analysis terminology appropriately.`;
          break;
        }

        case 'comparative_analysis': {
          // Compare two entities
          const entityIds = context?.entityIds || [];
          if (entityIds.length !== 2) {
            return res.status(400).json({
              success: false,
              error: 'Comparative analysis requires exactly 2 entity IDs',
            });
          }

          const [rankings, coPresence, positions] = await Promise.all([
            databricks.getSuspectRankings(),
            databricks.getCoPresenceEdges(entityIds),
            databricks.getPositionsForHour(12).catch(() => []), // midday sample
          ]);

          const entity1 = rankings.find((r) => r.entity_id === entityIds[0]);
          const entity2 = rankings.find((r) => r.entity_id === entityIds[1]);

          // Find connections for each entity
          const entity1Connections = (coPresence || []).filter(
            (c) => c.entity_id_1 === entityIds[0] || c.entity_id_2 === entityIds[0]
          );
          const entity2Connections = (coPresence || []).filter(
            (c) => c.entity_id_1 === entityIds[1] || c.entity_id_2 === entityIds[1]
          );

          // Find shared connections
          const entity1Partners = new Set(
            entity1Connections.map((c) =>
              c.entity_id_1 === entityIds[0] ? c.entity_id_2 : c.entity_id_1
            )
          );
          const entity2Partners = new Set(
            entity2Connections.map((c) =>
              c.entity_id_1 === entityIds[1] ? c.entity_id_2 : c.entity_id_1
            )
          );
          const sharedPartners = [...entity1Partners].filter((p) => entity2Partners.has(p));

          dataContext = {
            entity1: {
              id: entityIds[0],
              name: entity1?.entity_name || entityIds[0],
              alias: entity1?.alias,
              overlapScore: entity1?.overlap_score,
              linkedCities: entity1?.linked_cities || [],
              connectionCount: entity1Connections.length,
            },
            entity2: {
              id: entityIds[1],
              name: entity2?.entity_name || entityIds[1],
              alias: entity2?.alias,
              overlapScore: entity2?.overlap_score,
              linkedCities: entity2?.linked_cities || [],
              connectionCount: entity2Connections.length,
            },
            sharedConnections: sharedPartners.length,
            sharedPartnerIds: sharedPartners.slice(0, 5),
            sharedCities: (entity1?.linked_cities || []).filter((c) =>
              (entity2?.linked_cities || []).includes(c)
            ),
          };

          systemPromptAddition = `
You are comparing two suspects in a criminal investigation.
Analyze their similarities, differences, and potential connections.
Highlight shared associates, overlapping locations, and patterns that suggest coordination.
Identify which suspect appears more central to the network.`;
          break;
        }

        case 'link_suggestion_analysis': {
          // Analyze pending device-to-person link suggestions
          // Fetch link suggestion data from cached or generate
          let linkSuggestions = [];
          try {
            // Try to get cached suggestions first
            const cached = cache.get('link-suggestions');
            if (cached) {
              linkSuggestions = cached;
            } else {
              // Generate suggestions from handoff candidates and co-presence data
              const [handoffCandidates, rankings] = await Promise.all([
                databricks.getHandoffCandidates(),
                databricks.getSuspectRankings(),
              ]);

              // Create link suggestions from handoff patterns
              linkSuggestions = (handoffCandidates || []).slice(0, 15).map((h, idx) => ({
                id: `link_${h.entity_id}_${idx}`,
                suggestedDeviceId: h.new_entity_id || `DEV_${idx}`,
                personId: h.entity_id,
                personName: h.entity_name,
                confidence: 0.6 + Math.random() * 0.3,
                reason: h.origin_city && h.destination_city
                  ? `Device appeared in ${h.destination_city} shortly after ${h.entity_name}'s known device went dark in ${h.origin_city}`
                  : 'Co-presence pattern suggests same user',
                evidence: {
                  timeDiffMinutes: h.time_delta_hours ? h.time_delta_hours * 60 : null,
                  sharedPartners: Math.floor(Math.random() * 5) + 1,
                },
              }));
            }
          } catch (err) {
            logger.warn({ type: 'link_suggestion_fetch_error', error: err.message });
            linkSuggestions = [];
          }

          const pendingSuggestions = linkSuggestions.slice(0, 10);
          const highConfidence = pendingSuggestions.filter((s) => s.confidence >= 0.8);
          const burnerPhoneHints = pendingSuggestions.filter(
            (s) => s.reason?.toLowerCase().includes('burner') || s.reason?.toLowerCase().includes('switch') || s.reason?.toLowerCase().includes('dark')
          );

          dataContext = {
            totalPending: linkSuggestions.length,
            analyzed: pendingSuggestions.length,
            highConfidenceCount: highConfidence.length,
            burnerPhoneHints: burnerPhoneHints.length,
            suggestions: pendingSuggestions.map((s) => ({
              deviceId: s.suggestedDeviceId,
              personName: s.personName,
              confidence: s.confidence,
              reason: s.reason,
              evidence: s.evidence,
            })),
          };

          systemPromptAddition = `
You are analyzing suggested device-to-person links in a criminal investigation.
Explain why each link is suggested and assess its reliability.
Prioritize which links should be confirmed first based on:
1. Confidence score
2. Evidence of burner phone switches (devices appearing when others go dark)
3. Connection to active investigations
Provide clear recommendations for the analyst.`;
          break;
        }

        default:
          return res.status(400).json({
            success: false,
            error: `Unknown insight type: ${insightType}`,
          });
      }

      // Build the prompt and call the LLM
      const systemPrompt = `You are an AI data intelligence assistant for a crime investigation platform.
${systemPromptAddition}

IMPORTANT RULES:
- Output ONLY valid JSON with this exact structure: {"title": "string", "summary": "string", "keyFindings": ["string", ...], "recommendations": ["string", ...], "confidence": "High|Medium|Low", "riskLevel": "Critical|High|Medium|Low|None"}
- Be concise but specific - use actual data from the context
- Focus on actionable intelligence
- Do NOT include any text outside the JSON object`;

      const userPrompt = `Analyze this data and provide insights:
DATA_CONTEXT: ${JSON.stringify(dataContext)}`;

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      const { text } = await invokeAgentModel({
        host: process.env.DATABRICKS_HOST,
        token: process.env.DATABRICKS_TOKEN,
        clientId: process.env.DATABRICKS_CLIENT_ID,
        clientSecret: process.env.DATABRICKS_CLIENT_SECRET,
        endpointName: process.env.DATABRICKS_AGENT_ENDPOINT || 'databricks-gpt-5-2',
        messages,
        temperature: 0.3,
        maxTokens: 800,
      });

      // Parse the LLM response
      let parsed = safeJsonParse(text);

      // Fallback if parsing failed
      if (!parsed || !parsed.title) {
        parsed = {
          title: 'Analysis Complete',
          summary: typeof text === 'string' ? text.slice(0, 500) : 'Unable to generate insight.',
          keyFindings: [],
          recommendations: [],
          confidence: 'Medium',
          riskLevel: 'Medium',
        };
      }

      res.json({
        success: true,
        insight: {
          type: insightType,
          title: parsed.title || 'Analysis',
          summary: parsed.summary || '',
          keyFindings: Array.isArray(parsed.keyFindings) ? parsed.keyFindings : [],
          recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
          confidence: parsed.confidence || 'Medium',
          riskLevel: parsed.riskLevel || 'Medium',
          generatedAt: nowIso(),
        },
      });
    } catch (error) {
      logger.error({ type: 'insights_error', error: error.message });
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============== AI INSIGHTS FOLLOW-UP ENDPOINT ==============
  // Allows users to ask follow-up questions about generated insights
  app.post('/api/demo/insights/ask', async (req, res) => {
    try {
      const { insight, question, conversationHistory } = req.body || {};

      if (!insight || typeof insight !== 'object') {
        return res.status(400).json({ success: false, error: 'insight object is required' });
      }

      if (!question || typeof question !== 'string') {
        return res.status(400).json({ success: false, error: 'question string is required' });
      }

      // Build context from the original insight
      const insightContext = {
        type: insight.type,
        title: insight.title,
        summary: insight.summary,
        keyFindings: insight.keyFindings || [],
        recommendations: insight.recommendations || [],
        confidence: insight.confidence,
        riskLevel: insight.riskLevel,
      };

      // Build conversation messages
      const historyMessages = (conversationHistory || []).map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const systemPrompt = `You are an AI assistant for a crime investigation platform. The user is asking follow-up questions about an AI-generated analysis.

ORIGINAL ANALYSIS:
Title: ${insightContext.title}
Type: ${insightContext.type}
Summary: ${insightContext.summary}

Key Findings:
${insightContext.keyFindings.map((f, i) => `${i + 1}. ${f}`).join('\n')}

Recommendations:
${insightContext.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Confidence: ${insightContext.confidence}
Risk Level: ${insightContext.riskLevel}

INSTRUCTIONS:
- Answer the user's question based on the analysis and data context above
- Be concise but helpful
- If the data doesn't support an answer, say so clearly
- You can reference specific findings, recommendations, or data points
- Stay focused on the investigation context
- If asked to speculate beyond the data, clearly state that you're speculating`;

      const messages = [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: question },
      ];

      const { text } = await invokeAgentModel({
        host: process.env.DATABRICKS_HOST,
        token: process.env.DATABRICKS_TOKEN,
        clientId: process.env.DATABRICKS_CLIENT_ID,
        clientSecret: process.env.DATABRICKS_CLIENT_SECRET,
        endpointName: process.env.DATABRICKS_AGENT_ENDPOINT || 'databricks-gpt-5-2',
        messages,
        temperature: 0.5,
        maxTokens: 600,
      });

      res.json({
        success: true,
        answer: text,
        timestamp: nowIso(),
      });
    } catch (error) {
      logger.error({ type: 'insights_ask_error', error: error.message });
      res.status(500).json({ success: false, error: error.message });
    }
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

  /**
   * Warm the cache by prefetching heavy queries in the background.
   * Call after server starts and Databricks is connected.
   */
  async function warmCache() {
    logger.info({ type: 'cache_warm', status: 'starting' });
    const start = Date.now();

    try {
      // Prefetch the heaviest endpoints in parallel
      const baseUrl = 'http://localhost:' + (process.env.DATABRICKS_APP_PORT || process.env.PORT || '8000');
      const fetches = [
        // Positions bulk is the slowest - triggers location + rankings + edges queries
        fetch(`${baseUrl}/api/demo/positions/bulk`).catch(() => null),
        // Graph data is also heavy
        fetch(`${baseUrl}/api/demo/graph-data`).catch(() => null),
        // Config is needed on first page load
        fetch(`${baseUrl}/api/demo/config`).catch(() => null),
        // Stats
        fetch(`${baseUrl}/api/demo/stats`).catch(() => null),
      ];

      await Promise.allSettled(fetches);
      logger.info({ type: 'cache_warm', status: 'done', durationMs: Date.now() - start });
    } catch (err) {
      logger.warn({ type: 'cache_warm', status: 'failed', error: err.message });
    }
  }

  return { app, cache, warmCache };
}

module.exports = { createApp };
