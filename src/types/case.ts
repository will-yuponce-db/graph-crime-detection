// Type definitions for case management
import type { ChangeStatus } from './graph';

export const CaseStatus = {
  PENDING_APPROVAL: 'Pending Approval', // AI-detected cases awaiting approval
  LEADS: 'Leads',
  ACTIVE_INVESTIGATION: 'Active Investigation',
  PROSECUTION: 'Prosecution',
  CLOSED: 'Closed',
} as const;

export type CaseStatus = (typeof CaseStatus)[keyof typeof CaseStatus];

export const CasePriority = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
} as const;

export type CasePriority = (typeof CasePriority)[keyof typeof CasePriority];

export interface CaseDocument {
  id: string;
  title: string; // Changed from 'name' to match backend schema
  type: 'pdf' | 'image' | 'text' | 'url' | 'other';
  url?: string;
  path?: string;
  sourceNodeId?: string; // Node that referenced this document
  date?: string; // Changed from uploadedDate to match backend
  size?: number;
  summary?: string; // Changed from description to match backend
  tags?: string[];
}

export interface Case {
  id: string;
  name: string;
  description: string;
  status: CaseStatus;
  priority: CasePriority;
  createdDate: Date;
  updatedDate: Date;
  targetDate?: Date;
  closedDate?: Date;
  assignedAgents: string[]; // Array of agent names
  leadAgent?: string;
  classification: string; // e.g., "SECRET", "TOP SECRET"
  caseNumber: string; // e.g., "CASE-2024-001"
  
  // Related entities
  entityIds: string[]; // IDs of nodes (suspects, orgs, locations, etc.) assigned to this case
  
  // Documents
  documents: CaseDocument[]; // Associated documents
  
  // Metadata
  tags: string[];
  notes?: string;
  changeStatus: ChangeStatus; // For tracking if case is new/modified
}

export interface CaseStats {
  totalCases: number;
  casesByStatus: {
    [key in CaseStatus]?: number;
  };
  casesByPriority: {
    [key in CasePriority]?: number;
  };
  activeCases: number;
  closedCases: number;
}

export interface CreateCaseInput {
  name: string;
  description: string;
  priority: CasePriority;
  leadAgent?: string;
  assignedAgents?: string[];
  classification: string;
  tags?: string[];
  notes?: string;
  entityIds?: string[];
  documents?: CaseDocument[];
}

export interface UpdateCaseInput {
  name?: string;
  description?: string;
  status?: CaseStatus;
  priority?: CasePriority;
  leadAgent?: string;
  assignedAgents?: string[];
  targetDate?: Date;
  tags?: string[];
  notes?: string;
  documents?: CaseDocument[];
}


