export type NavigateAction = {
  type: 'navigate';
  path: '/' | '/heatmap' | '/graph-explorer' | '/evidence-card';
  searchParams?: Record<string, string>;
};

export type SetSearchParamsAction = {
  type: 'setSearchParams';
  searchParams: Record<string, string | null>;
};

export type SelectEntitiesAction = {
  type: 'selectEntities';
  entityIds: string[];
};

export type GenerateEvidenceCardAction = {
  type: 'generateEvidenceCard';
  personIds: string[];
  navigateToEvidenceCard?: boolean;
};

export type FocusLinkedSuspectsAction = {
  type: 'focusLinkedSuspects';
  entityIds: string[];
};

export type AnalysisType =
  | 'network_patterns'
  | 'entity_relationships'
  | 'hotspot_anomaly'
  | 'handoff_analysis'
  | 'timeline_narration'
  | 'case_summary'
  | 'comparative_analysis'
  | 'link_suggestion_analysis';

export type RunAnalysisAction = {
  type: 'runAnalysis';
  analysisType: AnalysisType;
  // Context varies by analysis type
  entityIds?: string[];
  caseId?: string;
  city?: string;
  hour?: number;
  startHour?: number;
  endHour?: number;
  // Optional: navigate to a specific component before running analysis
  navigateTo?: '/' | '/heatmap' | '/graph-explorer' | '/evidence-card';
};

// Action to analyze and explain link suggestions
export type AnalyzeLinkSuggestionsAction = {
  type: 'analyzeLinkSuggestions';
  suggestionIds?: string[]; // Specific suggestions to analyze, or all pending if empty
};

// Action to help with case triage/prioritization
export type TriageCasesAction = {
  type: 'triageCases';
  caseIds?: string[]; // Specific cases to triage, or suggest from queue if empty
  action: 'prioritize' | 'compare' | 'recommend_assignment';
};

// Action to generate a warrant package draft
export type GenerateWarrantPackageAction = {
  type: 'generateWarrantPackage';
  caseId: string;
  suspectIds?: string[];
};

// Action to check alibi/location conflicts
export type CheckAlibiAction = {
  type: 'checkAlibi';
  entityId: string;
  claimedLocation?: string;
  timeRange?: { startHour: number; endHour: number };
};

export type UIAction =
  | NavigateAction
  | SetSearchParamsAction
  | SelectEntitiesAction
  | GenerateEvidenceCardAction
  | FocusLinkedSuspectsAction
  | RunAnalysisAction
  | AnalyzeLinkSuggestionsAction
  | TriageCasesAction
  | GenerateWarrantPackageAction
  | CheckAlibiAction;

export type AgentRole = 'user' | 'assistant';

export type AgentMessage = {
  role: AgentRole;
  content: string;
  ts: number;
};

