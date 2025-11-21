// Type definitions for graph analysis algorithms

/**
 * Centrality scores for nodes
 * Maps nodeId to centrality score
 */
export type CentralityScores = Map<string, number>;

/**
 * Centrality type options
 */
export type CentralityType = 'betweenness' | 'closeness' | 'eigenvector' | 'pagerank' | 'degree';

/**
 * Result of shortest path finding
 */
export interface PathResult {
  path: string[]; // Array of node IDs from source to target
  distance: number; // Number of edges in path
  exists: boolean; // Whether a path exists
  sourceId: string;
  targetId: string;
}

/**
 * Bridge edge with impact analysis
 */
export interface BridgeResult {
  edgeId: string;
  sourceId: string;
  targetId: string;
  relationshipType: string;
  impact: 'high' | 'medium' | 'low'; // Impact if removed
  componentsCreated: number; // Number of components created if removed
}

/**
 * Articulation point (cut vertex) result
 */
export interface ArticulationPointResult {
  nodeId: string;
  label: string;
  type: string;
  componentsCreated: number; // Number of components created if removed
  impact: 'high' | 'medium' | 'low';
}

/**
 * Clustering coefficient for a node
 */
export interface ClusteringResult {
  nodeId: string;
  coefficient: number; // 0 to 1, where 1 means all neighbors are connected
  neighbors: number;
  triangles: number; // Number of triangles involving this node
}

/**
 * Comprehensive analysis for a single node
 */
export interface NodeAnalysis {
  nodeId: string;
  label: string;
  type: string;
  centrality: {
    betweenness: number;
    closeness: number;
    eigenvector: number;
    pagerank: number;
    degree: number;
  };
  clustering: number;
  isArticulationPoint: boolean;
  isBridgeEndpoint: boolean; // Is this node connected to any bridge?
  neighbors: number;
  role: 'hub' | 'bridge' | 'peripheral' | 'isolated';
}

/**
 * Top nodes by centrality
 */
export interface TopNodeResult {
  nodeId: string;
  label: string;
  type: string;
  score: number;
  rank: number;
}

/**
 * Analysis results container
 */
export interface GraphAnalysisResults {
  centrality: {
    betweenness: CentralityScores;
    closeness: CentralityScores;
    eigenvector: CentralityScores;
    pagerank: CentralityScores;
    degree: CentralityScores;
  };
  bridges: BridgeResult[];
  articulationPoints: ArticulationPointResult[];
  clustering: Map<string, number>; // nodeId -> clustering coefficient
  paths?: Map<string, PathResult>; // Cache of computed paths
}
