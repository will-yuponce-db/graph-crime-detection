// Community detection using Louvain algorithm
import Graph from 'graphology';
import type { GraphData, GraphNode } from '../types/graph';
import type { CreateCaseInput, CaseDocument } from '../types/case';
import { CasePriority } from '../types/case';

export interface Community {
  id: string;
  nodeIds: string[];
  modularity: number;
  size: number;
  nodeTypes: Record<string, number>;
  hasHighThreat: boolean;
}

/**
 * Simple Louvain-inspired community detection
 * Groups nodes that are densely connected to each other
 */
export function detectCommunities(graphData: GraphData): Community[] {
  // Build graphology graph
  const graph = new Graph({ type: 'undirected' });
  
  // Add all nodes
  graphData.nodes.forEach((node) => {
    graph.addNode(node.id, {
      label: node.label,
      type: node.type,
      properties: node.properties,
    });
  });
  
  // Add all edges (undirected for community detection)
  graphData.edges.forEach((edge) => {
    if (!graph.hasEdge(edge.source, edge.target)) {
      graph.addEdge(edge.source, edge.target, {
        relationshipType: edge.relationshipType,
        weight: 1,
      });
    }
  });
  
  // Simple community detection: connected components + modularity optimization
  const communities = new Map<string, string[]>();
  const nodeToComm = new Map<string, string>();
  
  // Phase 1: Assign each node to its own community
  graph.forEachNode((node) => {
    nodeToComm.set(node, node);
    communities.set(node, [node]);
  });
  
  // Phase 2: Iteratively move nodes to neighboring communities if it improves modularity
  let improved = true;
  let iteration = 0;
  const maxIterations = 10;
  
  while (improved && iteration < maxIterations) {
    improved = false;
    iteration++;
    
    graph.forEachNode((node) => {
      const currentCommunity = nodeToComm.get(node)!;
      
      // Find best community among neighbors
      const neighborCommunities = new Map<string, number>();
      
      graph.forEachNeighbor(node, (neighbor) => {
        const neighborComm = nodeToComm.get(neighbor)!;
        neighborCommunities.set(neighborComm, (neighborCommunities.get(neighborComm) || 0) + 1);
      });
      
      // Find community with most connections
      let bestCommunity = currentCommunity;
      let bestScore = neighborCommunities.get(currentCommunity) || 0;
      
      neighborCommunities.forEach((score, comm) => {
        if (score > bestScore) {
          bestScore = score;
          bestCommunity = comm;
        }
      });
      
      // Move node if beneficial
      if (bestCommunity !== currentCommunity) {
        // Remove from old community
        const oldComm = communities.get(currentCommunity)!;
        communities.set(
          currentCommunity,
          oldComm.filter((n) => n !== node)
        );
        
        // Add to new community
        if (!communities.has(bestCommunity)) {
          communities.set(bestCommunity, []);
        }
        communities.get(bestCommunity)!.push(node);
        nodeToComm.set(node, bestCommunity);
        
        improved = true;
      }
    });
  }
  
  // Convert to Community objects
  const result: Community[] = [];
  let communityIndex = 0;
  
  communities.forEach((nodeIds) => {
    if (nodeIds.length === 0) return;
    
    // Get node types in this community
    const nodeTypes: Record<string, number> = {};
    let hasHighThreat = false;
    
    nodeIds.forEach((nodeId) => {
      const nodeData = graph.getNodeAttributes(nodeId);
      const type = nodeData.type || 'Unknown';
      nodeTypes[type] = (nodeTypes[type] || 0) + 1;
      
      if (nodeData.properties?.threat_level === 'Critical' || nodeData.properties?.threat_level === 'High') {
        hasHighThreat = true;
      }
    });
    
    // Calculate modularity (simplified)
    const internalEdges = nodeIds.reduce((count, nodeId) => {
      return (
        count +
        graph.reduceNeighbors(
          nodeId,
          (acc, neighbor) => (nodeIds.includes(neighbor) ? acc + 1 : acc),
          0
        )
      );
    }, 0);
    
    const modularity = internalEdges / (nodeIds.length * (nodeIds.length - 1) || 1);
    
    result.push({
      id: `community_${communityIndex++}`,
      nodeIds,
      modularity,
      size: nodeIds.length,
      nodeTypes,
      hasHighThreat,
    });
  });
  
  // Filter out single-node communities and sort by size
  return result
    .filter((c) => c.size > 1)
    .sort((a, b) => b.size - a.size);
}

/**
 * Extract document references from node properties and connected document nodes
 */
function extractDocumentsFromNodes(
  nodeIds: string[],
  graphData: GraphData
): CaseDocument[] {
  const documents: CaseDocument[] = [];
  const seenDocuments = new Set<string>();
  const nodeIdSet = new Set(nodeIds);
  
  // Phase 1: Extract documents from node properties
  nodeIds.forEach((nodeId) => {
    const node = graphData.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    
    const props = node.properties;
    
    // Look for document references in various property fields
    const documentFields = [
      'document',
      'documentUrl',
      'document_url',
      'sourceDocument',
      'source_document',
      'pdf',
      'pdfUrl',
      'pdf_url',
      'file',
      'fileUrl',
      'file_url',
      'url',
      'source',
      'reference',
    ];
    
    documentFields.forEach((field) => {
      const value = props[field];
      if (value && typeof value === 'string' && value.length > 0) {
        // Skip if already seen
        if (seenDocuments.has(value)) return;
        seenDocuments.add(value);
        
        // Determine document type from extension or URL
        let docType: CaseDocument['type'] = 'other';
        const lowerValue = value.toLowerCase();
        
        if (lowerValue.includes('.pdf') || lowerValue.includes('pdf')) {
          docType = 'pdf';
        } else if (lowerValue.match(/\.(jpg|jpeg|png|gif|webp)/)) {
          docType = 'image';
        } else if (lowerValue.match(/\.(txt|doc|docx)/)) {
          docType = 'text';
        } else if (lowerValue.startsWith('http')) {
          docType = 'url';
        }
        
        // Extract filename from path/URL
        const parts = value.split('/');
        const filename = parts[parts.length - 1] || value;
        
        documents.push({
          id: `doc_${nodeId}_${documents.length}`,
          title: filename, // Use title instead of name
          type: docType,
          url: value.startsWith('http') ? value : undefined,
          path: !value.startsWith('http') ? value : undefined,
          sourceNodeId: nodeId,
          date: new Date().toISOString(), // Use date instead of uploadedDate
          summary: `Auto-extracted from ${node.label} (${node.type})`, // Use summary instead of description
          tags: ['auto-detected', node.type],
        });
      }
    });
  });
  
  // Phase 2: Find document nodes connected to case entities via edges
  const connectedDocumentNodes = new Set<string>();
  
  // Find all edges where source or target is in our case nodes
  graphData.edges.forEach((edge) => {
    const sourceInCase = nodeIdSet.has(edge.source);
    const targetInCase = nodeIdSet.has(edge.target);
    
    // Check if the other end of the edge is a document node
    if (sourceInCase) {
      const targetNode = graphData.nodes.find((n) => n.id === edge.target);
      if (targetNode && isDocumentNode(targetNode)) {
        connectedDocumentNodes.add(edge.target);
      }
    }
    
    if (targetInCase) {
      const sourceNode = graphData.nodes.find((n) => n.id === edge.source);
      if (sourceNode && isDocumentNode(sourceNode)) {
        connectedDocumentNodes.add(edge.source);
      }
    }
  });
  
  // Convert document nodes to CaseDocument objects
  connectedDocumentNodes.forEach((docNodeId) => {
    const docNode = graphData.nodes.find((n) => n.id === docNodeId);
    if (!docNode || seenDocuments.has(docNodeId)) return;
    
    seenDocuments.add(docNodeId);
    
    const props = docNode.properties;
    
    // Determine document type
    let docType: CaseDocument['type'] = 'other';
    const nodeType = docNode.type.toLowerCase();
    const label = docNode.label.toLowerCase();
    
    if (nodeType.includes('pdf') || label.includes('.pdf')) {
      docType = 'pdf';
    } else if (nodeType.includes('image') || label.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
      docType = 'image';
    } else if (nodeType.includes('text') || nodeType.includes('document') || label.match(/\.(txt|doc|docx)$/)) {
      docType = 'text';
    } else if (props.url || props.documentUrl || props.document_url) {
      docType = 'url';
    }
    
    // Extract URL/path from properties
    const url = props.url || props.documentUrl || props.document_url || props.file_path || props.path;
    
    documents.push({
      id: docNodeId,
      title: docNode.label, // Use title instead of name for backend compatibility
      type: docType,
      url: typeof url === 'string' && url.startsWith('http') ? url : undefined,
      path: typeof url === 'string' && !url.startsWith('http') ? url : undefined,
      sourceNodeId: docNodeId,
      date: new Date().toISOString(),
      summary: `Document node: ${docNode.label}${props.description ? ` - ${props.description}` : ''}`,
      tags: ['graph-node', docNode.type, ...extractTagsFromProperties(props)],
    });
  });
  
  return documents;
}

/**
 * Check if a node represents a document
 */
function isDocumentNode(node: GraphNode): boolean {
  const type = node.type.toLowerCase();
  const label = node.label.toLowerCase();
  
  // Check if node type suggests it's a document
  const documentTypes = [
    'document',
    'pdf',
    'file',
    'report',
    'evidence',
    'attachment',
    'image',
    'photo',
    'video',
    'recording',
  ];
  
  return documentTypes.some(docType => 
    type.includes(docType) || 
    label.includes(docType) ||
    // Check for file extensions in label
    label.match(/\.(pdf|doc|docx|txt|jpg|jpeg|png|gif|mp4|mp3|wav)$/)
  );
}

/**
 * Extract tags from node properties
 */
function extractTagsFromProperties(props: Record<string, any>): string[] {
  const tags: string[] = [];
  
  if (props.classification) {
    tags.push(String(props.classification));
  }
  
  if (props.category) {
    tags.push(String(props.category));
  }
  
  if (props.tags && Array.isArray(props.tags)) {
    tags.push(...props.tags.map(String));
  }
  
  return tags;
}

/**
 * Convert detected communities into case suggestions
 */
export function communitiesToCases(
  communities: Community[],
  graphData: GraphData
): CreateCaseInput[] {
  return communities.map((community, index) => {
    // Generate case name based on node types
    const dominantType = Object.entries(community.nodeTypes)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || 'Unknown';
    
    // Get representative nodes for description
    const nodeLabels = community.nodeIds
      .slice(0, 3)
      .map((id) => graphData.nodes.find((n) => n.id === id)?.label)
      .filter(Boolean);
    
    const caseName = `Community ${index + 1}: ${dominantType} Network`;
    
    const description = `Detected community of ${community.size} entities including ${nodeLabels.join(', ')}${
      nodeLabels.length < community.nodeIds.length ? ` and ${community.nodeIds.length - nodeLabels.length} more` : ''
    }. Node types: ${Object.entries(community.nodeTypes)
      .map(([type, count]) => `${count} ${type}`)
      .join(', ')}.`;
    
    // Determine priority based on threat level and size
    let priority = CasePriority.MEDIUM;
    if (community.hasHighThreat && community.size >= 5) {
      priority = CasePriority.CRITICAL;
    } else if (community.hasHighThreat || community.size >= 8) {
      priority = CasePriority.HIGH;
    } else if (community.size >= 4) {
      priority = CasePriority.MEDIUM;
    } else {
      priority = CasePriority.LOW;
    }
    
    // Automatically extract documents from node properties
    const documents = extractDocumentsFromNodes(community.nodeIds, graphData);
    
    return {
      name: caseName,
      description,
      priority,
      classification: 'CONFIDENTIAL',
      entityIds: community.nodeIds,
      documents,
      tags: [
        'community-detected',
        `modularity-${community.modularity.toFixed(2)}`,
        ...(documents.length > 0 ? [`${documents.length}-documents`] : []),
      ],
    };
  });
}

/**
 * Get community color for visualization
 */
export function getCommunityColor(communityIndex: number, isDarkMode: boolean): string {
  const darkColors = [
    '#e53935', // Red
    '#1e88e5', // Blue
    '#43a047', // Green
    '#fb8c00', // Orange
    '#8e24aa', // Purple
    '#00acc1', // Cyan
    '#fdd835', // Yellow
    '#6d4c41', // Brown
    '#e91e63', // Pink
    '#5e35b1', // Deep Purple
  ];
  
  const lightColors = [
    '#c62828', // Dark Red
    '#1565c0', // Dark Blue
    '#2e7d32', // Dark Green
    '#ef6c00', // Dark Orange
    '#6a1b9a', // Dark Purple
    '#00838f', // Dark Cyan
    '#f9a825', // Dark Yellow
    '#4e342e', // Dark Brown
    '#ad1457', // Dark Pink
    '#4527a0', // Dark Deep Purple
  ];
  
  const colors = isDarkMode ? darkColors : lightColors;
  return colors[communityIndex % colors.length];
}

/**
 * Assign community colors to nodes
 */
export function assignCommunityColors(
  graphData: GraphData,
  communities: Community[],
  isDarkMode: boolean
): Map<string, string> {
  const nodeToColor = new Map<string, string>();
  
  communities.forEach((community, index) => {
    const color = getCommunityColor(index, isDarkMode);
    community.nodeIds.forEach((nodeId) => {
      nodeToColor.set(nodeId, color);
    });
  });
  
  return nodeToColor;
}

