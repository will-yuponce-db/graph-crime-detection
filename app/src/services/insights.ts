/**
 * AI Data Intelligence Service
 *
 * Provides LLM-powered insights throughout the application.
 * This service is the central hub for all AI-generated analysis.
 */

const API_BASE = '/api/demo';

// ============== Types ==============

export type InsightType =
  | 'hotspot_anomaly'
  | 'entity_relationships'
  | 'case_summary'
  | 'handoff_analysis'
  | 'timeline_narration'
  | 'network_patterns';

export type ConfidenceLevel = 'High' | 'Medium' | 'Low';
export type RiskLevel = 'Critical' | 'High' | 'Medium' | 'Low' | 'None';

export interface Insight {
  type: InsightType;
  title: string;
  summary: string;
  keyFindings: string[];
  recommendations: string[];
  confidence: ConfidenceLevel;
  riskLevel: RiskLevel;
  dataContext?: Record<string, unknown>;
  generatedAt: string;
}

export interface HotspotAnomalyContext {
  hour?: number;
  city?: string | null;
}

export interface EntityRelationshipsContext {
  entityIds: string[];
}

export interface CaseSummaryContext {
  caseId: string;
}

export interface HandoffAnalysisContext {
  entityId?: string;
}

export interface TimelineNarrationContext {
  startHour?: number;
  endHour?: number;
  entityIds?: string[];
  city?: string | null;
}

export interface NetworkPatternsContext {
  city?: string | null;
}

export type InsightContext =
  | HotspotAnomalyContext
  | EntityRelationshipsContext
  | CaseSummaryContext
  | HandoffAnalysisContext
  | TimelineNarrationContext
  | NetworkPatternsContext;

// ============== API Functions ==============

/**
 * Generate an AI-powered insight
 */
export async function generateInsight(
  insightType: InsightType,
  context: InsightContext
): Promise<Insight> {
  const res = await fetch(`${API_BASE}/insights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ insightType, context }),
  });

  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || 'Failed to generate insight');
  }

  return data.insight;
}

/**
 * Generate hotspot anomaly analysis
 */
export async function analyzeHotspotAnomalies(
  hour: number,
  city?: string | null
): Promise<Insight> {
  return generateInsight('hotspot_anomaly', { hour, city });
}

/**
 * Analyze relationships between entities
 */
export async function analyzeEntityRelationships(entityIds: string[]): Promise<Insight> {
  return generateInsight('entity_relationships', { entityIds });
}

/**
 * Generate AI case summary
 */
export async function generateCaseSummary(caseId: string): Promise<Insight> {
  return generateInsight('case_summary', { caseId });
}

/**
 * Analyze cross-jurisdiction handoff patterns
 */
export async function analyzeHandoffs(entityId?: string): Promise<Insight> {
  return generateInsight('handoff_analysis', { entityId });
}

/**
 * Generate timeline narration
 */
export async function narrateTimeline(
  startHour: number,
  endHour: number,
  options?: { entityIds?: string[]; city?: string | null }
): Promise<Insight> {
  return generateInsight('timeline_narration', {
    startHour,
    endHour,
    entityIds: options?.entityIds,
    city: options?.city,
  });
}

/**
 * Analyze network patterns
 */
export async function analyzeNetworkPatterns(city?: string | null): Promise<Insight> {
  return generateInsight('network_patterns', { city });
}

// ============== Utility Functions ==============

/**
 * Get appropriate icon name for insight type
 */
export function getInsightIcon(type: InsightType): string {
  switch (type) {
    case 'hotspot_anomaly':
      return 'Warning';
    case 'entity_relationships':
      return 'Hub';
    case 'case_summary':
      return 'Description';
    case 'handoff_analysis':
      return 'FlightTakeoff';
    case 'timeline_narration':
      return 'Timeline';
    case 'network_patterns':
      return 'AccountTree';
    default:
      return 'AutoAwesome';
  }
}

/**
 * Get color for risk level
 */
export function getRiskColor(riskLevel: RiskLevel): string {
  switch (riskLevel) {
    case 'Critical':
      return '#ef4444';
    case 'High':
      return '#f97316';
    case 'Medium':
      return '#eab308';
    case 'Low':
      return '#22c55e';
    case 'None':
      return '#71717a';
    default:
      return '#71717a';
  }
}

/**
 * Get color for confidence level
 */
export function getConfidenceColor(confidence: ConfidenceLevel): string {
  switch (confidence) {
    case 'High':
      return '#22c55e';
    case 'Medium':
      return '#eab308';
    case 'Low':
      return '#f97316';
    default:
      return '#71717a';
  }
}

// ============== Interactive Follow-up ==============

export interface InsightMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface AskInsightResponse {
  answer: string;
  timestamp: string;
}

/**
 * Ask a follow-up question about an insight
 */
export async function askInsightFollowup(
  insight: Insight,
  question: string,
  conversationHistory: InsightMessage[] = []
): Promise<AskInsightResponse> {
  const res = await fetch(`${API_BASE}/insights/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      insight,
      question,
      conversationHistory: conversationHistory.map(m => ({
        role: m.role,
        content: m.content,
      })),
    }),
  });

  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || 'Failed to get answer');
  }

  return {
    answer: data.answer,
    timestamp: data.timestamp,
  };
}

