import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { Case, CreateCaseInput, UpdateCaseInput } from '../types/case';
import { CaseStatus, CasePriority } from '../types/case';
import { ChangeStatus } from '../types/graph';
import { mockGraphData } from '../data/mockGraphData';
import { detectCommunities, communitiesToCases } from '../utils/communityDetection';

interface CaseSuggestion {
  id: string;
  name: string;
  description: string;
  entityIds: string[];
  priority: CasePriority;
  reasoning: string;
}

interface CaseContextValue {
  selectedCase: Case | null;
  allCases: Case[];
  selectCase: (caseId: string | null) => void;
  createCase: (input: CreateCaseInput) => Case;
  updateCase: (caseId: string, input: UpdateCaseInput) => void;
  deleteCase: (caseId: string) => void;
  assignEntitiesToCase: (caseId: string, entityIds: string[]) => void;
  removeEntitiesFromCase: (caseId: string, entityIds: string[]) => void;
  suggestCases: () => CaseSuggestion[];
  isEntityInCase: (entityId: string, caseId?: string) => boolean;
  detectCommunitiesAndCreateCases: () => void;
}

const CaseContext = createContext<CaseContextValue | undefined>(undefined);

interface CaseProviderProps {
  children: ReactNode;
}

export const CaseProvider: React.FC<CaseProviderProps> = ({ children }) => {
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [allCases, setAllCases] = useState<Case[]>([]);
  
  // Initialize with mock cases on mount (if no cases exist)
  React.useEffect(() => {
    if (allCases.length === 0) {
      // This will be populated by detectCommunitiesAndCreateCases or manual creation
      // For now, keep empty - cases can be created via community detection or manually
    }
  }, [allCases.length]);

  const selectCase = useCallback((caseId: string | null) => {
    if (caseId === null) {
      setSelectedCase(null);
    } else {
      const caseToSelect = allCases.find((c) => c.id === caseId);
      setSelectedCase(caseToSelect || null);
    }
  }, [allCases]);

  const createCase = useCallback((input: CreateCaseInput): Case => {
    const newCase: Case = {
      id: `case_${Date.now()}`,
      caseNumber: `CASE-${new Date().getFullYear()}-${String(allCases.length + 1).padStart(3, '0')}`,
      name: input.name,
      description: input.description,
      status: CaseStatus.LEADS,
      priority: input.priority,
      createdDate: new Date(),
      updatedDate: new Date(),
      assignedAgents: input.assignedAgents || [],
      leadAgent: input.leadAgent,
      classification: input.classification,
      entityIds: input.entityIds || [],
      tags: input.tags || [],
      notes: input.notes,
      changeStatus: ChangeStatus.NEW,
    };

    setAllCases((prev) => [...prev, newCase]);
    return newCase;
  }, [allCases.length]);

  const updateCase = useCallback((caseId: string, input: UpdateCaseInput) => {
    setAllCases((prev) =>
      prev.map((c) => {
        if (c.id === caseId) {
          const updated = {
            ...c,
            ...input,
            updatedDate: new Date(),
          };
          // Update selected case if it's the one being updated
          if (selectedCase?.id === caseId) {
            setSelectedCase(updated);
          }
          return updated;
        }
        return c;
      })
    );
  }, [selectedCase]);

  const deleteCase = useCallback((caseId: string) => {
    setAllCases((prev) => prev.filter((c) => c.id !== caseId));
    if (selectedCase?.id === caseId) {
      setSelectedCase(null);
    }
  }, [selectedCase]);

  const assignEntitiesToCase = useCallback((caseId: string, entityIds: string[]) => {
    setAllCases((prev) =>
      prev.map((c) => {
        if (c.id === caseId) {
          const existingIds = new Set(c.entityIds);
          const newEntityIds = entityIds.filter((id) => !existingIds.has(id));
          const updated = {
            ...c,
            entityIds: [...c.entityIds, ...newEntityIds],
            updatedDate: new Date(),
          };
          // Update selected case if it's the one being updated
          if (selectedCase?.id === caseId) {
            setSelectedCase(updated);
          }
          return updated;
        }
        return c;
      })
    );
  }, [selectedCase]);

  const removeEntitiesFromCase = useCallback((caseId: string, entityIds: string[]) => {
    setAllCases((prev) =>
      prev.map((c) => {
        if (c.id === caseId) {
          const idsToRemove = new Set(entityIds);
          const updated = {
            ...c,
            entityIds: c.entityIds.filter((id) => !idsToRemove.has(id)),
            updatedDate: new Date(),
          };
          // Update selected case if it's the one being updated
          if (selectedCase?.id === caseId) {
            setSelectedCase(updated);
          }
          return updated;
        }
        return c;
      })
    );
  }, [selectedCase]);

  const suggestCases = useCallback((): CaseSuggestion[] => {
    // Mock AI suggestions - will be replaced with real AI later
    return [];
  }, []);

  const isEntityInCase = useCallback((entityId: string, caseId?: string): boolean => {
    const targetCase = caseId ? allCases.find((c) => c.id === caseId) : selectedCase;
    return targetCase ? targetCase.entityIds.includes(entityId) : false;
  }, [allCases, selectedCase]);

  const detectCommunitiesAndCreateCases = useCallback(() => {
    // Run community detection on the graph
    const communities = detectCommunities(mockGraphData);
    
    // Convert communities to cases
    const caseInputs = communitiesToCases(communities, mockGraphData);
    
    // Clear existing cases and create new ones from communities
    const newCases: Case[] = caseInputs.map((input, index) => ({
      id: `community_case_${Date.now()}_${index}`,
      caseNumber: `COMM-${new Date().getFullYear()}-${String(index + 1).padStart(3, '0')}`,
      name: input.name,
      description: input.description,
      status: CaseStatus.LEADS,
      priority: input.priority,
      createdDate: new Date(),
      updatedDate: new Date(),
      assignedAgents: [],
      classification: input.classification,
      entityIds: input.entityIds || [],
      tags: input.tags || [],
      changeStatus: ChangeStatus.NEW,
    }));
    
    setAllCases(newCases);
    setSelectedCase(null);
  }, []);

  const value: CaseContextValue = {
    selectedCase,
    allCases,
    selectCase,
    createCase,
    updateCase,
    deleteCase,
    assignEntitiesToCase,
    removeEntitiesFromCase,
    suggestCases,
    isEntityInCase,
    detectCommunitiesAndCreateCases,
  };

  return <CaseContext.Provider value={value}>{children}</CaseContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useCaseContext = () => {
  const context = useContext(CaseContext);
  if (context === undefined) {
    throw new Error('useCaseContext must be used within a CaseProvider');
  }
  return context;
};

export type { CaseSuggestion };

