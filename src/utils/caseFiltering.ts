// Utility functions to filter graph data, activities, and map markers by case
import type { GraphData, GraphNode } from '../types/graph';
import type { Activity, MapMarker } from '../types/activity';
import type { Case } from '../types/case';

/**
 * Filter graph nodes to only include entities assigned to a case
 * Also includes directly connected nodes for context
 */
export function filterGraphByCase(
  graphData: GraphData,
  selectedCase: Case | null,
  includeConnections: boolean = true
): GraphData {
  // If no case selected, return all data
  if (!selectedCase) {
    return graphData;
  }

  const caseEntityIds = new Set(selectedCase.entityIds);
  
  // Get all nodes that are in the case
  const caseNodes = graphData.nodes.filter((node) => caseEntityIds.has(node.id));
  
  // Get edges where at least one end is in the case
  const relevantEdges = graphData.edges.filter(
    (edge) => caseEntityIds.has(edge.source) || caseEntityIds.has(edge.target)
  );
  
  if (!includeConnections) {
    // Only return nodes directly in the case
    return {
      nodes: caseNodes,
      edges: relevantEdges.filter(
        (edge) => caseEntityIds.has(edge.source) && caseEntityIds.has(edge.target)
      ),
    };
  }
  
  // Include connected nodes (1-hop neighbors) for context
  const connectedNodeIds = new Set<string>();
  relevantEdges.forEach((edge) => {
    if (caseEntityIds.has(edge.source)) {
      connectedNodeIds.add(edge.target);
    }
    if (caseEntityIds.has(edge.target)) {
      connectedNodeIds.add(edge.source);
    }
  });
  
  // Combine case nodes and connected nodes
  const allRelevantNodeIds = new Set([...caseEntityIds, ...connectedNodeIds]);
  const filteredNodes = graphData.nodes.filter((node) => allRelevantNodeIds.has(node.id));
  
  return {
    nodes: filteredNodes,
    edges: relevantEdges,
  };
}

/**
 * Filter activities to only include those related to case entities
 */
export function filterActivitiesByCase(
  activities: Activity[],
  selectedCase: Case | null
): Activity[] {
  // If no case selected, return all activities
  if (!selectedCase) {
    return activities;
  }

  const caseEntityIds = new Set(selectedCase.entityIds);
  
  // Include activities where at least one related entity is in the case
  return activities.filter((activity) =>
    activity.relatedNodeIds.some((id) => caseEntityIds.has(id))
  );
}

/**
 * Filter map markers to only include locations related to case
 */
export function filterMarkersByCase(
  markers: MapMarker[],
  selectedCase: Case | null
): MapMarker[] {
  // If no case selected, return all markers
  if (!selectedCase) {
    return markers;
  }

  const caseEntityIds = new Set(selectedCase.entityIds);
  
  // Include markers that are case locations or have case-related activities
  return markers.filter((marker) => {
    // Check if the location itself is in the case
    if (caseEntityIds.has(marker.id)) {
      return true;
    }
    
    // Check if any activities at this location involve case entities
    return marker.activities.some((activity) =>
      activity.relatedNodeIds.some((id) => caseEntityIds.has(id))
    );
  });
}

/**
 * Get entities that are in the case
 */
export function getCaseEntities(
  graphData: GraphData,
  selectedCase: Case | null
): GraphNode[] {
  if (!selectedCase) {
    return [];
  }

  const caseEntityIds = new Set(selectedCase.entityIds);
  return graphData.nodes.filter((node) => caseEntityIds.has(node.id));
}

/**
 * Get entities connected to case but not in the case
 */
export function getConnectedEntities(
  graphData: GraphData,
  selectedCase: Case | null
): GraphNode[] {
  if (!selectedCase) {
    return [];
  }

  const caseEntityIds = new Set(selectedCase.entityIds);
  const connectedIds = new Set<string>();
  
  // Find all edges where one end is in the case
  graphData.edges.forEach((edge) => {
    if (caseEntityIds.has(edge.source) && !caseEntityIds.has(edge.target)) {
      connectedIds.add(edge.target);
    }
    if (caseEntityIds.has(edge.target) && !caseEntityIds.has(edge.source)) {
      connectedIds.add(edge.source);
    }
  });
  
  return graphData.nodes.filter((node) => connectedIds.has(node.id));
}

/**
 * Check if a node should be highlighted as part of the case
 */
export function isNodeInCase(nodeId: string, selectedCase: Case | null): boolean {
  if (!selectedCase) {
    return false;
  }
  return selectedCase.entityIds.includes(nodeId);
}

/**
 * Get statistics about the filtered data
 */
export function getCaseFilterStats(
  graphData: GraphData,
  activities: Activity[],
  markers: MapMarker[],
  selectedCase: Case | null
) {
  if (!selectedCase) {
    return {
      totalEntities: graphData.nodes.length,
      caseEntities: 0,
      connectedEntities: 0,
      totalActivities: activities.length,
      caseActivities: 0,
      totalLocations: markers.length,
      caseLocations: 0,
    };
  }

  const filteredGraph = filterGraphByCase(graphData, selectedCase, true);
  const filteredActivities = filterActivitiesByCase(activities, selectedCase);
  const filteredMarkers = filterMarkersByCase(markers, selectedCase);
  const caseEntities = getCaseEntities(graphData, selectedCase);
  const connectedEntities = getConnectedEntities(graphData, selectedCase);

  return {
    totalEntities: graphData.nodes.length,
    caseEntities: caseEntities.length,
    connectedEntities: connectedEntities.length,
    filteredEntities: filteredGraph.nodes.length,
    totalActivities: activities.length,
    caseActivities: filteredActivities.length,
    totalLocations: markers.length,
    caseLocations: filteredMarkers.length,
  };
}

