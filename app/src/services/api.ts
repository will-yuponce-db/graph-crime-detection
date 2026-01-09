/**
 * API Service Layer
 * Provides a unified interface for fetching data from Databricks Unity Catalog
 */

// Databricks is the only data source
export const USE_DATABRICKS = true;

const API_BASE = '/api/demo';

// ============== Types ==============

export interface CellTower {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  city: string;
  properties?: Record<string, unknown>;
}

export interface KeyFrame {
  id: string;
  caseNumber: string;
  hour: number;
  lat: number;
  lng: number;
  neighborhood: string;
  city: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface DevicePosition {
  deviceId: string;
  deviceName: string;
  lat: number;
  lng: number;
  towerId: string | null;
  towerName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  ownerAlias: string | null;
  isSuspect: boolean;
  isBurner?: boolean;
  deviceType?: string;
}

export interface Hotspot {
  towerId: string;
  towerName: string;
  lat: number;
  lng: number;
  city: string;
  state?: string;
  deviceCount: number;
  suspectCount: number;
  entityIds?: string[];
  isHighActivity?: boolean;
}

export interface Suspect {
  id: string;
  name: string;
  originalName?: string;
  customTitle?: string | null;
  customNotes?: string | null;
  hasCustomTitle?: boolean;
  alias: string | null;
  threatLevel: string;
  criminalHistory: string | null;
  isSuspect?: boolean;
  rank?: number;
  totalScore?: number;
  linkedCases?: string[];
  linkedCities?: string[];
  properties?: Record<string, unknown>;
}

// ============== Normalizers (backend may return snake_case) ==============

type AnyRecord = Record<string, unknown>;

function asStringOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : v == null ? null : String(v);
}

function normalizePerson(raw: AnyRecord): Suspect {
  const id = asStringOrNull(raw.id) || asStringOrNull(raw.entity_id) || '';
  const name =
    asStringOrNull(raw.name) ||
    asStringOrNull(raw.entity_name) ||
    (id ? `Entity ${id}` : 'Unknown');

  const originalName =
    asStringOrNull(raw.originalName) || asStringOrNull(raw.original_name) || name;

  const threatLevel =
    asStringOrNull(raw.threatLevel) ||
    asStringOrNull(raw.threat_level) ||
    asStringOrNull(raw.threat) ||
    'Unknown';

  const criminalHistory =
    asStringOrNull(raw.criminalHistory) || asStringOrNull(raw.criminal_history) || null;

  const isSuspect =
    typeof raw.isSuspect === 'boolean'
      ? raw.isSuspect
      : typeof raw.is_suspect === 'number'
        ? raw.is_suspect > 0
        : typeof raw.is_suspect === 'boolean'
          ? raw.is_suspect
          : undefined;

  return {
    id,
    name,
    originalName,
    customTitle: asStringOrNull(raw.customTitle) || asStringOrNull(raw.custom_title) || null,
    customNotes: asStringOrNull(raw.customNotes) || asStringOrNull(raw.custom_notes) || null,
    hasCustomTitle: Boolean(raw.hasCustomTitle ?? raw.has_custom_title),
    alias: asStringOrNull(raw.alias),
    threatLevel,
    criminalHistory,
    isSuspect,
    rank: typeof raw.rank === 'number' ? raw.rank : undefined,
    totalScore: typeof raw.totalScore === 'number' ? raw.totalScore : undefined,
    linkedCases: Array.isArray(raw.linkedCases)
      ? (raw.linkedCases as string[])
      : Array.isArray(raw.linked_cases)
        ? (raw.linked_cases as string[])
        : undefined,
    linkedCities: Array.isArray(raw.linkedCities)
      ? (raw.linkedCities as string[])
      : Array.isArray(raw.linked_cities)
        ? (raw.linked_cities as string[])
        : undefined,
    properties: (typeof raw.properties === 'object' && raw.properties !== null
      ? (raw.properties as Record<string, unknown>)
      : undefined) as Record<string, unknown> | undefined,
  };
}

export interface Assignee {
  id: string;
  name: string;
  role: string;
  email: string | null;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CaseData {
  id: string;
  caseNumber: string;
  title: string;
  city: string;
  state: string;
  neighborhood: string;
  status: 'investigating' | 'review' | 'adjudicated';
  priority: string;
  createdAt: string;
  updatedAt: string;
  assignedTo: string;
  assigneeId?: string | null;
  assignee?: Assignee | null;
  estimatedLoss?: number;
  description?: string;
  persons?: { id: string; name: string; alias?: string }[];
  devices?: { id: string; name: string }[];
  properties?: Record<string, unknown>;
}

export async function createCase(input: {
  title?: string;
  neighborhood: string;
  city: string;
  state?: string;
  priority?: string;
  description?: string;
  estimatedLoss?: number | string;
  assigneeId?: string;
}): Promise<CaseData> {
  const res = await fetch(`${API_BASE}/cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.case;
}

export interface CaseLinkedEntity {
  id: string;
  name: string;
  originalName?: string;
  alias?: string | null;
  overlapScore?: number;
  timeBucket?: string | number | null;
  threatLevel?: string;
  totalScore?: number;
  linkedCities?: string[] | null;
  geoEvidence?: unknown;
  // Optional richer fields (from case_summary_with_suspects)
  personId?: string | null;
  deviceId?: string | null;
  personRole?: string | null;
  caseRole?: string | null;
  linkSource?: string | null;
  notes?: string | null;
  confidence?: number | null;
}

export interface GraphNode {
  id: string;
  name: string;
  originalName?: string;
  customTitle?: string | null;
  customNotes?: string | null;
  hasCustomTitle?: boolean;
  alias?: string;
  type: 'person' | 'device';
  isSuspect?: boolean;
  city?: string;
  threatLevel?: string;
  totalScore?: number;
  linkedCities?: string[];
  properties?: Record<string, unknown>;
  // Device-specific fields
  ownerId?: string | null;
  relationship?: string;
  confidence?: number;
  isCurrent?: boolean;
  isBurner?: boolean;
}

export interface GraphLink {
  source: string;
  target: string;
  type: string;
  count?: number;
  weight?: number;
  cities?: string;
}

export interface Relationship {
  person1Id: string;
  person1Name: string;
  person2Id: string;
  person2Name: string;
  type: string;
  count: number;
  cities?: string;
}

export interface EvidenceCard {
  title: string;
  generatedAt: string;
  suspects: Array<{
    id: string;
    name: string;
    threatLevel: string;
    linkedCases?: string[];
    properties?: Record<string, unknown>;
  }>;
  linkedCases: Array<{
    caseId: string;
    overlapScore?: number;
  }>;
  signals: {
    geospatial: Array<{ claim: string; confidence: string }>;
    narrative: Array<{ claim: string; confidence: string }>;
    social: Array<{ claim: string; confidence: string }>;
  };
  summary: string;
  recommendedAction: string;
}

// New types for enhanced data
export interface HandoffCandidate {
  entityId: string;
  entityName: string;
  originCity: string;
  destinationCity: string;
  originState?: string | null;
  destinationState?: string | null;
  detectedAt?: string | null;
  confidence?: number | null;
  timeDeltaHours?: number | null;
}

export interface Device {
  id: string;
  deviceId: string;
  name: string;
  deviceType: string;
  ownerId: string;
  ownerName: string;
  ownerAlias?: string | null;
  isBurner: boolean;
  linkedCities: string[];
  lastSeen?: string | null;
  threatLevel: string;
}

export interface EntityEvidence {
  entityId: string;
  entityName: string;
  alias?: string | null;
  threatLevel: string;
  totalScore?: number | null;
  linkedCities: string[];
  linkedCases: Array<{ caseId: string; overlapScore?: number; timeBucket?: string }>;
  geoEvidence: unknown;
  signals: {
    geospatial: unknown[];
    narrative: unknown[];
    social: unknown[];
  };
  criminalHistory: string;
  properties: Record<string, unknown>;
}

export interface DashboardStats {
  totalCases: number;
  activeCases: number;
  totalSuspects: number;
  highThreatSuspects: number;
  mediumThreatSuspects: number;
  totalCoLocations: number;
  crossJurisdictionHandoffs: number;
  cities: string[];
  totalEstimatedLoss: number;
}

export interface CoLocationLogEntry {
  time: string | null;
  city: string | null;
  state: string | null;
  h3Cell: string | null;
  latitude: number | null;
  longitude: number | null;
  participantCount: number;
  evidenceCount: number;
  participants: Array<{ id: string; name: string }>;
}

export interface Pagination {
  limit: number;
  offset: number;
  hasMore: boolean;
  total?: number | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}

// ============== API Functions ==============

/**
 * Fetch config (towers, key frames, time range)
 */
export async function fetchConfig(): Promise<{
  towers: CellTower[];
  keyFrames: KeyFrame[];
  timeRange: { min: number; max: number };
  totalHours: number;
}> {
  const res = await fetch(`${API_BASE}/config`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data;
}

/**
 * Fetch device positions at a specific hour
 */
export async function fetchPositions(
  hour: number,
  options?: { signal?: AbortSignal }
): Promise<DevicePosition[]> {
  const res = await fetch(`${API_BASE}/positions/${hour}`, { signal: options?.signal });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.positions;
}

/**
 * Fetch positions for ALL hours (0-71) in a single request for smooth playback.
 * Returns a map of hour -> positions array.
 */
export async function fetchPositionsBulk(options?: {
  limit?: number;
  signal?: AbortSignal;
}): Promise<{
  positionsByHour: Record<number, DevicePosition[]>;
  totalHours: number;
  entitiesPerHour: number;
}> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));

  const url = `${API_BASE}/positions/bulk?${params}`;
  const res = await fetch(url, { signal: options?.signal });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return {
    positionsByHour: data.positionsByHour || {},
    totalHours: data.totalHours || 72,
    entitiesPerHour: data.entitiesPerHour || 0,
  };
}

/**
 * Fetch hotspots at a specific hour
 */
export async function fetchHotspots(
  hour: number,
  options?: { signal?: AbortSignal; startHour?: number; endHour?: number }
): Promise<Hotspot[]> {
  const params = new URLSearchParams();
  if (options?.startHour !== undefined) params.set('startHour', String(options.startHour));
  if (options?.endHour !== undefined) params.set('endHour', String(options.endHour));
  const url = params.toString()
    ? `${API_BASE}/hotspots/${hour}?${params.toString()}`
    : `${API_BASE}/hotspots/${hour}`;
  const res = await fetch(url, { signal: options?.signal });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.hotspots;
}

/**
 * Fetch all cases with optional pagination and filters
 */
export async function fetchCases(options?: {
  limit?: number;
  offset?: number;
  city?: string;
  status?: string;
  enriched?: boolean;
}): Promise<CaseData[]> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));
  if (options?.city) params.set('city', options.city);
  if (options?.status) params.set('status', options.status);
  if (options?.enriched !== undefined) params.set('enriched', String(options.enriched));

  const url = params.toString() ? `${API_BASE}/cases?${params}` : `${API_BASE}/cases`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.cases;
}

/**
 * Fetch cases with pagination info
 */
export async function fetchCasesPaginated(options?: {
  limit?: number;
  offset?: number;
  city?: string;
  status?: string;
}): Promise<{ cases: CaseData[]; pagination: Pagination }> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));
  if (options?.city) params.set('city', options.city);
  if (options?.status) params.set('status', options.status);

  const url = params.toString() ? `${API_BASE}/cases?${params}` : `${API_BASE}/cases`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return { cases: data.cases, pagination: data.pagination };
}

/**
 * Fetch a richer case detail payload (linked entities + geo evidence).
 */
export async function fetchCaseDetail(
  caseId: string
): Promise<{ case: CaseData; linkedEntities: CaseLinkedEntity[] }> {
  const res = await fetch(`${API_BASE}/cases/${encodeURIComponent(caseId)}/detail`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return { case: data.case, linkedEntities: data.linkedEntities || [] };
}

/**
 * Fetch suspects/persons with optional pagination and filters
 */
export async function fetchSuspects(options?: {
  limit?: number;
  offset?: number;
  city?: string;
  minScore?: number;
  suspectsOnly?: boolean;
}): Promise<Suspect[]> {
  const params = new URLSearchParams();
  if (options?.suspectsOnly !== false) params.set('suspects', 'true');
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));
  if (options?.city) params.set('city', options.city);
  if (options?.minScore) params.set('minScore', String(options.minScore));

  const url = `${API_BASE}/persons?${params}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  const persons = Array.isArray(data.persons) ? data.persons : [];
  return persons.map((p: AnyRecord) => normalizePerson(p));
}

/**
 * Fetch suspects/persons with pagination info
 */
export async function fetchSuspectsPaginated(options?: {
  limit?: number;
  offset?: number;
  city?: string;
  minScore?: number;
  suspectsOnly?: boolean;
}): Promise<{ suspects: Suspect[]; pagination: Pagination }> {
  const params = new URLSearchParams();
  // Default to suspects only, but allow fetching all persons
  if (options?.suspectsOnly !== false) params.set('suspects', 'true');
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));
  if (options?.city) params.set('city', options.city);
  if (options?.minScore) params.set('minScore', String(options.minScore));

  const url = `${API_BASE}/persons?${params}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  const persons = Array.isArray(data.persons) ? data.persons : [];
  return {
    suspects: persons.map((p: AnyRecord) => normalizePerson(p)),
    pagination: data.pagination,
  };
}

/**
 * Fetch graph data for network visualization with optional filters
 */
export async function fetchGraphData(options?: {
  limit?: number;
  city?: string;
  minScore?: number;
}): Promise<{
  nodes: GraphNode[];
  links: GraphLink[];
  stats?: {
    nodeCount: number;
    linkCount: number;
    personCount: number;
    deviceCount: number;
    coLocationLinks: number;
    socialLinks: number;
    ownsLinks: number;
  };
}> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.city) params.set('city', options.city);
  if (options?.minScore) params.set('minScore', String(options.minScore));

  const url = params.toString() ? `${API_BASE}/graph-data?${params}` : `${API_BASE}/graph-data`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return { nodes: data.nodes, links: data.links, stats: data.stats };
}

/**
 * Fetch relationships
 */
export async function fetchRelationships(): Promise<Relationship[]> {
  const res = await fetch(`${API_BASE}/relationships`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.relationships;
}

/**
 * Fetch evidence card for a case
 */

export async function fetchEvidenceCard(input: {
  caseId?: string;
  personIds: string[];
}): Promise<EvidenceCard> {
  // Backend currently supports personIds. caseId is reserved for future use.
  const res = await fetch(`${API_BASE}/evidence-card`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ personIds: input.personIds || [] }),
  });

  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.evidenceCard;
}

/**
 * Update case status
 */
export async function updateCaseStatus(caseId: string, status: string): Promise<void> {
  const res = await fetch(`${API_BASE}/cases/${caseId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
}

/**
 * Update case priority
 */
export async function updateCasePriority(caseId: string, priority: string): Promise<void> {
  const res = await fetch(`${API_BASE}/cases/${caseId}/priority`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ priority }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
}

export interface MergeCasesResult {
  message: string;
  case: CaseData;
}

/**
 * Merge multiple cases into a primary case
 * - Combines all persons and devices from secondary cases into the primary case
 * - Aggregates estimated loss and stolen items
 * - Marks secondary cases as 'merged' status
 * @param primaryCaseId - The case to merge into (survives)
 * @param secondaryCaseIds - Cases to merge from (will be marked as merged)
 */
export async function mergeCases(
  primaryCaseId: string,
  secondaryCaseIds: string[]
): Promise<MergeCasesResult> {
  // Case merging is not available yet
  console.log(`Would merge cases ${secondaryCaseIds.join(', ')} into ${primaryCaseId}`);
  throw new Error('Case merging is not yet available');
}

/**
 * Fetch devices
 */
export async function fetchDevices(): Promise<Array<{ owner_id: string; name: string }>> {
  const res = await fetch(`${API_BASE}/devices`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.devices;
}

/**
 * Update entity name/properties
 * @param entityType - Type of entity ('persons', 'cases')
 * @param entityId - Entity ID
 * @param name - Display name to set
 */
export async function updateEntityName(
  entityType: 'persons' | 'cases',
  entityId: string,
  name: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/${entityType}/${entityId}/name`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
}

/**
 * Update entity properties
 * @param entityType - Type of entity ('persons', 'cases')
 * @param entityId - Entity ID
 * @param properties - Properties object to merge
 */
export async function updateEntityProperties(
  entityType: 'persons' | 'cases',
  entityId: string,
  properties: Record<string, unknown>
): Promise<void> {
  const res = await fetch(`${API_BASE}/${entityType}/${entityId}/properties`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ properties }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
}

// ============== ASSIGNEE API FUNCTIONS ==============

/**
 * Fetch all assignees
 */
export async function fetchAssignees(activeOnly = true): Promise<Assignee[]> {
  const res = await fetch(`${API_BASE}/assignees${activeOnly ? '?active=true' : ''}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.assignees;
}

/**
 * Fetch a single assignee by ID
 */
export async function fetchAssignee(assigneeId: string): Promise<Assignee> {
  const res = await fetch(`${API_BASE}/assignees/${assigneeId}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.assignee;
}

/**
 * Create a new assignee
 */
export async function createAssignee(
  name: string,
  role?: string,
  email?: string
): Promise<Assignee> {
  const res = await fetch(`${API_BASE}/assignees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, role, email }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.assignee;
}

/**
 * Update an assignee
 */
export async function updateAssignee(
  assigneeId: string,
  updates: { name?: string; role?: string; email?: string; active?: boolean }
): Promise<Assignee> {
  const res = await fetch(`${API_BASE}/assignees/${assigneeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.assignee;
}

/**
 * Delete (deactivate) an assignee
 */
export async function deleteAssignee(assigneeId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/assignees/${assigneeId}`, {
    method: 'DELETE',
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
}

/**
 * Assign a case to an assignee
 */
export async function assignCase(
  caseId: string,
  assigneeId: string
): Promise<{ caseId: string; assignee: Assignee }> {
  const res = await fetch(`${API_BASE}/cases/${caseId}/assignee`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assigneeId }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return { caseId: data.caseId, assignee: data.assignee };
}

/**
 * Get the assignee for a case
 */
export async function getCaseAssignee(
  caseId: string
): Promise<{ assignee: Assignee; isDefault: boolean }> {
  const res = await fetch(`${API_BASE}/cases/${caseId}/assignee`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return { assignee: data.assignee, isDefault: data.isDefault };
}

/**
 * Unassign a case (revert to default)
 */
export async function unassignCase(caseId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/cases/${caseId}/assignee`, {
    method: 'DELETE',
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
}

// ============== ENTITY TITLES API FUNCTIONS ==============

export type EntityType = 'persons' | 'cases' | 'devices' | 'hotspots';

export interface EntityTitle {
  title: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EntityTitleResponse {
  entityId: string;
  entityType: EntityType;
  title: string | null;
  notes: string | null;
  hasCustomTitle: boolean;
  createdAt?: string;
  updatedAt?: string;
  isNew?: boolean;
}

/**
 * Fetch all entity titles, optionally filtered by type
 */
export async function fetchEntityTitles(
  entityType?: EntityType
): Promise<Record<string, EntityTitle> | Record<EntityType, Record<string, EntityTitle>>> {
  const url = entityType
    ? `${API_BASE}/entity-titles?type=${entityType}`
    : `${API_BASE}/entity-titles`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.titles;
}

/**
 * Fetch the custom title for a specific entity
 */
export async function fetchEntityTitle(
  entityType: EntityType,
  entityId: string
): Promise<EntityTitleResponse> {
  const res = await fetch(`${API_BASE}/entity-titles/${entityType}/${entityId}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data;
}

/**
 * Set or update a custom title for an entity
 */
export async function setEntityTitle(
  entityType: EntityType,
  entityId: string,
  title: string,
  notes?: string
): Promise<EntityTitleResponse> {
  const res = await fetch(`${API_BASE}/entity-titles/${entityType}/${entityId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, notes }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data;
}

/**
 * Partially update a custom title for an entity
 */
export async function updateEntityTitle(
  entityType: EntityType,
  entityId: string,
  updates: { title?: string; notes?: string }
): Promise<EntityTitleResponse> {
  const res = await fetch(`${API_BASE}/entity-titles/${entityType}/${entityId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data;
}

/**
 * Remove a custom title for an entity (reverts to original name)
 */
export async function deleteEntityTitle(entityType: EntityType, entityId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/entity-titles/${entityType}/${entityId}`, {
    method: 'DELETE',
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
}

/**
 * Set multiple entity titles at once
 */
export async function setEntityTitlesBulk(
  titles: Array<{ type: EntityType; id: string; title: string; notes?: string }>
): Promise<{
  updated: Array<{ type: EntityType; id: string; title: string; isNew: boolean }>;
  errors?: Array<{ id: string; type: EntityType; error: string }>;
}> {
  const res = await fetch(`${API_BASE}/entity-titles/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ titles }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return { updated: data.updated, errors: data.errors };
}

// ============== DEVICE-PERSON LINKING ==============

export interface DevicePersonLink {
  linkId: string;
  deviceId: string;
  personId: string;
  relationship: 'owner' | 'suspected_owner' | 'burner' | 'shared' | 'temporary';
  confidence: number;
  validFrom: string;
  validTo: string | null;
  notes: string | null;
  source: 'manual' | 'suggestion_confirmed' | 'databricks';
  createdAt: string;
  updatedAt?: string;
}

export interface LinkSuggestion {
  id: string;
  suggestedDeviceId: string;
  suggestedPersonId: string;
  personName: string;
  personAlias: string | null;
  personRole: string | null;
  riskLevel: string | null;
  knownDeviceId: string;
  evidence: {
    type: 'handoff' | 'copresence';
    handoffScore?: number;
    sharedPartners?: number;
    timeDiffMinutes?: number;
    h3Cell?: string;
    oldLastSeen?: string;
    newFirstSeen?: string;
  };
  confidence: number;
  reason: string;
}

export interface EntityWithLinkStatus {
  id: string;
  type: 'person' | 'device';
  name: string;
  alias?: string | null;
  // Person-specific
  role?: string | null;
  riskLevel?: string | null;
  criminalHistory?: string | null;
  isSuspect?: boolean;
  linkedDevices?: Array<{ deviceId: string; relationship: string; source: string }>;
  // Device-specific
  linkedCases?: string[];
  linkedCities?: string[];
  totalScore?: number;
  rank?: number | null;
  isLinked?: boolean;
  linkedPersonId?: string | null;
  linkedPersonName?: string | null;
  linkRelationship?: string | null;
  linkConfidence?: number | null;
  linkSource?: string | null;
  linkId?: string | null;
}

export interface EntitiesWithLinkStatusResponse {
  persons: EntityWithLinkStatus[];
  devices: EntityWithLinkStatus[];
  stats: {
    totalPersons: number;
    totalDevices: number;
    linkedDevices: number;
    unlinkedDevices: number;
    databricksLinks: number;
    localLinks: number;
  };
}

/**
 * Fetch all device-person links
 */
export async function fetchDevicePersonLinks(): Promise<DevicePersonLink[]> {
  const res = await fetch(`${API_BASE}/device-person-links`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.links || [];
}

/**
 * Create a new device-person link
 */
export async function createDevicePersonLink(input: {
  deviceId: string;
  personId: string;
  relationship?: string;
  confidence?: number;
  notes?: string;
  validFrom?: string;
  validTo?: string;
}): Promise<DevicePersonLink> {
  const res = await fetch(`${API_BASE}/device-person-links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.link;
}

/**
 * Update an existing device-person link
 */
export async function updateDevicePersonLink(
  linkId: string,
  updates: {
    relationship?: string;
    confidence?: number;
    notes?: string;
    validTo?: string;
  }
): Promise<DevicePersonLink> {
  const res = await fetch(`${API_BASE}/device-person-links/${encodeURIComponent(linkId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.link;
}

/**
 * Delete a device-person link
 */
export async function deleteDevicePersonLink(linkId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/device-person-links/${encodeURIComponent(linkId)}`, {
    method: 'DELETE',
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
}

/**
 * Fetch AI-suggested device-person links
 */
export async function fetchLinkSuggestions(): Promise<LinkSuggestion[]> {
  const res = await fetch(`${API_BASE}/link-suggestions`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.suggestions || [];
}

/**
 * Confirm a suggested link (creates a new device-person link)
 */
export async function confirmLinkSuggestion(
  suggestionId: string,
  notes?: string
): Promise<DevicePersonLink> {
  const res = await fetch(`${API_BASE}/link-suggestions/${encodeURIComponent(suggestionId)}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.link;
}

/**
 * Reject a suggested link
 */
export async function rejectLinkSuggestion(suggestionId: string, reason?: string): Promise<void> {
  const res = await fetch(`${API_BASE}/link-suggestions/${encodeURIComponent(suggestionId)}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
}

/**
 * Fetch all entities (persons and devices) with their link status
 */
export async function fetchEntitiesWithLinkStatus(): Promise<EntitiesWithLinkStatusResponse> {
  const res = await fetch(`${API_BASE}/entities-with-link-status`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return {
    persons: data.persons || [],
    devices: data.devices || [],
    stats: data.stats || {
      totalPersons: 0,
      totalDevices: 0,
      linkedDevices: 0,
      unlinkedDevices: 0,
      databricksLinks: 0,
      localLinks: 0,
    },
  };
}

// ============== NEW DATA ENDPOINTS ==============

/**
 * Fetch handoff candidates (suspects crossing jurisdictions)
 */
export async function fetchHandoffCandidates(): Promise<HandoffCandidate[]> {
  const res = await fetch(`${API_BASE}/handoff-candidates`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.candidates || [];
}

/**
 * Fetch devices with optional pagination
 */
export async function fetchDevicesPaginated(options?: {
  limit?: number;
  offset?: number;
}): Promise<{ devices: Device[]; pagination: Pagination }> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));

  const url = params.toString() ? `${API_BASE}/devices?${params}` : `${API_BASE}/devices`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return { devices: data.devices || [], pagination: data.pagination };
}

/**
 * Fetch full evidence for a specific entity
 */
export async function fetchEntityEvidence(entityId: string): Promise<EntityEvidence> {
  const res = await fetch(`${API_BASE}/evidence/${encodeURIComponent(entityId)}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.evidence;
}

/**
 * Fetch dashboard statistics
 */
export async function fetchDashboardStats(): Promise<DashboardStats> {
  const res = await fetch(`${API_BASE}/stats`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.stats;
}

/**
 * Fetch a best-effort co-location log for selected entities.
 */
export async function fetchCoLocationLog(input: {
  entityIds: string[];
  mode?: 'any' | 'all';
  limit?: number;
  bucketMinutes?: number;
}): Promise<{
  entityIds: string[];
  mode: 'any' | 'all';
  bucketMinutes: number;
  timeColumn: string | null;
  entries: CoLocationLogEntry[];
}> {
  const res = await fetch(`${API_BASE}/colocation-log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return {
    entityIds: data.entityIds || [],
    mode: data.mode === 'all' ? 'all' : 'any',
    bucketMinutes: data.bucketMinutes || 60,
    timeColumn: data.timeColumn || null,
    entries: data.entries || [],
  };
}

export interface SocialLogEntry {
  person1Id: string;
  person1Name: string;
  person1Alias: string | null;
  person2Id: string;
  person2Name: string;
  person2Alias: string | null;
  type: string;
  count: number;
  firstContact: string | null;
  lastContact: string | null;
}

/**
 * Fetch social connections (calls, messages) between selected entities.
 */
export async function fetchSocialLog(input: {
  entityIds: string[];
  limit?: number;
}): Promise<{
  entityIds: string[];
  entries: SocialLogEntry[];
  totalConnections: number;
}> {
  const res = await fetch(`${API_BASE}/social-log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return {
    entityIds: data.entityIds || [],
    entries: data.entries || [],
    totalConnections: data.totalConnections || 0,
  };
}

// ============== DEVICE TAIL (TRACKING TRAIL) ==============

export interface DeviceTailPoint {
  hour: number;
  lat: number;
  lng: number;
  city?: string;
  h3Cell?: string;
}

export interface DeviceTail {
  deviceId: string;
  entityId: string;
  entityName: string;
  alias: string | null;
  isSuspect: boolean;
  threatLevel: string | null;
  trail: DeviceTailPoint[];
  totalPoints: number;
  baseLocation: {
    lat: number;
    lng: number;
    city: string;
    state: string;
  };
}

/**
 * Fetch the movement trail (tail) for a specific device across all hours.
 * Used for surveillance/tracking visualization.
 */
export async function fetchDeviceTail(
  deviceId: string,
  options?: { signal?: AbortSignal }
): Promise<DeviceTail> {
  const res = await fetch(`${API_BASE}/device-tail/${encodeURIComponent(deviceId)}`, {
    signal: options?.signal,
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return {
    deviceId: data.deviceId,
    entityId: data.entityId,
    entityName: data.entityName,
    alias: data.alias,
    isSuspect: data.isSuspect,
    threatLevel: data.threatLevel,
    trail: data.trail || [],
    totalPoints: data.totalPoints || 0,
    baseLocation: data.baseLocation,
  };
}

/**
 * Fetch positions with enhanced data
 */
export async function fetchPositionsEnhanced(
  hour: number,
  options?: { limit?: number; signal?: AbortSignal }
): Promise<{
  positions: DevicePosition[];
  count: number;
  suspectCount: number;
}> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));

  const url = `${API_BASE}/positions/${hour}?${params}`;
  const res = await fetch(url, { signal: options?.signal });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return {
    positions: data.positions || [],
    count: data.count || 0,
    suspectCount: data.suspectCount || 0,
  };
}

// Export data source indicator
export function getDataSource(): string {
  return 'Databricks Unity Catalog';
}

// ============== PROGRESSIVE/LAZY LOADING HELPERS ==============

export interface ProgressCallback {
  (progress: { loaded: number; total: number | null; complete: boolean }): void;
}

/**
 * Fetch all suspects/persons with progressive loading
 * Calls onProgress with each batch as it arrives
 */
export async function fetchAllSuspectsProgressive(options?: {
  batchSize?: number;
  city?: string;
  minScore?: number;
  suspectsOnly?: boolean;
  onProgress?: ProgressCallback;
}): Promise<Suspect[]> {
  const batchSize = options?.batchSize || 1000;
  const allSuspects: Suspect[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { suspects, pagination } = await fetchSuspectsPaginated({
      limit: batchSize,
      offset,
      city: options?.city,
      minScore: options?.minScore,
      suspectsOnly: options?.suspectsOnly,
    });

    allSuspects.push(...suspects);
    hasMore = pagination.hasMore;
    offset += batchSize;

    options?.onProgress?.({
      loaded: allSuspects.length,
      total: pagination.total,
      complete: !hasMore,
    });
  }

  return allSuspects;
}

/**
 * Fetch all cases with progressive loading
 */
export async function fetchAllCasesProgressive(options?: {
  batchSize?: number;
  city?: string;
  status?: string;
  onProgress?: ProgressCallback;
}): Promise<CaseData[]> {
  const batchSize = options?.batchSize || 500;
  const allCases: CaseData[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { cases, pagination } = await fetchCasesPaginated({
      limit: batchSize,
      offset,
      city: options?.city,
      status: options?.status,
    });

    allCases.push(...cases);
    hasMore = pagination.hasMore;
    offset += batchSize;

    options?.onProgress?.({
      loaded: allCases.length,
      total: pagination.total,
      complete: !hasMore,
    });
  }

  return allCases;
}

export interface GraphDataProgressCallback {
  (progress: {
    nodes: GraphNode[];
    links: GraphLink[];
    stats?: {
      nodeCount: number;
      linkCount: number;
      personCount: number;
      deviceCount: number;
      coLocationLinks: number;
      socialLinks: number;
      ownsLinks: number;
    };
    complete: boolean;
    batchIndex: number;
  }): void;
}

/**
 * Fetch graph data progressively with larger batches
 * Graph data endpoint doesn't have traditional pagination, so we request
 * larger limits to get all data
 */
export async function fetchGraphDataProgressive(options?: {
  city?: string;
  minScore?: number;
  onProgress?: GraphDataProgressCallback;
}): Promise<{
  nodes: GraphNode[];
  links: GraphLink[];
  stats?: {
    nodeCount: number;
    linkCount: number;
    personCount: number;
    deviceCount: number;
    coLocationLinks: number;
    socialLinks: number;
    ownsLinks: number;
  };
}> {
  // Request full dataset with high limit (backend now supports up to 100k rows)
  const result = await fetchGraphData({
    limit: 50000,
    city: options?.city,
    minScore: options?.minScore,
  });

  options?.onProgress?.({
    nodes: result.nodes,
    links: result.links,
    stats: result.stats,
    complete: true,
    batchIndex: 0,
  });

  return result;
}

/**
 * Progressive data loader that fetches graph data, suspects, and relationships
 * in parallel with progress updates
 */
export interface FullDataLoadProgress {
  suspects: { loaded: number; total: number | null; complete: boolean };
  graph: { nodes: number; links: number; complete: boolean };
  overall: { percent: number; complete: boolean };
}

export async function loadAllDataProgressive(options?: {
  city?: string;
  minScore?: number;
  onProgress?: (progress: FullDataLoadProgress) => void;
}): Promise<{
  suspects: Suspect[];
  graphData: { nodes: GraphNode[]; links: GraphLink[] };
}> {
  const progress: FullDataLoadProgress = {
    suspects: { loaded: 0, total: null, complete: false },
    graph: { nodes: 0, links: 0, complete: false },
    overall: { percent: 0, complete: false },
  };

  const updateProgress = () => {
    const suspectsWeight = 0.4;
    const graphWeight = 0.6;

    const suspectsPct = progress.suspects.complete
      ? 100
      : progress.suspects.total
        ? (progress.suspects.loaded / progress.suspects.total) * 100
        : 50;
    const graphPct = progress.graph.complete ? 100 : 50;

    progress.overall.percent = Math.round(suspectsPct * suspectsWeight + graphPct * graphWeight);
    progress.overall.complete = progress.suspects.complete && progress.graph.complete;
    options?.onProgress?.(progress);
  };

  // Fetch in parallel - get ALL persons (not just suspects) for graph visualization
  const [suspects, graphData] = await Promise.all([
    fetchAllSuspectsProgressive({
      batchSize: 2000,
      city: options?.city,
      minScore: options?.minScore,
      suspectsOnly: false, // Get all persons including associates
      onProgress: (p) => {
        progress.suspects = p;
        updateProgress();
      },
    }),
    fetchGraphDataProgressive({
      city: options?.city,
      minScore: options?.minScore,
      onProgress: (p) => {
        progress.graph = {
          nodes: p.nodes.length,
          links: p.links.length,
          complete: p.complete,
        };
        updateProgress();
      },
    }),
  ]);

  return { suspects, graphData };
}
