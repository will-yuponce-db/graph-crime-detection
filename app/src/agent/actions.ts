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

export type UIAction =
  | NavigateAction
  | SetSearchParamsAction
  | SelectEntitiesAction
  | GenerateEvidenceCardAction
  | FocusLinkedSuspectsAction;

export type AgentRole = 'user' | 'assistant';

export type AgentMessage = {
  role: AgentRole;
  content: string;
  ts: number;
};

