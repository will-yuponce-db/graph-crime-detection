// Mock case data for development
import type { Case } from '../types/case';
import { CaseStatus, CasePriority } from '../types/case';
import { ChangeStatus } from '../types/graph';

export const mockCases: Case[] = [
  {
    id: 'case_001',
    caseNumber: 'CASE-2024-001',
    name: 'Operation El Lobo',
    description: 'Investigation into Miguel Sandoval (El Lobo) and the Sinaloa Cartel operations in North America. Focus on drug trafficking routes and money laundering schemes.',
    status: CaseStatus.ACTIVE_INVESTIGATION,
    priority: CasePriority.CRITICAL,
    createdDate: new Date('2024-01-15'),
    updatedDate: new Date('2024-11-15'),
    targetDate: new Date('2025-03-01'),
    assignedAgents: ['Agent Rodriguez', 'Agent Chen', 'Agent Thompson'],
    leadAgent: 'Agent Rodriguez',
    classification: 'SECRET',
    entityIds: [
      'suspect_001', // Miguel Sandoval
      'suspect_005', // James Thompson
      'org_001', // Sinaloa Cartel
      'org_003', // Los Hermanos Network
      'location_001', // Safe House - Tijuana
      'location_002', // Warehouse - Los Angeles
      'event_001', // Meeting - Tijuana
      'asset_001', // Yacht - Sea Wolf
    ],
    documents: [
      {
        id: 'doc_001',
        title: 'Surveillance Report - Tijuana Safe House',
        type: 'pdf',
        url: 'https://www.justice.gov/opa/press-release/file/1234567/download',
        summary: 'Detailed surveillance report of activities at the Tijuana safe house over 6-month period',
        tags: ['surveillance', 'evidence', 'cartel'],
      },
      {
        id: 'doc_002',
        title: 'Financial Transaction Analysis',
        type: 'pdf',
        url: 'https://www.justice.gov/opa/press-release/file/1234568/download',
        summary: 'Analysis of wire transfers and cryptocurrency transactions linked to the Sinaloa Cartel',
        tags: ['financial', 'money-laundering'],
      },
    ],
    tags: ['drug-trafficking', 'money-laundering', 'cartel', 'high-priority'],
    notes: 'Primary target: Dismantle distribution network in Southern California. Key evidence gathered from surveillance at Tijuana safe house.',
    changeStatus: ChangeStatus.EXISTING,
  },
  {
    id: 'case_002',
    caseNumber: 'CASE-2024-002',
    name: 'Red Square Financial Network',
    description: 'Investigation into Viktor Petrov (The Banker) and Solntsevskaya Bratva money laundering operations through shell companies and offshore accounts.',
    status: CaseStatus.ACTIVE_INVESTIGATION,
    priority: CasePriority.HIGH,
    createdDate: new Date('2024-03-10'),
    updatedDate: new Date('2024-11-16'),
    targetDate: new Date('2025-06-30'),
    assignedAgents: ['Agent Williams', 'Agent Park', 'Agent Romano'],
    leadAgent: 'Agent Williams',
    classification: 'SECRET',
    entityIds: [
      'suspect_002', // Viktor Petrov
      'suspect_007', // Isabella Romano
      'org_002', // Solntsevskaya Bratva
      'org_004', // Shadow Finance LLC
      'location_003', // Office - Moscow
      'account_001', // Account - Cayman Islands
      'account_002', // Account - Swiss Bank
      'account_004', // Account - Panama Bank
      'asset_002', // Aircraft - N847GT
      'asset_003', // Property - Villa Napoli
    ],
    documents: [
      {
        id: 'doc_003',
        title: 'Shell Company Network Diagram',
        type: 'pdf',
        url: 'https://www.justice.gov/opa/press-release/file/1234569/download',
        summary: 'Visual diagram of interconnected shell companies and offshore accounts',
        tags: ['financial', 'organized-crime'],
      },
      {
        id: 'doc_004',
        title: 'DOJ Press Release - Solntsevskaya Bratva Investigation',
        type: 'url',
        url: 'https://www.justice.gov/opa/pr/russian-organized-crime-figure-charged',
        summary: 'Official Department of Justice press release announcing the investigation',
        tags: ['press-release', 'public-record'],
      },
      {
        id: 'doc_005',
        title: 'Cryptocurrency Wallet Analysis',
        type: 'pdf',
        url: 'https://www.justice.gov/opa/press-release/file/1234570/download',
        summary: 'Blockchain analysis tracking fund movements through multiple cryptocurrency wallets',
        tags: ['cryptocurrency', 'blockchain', 'evidence'],
      },
    ],
    tags: ['money-laundering', 'organized-crime', 'cybercrime', 'international'],
    notes: 'Focus on tracing cryptocurrency transactions and identifying beneficial owners of shell companies.',
    changeStatus: ChangeStatus.EXISTING,
  },
  {
    id: 'case_003',
    caseNumber: 'CASE-2024-003',
    name: 'Cross-Pacific Logistics',
    description: 'Investigation into Chen Wei\'s logistics coordination between Asian and American criminal networks. Suspected drug and weapons smuggling through commercial shipping.',
    status: CaseStatus.LEADS,
    priority: CasePriority.MEDIUM,
    createdDate: new Date('2024-10-01'),
    updatedDate: new Date('2024-11-10'),
    assignedAgents: ['Agent Liu', 'Agent Martinez'],
    leadAgent: 'Agent Liu',
    classification: 'CONFIDENTIAL',
    entityIds: [
      'suspect_004', // Chen Wei
      'location_004', // Port Facility - Hong Kong
      'event_003', // Shipment - Hong Kong
    ],
    tags: ['smuggling', 'logistics', 'ports', 'asia-pacific'],
    notes: 'Early stage investigation. Monitoring port activity and building case for search warrant.',
    changeStatus: ChangeStatus.EXISTING,
  },
  {
    id: 'case_004',
    caseNumber: 'CASE-2024-004',
    name: 'Arms Dealer Network',
    description: 'Investigation into Ahmed Hassan and illegal weapons trafficking to criminal organizations in the Americas.',
    status: CaseStatus.PROSECUTION,
    priority: CasePriority.HIGH,
    createdDate: new Date('2023-08-20'),
    updatedDate: new Date('2024-11-01'),
    closedDate: undefined,
    assignedAgents: ['Agent Hassan', 'Agent Cooper'],
    leadAgent: 'Agent Hassan',
    classification: 'SECRET',
    entityIds: [
      'suspect_006', // Ahmed Hassan
      'suspect_001', // Miguel Sandoval (connected)
    ],
    tags: ['weapons-trafficking', 'arms-dealer', 'prosecution'],
    notes: 'Case handed over to prosecutors. Grand jury indictment expected in December 2024.',
    changeStatus: ChangeStatus.EXISTING,
  },
  {
    id: 'case_005',
    caseNumber: 'CASE-2024-005',
    name: 'Cryptocurrency Laundering Investigation',
    description: 'New lead on cryptocurrency expert David Park potentially facilitating money laundering for Los Hermanos Network.',
    status: CaseStatus.LEADS,
    priority: CasePriority.LOW,
    createdDate: new Date('2024-11-05'),
    updatedDate: new Date('2024-11-16'),
    assignedAgents: ['Agent Park'],
    leadAgent: 'Agent Park',
    classification: 'CONFIDENTIAL',
    entityIds: [
      'suspect_008', // David Park
      'suspect_003', // Maria Santos
      'account_003', // Cryptocurrency Wallet
    ],
    tags: ['cryptocurrency', 'blockchain', 'new-lead'],
    notes: 'Initial intelligence from financial monitoring. Need to establish probable cause before proceeding.',
    changeStatus: ChangeStatus.NEW,
  },
  {
    id: 'case_006',
    caseNumber: 'CASE-2023-042',
    name: 'Operation Clean Sweep',
    description: 'Successfully dismantled a major drug distribution network in the Pacific Northwest.',
    status: CaseStatus.CLOSED,
    priority: CasePriority.MEDIUM,
    createdDate: new Date('2023-02-15'),
    updatedDate: new Date('2024-05-20'),
    closedDate: new Date('2024-05-20'),
    assignedAgents: ['Agent Rodriguez', 'Agent Smith'],
    leadAgent: 'Agent Rodriguez',
    classification: 'SECRET',
    entityIds: [],
    tags: ['closed', 'successful', 'drug-trafficking'],
    notes: 'Case successfully closed. 12 arrests made, $4.5M in assets seized. All defendants convicted.',
    changeStatus: ChangeStatus.EXISTING,
  },
];

// Helper function to get case statistics
export const getCaseStats = (cases: Case[]) => {
  const stats = {
    totalCases: cases.length,
    casesByStatus: {} as { [key: string]: number },
    casesByPriority: {} as { [key: string]: number },
    activeCases: 0,
    closedCases: 0,
  };

  cases.forEach((c) => {
    stats.casesByStatus[c.status] = (stats.casesByStatus[c.status] || 0) + 1;
    stats.casesByPriority[c.priority] = (stats.casesByPriority[c.priority] || 0) + 1;
    
    if (c.status === CaseStatus.CLOSED) {
      stats.closedCases++;
    } else {
      stats.activeCases++;
    }
  });

  return stats;
};


