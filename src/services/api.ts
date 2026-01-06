/**
 * API Service Layer
 * Provides a unified interface for fetching data from either SQLite (demo) or Databricks
 */

// Set to true to use Databricks Unity Catalog, false for local SQLite demo
export const USE_DATABRICKS = true;

const API_BASE = USE_DATABRICKS ? '/api/databricks/ui' : '/api/demo';

// ============== Types ==============

export interface CellTower {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  city: string;
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
  const endpoint = USE_DATABRICKS ? `${API_BASE}/suspects` : '/api/demo/persons?suspects=true';
  const res = await fetch(endpoint);
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
export async function fetchEvidenceCard(caseId: string): Promise<EvidenceCard> {
  const endpoint = USE_DATABRICKS
    ? `${API_BASE}/evidence-card/${caseId}`
    : '/api/demo/evidence-card';

  const res = USE_DATABRICKS
    ? await fetch(endpoint)
    : await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personIds: [] }),
      });

  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.evidenceCard;
}

/**
 * Update case status (only works with SQLite for now)
 */
export async function updateCaseStatus(caseId: string, status: string): Promise<void> {
  if (USE_DATABRICKS) {
    // Databricks is read-only for now, just simulate success
    console.log(`[Databricks] Would update case ${caseId} to ${status}`);
    return;
  }

  await fetch(`/api/demo/cases/${caseId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

/**
 * Fetch devices (for SQLite compatibility)
 */
export async function fetchDevices(): Promise<Array<{ owner_id: string; name: string }>> {
  if (USE_DATABRICKS) {
    // Return empty array for Databricks - device mapping not available
    return [];
  }
  const res = await fetch('/api/demo/devices');
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.devices;
}

// Export data source indicator
export function getDataSource(): string {
  return USE_DATABRICKS ? 'Databricks Unity Catalog' : 'Local SQLite';
}
