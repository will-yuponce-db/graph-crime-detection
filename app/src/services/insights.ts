/**
 * AI Data Intelligence Service
 *
 * Provides LLM-powered insights throughout the application.
 * This service is the central hub for all AI-generated analysis.
 */

const API_BASE = '/api/demo';

/**
 * Detect if a string looks like raw JSON and sanitize it.
 * Returns a user-friendly error message if the content is JSON.
 */
function sanitizeAgentResponse(content: string): string {
  if (!content || typeof content !== 'string') {
    return 'Could not generate summary. Please try again.';
  }

  const trimmed = content.trim();

  // Check if the response looks like JSON (starts with { or [)
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      JSON.parse(trimmed);
      // If it parses successfully, it's raw JSON - return error message
      return 'Could not generate summary. Please try again.';
    } catch {
      // Not valid JSON, return as-is
      return content;
    }
  }

  return content;
}

// ============== Types ==============

export type InsightType =
  | 'hotspot_anomaly'
  | 'entity_relationships'
  | 'case_summary'
  | 'handoff_analysis'
  | 'timeline_narration'
  | 'network_patterns'
  | 'comparative_analysis'
  | 'link_suggestion_analysis';

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

export interface ComparativeAnalysisContext {
  entityIds: string[]; // Exactly 2 entities to compare
}

export interface LinkSuggestionAnalysisContext {
  suggestionIds?: string[]; // Specific suggestions, or all if empty
}

export type InsightContext =
  | HotspotAnomalyContext
  | EntityRelationshipsContext
  | CaseSummaryContext
  | HandoffAnalysisContext
  | TimelineNarrationContext
  | NetworkPatternsContext
  | ComparativeAnalysisContext
  | LinkSuggestionAnalysisContext;

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

  // Sanitize text fields in the insight to handle raw JSON responses
  const insight = data.insight;
  if (insight) {
    if (insight.summary) {
      insight.summary = sanitizeAgentResponse(insight.summary);
    }
    if (insight.title) {
      insight.title = sanitizeAgentResponse(insight.title);
    }
    if (Array.isArray(insight.keyFindings)) {
      insight.keyFindings = insight.keyFindings.map((f: string) => sanitizeAgentResponse(f));
    }
    if (Array.isArray(insight.recommendations)) {
      insight.recommendations = insight.recommendations.map((r: string) => sanitizeAgentResponse(r));
    }
  }

  return insight;
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

/**
 * Compare two entities' patterns and connections
 */
export async function compareEntities(entityIds: string[]): Promise<Insight> {
  if (entityIds.length !== 2) {
    throw new Error('Comparative analysis requires exactly 2 entities');
  }
  return generateInsight('comparative_analysis', { entityIds });
}

/**
 * Analyze pending link suggestions
 */
export async function analyzeLinkSuggestions(suggestionIds?: string[]): Promise<Insight> {
  return generateInsight('link_suggestion_analysis', { suggestionIds });
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
    case 'comparative_analysis':
      return 'CompareArrows';
    case 'link_suggestion_analysis':
      return 'Link';
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
    answer: sanitizeAgentResponse(data.answer),
    timestamp: data.timestamp,
  };
}

