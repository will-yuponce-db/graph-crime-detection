import type { NavigateFunction } from 'react-router-dom';
import type { UIAction } from './actions';

export type ExecuteActionsContext = {
  navigate: NavigateFunction;
  currentPath: string;
  currentSearchParams: URLSearchParams;
  setSearchParams: (next: URLSearchParams) => void;
  onGenerateEvidenceCard?: (args: {
    personIds: string[];
    navigateToEvidenceCard?: boolean;
  }) => void;
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
      default: {
        // Exhaustiveness guard
        const _never: never = action;
        void _never;
      }
    }
  }
}
