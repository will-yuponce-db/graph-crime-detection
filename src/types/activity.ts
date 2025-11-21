// Type definitions for activity map and timeline visualization
import type { ChangeStatus } from './graph';

export const ActivityType = {
  MEETING: 'Meeting',
  TRANSACTION: 'Transaction',
  SHIPMENT: 'Shipment',
  COMMUNICATION: 'Communication',
  SURVEILLANCE: 'Surveillance',
  TRAVEL: 'Travel',
  OTHER: 'Other',
} as const;

export type ActivityType = (typeof ActivityType)[keyof typeof ActivityType];

export interface Activity {
  id: string;
  type: ActivityType;
  date: Date;
  title: string;
  description: string;
  status: ChangeStatus;
  properties: {
    [key: string]: string | number | boolean | null;
  };
  // Related entities
  relatedNodeIds: string[];
  relatedNodeLabels: string[];
  location?: {
    id: string;
    label: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
    address?: string;
  };
  threatLevel?: string;
  classification?: string;
  source?: string;
}

export interface TimelineGroup {
  date: string; // YYYY-MM-DD format
  activities: Activity[];
}

export interface MapMarker {
  id: string;
  position: {
    lat: number;
    lng: number;
  };
  label: string;
  locationType: string;
  activities: Activity[];
  status: ChangeStatus;
  properties: {
    [key: string]: string | number | boolean | null;
  };
}

export interface ActivityFilters {
  dateRange: {
    start: Date | null;
    end: Date | null;
  };
  activityTypes: ActivityType[];
  showProposed: boolean;
  threatLevels: string[];
  locationTypes: string[];
}

export interface ActivityStats {
  totalActivities: number;
  newActivities: number;
  existingActivities: number;
  activitiesByType: {
    [key in ActivityType]?: number;
  };
  activitiesByMonth: {
    [key: string]: number; // YYYY-MM format
  };
  uniqueLocations: number;
}



