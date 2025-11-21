// Utility functions to extract activities from graph data
import type { GraphData, GraphNode, GraphEdge } from '../types/graph';
import type {
  Activity,
  ActivityType,
  TimelineGroup,
  MapMarker,
  ActivityStats,
} from '../types/activity';
import { ChangeStatus } from '../types/graph';
import { ActivityType as ActivityTypeEnum } from '../types/activity';

/**
 * Parse a date string from various formats
 */
function parseDate(dateStr: string | number | boolean | null | undefined): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;

  try {
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

/**
 * Parse coordinates from a string like "32.5149°N, 117.0382°W"
 */
function parseCoordinates(
  coordStr: string | number | boolean | null | undefined
): { lat: number; lng: number } | undefined {
  if (!coordStr || typeof coordStr !== 'string') return undefined;

  try {
    // Match patterns like "32.5149°N, 117.0382°W" or "32.5149, -117.0382"
    const match = coordStr.match(/([-+]?\d+\.?\d*)°?[NS]?,?\s*([-+]?\d+\.?\d*)°?[EW]?/i);
    if (!match) return undefined;

    let lat = parseFloat(match[1]);
    let lng = parseFloat(match[2]);

    // Handle N/S and E/W indicators
    if (coordStr.includes('S')) lat = -Math.abs(lat);
    if (coordStr.includes('W')) lng = -Math.abs(lng);

    if (isNaN(lat) || isNaN(lng)) return undefined;

    return { lat, lng };
  } catch {
    return undefined;
  }
}

/**
 * Determine activity type from event or edge properties
 */
function determineActivityType(node?: GraphNode, edge?: GraphEdge): ActivityType {
  const eventType = node?.properties?.event_type as string | undefined;
  const relationshipType = edge?.relationshipType;

  if (eventType) {
    if (eventType.toLowerCase().includes('meeting')) return ActivityTypeEnum.MEETING;
    if (eventType.toLowerCase().includes('transaction')) return ActivityTypeEnum.TRANSACTION;
    if (eventType.toLowerCase().includes('shipment')) return ActivityTypeEnum.SHIPMENT;
    if (eventType.toLowerCase().includes('surveillance')) return ActivityTypeEnum.SURVEILLANCE;
    if (eventType.toLowerCase().includes('travel')) return ActivityTypeEnum.TRAVEL;
  }

  if (relationshipType) {
    if (relationshipType.includes('COMMUNICATED')) return ActivityTypeEnum.COMMUNICATION;
    if (relationshipType.includes('TRANSFERRED_FUNDS')) return ActivityTypeEnum.TRANSACTION;
    if (relationshipType.includes('ATTENDED')) return ActivityTypeEnum.MEETING;
  }

  return ActivityTypeEnum.OTHER;
}

/**
 * Extract activities from Event nodes
 */
function extractEventActivities(data: GraphData): Activity[] {
  const activities: Activity[] = [];

  // Find all Event nodes
  const eventNodes = data.nodes.filter((node) => node.type === 'Event');

  for (const event of eventNodes) {
    const date = parseDate(event.properties.date);
    if (!date) continue;

    const activityType = determineActivityType(event);

    // Find related nodes through edges
    const relatedEdges = data.edges.filter(
      (edge) => edge.source === event.id || edge.target === event.id
    );

    const relatedNodeIds: string[] = [];
    const relatedNodeLabels: string[] = [];
    let location: Activity['location'] = undefined;

    for (const edge of relatedEdges) {
      const otherNodeId = edge.source === event.id ? edge.target : edge.source;
      const otherNode = data.nodes.find((n) => n.id === otherNodeId);

      if (otherNode) {
        relatedNodeIds.push(otherNode.id);
        relatedNodeLabels.push(otherNode.label);

        // If related to a location, extract coordinates
        if (otherNode.type === 'Location' && !location) {
          const coordinates = parseCoordinates(otherNode.properties.coordinates);
          location = {
            id: otherNode.id,
            label: otherNode.label,
            coordinates,
            address: otherNode.properties.address as string | undefined,
          };
        }
      }
    }

    // Check if event properties reference a location
    if (!location && event.properties.location) {
      const locationStr = event.properties.location as string;
      const locationNode = data.nodes.find(
        (n) =>
          n.type === 'Location' &&
          (n.label.toLowerCase().includes(locationStr.toLowerCase()) ||
            (n.properties.address as string)?.toLowerCase().includes(locationStr.toLowerCase()))
      );

      if (locationNode) {
        const coordinates = parseCoordinates(locationNode.properties.coordinates);
        location = {
          id: locationNode.id,
          label: locationNode.label,
          coordinates,
          address: locationNode.properties.address as string | undefined,
        };
        relatedNodeIds.push(locationNode.id);
        relatedNodeLabels.push(locationNode.label);
      }
    }

    activities.push({
      id: event.id,
      type: activityType,
      date,
      title: event.label,
      description: (event.properties.event_type as string) || 'Event',
      status: event.status,
      properties: event.properties,
      relatedNodeIds,
      relatedNodeLabels,
      location,
      threatLevel: event.properties.threat_level as string | undefined,
      classification: event.properties.classification as string | undefined,
      source: event.properties.source as string | undefined,
    });
  }

  return activities;
}

/**
 * Extract communication activities from edges
 */
function extractCommunicationActivities(data: GraphData): Activity[] {
  const activities: Activity[] = [];

  const commEdges = data.edges.filter((edge) => edge.relationshipType === 'COMMUNICATED_WITH');

  for (const edge of commEdges) {
    // Try to get date from edge properties
    const lastContact = parseDate(edge.properties.last_contact);
    if (!lastContact) continue;

    const sourceNode = data.nodes.find((n) => n.id === edge.source);
    const targetNode = data.nodes.find((n) => n.id === edge.target);

    if (!sourceNode || !targetNode) continue;

    activities.push({
      id: edge.id,
      type: ActivityTypeEnum.COMMUNICATION,
      date: lastContact,
      title: `Communication: ${sourceNode.label} ↔ ${targetNode.label}`,
      description: `${edge.properties.method || 'Communication'} - ${edge.properties.frequency || 'Unknown frequency'}`,
      status: edge.status,
      properties: edge.properties,
      relatedNodeIds: [edge.source, edge.target],
      relatedNodeLabels: [sourceNode.label, targetNode.label],
      threatLevel: sourceNode.properties.threat_level as string | undefined,
      classification: edge.properties.classification as string | undefined,
      source: edge.properties.source as string | undefined,
    });
  }

  return activities;
}

/**
 * Extract financial transaction activities from edges
 */
function extractTransactionActivities(data: GraphData): Activity[] {
  const activities: Activity[] = [];

  const transactionEdges = data.edges.filter(
    (edge) => edge.relationshipType === 'TRANSFERRED_FUNDS_TO'
  );

  for (const edge of transactionEdges) {
    const lastTransaction = parseDate(edge.properties.last_transaction);
    if (!lastTransaction) continue;

    const sourceNode = data.nodes.find((n) => n.id === edge.source);
    const targetNode = data.nodes.find((n) => n.id === edge.target);

    if (!sourceNode || !targetNode) continue;

    const amount = edge.properties.total_amount || edge.properties.amount || 'Unknown amount';

    activities.push({
      id: edge.id,
      type: ActivityTypeEnum.TRANSACTION,
      date: lastTransaction,
      title: `Transaction: ${sourceNode.label} → ${targetNode.label}`,
      description: `${amount} transferred`,
      status: edge.status,
      properties: edge.properties,
      relatedNodeIds: [edge.source, edge.target],
      relatedNodeLabels: [sourceNode.label, targetNode.label],
      classification: edge.properties.classification as string | undefined,
      source: edge.properties.source as string | undefined,
    });
  }

  return activities;
}

/**
 * Extract all activities from graph data
 */
export function extractActivities(data: GraphData): Activity[] {
  const eventActivities = extractEventActivities(data);
  const commActivities = extractCommunicationActivities(data);
  const transactionActivities = extractTransactionActivities(data);

  // Combine and sort by date (newest first)
  const allActivities = [...eventActivities, ...commActivities, ...transactionActivities];
  allActivities.sort((a, b) => b.date.getTime() - a.date.getTime());

  return allActivities;
}

/**
 * Group activities by date for timeline display
 */
export function groupActivitiesByDate(activities: Activity[]): TimelineGroup[] {
  const groups = new Map<string, Activity[]>();

  for (const activity of activities) {
    const dateKey = activity.date.toISOString().split('T')[0]; // YYYY-MM-DD
    const existing = groups.get(dateKey) || [];
    existing.push(activity);
    groups.set(dateKey, existing);
  }

  // Convert to array and sort by date (newest first)
  const result: TimelineGroup[] = Array.from(groups.entries()).map(([date, activities]) => ({
    date,
    activities: activities.sort((a, b) => b.date.getTime() - a.date.getTime()),
  }));

  result.sort((a, b) => b.date.localeCompare(a.date));

  return result;
}

/**
 * Extract map markers from location nodes with activities
 */
export function extractMapMarkers(data: GraphData, activities: Activity[]): MapMarker[] {
  const markers: MapMarker[] = [];

  // Find all locations with coordinates
  const locationNodes = data.nodes.filter(
    (node) => node.type === 'Location' && node.properties.coordinates
  );

  for (const location of locationNodes) {
    const coordinates = parseCoordinates(location.properties.coordinates);
    if (!coordinates) continue;

    // Find activities related to this location
    const relatedActivities = activities.filter(
      (activity) => activity.location?.id === location.id
    );

    markers.push({
      id: location.id,
      position: coordinates,
      label: location.label,
      locationType: (location.properties.location_type as string) || 'Unknown',
      activities: relatedActivities,
      status: location.status,
      properties: location.properties,
    });
  }

  return markers;
}

/**
 * Calculate statistics from activities
 */
export function calculateActivityStats(activities: Activity[]): ActivityStats {
  const stats: ActivityStats = {
    totalActivities: activities.length,
    newActivities: activities.filter((a) => a.status === ChangeStatus.NEW).length,
    existingActivities: activities.filter((a) => a.status === ChangeStatus.EXISTING).length,
    activitiesByType: {},
    activitiesByMonth: {},
    uniqueLocations: 0,
  };

  // Count by type
  for (const activity of activities) {
    stats.activitiesByType[activity.type] = (stats.activitiesByType[activity.type] || 0) + 1;
  }

  // Count by month
  for (const activity of activities) {
    const monthKey = `${activity.date.getFullYear()}-${String(activity.date.getMonth() + 1).padStart(2, '0')}`;
    stats.activitiesByMonth[monthKey] = (stats.activitiesByMonth[monthKey] || 0) + 1;
  }

  // Count unique locations
  const uniqueLocationIds = new Set(
    activities.filter((a) => a.location?.id).map((a) => a.location!.id)
  );
  stats.uniqueLocations = uniqueLocationIds.size;

  return stats;
}

/**
 * Filter activities based on criteria
 */
export function filterActivities(
  activities: Activity[],
  filters: {
    dateRange?: { start: Date | null; end: Date | null };
    activityTypes?: ActivityType[];
    showProposed?: boolean;
    threatLevels?: string[];
  }
): Activity[] {
  return activities.filter((activity) => {
    // Date range filter
    if (filters.dateRange?.start && activity.date < filters.dateRange.start) {
      return false;
    }
    if (filters.dateRange?.end && activity.date > filters.dateRange.end) {
      return false;
    }

    // Activity type filter
    if (filters.activityTypes && filters.activityTypes.length > 0) {
      if (!filters.activityTypes.includes(activity.type)) {
        return false;
      }
    }

    // Status filter (proposed vs existing)
    if (filters.showProposed === false && activity.status === ChangeStatus.NEW) {
      return false;
    }

    // Threat level filter
    if (filters.threatLevels && filters.threatLevels.length > 0) {
      if (!activity.threatLevel || !filters.threatLevels.includes(activity.threatLevel)) {
        return false;
      }
    }

    return true;
  });
}
