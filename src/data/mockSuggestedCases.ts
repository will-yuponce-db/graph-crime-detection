// Mock AI-suggested cases based on graph patterns
import type { CaseSuggestion } from '../contexts/CaseContext';
import { CasePriority } from '../types/case';

export const mockSuggestedCases: CaseSuggestion[] = [
  {
    id: 'suggestion_001',
    name: 'Suspected Money Laundering Ring',
    description:
      'AI detected a cluster of 8 entities with unusual financial transaction patterns involving Viktor Petrov, offshore accounts, and shell companies. High confidence of coordinated money laundering activity.',
    entityIds: [
      'suspect_002', // Viktor Petrov
      'suspect_007', // Isabella Romano
      'org_002', // Solntsevskaya Bratva
      'org_004', // Shadow Finance LLC
      'account_001', // Cayman Account
      'account_002', // Swiss Bank
      'account_004', // Panama Bank
      'asset_002', // Private Jet
    ],
    priority: CasePriority.HIGH,
    reasoning:
      'Pattern analysis shows frequent large transfers between these accounts with cryptocurrency mixing. Shell company ownership links all entities.',
  },
  {
    id: 'suggestion_002',
    name: 'Drug Distribution Network',
    description:
      'Community detection algorithm identified a tightly connected group of entities involved in drug trafficking operations between Mexico, Hong Kong, and the US.',
    entityIds: [
      'suspect_001', // Miguel Sandoval
      'suspect_004', // Chen Wei
      'suspect_005', // James Thompson
      'org_001', // Sinaloa Cartel
      'org_003', // Los Hermanos Network
      'location_001', // Safe House - Tijuana
      'location_002', // Warehouse - Los Angeles
      'location_004', // Port Facility - Hong Kong
      'event_003', // Shipment - Hong Kong
    ],
    priority: CasePriority.CRITICAL,
    reasoning:
      'High frequency of communications and logistics coordination detected. Recent shipment intercept intelligence corroborates network activity.',
  },
  {
    id: 'suggestion_003',
    name: 'Arms Trafficking Investigation',
    description:
      'Link analysis reveals potential arms trafficking network connecting Middle Eastern dealer with South American cartels.',
    entityIds: [
      'suspect_006', // Ahmed Hassan
      'suspect_001', // Miguel Sandoval
      'org_001', // Sinaloa Cartel
    ],
    priority: CasePriority.HIGH,
    reasoning:
      'Communications intercepts show weapons discussions. Financial transactions match typical arms deal patterns.',
  },
  {
    id: 'suggestion_004',
    name: 'Cryptocurrency Laundering Cell',
    description:
      'Blockchain analysis identified a new cryptocurrency laundering operation potentially connected to existing cases.',
    entityIds: [
      'suspect_008', // David Park
      'suspect_003', // Maria Santos
      'account_003', // Cryptocurrency Wallet
      'account_004', // Panama Account
    ],
    priority: CasePriority.MEDIUM,
    reasoning:
      'Multiple cryptocurrency tumbling operations detected. Wallet analysis shows connection to known cartel financial coordinator.',
  },
];
