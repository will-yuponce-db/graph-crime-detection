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
}

export interface Hotspot {
  towerId: string;
  towerName: string;
  lat: number;
  lng: number;
  city: string;
  deviceCount: number;
  suspectCount: number;
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
}

export interface GraphNode {
  id: string;
  name: string;
  originalName?: string;
  customTitle?: string | null;
  customNotes?: string | null;
  hasCustomTitle?: boolean;
  alias?: string;
  type: 'person' | 'location';
  isSuspect?: boolean;
  city?: string;
  threatLevel?: string;
  totalScore?: number;
  linkedCities?: string[];
  properties?: Record<string, unknown>;
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
export async function fetchPositions(hour: number): Promise<DevicePosition[]> {
  const res = await fetch(`${API_BASE}/positions/${hour}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.positions;
}

/**
 * Fetch hotspots at a specific hour
 */
export async function fetchHotspots(hour: number): Promise<Hotspot[]> {
  const res = await fetch(`${API_BASE}/hotspots/${hour}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.hotspots;
}

/**
 * Fetch all cases
 */
export async function fetchCases(): Promise<CaseData[]> {
  const res = await fetch(`${API_BASE}/cases`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.cases;
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
 * Fetch suspects/persons
 */
export async function fetchSuspects(): Promise<Suspect[]> {
  const res = await fetch(`${API_BASE}/persons?suspects=true`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  const persons = Array.isArray(data.persons) ? data.persons : [];
  return persons.map((p: AnyRecord) => normalizePerson(p));
}

/**
 * Fetch graph data for network visualization
 */
export async function fetchGraphData(): Promise<{
  nodes: GraphNode[];
  links: GraphLink[];
}> {
  const res = await fetch(`${API_BASE}/graph-data`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return { nodes: data.nodes, links: data.links };
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function fetchEvidenceCard(caseId: string): Promise<EvidenceCard> {
  // TODO: Use caseId to fetch specific case evidence
  const res = await fetch(`${API_BASE}/evidence-card`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ personIds: [] }),
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

export type EntityType = 'persons' | 'cases' | 'devices' | 'hotspots' | 'locations';

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

// Export data source indicator
export function getDataSource(): string {
  return 'Databricks Unity Catalog';
}
