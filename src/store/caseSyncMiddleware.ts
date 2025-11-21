import type { Middleware } from '@reduxjs/toolkit';
import { createCaseInDB, updateCaseInDB, deleteCaseFromDB } from '../services/caseApi';
import { ChangeStatus } from '../types/graph';
import type { RootState } from './index';

/**
 * Middleware to sync case changes to the backend database
 * Intercepts Redux actions and syncs cases marked with changeStatus.NEW
 */
const caseSyncMiddleware: Middleware<Record<string, never>, RootState> =
  (store) => (next) => async (action) => {
    // First, let the action pass through to the reducers
    const result = next(action);

    // After state update, check if we need to sync to backend
    if (action.type.startsWith('cases/')) {
      const state = store.getState();
      const { cases } = state.cases;

      // Sync cases that have changeStatus.NEW to the backend
      switch (action.type) {
        case 'cases/createCase':
        case 'cases/approveDetectedCase':
        case 'cases/approveAllDetectedCases': {
          // Find all cases with changeStatus.NEW and sync them
          const newCases = cases.filter((c) => c.changeStatus === ChangeStatus.NEW);

          if (newCases.length > 0) {
            console.log(`🔄 Syncing ${newCases.length} new case(s) to backend...`);

            // Sync each new case to backend
            for (const caseData of newCases) {
              try {
                const result = await createCaseInDB(caseData);
                if (result.success) {
                  console.log(`✓ Synced case ${caseData.caseNumber} to backend`);
                } else {
                  console.error(`✗ Failed to sync case ${caseData.caseNumber}: ${result.message}`);
                }
              } catch (error) {
                console.error(`✗ Error syncing case ${caseData.caseNumber}:`, error);
              }
            }
          }
          break;
        }

        case 'cases/updateCase': {
          // Sync the updated case to backend
          const { caseId, updates } = action.payload as {
            caseId: string;
            updates: Record<string, unknown>;
          };

          try {
            const result = await updateCaseInDB(caseId, updates);
            if (result.success) {
              console.log(`✓ Synced case update ${caseId} to backend`);
            } else {
              console.error(`✗ Failed to sync case update ${caseId}: ${result.message}`);
            }
          } catch (error) {
            console.error(`✗ Error syncing case update ${caseId}:`, error);
          }
          break;
        }

        case 'cases/deleteCase': {
          // Sync the deletion to backend
          const caseId = action.payload as string;

          try {
            const result = await deleteCaseFromDB(caseId);
            if (result.success) {
              console.log(`✓ Synced case deletion ${caseId} to backend`);
            } else {
              console.error(`✗ Failed to sync case deletion ${caseId}: ${result.message}`);
            }
          } catch (error) {
            console.error(`✗ Error syncing case deletion ${caseId}:`, error);
          }
          break;
        }

        case 'cases/mergeCases': {
          // When cases are merged, sync the target case update
          const { targetCaseId, sourceCaseIds } = action.payload as {
            targetCaseId: string;
            sourceCaseIds: string[];
          };

          try {
            // Delete source cases from backend
            for (const sourceId of sourceCaseIds) {
              await deleteCaseFromDB(sourceId);
            }

            // Update target case in backend
            const targetCase = cases.find((c) => c.id === targetCaseId);
            if (targetCase) {
              await updateCaseInDB(targetCaseId, targetCase);
            }

            console.log(`✓ Synced case merge (target: ${targetCaseId}) to backend`);
          } catch (error) {
            console.error(`✗ Error syncing case merge:`, error);
          }
          break;
        }

        case 'cases/assignEntitiesToCase':
        case 'cases/removeEntitiesFromCase':
        case 'cases/addDocumentsToCase':
        case 'cases/removeDocumentsFromCase': {
          // Sync entity/document changes to backend
          const { caseId } = action.payload as { caseId: string };
          const updatedCase = cases.find((c) => c.id === caseId);

          if (updatedCase) {
            try {
              const result = await updateCaseInDB(caseId, updatedCase);
              if (result.success) {
                console.log(`✓ Synced case changes ${caseId} to backend`);
              } else {
                console.error(`✗ Failed to sync case changes ${caseId}: ${result.message}`);
              }
            } catch (error) {
              console.error(`✗ Error syncing case changes ${caseId}:`, error);
            }
          }
          break;
        }
      }
    }

    return result;
  };

export default caseSyncMiddleware;
