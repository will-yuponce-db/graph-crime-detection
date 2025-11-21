// Graph analysis algorithms for crime network analysis
import Graph from 'graphology';
import type { GraphData } from '../types/graph';
import type {
  CentralityScores,
  CentralityType,
  PathResult,
  BridgeResult,
  ArticulationPointResult,
  NodeAnalysis,
  TopNodeResult,
  GraphAnalysisResults,
} from '../types/graphAnalysis';

/**
 * Build a graphology graph from GraphData
 */
function buildGraph(graphData: GraphData, directed: boolean = false): Graph {
  const graph = new Graph({ type: directed ? 'directed' : 'undirected' });

  // Add all nodes
  graphData.nodes.forEach((node) => {
    graph.addNode(node.id, {
      label: node.label,
      type: node.type,
      properties: node.properties,
    });
  });

  // Add all edges
  graphData.edges.forEach((edge) => {
    if (!graph.hasEdge(edge.source, edge.target)) {
      graph.addEdge(edge.source, edge.target, {
        relationshipType: edge.relationshipType,
        weight: 1,
        id: edge.id,
      });
    }
  });

  return graph;
}

/**
 * Calculate degree centrality for all nodes
 * Simple count of direct connections
 */
export function calculateDegreeCentrality(graphData: GraphData): CentralityScores {
  const graph = buildGraph(graphData, false);
  const scores = new Map<string, number>();

  graph.forEachNode((node) => {
    scores.set(node, graph.degree(node));
  });

  return scores;
}

/**
 * Calculate betweenness centrality
 * Measures how often a node appears on shortest paths between other nodes
 * High betweenness = broker/bridge between groups
 */
export function calculateBetweennessCentrality(graphData: GraphData): CentralityScores {
  const graph = buildGraph(graphData, false);
  const scores = new Map<string, number>();
  const nodes = graph.nodes();

  // Initialize scores
  nodes.forEach((node) => scores.set(node, 0));

  // For each pair of nodes, find shortest paths and count node appearances
  for (let i = 0; i < nodes.length; i++) {
    const source = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const target = nodes[j];

      // Find all shortest paths using BFS
      const paths = findAllShortestPaths(graph, source, target);

      if (paths.length > 0) {
        // Count how many paths each node appears in
        paths.forEach((path) => {
          // Skip source and target
          for (let k = 1; k < path.length - 1; k++) {
            const nodeId = path[k];
            scores.set(nodeId, (scores.get(nodeId) || 0) + 1 / paths.length);
          }
        });
      }
    }
  }

  // Normalize by number of pairs (n*(n-1)/2 for undirected)
  const n = nodes.length;
  const normalization = n > 2 ? ((n - 1) * (n - 2)) / 2 : 1;

  nodes.forEach((node) => {
    scores.set(node, (scores.get(node) || 0) / normalization);
  });

  return scores;
}

/**
 * Find all shortest paths between two nodes using BFS
 */
function findAllShortestPaths(graph: Graph, source: string, target: string): string[][] {
  if (source === target) return [[source]];

  const queue: Array<{ node: string; path: string[] }> = [{ node: source, path: [source] }];
  const visited = new Set<string>([source]);
  const paths: string[][] = [];
  let shortestLength: number | null = null;

  while (queue.length > 0) {
    const { node, path } = queue.shift()!;

    if (shortestLength !== null && path.length > shortestLength) {
      break; // We've found all shortest paths
    }

    if (node === target) {
      paths.push([...path]);
      shortestLength = path.length;
      continue;
    }

    graph.forEachNeighbor(node, (neighbor) => {
      if (!visited.has(neighbor) || neighbor === target) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
        }
        queue.push({ node: neighbor, path: [...path, neighbor] });
      }
    });
  }

  return paths;
}

/**
 * Calculate closeness centrality
 * Measures average distance to all other nodes
 * High closeness = can reach others quickly
 */
export function calculateClosenessCentrality(graphData: GraphData): CentralityScores {
  const graph = buildGraph(graphData, false);
  const scores = new Map<string, number>();
  const nodes = graph.nodes();

  nodes.forEach((node) => {
    const distances = calculateDistances(graph, node);
    const reachableNodes = Array.from(distances.values()).filter((d) => d > 0).length;

    if (reachableNodes === 0) {
      scores.set(node, 0);
    } else {
      const sumDistances = Array.from(distances.values()).reduce((sum, d) => sum + d, 0);
      scores.set(node, reachableNodes / sumDistances);
    }
  });

  return scores;
}

/**
 * Calculate distances from a source node to all other nodes using BFS
 */
function calculateDistances(graph: Graph, source: string): Map<string, number> {
  const distances = new Map<string, number>();
  const queue: Array<{ node: string; distance: number }> = [{ node: source, distance: 0 }];
  const visited = new Set<string>([source]);

  distances.set(source, 0);

  while (queue.length > 0) {
    const { node, distance } = queue.shift()!;

    graph.forEachNeighbor(node, (neighbor) => {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        const newDistance = distance + 1;
        distances.set(neighbor, newDistance);
        queue.push({ node: neighbor, distance: newDistance });
      }
    });
  }

  return distances;
}

/**
 * Calculate eigenvector centrality using power iteration
 * Measures influence based on connections to other influential nodes
 */
export function calculateEigenvectorCentrality(
  graphData: GraphData,
  maxIterations: number = 100,
  tolerance: number = 1e-6
): CentralityScores {
  const graph = buildGraph(graphData, false);
  const nodes = graph.nodes();
  const n = nodes.length;

  if (n === 0) return new Map();

  // Initialize with equal values
  const scores = new Map<string, number>();
  nodes.forEach((node) => scores.set(node, 1 / Math.sqrt(n)));

  for (let iter = 0; iter < maxIterations; iter++) {
    const newScores = new Map<string, number>();

    nodes.forEach((node) => {
      let sum = 0;
      graph.forEachNeighbor(node, (neighbor) => {
        sum += scores.get(neighbor) || 0;
      });
      newScores.set(node, sum);
    });

    // Normalize
    const norm = Math.sqrt(Array.from(newScores.values()).reduce((sum, val) => sum + val * val, 0));

    if (norm === 0) break;

    let maxDiff = 0;
    nodes.forEach((node) => {
      const newVal = (newScores.get(node) || 0) / norm;
      const oldVal = scores.get(node) || 0;
      maxDiff = Math.max(maxDiff, Math.abs(newVal - oldVal));
      scores.set(node, newVal);
    });

    if (maxDiff < tolerance) break;
  }

  return scores;
}

/**
 * Calculate PageRank centrality
 * Alternative influence measure, similar to Google's PageRank
 */
export function calculatePageRank(
  graphData: GraphData,
  dampingFactor: number = 0.85,
  maxIterations: number = 100,
  tolerance: number = 1e-6
): CentralityScores {
  const graph = buildGraph(graphData, true); // Use directed graph
  const nodes = graph.nodes();
  const n = nodes.length;

  if (n === 0) return new Map();

  // Initialize with equal values
  const scores = new Map<string, number>();
  nodes.forEach((node) => scores.set(node, 1 / n));

  for (let iter = 0; iter < maxIterations; iter++) {
    const newScores = new Map<string, number>();

    nodes.forEach((node) => {
      let sum = 0;
      graph.forEachInNeighbor(node, (neighbor) => {
        const outDegree = graph.outDegree(neighbor);
        if (outDegree > 0) {
          sum += (scores.get(neighbor) || 0) / outDegree;
        }
      });
      newScores.set(node, (1 - dampingFactor) / n + dampingFactor * sum);
    });

    let maxDiff = 0;
    nodes.forEach((node) => {
      const newVal = newScores.get(node) || 0;
      const oldVal = scores.get(node) || 0;
      maxDiff = Math.max(maxDiff, Math.abs(newVal - oldVal));
      scores.set(node, newVal);
    });

    if (maxDiff < tolerance) break;
  }

  return scores;
}

/**
 * Find shortest path between two nodes
 */
export function findShortestPath(
  graphData: GraphData,
  sourceId: string,
  targetId: string
): PathResult {
  const graph = buildGraph(graphData, false);

  if (sourceId === targetId) {
    return {
      path: [sourceId],
      distance: 0,
      exists: true,
      sourceId,
      targetId,
    };
  }

  const queue: Array<{ node: string; path: string[] }> = [{ node: sourceId, path: [sourceId] }];
  const visited = new Set<string>([sourceId]);

  while (queue.length > 0) {
    const { node, path } = queue.shift()!;

    const neighbors: string[] = [];
    graph.forEachNeighbor(node, (neighbor) => {
      neighbors.push(neighbor);
    });

    for (const neighbor of neighbors) {
      if (neighbor === targetId) {
        // Found target - return immediately
        return {
          path: [...path, neighbor],
          distance: path.length,
          exists: true,
          sourceId,
          targetId,
        };
      }

      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ node: neighbor, path: [...path, neighbor] });
      }
    }
  }

  return {
    path: [],
    distance: Infinity,
    exists: false,
    sourceId,
    targetId,
  };
}

/**
 * Find all paths up to a certain length from a source node
 */
export function findPathsUpToLength(
  graphData: GraphData,
  sourceId: string,
  maxLength: number
): Map<string, string[][]> {
  const graph = buildGraph(graphData, false);
  const paths = new Map<string, string[][]>();

  const queue: Array<{ node: string; path: string[] }> = [{ node: sourceId, path: [sourceId] }];

  while (queue.length > 0) {
    const { node, path } = queue.shift()!;

    if (path.length > maxLength) continue;

    const targetId = path[path.length - 1];
    if (!paths.has(targetId)) {
      paths.set(targetId, []);
    }
    paths.get(targetId)!.push([...path]);

    graph.forEachNeighbor(node, (neighbor) => {
      if (!path.includes(neighbor) && path.length < maxLength) {
        queue.push({ node: neighbor, path: [...path, neighbor] });
      }
    });
  }

  return paths;
}

/**
 * Find bridge edges - edges whose removal disconnects the graph
 */
export function findBridges(graphData: GraphData): BridgeResult[] {
  const graph = buildGraph(graphData, false);
  const bridges: BridgeResult[] = [];

  // For each edge, check if removing it increases component count
  const originalComponents = getConnectedComponents(graph);

  graph.forEachEdge((edge, attr, source, target) => {
    // Temporarily remove edge
    graph.dropEdge(edge);

    const newComponents = getConnectedComponents(graph);
    const componentsCreated = newComponents.length - originalComponents.length;

    if (componentsCreated > 0) {
      const edgeData = graphData.edges.find((e) => e.id === edge);
      bridges.push({
        edgeId: edge,
        sourceId: source,
        targetId: target,
        relationshipType: edgeData?.relationshipType || 'unknown',
        impact: componentsCreated >= 2 ? 'high' : componentsCreated === 1 ? 'medium' : 'low',
        componentsCreated,
      });
    }

    // Restore edge
    graph.addEdge(source, target, attr);
  });

  return bridges;
}

/**
 * Get connected components of a graph
 */
function getConnectedComponents(graph: Graph): string[][] {
  const visited = new Set<string>();
  const components: string[][] = [];

  graph.forEachNode((node) => {
    if (!visited.has(node)) {
      const component: string[] = [];
      const queue = [node];
      visited.add(node);

      while (queue.length > 0) {
        const current = queue.shift()!;
        component.push(current);

        graph.forEachNeighbor(current, (neighbor) => {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        });
      }

      components.push(component);
    }
  });

  return components;
}

/**
 * Find articulation points (cut vertices) - nodes whose removal fragments the network
 */
export function findArticulationPoints(graphData: GraphData): ArticulationPointResult[] {
  const graph = buildGraph(graphData, false);
  const articulationPoints: ArticulationPointResult[] = [];

  const originalComponents = getConnectedComponents(graph);
  const nodes = graph.nodes();

  nodes.forEach((nodeId) => {
    // Temporarily remove node and its edges
    const neighbors: string[] = [];
    graph.forEachNeighbor(nodeId, (neighbor) => {
      neighbors.push(neighbor);
    });

    neighbors.forEach((neighbor) => {
      graph.dropEdge(nodeId, neighbor);
    });

    const newComponents = getConnectedComponents(graph);
    const componentsCreated = newComponents.length - originalComponents.length;

    if (componentsCreated > 0) {
      const node = graphData.nodes.find((n) => n.id === nodeId);
      articulationPoints.push({
        nodeId,
        label: node?.label || nodeId,
        type: node?.type || 'unknown',
        componentsCreated,
        impact: componentsCreated >= 2 ? 'high' : 'medium',
      });
    }

    // Restore edges
    neighbors.forEach((neighbor) => {
      graph.addEdge(nodeId, neighbor);
    });
  });

  return articulationPoints;
}

/**
 * Calculate clustering coefficient for all nodes
 * Measures how tightly connected a node's neighbors are
 */
export function calculateClusteringCoefficient(graphData: GraphData): Map<string, number> {
  const graph = buildGraph(graphData, false);
  const coefficients = new Map<string, number>();

  graph.forEachNode((node) => {
    const neighbors: string[] = [];
    graph.forEachNeighbor(node, (neighbor) => {
      neighbors.push(neighbor);
    });

    const k = neighbors.length;
    if (k < 2) {
      coefficients.set(node, 0);
      return;
    }

    // Count edges between neighbors
    let edgesBetweenNeighbors = 0;
    for (let i = 0; i < neighbors.length; i++) {
      for (let j = i + 1; j < neighbors.length; j++) {
        if (graph.hasEdge(neighbors[i], neighbors[j])) {
          edgesBetweenNeighbors++;
        }
      }
    }

    // Clustering coefficient = 2 * edges / (k * (k - 1))
    const maxPossibleEdges = (k * (k - 1)) / 2;
    const coefficient = maxPossibleEdges > 0 ? edgesBetweenNeighbors / maxPossibleEdges : 0;

    coefficients.set(node, coefficient);
  });

  return coefficients;
}

/**
 * Get top N nodes by centrality score
 */
export function getTopNodesByCentrality(
  centrality: CentralityScores,
  graphData: GraphData,
  topN: number = 10
): TopNodeResult[] {
  const entries = Array.from(centrality.entries())
    .map(([nodeId, score]) => {
      const node = graphData.nodes.find((n) => n.id === nodeId);
      return {
        nodeId,
        label: node?.label || nodeId,
        type: node?.type || 'unknown',
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((item, index) => ({
      ...item,
      rank: index + 1,
    }));

  return entries;
}

/**
 * Comprehensive analysis for a single node
 */
export function analyzeNodeRole(
  graphData: GraphData,
  nodeId: string,
  analysisResults?: GraphAnalysisResults
): NodeAnalysis | null {
  const node = graphData.nodes.find((n) => n.id === nodeId);
  if (!node) return null;

  // Calculate all centralities if not provided
  const centrality = analysisResults
    ? {
        betweenness: analysisResults.centrality.betweenness.get(nodeId) || 0,
        closeness: analysisResults.centrality.closeness.get(nodeId) || 0,
        eigenvector: analysisResults.centrality.eigenvector.get(nodeId) || 0,
        pagerank: analysisResults.centrality.pagerank.get(nodeId) || 0,
        degree: analysisResults.centrality.degree.get(nodeId) || 0,
      }
    : {
        betweenness: calculateBetweennessCentrality(graphData).get(nodeId) || 0,
        closeness: calculateClosenessCentrality(graphData).get(nodeId) || 0,
        eigenvector: calculateEigenvectorCentrality(graphData).get(nodeId) || 0,
        pagerank: calculatePageRank(graphData).get(nodeId) || 0,
        degree: calculateDegreeCentrality(graphData).get(nodeId) || 0,
      };

  const clustering =
    analysisResults?.clustering.get(nodeId) ||
    calculateClusteringCoefficient(graphData).get(nodeId) ||
    0;

  const bridges = analysisResults?.bridges || findBridges(graphData);
  const isBridgeEndpoint = bridges.some((b) => b.sourceId === nodeId || b.targetId === nodeId);

  const articulationPoints =
    analysisResults?.articulationPoints || findArticulationPoints(graphData);
  const isArticulationPoint = articulationPoints.some((ap) => ap.nodeId === nodeId);

  const graph = buildGraph(graphData, false);
  const neighbors = graph.degree(nodeId);

  // Determine role
  let role: 'hub' | 'bridge' | 'peripheral' | 'isolated';
  if (neighbors === 0) {
    role = 'isolated';
  } else if (isArticulationPoint || isBridgeEndpoint || centrality.betweenness > 0.1) {
    role = 'bridge';
  } else if (centrality.degree > 5 || centrality.eigenvector > 0.1) {
    role = 'hub';
  } else {
    role = 'peripheral';
  }

  return {
    nodeId,
    label: node.label,
    type: node.type,
    centrality,
    clustering,
    isArticulationPoint,
    isBridgeEndpoint,
    neighbors,
    role,
  };
}

/**
 * Calculate all analysis results at once (for caching)
 */
export function calculateAllAnalysis(
  graphData: GraphData,
  skipExpensive: boolean = false
): GraphAnalysisResults {
  // For large graphs, skip the most expensive calculations
  const emptyScores = new Map<string, number>();
  graphData.nodes.forEach((node) => emptyScores.set(node.id, 0));

  return {
    centrality: {
      betweenness: skipExpensive ? emptyScores : calculateBetweennessCentrality(graphData),
      closeness: skipExpensive ? emptyScores : calculateClosenessCentrality(graphData),
      eigenvector: skipExpensive ? emptyScores : calculateEigenvectorCentrality(graphData),
      pagerank: skipExpensive ? emptyScores : calculatePageRank(graphData),
      degree: calculateDegreeCentrality(graphData), // Always calculate - it's fast
    },
    bridges: skipExpensive ? [] : findBridges(graphData),
    articulationPoints: skipExpensive ? [] : findArticulationPoints(graphData),
    clustering: skipExpensive ? emptyScores : calculateClusteringCoefficient(graphData),
  };
}

/**
 * Get centrality scores by type
 */
export function getCentralityByType(graphData: GraphData, type: CentralityType): CentralityScores {
  switch (type) {
    case 'betweenness':
      return calculateBetweennessCentrality(graphData);
    case 'closeness':
      return calculateClosenessCentrality(graphData);
    case 'eigenvector':
      return calculateEigenvectorCentrality(graphData);
    case 'pagerank':
      return calculatePageRank(graphData);
    case 'degree':
      return calculateDegreeCentrality(graphData);
    default:
      return calculateDegreeCentrality(graphData);
  }
}
