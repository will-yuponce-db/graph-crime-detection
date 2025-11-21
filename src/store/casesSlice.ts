import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { Case, CreateCaseInput, UpdateCaseInput } from '../types/case';
import { CaseStatus, CasePriority } from '../types/case';
import { ChangeStatus } from '../types/graph';
import { mockCases } from '../data/mockCaseData';
import { mockGraphData } from '../data/mockGraphData';
import { detectCommunities, communitiesToCases } from '../utils/communityDetection';

interface CasesState {
  cases: Case[];
  detectedCases: Case[]; // AI-detected cases pending approval (not persisted)
  selectedCaseId: string | null;
  initialized: boolean;
}

const initialState: CasesState = {
  cases: [],
  detectedCases: [], // Temporary storage for AI-detected cases
  selectedCaseId: null,
  initialized: false,
};

const casesSlice = createSlice({
  name: 'cases',
  initialState,
  reducers: {
    // Initialize with mock cases
    initializeCases: (state) => {
      if (!state.initialized && state.cases.length === 0) {
        state.cases = mockCases.map(c => ({
          ...c,
          changeStatus: ChangeStatus.EXISTING,
        }));
        state.initialized = true;
      }
    },

    // Select a case (or null for all entities)
    selectCase: (state, action: PayloadAction<string | null>) => {
      state.selectedCaseId = action.payload;
    },

    // Create a new case
    createCase: (state, action: PayloadAction<CreateCaseInput>) => {
      const newCase: Case = {
        id: `case_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        caseNumber: `CASE-${new Date().getFullYear()}-${String(state.cases.length + 1).padStart(3, '0')}`,
        name: action.payload.name,
        description: action.payload.description,
        status: CaseStatus.LEADS,
        priority: action.payload.priority,
        createdDate: new Date(),
        updatedDate: new Date(),
        assignedAgents: action.payload.assignedAgents || [],
        leadAgent: action.payload.leadAgent,
        classification: action.payload.classification,
        entityIds: action.payload.entityIds || [],
        documents: action.payload.documents || [],
        tags: action.payload.tags || [],
        notes: action.payload.notes,
        changeStatus: ChangeStatus.NEW,
      };
      state.cases.push(newCase);
    },

    // Update an existing case
    updateCase: (state, action: PayloadAction<{ caseId: string; updates: UpdateCaseInput }>) => {
      const { caseId, updates } = action.payload;
      const caseIndex = state.cases.findIndex(c => c.id === caseId);
      if (caseIndex !== -1) {
        state.cases[caseIndex] = {
          ...state.cases[caseIndex],
          ...updates,
          updatedDate: new Date(),
        };
      }
    },

    // Delete a case
    deleteCase: (state, action: PayloadAction<string>) => {
      state.cases = state.cases.filter(c => c.id !== action.payload);
      if (state.selectedCaseId === action.payload) {
        state.selectedCaseId = null;
      }
    },

    // Assign entities to a case
    assignEntitiesToCase: (state, action: PayloadAction<{ caseId: string; entityIds: string[] }>) => {
      const { caseId, entityIds } = action.payload;
      const caseIndex = state.cases.findIndex(c => c.id === caseId);
      if (caseIndex !== -1) {
        const existingIds = new Set(state.cases[caseIndex].entityIds);
        const newEntityIds = entityIds.filter(id => !existingIds.has(id));
        state.cases[caseIndex].entityIds = [...state.cases[caseIndex].entityIds, ...newEntityIds];
        state.cases[caseIndex].updatedDate = new Date();
      }
    },

    // Remove entities from a case
    removeEntitiesFromCase: (state, action: PayloadAction<{ caseId: string; entityIds: string[] }>) => {
      const { caseId, entityIds } = action.payload;
      const caseIndex = state.cases.findIndex(c => c.id === caseId);
      if (caseIndex !== -1) {
        const idsToRemove = new Set(entityIds);
        state.cases[caseIndex].entityIds = state.cases[caseIndex].entityIds.filter(
          id => !idsToRemove.has(id)
        );
        state.cases[caseIndex].updatedDate = new Date();
      }
    },

    // Detect communities and create cases
    detectCommunitiesAndCreateCases: (state) => {
      const communities = detectCommunities(mockGraphData);
      const caseInputs = communitiesToCases(communities, mockGraphData);
      
      // Create detected cases with PENDING_APPROVAL status (not persisted until approved)
      caseInputs.forEach((input, index) => {
        const detectedCase: Case = {
          id: `detected_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
          caseNumber: `DETECTED-${new Date().getFullYear()}-${String(index + 1).padStart(3, '0')}`,
          name: input.name,
          description: input.description,
          status: CaseStatus.PENDING_APPROVAL,
          priority: input.priority,
          createdDate: new Date(),
          updatedDate: new Date(),
          assignedAgents: [],
          classification: input.classification,
          entityIds: input.entityIds || [],
          documents: input.documents || [],
          tags: input.tags || [],
          changeStatus: ChangeStatus.NEW,
        };
        state.detectedCases.push(detectedCase);
      });
    },

    // Approve a detected case (move to regular cases with LEADS status)
    approveDetectedCase: (state, action: PayloadAction<string>) => {
      const caseId = action.payload;
      const detectedCase = state.detectedCases.find(c => c.id === caseId);
      
      if (detectedCase) {
        // Move to regular cases with LEADS status and new ID
        const now = new Date();
        const approvedCase: Case = {
          ...detectedCase,
          id: `case_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          caseNumber: `CASE-${now.getFullYear()}-${String(state.cases.length + 1).padStart(3, '0')}`,
          status: CaseStatus.LEADS,
          createdDate: now,
          updatedDate: now,
          changeStatus: ChangeStatus.NEW, // Mark as new for tracking
        };
        
        console.log('✅ Approving case:', {
          originalId: caseId,
          newId: approvedCase.id,
          status: approvedCase.status,
          caseNumber: approvedCase.caseNumber,
        });
        
        // Add to regular cases (this will be persisted)
        state.cases.push(approvedCase);
        
        // Remove from detected cases (these are not persisted)
        state.detectedCases = state.detectedCases.filter(c => c.id !== caseId);
        
        console.log('📊 After approval - Total cases:', state.cases.length);
      }
    },

    // Decline a detected case (remove without persisting)
    declineDetectedCase: (state, action: PayloadAction<string>) => {
      const caseId = action.payload;
      state.detectedCases = state.detectedCases.filter(c => c.id !== caseId);
    },

    // Approve all detected cases at once
    approveAllDetectedCases: (state) => {
      const now = new Date();
      state.detectedCases.forEach((detectedCase, index) => {
        const approvedCase: Case = {
          ...detectedCase,
          id: `case_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
          caseNumber: `CASE-${now.getFullYear()}-${String(state.cases.length + index + 1).padStart(3, '0')}`,
          status: CaseStatus.LEADS,
          createdDate: now,
          updatedDate: now,
          changeStatus: ChangeStatus.NEW, // Mark as new for tracking
        };
        state.cases.push(approvedCase);
      });
      
      state.detectedCases = [];
    },

    // Decline all detected cases without persisting
    declineAllDetectedCases: (state) => {
      state.detectedCases = [];
    },

    // Set all cases at once (for bulk operations)
    setCases: (state, action: PayloadAction<Case[]>) => {
      state.cases = action.payload;
    },

    // Merge multiple cases into one
    mergeCases: (state, action: PayloadAction<{ targetCaseId: string; sourceCaseIds: string[]; mergeOptions?: { keepSourceCases?: boolean; newName?: string; newDescription?: string } }>) => {
      const { targetCaseId, sourceCaseIds, mergeOptions = {} } = action.payload;
      const targetCase = state.cases.find(c => c.id === targetCaseId);
      
      if (!targetCase) return;

      // Collect all entities, documents, tags, agents from source cases
      const allEntityIds = new Set(targetCase.entityIds);
      const allDocuments = [...(targetCase.documents || [])];
      const allTags = new Set(targetCase.tags);
      const allAgents = new Set(targetCase.assignedAgents);
      const mergedNotes: string[] = [targetCase.notes || ''];

      sourceCaseIds.forEach((sourceId) => {
        const sourceCase = state.cases.find(c => c.id === sourceId);
        if (!sourceCase || sourceCase.id === targetCaseId) return;

        // Merge entities
        sourceCase.entityIds.forEach(id => allEntityIds.add(id));

        // Merge documents (avoid duplicates by URL/path)
        const existingDocUrls = new Set(allDocuments.map(d => d.url || d.path).filter(Boolean));
        (sourceCase.documents || []).forEach(doc => {
          const identifier = doc.url || doc.path;
          if (identifier && !existingDocUrls.has(identifier)) {
            allDocuments.push(doc);
            existingDocUrls.add(identifier);
          }
        });

        // Merge tags
        sourceCase.tags.forEach(tag => allTags.add(tag));

        // Merge agents
        sourceCase.assignedAgents.forEach(agent => allAgents.add(agent));

        // Merge notes
        if (sourceCase.notes) {
          mergedNotes.push(`--- From ${sourceCase.name} (${sourceCase.caseNumber}) ---\n${sourceCase.notes}`);
        }
      });

      // Update target case
      const targetIndex = state.cases.findIndex(c => c.id === targetCaseId);
      if (targetIndex !== -1) {
        state.cases[targetIndex] = {
          ...targetCase,
          name: mergeOptions.newName || targetCase.name,
          description: mergeOptions.newDescription || `${targetCase.description}\n\nMerged with ${sourceCaseIds.length} case(s) on ${new Date().toLocaleDateString()}`,
          entityIds: Array.from(allEntityIds),
          documents: allDocuments,
          tags: Array.from(allTags),
          assignedAgents: Array.from(allAgents),
          notes: mergedNotes.filter(n => n.trim()).join('\n\n'),
          updatedDate: new Date(),
          changeStatus: ChangeStatus.MODIFIED,
        };

        // Optionally delete source cases
        if (!mergeOptions.keepSourceCases) {
          state.cases = state.cases.filter(c => !sourceCaseIds.includes(c.id));
          // Update selected case if it was deleted
          if (sourceCaseIds.includes(state.selectedCaseId || '')) {
            state.selectedCaseId = targetCaseId;
          }
        } else {
          // Mark source cases as merged
          sourceCaseIds.forEach(sourceId => {
            const sourceIndex = state.cases.findIndex(c => c.id === sourceId);
            if (sourceIndex !== -1) {
              state.cases[sourceIndex].tags = [...new Set([...state.cases[sourceIndex].tags, 'merged'])];
              state.cases[sourceIndex].notes = `${state.cases[sourceIndex].notes || ''}\n\nMerged into ${targetCase.name} (${targetCase.caseNumber}) on ${new Date().toLocaleDateString()}`;
              state.cases[sourceIndex].updatedDate = new Date();
            }
          });
        }
      }
    },

    // Add documents to a case
    addDocumentsToCase: (state, action: PayloadAction<{ caseId: string; documents: any[] }>) => {
      const { caseId, documents } = action.payload;
      const caseIndex = state.cases.findIndex(c => c.id === caseId);
      if (caseIndex !== -1) {
        state.cases[caseIndex].documents = [...(state.cases[caseIndex].documents || []), ...documents];
        state.cases[caseIndex].updatedDate = new Date();
      }
    },

    // Remove documents from a case
    removeDocumentsFromCase: (state, action: PayloadAction<{ caseId: string; documentIds: string[] }>) => {
      const { caseId, documentIds } = action.payload;
      const caseIndex = state.cases.findIndex(c => c.id === caseId);
      if (caseIndex !== -1) {
        state.cases[caseIndex].documents = (state.cases[caseIndex].documents || []).filter(
          doc => !documentIds.includes(doc.id)
        );
        state.cases[caseIndex].updatedDate = new Date();
      }
    },
  },
});

export const {
  initializeCases,
  selectCase,
  createCase,
  updateCase,
  deleteCase,
  assignEntitiesToCase,
  removeEntitiesFromCase,
  detectCommunitiesAndCreateCases,
  approveDetectedCase,
  declineDetectedCase,
  approveAllDetectedCases,
  declineAllDetectedCases,
  setCases,
  mergeCases,
  addDocumentsToCase,
  removeDocumentsFromCase,
} = casesSlice.actions;

export default casesSlice.reducer;

