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
  estimatedLoss?: number;
  description?: string;
  persons?: { id: string; name: string; alias?: string }[];
  devices?: { id: string; name: string }[];
  properties?: Record<string, unknown>;
}

export interface GraphNode {
  id: string;
  name: string;
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
 * Fetch suspects/persons
 */
export async function fetchSuspects(): Promise<Suspect[]> {
  const res = await fetch(`${API_BASE}/persons?suspects=true`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.persons;
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
  // Case status updates are not persisted in Databricks yet
  console.log(`Would update case ${caseId} to ${status}`);
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

// Export data source indicator
export function getDataSource(): string {
  return 'Databricks Unity Catalog';
}
