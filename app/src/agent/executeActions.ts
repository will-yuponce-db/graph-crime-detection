import type { NavigateFunction } from 'react-router-dom';
import type {
  UIAction,
  RunAnalysisAction,
  AnalyzeLinkSuggestionsAction,
  TriageCasesAction,
  GenerateWarrantPackageAction,
  CheckAlibiAction,
} from './actions';

export type ExecuteActionsContext = {
  navigate: NavigateFunction;
  currentPath: string;
  currentSearchParams: URLSearchParams;
  setSearchParams: (next: URLSearchParams) => void;
  onGenerateEvidenceCard?: (args: {
    personIds: string[];
    navigateToEvidenceCard?: boolean;
  }) => void;
  onFocusLinkedSuspects?: (entityIds: string[]) => void;
};

function applySearchParamPatches(
  current: URLSearchParams,
  patches: Record<string, string | null>
): URLSearchParams {
  const next = new URLSearchParams(current.toString());
  for (const [k, v] of Object.entries(patches)) {
    if (v === null) next.delete(k);
    else next.set(k, v);
  }
  return next;
}

export async function executeActions(actions: UIAction[], ctx: ExecuteActionsContext) {
  for (const action of actions) {
    switch (action.type) {
      case 'navigate': {
        const sp = action.searchParams ? new URLSearchParams(action.searchParams).toString() : '';
        const to = sp ? `${action.path}?${sp}` : action.path;
        ctx.navigate(to);
        break;
      }
      case 'setSearchParams': {
        const next = applySearchParamPatches(ctx.currentSearchParams, action.searchParams);
        ctx.setSearchParams(next);
        break;
      }
      case 'selectEntities': {
        const ids = action.entityIds.filter(Boolean).slice(0, 50);
        const entityIdsValue = ids.join(',');

        if (ctx.currentPath === '/graph-explorer') {
          const next = applySearchParamPatches(ctx.currentSearchParams, {
            entityIds: entityIdsValue,
          });
          ctx.setSearchParams(next);
        } else {
          const sp = new URLSearchParams();
          sp.set('entityIds', entityIdsValue);
          ctx.navigate(`/graph-explorer?${sp.toString()}`);
        }
        break;
      }
      case 'generateEvidenceCard': {
        ctx.onGenerateEvidenceCard?.({
          personIds: action.personIds || [],
          navigateToEvidenceCard: action.navigateToEvidenceCard,
        });
        break;
      }
      case 'focusLinkedSuspects': {
        const entityIds = action.entityIds?.filter(Boolean).slice(0, 50) || [];
        if (entityIds.length > 0) {
          // If we have a callback and are already on graph explorer, use it
          if (ctx.onFocusLinkedSuspects && ctx.currentPath === '/graph-explorer') {
            ctx.onFocusLinkedSuspects(entityIds);
          }
          // Navigate to graph explorer with the entity IDs and focusLinked flag
          // The GraphExplorer will detect focusLinked=true and expand selection
          if (ctx.currentPath !== '/graph-explorer') {
            const sp = new URLSearchParams();
            sp.set('entityIds', entityIds.join(','));
            sp.set('focusLinked', 'true');
            ctx.navigate(`/graph-explorer?${sp.toString()}`);
          } else {
            // Already on graph explorer, update params to trigger expansion
            const next = applySearchParamPatches(ctx.currentSearchParams, {
              entityIds: entityIds.join(','),
              focusLinked: 'true',
            });
            ctx.setSearchParams(next);
          }
        }
        break;
      }
      case 'runAnalysis': {
        const analysisAction = action as RunAnalysisAction;
        // Navigate to the appropriate page if requested
        if (analysisAction.navigateTo && ctx.currentPath !== analysisAction.navigateTo) {
          const sp = new URLSearchParams();
          if (analysisAction.entityIds?.length) {
            sp.set('entityIds', analysisAction.entityIds.join(','));
          }
          if (analysisAction.city) {
            sp.set('city', analysisAction.city);
          }
          if (analysisAction.caseId) {
            sp.set('case_id', analysisAction.caseId);
          }
          ctx.navigate(`${analysisAction.navigateTo}?${sp.toString()}`);
        }
        break;
      }
      case 'analyzeLinkSuggestions': {
        // Navigate to graph explorer for link context
        void (action as AnalyzeLinkSuggestionsAction);
        ctx.navigate('/graph-explorer');
        break;
      }
      case 'triageCases': {
        const triageAction = action as TriageCasesAction;
        // Navigate to evidence card
        if (triageAction.caseIds?.[0]) {
          ctx.navigate(`/evidence-card?case_id=${triageAction.caseIds[0]}`);
        } else {
          ctx.navigate('/evidence-card');
        }
        break;
      }
      case 'generateWarrantPackage': {
        const warrantAction = action as GenerateWarrantPackageAction;
        // Navigate to evidence card with the case
        ctx.navigate(`/evidence-card?case_id=${warrantAction.caseId}`);
        break;
      }
      case 'checkAlibi': {
        const alibiAction = action as CheckAlibiAction;
        // Navigate to graph explorer with the entity
        const sp = new URLSearchParams();
        sp.set('entityIds', alibiAction.entityId);
        ctx.navigate(`/graph-explorer?${sp.toString()}`);
        break;
      }
      default: {
        // For unknown action types, log and continue
        console.warn('Unknown action type:', (action as { type: string }).type);
      }
    }
  }
}

