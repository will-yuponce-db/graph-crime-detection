import { useRef, useCallback, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { Box, Paper, Typography, useTheme, IconButton, Stack, Tooltip } from '@mui/material';
import { ZoomIn as ZoomInIcon, ZoomOut as ZoomOutIcon } from '@mui/icons-material';
import type { GraphData, ForceGraphData, ForceGraphNode, ForceGraphLink } from '../types/graph';
import { ChangeStatus, getColorForType } from '../types/graph';
import { useAppSelector } from '../store/hooks';
import type { CentralityScores } from '../types/graphAnalysis';

interface GraphVisualizationProps {
  data: GraphData;
  showProposed: boolean;
  selectedNodeTypes: string[];
  selectedRelationshipTypes: string[];
  showNodeLabels?: boolean;
  showEdgeLabels?: boolean;
  showCommunities?: boolean;
  edgeLength?: number;
  nodeSize?: number;
  width?: number;
  height?: number;
  onNodeClick?: (nodeId: string) => void;
  onEdgeClick?: (edgeId: string) => void;
  edgeCreateMode?: boolean;
  edgeCreateSourceId?: string | null;
  selectedNodeId?: string | null;
  // Analysis visualization props
  showCentrality?: boolean;
  centralityScores?: CentralityScores;
  highlightedPath?: string[];
  highlightedBridges?: string[];
}

export interface GraphVisualizationRef {
  resetView: () => void;
  centerOnNode: (nodeId: string) => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

const GraphVisualization = forwardRef<GraphVisualizationRef, GraphVisualizationProps>(
  (
    {
      data,
      showProposed,
      selectedNodeTypes,
      selectedRelationshipTypes,
      showNodeLabels = false,
      showEdgeLabels = false,
      showCommunities = true,
      edgeLength = 80,
      nodeSize = 6,
      width = 800,
      height = 600,
      onNodeClick,
      onEdgeClick,
      edgeCreateMode = false,
      edgeCreateSourceId = null,
      selectedNodeId = null,
      showCentrality = false,
      centralityScores,
      highlightedPath = [],
      highlightedBridges = [],
    },
    ref
  ) => {
    const theme = useTheme();
    const allCases = useAppSelector(state => state.cases?.cases || []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const graphRef = useRef<any>(null);
    const [hoveredNode, setHoveredNode] = useState<ForceGraphNode | null>(null);
    const [graphData, setGraphData] = useState<ForceGraphData>({ nodes: [], links: [] });
    const [hasInitialized, setHasInitialized] = useState(false);
    const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());

    // Create node to case color mapping
    const nodeToCase = useCallback((nodeId: string): number | null => {
      for (let i = 0; i < allCases.length; i++) {
        if (allCases[i].entityIds.includes(nodeId)) {
          return i;
        }
      }
      return null;
    }, [allCases]);

    // Community colors
    const getCommunityColor = useCallback((communityIndex: number): string => {
      const darkColors = [
        '#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa',
        '#00acc1', '#fdd835', '#6d4c41', '#e91e63', '#5e35b1',
      ];
      const lightColors = [
        '#c62828', '#1565c0', '#2e7d32', '#ef6c00', '#6a1b9a',
        '#00838f', '#f9a825', '#4e342e', '#ad1457', '#4527a0',
      ];
      const colors = theme.palette.mode === 'dark' ? darkColors : lightColors;
      return colors[communityIndex % colors.length];
    }, [theme.palette.mode]);

    // Color schemes for different node types - now community-aware!
    const getNodeColor = useCallback(
      (node: ForceGraphNode): string => {
        // If cases exist and node is in a case, color by community
        if (allCases.length > 0) {
          const communityIndex = nodeToCase(node.id as string);
          if (communityIndex !== null) {
            return getCommunityColor(communityIndex);
          }
        }

        if (node.status === ChangeStatus.NEW) {
          return theme.palette.mode === 'dark' ? '#4caf50' : '#2e7d32';
        }

        // Use dynamic color generation for any node type
        return getColorForType(node.type, theme.palette.mode === 'dark');
      },
      [theme.palette.mode, allCases, nodeToCase, getCommunityColor]
    );

    const getLinkColor = useCallback(
      (link: ForceGraphLink): string => {
        // Highlight bridges
        if (highlightedBridges.includes(link.id as string)) {
          return theme.palette.mode === 'dark' ? '#ff6b6b' : '#d32f2f';
        }
        // Highlight path edges
        if (highlightedPath.length > 0) {
          const sourceIdx = highlightedPath.indexOf(link.source as string);
          const targetIdx = highlightedPath.indexOf(link.target as string);
          if (
            sourceIdx !== -1 &&
            targetIdx !== -1 &&
            Math.abs(sourceIdx - targetIdx) === 1
          ) {
            return theme.palette.mode === 'dark' ? '#42a5f5' : '#1976d2';
          }
        }
        if (link.status === ChangeStatus.NEW) {
          return theme.palette.mode === 'dark' ? '#66bb6a' : '#43a047';
        }
        return theme.palette.mode === 'dark' ? '#616161' : '#9e9e9e';
      },
      [theme.palette.mode, highlightedBridges, highlightedPath]
    );

    // Calculate node size based on centrality if enabled
    const getNodeSize = useCallback(
      (node: ForceGraphNode): number => {
        let baseSize = node.status === ChangeStatus.NEW ? nodeSize * 1.3 : nodeSize;
        
        if (showCentrality && centralityScores) {
          const score = centralityScores.get(node.id as string) || 0;
          if (score > 0) {
            // Normalize score to 0-1 range for scaling
            const maxScore = Math.max(...Array.from(centralityScores.values()));
            const normalizedScore = maxScore > 0 ? score / maxScore : 0;
            // Scale between 0.5x and 2x base size
            baseSize = baseSize * (0.5 + normalizedScore * 1.5);
          }
        }
        
        return baseSize;
      },
      [nodeSize, showCentrality, centralityScores]
    );

    // Transform data for react-force-graph
    useEffect(() => {
      const filteredNodes = data.nodes.filter((node) => {
        if (!showProposed && node.status === ChangeStatus.NEW) return false;
        if (selectedNodeTypes.length > 0 && !selectedNodeTypes.includes(node.type)) return false;
        return true;
      });

      const nodeIds = new Set(filteredNodes.map((n) => n.id));

      const filteredEdges = data.edges.filter((edge) => {
        if (!showProposed && edge.status === ChangeStatus.NEW) return false;
        if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return false;
        if (
          selectedRelationshipTypes.length > 0 &&
          !selectedRelationshipTypes.includes(edge.relationshipType)
        )
          return false;
        return true;
      });

      const forceNodes: ForceGraphNode[] = filteredNodes.map((node) => {
        const forceNode: ForceGraphNode = {
          id: node.id,
          name: node.label,
          type: node.type,
          status: node.status,
          properties: node.properties,
          val: node.status === ChangeStatus.NEW ? nodeSize * 1.3 : nodeSize,
        };
        // Apply centrality-based sizing
        if (showCentrality && centralityScores) {
          forceNode.val = getNodeSize(forceNode);
        }
        return forceNode;
      });

      const forceLinks: ForceGraphLink[] = filteredEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        relationshipType: edge.relationshipType,
        status: edge.status,
        properties: edge.properties,
      }));

      setGraphData({ nodes: forceNodes, links: forceLinks });
    }, [
      data,
      showProposed,
      selectedNodeTypes,
      selectedRelationshipTypes,
      nodeSize,
      showCentrality,
      centralityScores,
      getNodeSize,
    ]);

    // Configure d3 forces to spread nodes farther apart
    useEffect(() => {
      if (graphRef.current) {
        // Set link distance based on slider value
        graphRef.current.d3Force('link')?.distance(edgeLength);

        // Adjust charge strength proportionally to edge length for better layout
        const chargeStrength = -(edgeLength * 2.5);
        graphRef.current.d3Force('charge')?.strength(chargeStrength);

        // Only restart the simulation when edge length changes, not on every data update
        graphRef.current.d3ReheatSimulation();
      }
    }, [edgeLength]);

    // Expose methods to parent component
    useImperativeHandle(
      ref,
      () => ({
        resetView: () => {
          if (graphRef.current) {
            graphRef.current.zoomToFit(400, 50);
          }
        },
        centerOnNode: (nodeId: string) => {
          if (graphRef.current) {
            const node = graphData.nodes.find((n) => n.id === nodeId);
            if (node && node.x !== undefined && node.y !== undefined) {
              // Center on node and zoom in slightly
              graphRef.current.centerAt(node.x, node.y, 1000);
              graphRef.current.zoom(2, 1000);
            }
          }
        },
        zoomIn: () => {
          if (graphRef.current) {
            const currentZoom = graphRef.current.zoom();
            graphRef.current.zoom(currentZoom * 1.3, 300);
          }
        },
        zoomOut: () => {
          if (graphRef.current) {
            const currentZoom = graphRef.current.zoom();
            graphRef.current.zoom(currentZoom / 1.3, 300);
          }
        },
      }),
      [graphData.nodes]
    );

    const handleNodeHover = useCallback((node: ForceGraphNode | null) => {
      setHoveredNode(node);
    }, []);

    const handleNodeClick = useCallback(
      (node: ForceGraphNode) => {
        if (onNodeClick) {
          onNodeClick(node.id as string);
        } else if (graphRef.current) {
          // Default behavior: center on node without changing zoom level
          graphRef.current.centerAt(node.x, node.y, 1000);
        }
      },
      [onNodeClick]
    );

    const handleLinkClick = useCallback(
      (link: ForceGraphLink) => {
        if (onEdgeClick) {
          onEdgeClick(link.id as string);
        }
      },
      [onEdgeClick]
    );

    const handleZoomIn = useCallback(() => {
      if (graphRef.current) {
        const currentZoom = graphRef.current.zoom();
        graphRef.current.zoom(currentZoom * 1.3, 300);
      }
    }, []);

    const handleZoomOut = useCallback(() => {
      if (graphRef.current) {
        const currentZoom = graphRef.current.zoom();
        graphRef.current.zoom(currentZoom / 1.3, 300);
      }
    }, []);

    const paintNode = useCallback(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (node: any, ctx: CanvasRenderingContext2D) => {
        const label = node.name;
        const fontSize = 11;
        const nodeRadius = node.val || 5;
        const imageUrl = node.properties?.image_url;

        // Try to draw image if available (for suspects with photos)
        let imageDrawn = false;
        if (imageUrl) {
          let img = imageCache.current.get(imageUrl);
          
          if (!img) {
            // Create and cache new image (no crossOrigin needed for same-origin)
            img = new Image();
            img.src = imageUrl;
            imageCache.current.set(imageUrl, img);
            
            // Trigger redraw when image loads
            img.onload = () => {
              if (graphRef.current) {
                graphRef.current.refresh?.();
              }
            };
          }
          
          // Draw image if loaded
          if (img.complete && img.naturalWidth > 0) {
            ctx.save();
            
            // Create circular clip path
            ctx.beginPath();
            ctx.arc(node.x, node.y, nodeRadius, 0, 2 * Math.PI);
            ctx.closePath();
            ctx.clip();
            
            // Draw image
            ctx.drawImage(
              img,
              node.x - nodeRadius,
              node.y - nodeRadius,
              nodeRadius * 2,
              nodeRadius * 2
            );
            
            ctx.restore();
            
            // Draw border around image
            ctx.beginPath();
            ctx.arc(node.x, node.y, nodeRadius, 0, 2 * Math.PI);
            ctx.strokeStyle = node.status === ChangeStatus.NEW 
              ? (theme.palette.mode === 'dark' ? '#81c784' : '#1b5e20')
              : getNodeColor(node);
            ctx.lineWidth = 2.5;
            ctx.stroke();
            
            imageDrawn = true;
          }
        }
        
        // Fallback to circle if no image or image not loaded
        if (!imageDrawn) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, nodeRadius, 0, 2 * Math.PI);
          ctx.fillStyle = getNodeColor(node);
          ctx.fill();
        }

        // Add border for new nodes
        if (node.status === ChangeStatus.NEW) {
          ctx.strokeStyle = theme.palette.mode === 'dark' ? '#81c784' : '#1b5e20';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Determine if label should be shown
        const isHovered = hoveredNode && hoveredNode.id === node.id;
        const isSelected = selectedNodeId && selectedNodeId === node.id;
        const isEdgeCreateSource = edgeCreateMode && edgeCreateSourceId === node.id;
        const isInPath = highlightedPath.includes(node.id as string);
        const shouldShowLabel = showNodeLabels || isHovered || isSelected || isEdgeCreateSource || isInPath;

        // Draw label only when appropriate
        if (shouldShowLabel) {
          ctx.font = `${fontSize}px Sans-Serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          // Measure text for background
          const textMetrics = ctx.measureText(label);
          const textWidth = textMetrics.width;
          const textHeight = fontSize;
          const padding = 4;
          const labelY = node.y + nodeRadius + 12;

          // Draw semi-transparent background
          ctx.fillStyle =
            theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.75)' : 'rgba(255, 255, 255, 0.85)';
          ctx.fillRect(
            node.x - textWidth / 2 - padding,
            labelY - textHeight / 2 - padding,
            textWidth + padding * 2,
            textHeight + padding * 2
          );

          // Draw text
          ctx.fillStyle = theme.palette.text.primary;
          ctx.fillText(label, node.x, labelY);
        }

        // Highlight hovered node
        if (isHovered) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, nodeRadius + 3, 0, 2 * Math.PI);
          ctx.strokeStyle = theme.palette.primary.main;
          ctx.lineWidth = 3;
          ctx.stroke();
        }

        // Highlight selected node
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, nodeRadius + 4, 0, 2 * Math.PI);
          ctx.strokeStyle = theme.palette.secondary.main;
          ctx.lineWidth = 3;
          ctx.stroke();
        }

        // Highlight source node in edge create mode
        if (isEdgeCreateSource) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, nodeRadius + 5, 0, 2 * Math.PI);
          ctx.strokeStyle = theme.palette.success.main;
          ctx.lineWidth = 4;
          ctx.stroke();
        }

        // Highlight nodes in path
        if (isInPath) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, nodeRadius + 2, 0, 2 * Math.PI);
          ctx.strokeStyle = theme.palette.mode === 'dark' ? '#42a5f5' : '#1976d2';
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      },
      [
        hoveredNode,
        theme,
        getNodeColor,
        selectedNodeId,
        edgeCreateMode,
        edgeCreateSourceId,
        showNodeLabels,
        highlightedPath,
      ]
    );

    // Convex hull calculation (Graham scan algorithm)
    const getConvexHull = useCallback((points: { x: number; y: number }[]): { x: number; y: number }[] => {
      if (points.length < 3) return points;

      // Add padding to hull
      const padding = 30;
      const paddedPoints = points.map(p => ({ ...p }));

      // Find bottom-most point (or left-most if tied)
      let bottomMost = paddedPoints[0];
      for (let i = 1; i < paddedPoints.length; i++) {
        if (paddedPoints[i].y > bottomMost.y || 
            (paddedPoints[i].y === bottomMost.y && paddedPoints[i].x < bottomMost.x)) {
          bottomMost = paddedPoints[i];
        }
      }

      const crossProduct = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) => {
        return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      };

      // Sort by polar angle
      const sorted = paddedPoints.sort((a, b) => {
        if (a === bottomMost) return -1;
        if (b === bottomMost) return 1;
        
        const angleA = Math.atan2(a.y - bottomMost.y, a.x - bottomMost.x);
        const angleB = Math.atan2(b.y - bottomMost.y, b.x - bottomMost.x);
        
        if (angleA !== angleB) return angleA - angleB;
        
        const distA = Math.hypot(a.x - bottomMost.x, a.y - bottomMost.y);
        const distB = Math.hypot(b.x - bottomMost.x, b.y - bottomMost.y);
        return distA - distB;
      });

      const hull: { x: number; y: number }[] = [sorted[0], sorted[1]];

      for (let i = 2; i < sorted.length; i++) {
        let top = hull.length - 1;
        
        while (hull.length >= 2 && crossProduct(hull[top - 1], hull[top], sorted[i]) <= 0) {
          hull.pop();
          top--;
        }
        
        hull.push(sorted[i]);
      }

      // Expand hull outward by padding
      const center = {
        x: hull.reduce((sum, p) => sum + p.x, 0) / hull.length,
        y: hull.reduce((sum, p) => sum + p.y, 0) / hull.length,
      };

      return hull.map(p => {
        const dx = p.x - center.x;
        const dy = p.y - center.y;
        const dist = Math.hypot(dx, dy);
        const ratio = (dist + padding) / dist;
        return {
          x: center.x + dx * ratio,
          y: center.y + dy * ratio,
        };
      });
    }, []);

    // Draw community hulls
    const drawCommunityHulls = useCallback(
      (ctx: CanvasRenderingContext2D, globalScale: number) => {
        if (allCases.length === 0) return;

        interface NodeWithPosition {
          id: string;
          x: number;
          y: number;
        }

        // Group nodes by community
        const communities = new Map<number, NodeWithPosition[]>();
        graphData.nodes.forEach((node) => {
          // Skip nodes without position data
          if (typeof node.x !== 'number' || typeof node.y !== 'number') return;
          
          const communityIndex = nodeToCase(node.id);
          if (communityIndex !== null) {
            if (!communities.has(communityIndex)) {
              communities.set(communityIndex, []);
            }
            communities.get(communityIndex)!.push({
              id: node.id,
              x: node.x,
              y: node.y,
            });
          }
        });

        // Draw hull for each community
        communities.forEach((nodes, communityIndex) => {
          if (nodes.length < 2) return;

          const color = getCommunityColor(communityIndex);
          
          // Get convex hull points
          const points = nodes.map((n) => ({ x: n.x, y: n.y }));
          const hull = getConvexHull(points);
          
          if (hull.length < 3) return;

          // Draw smooth curve through hull points using cardinal splines
          const drawSmoothCurve = (isFill: boolean) => {
            if (hull.length < 3) return;
            
            const tension = 0.5; // Controls smoothness (0 = straight lines, 1 = very smooth)
            
            ctx.beginPath();
            ctx.moveTo(hull[0].x, hull[0].y);
            
            for (let i = 0; i < hull.length; i++) {
              const p0 = hull[(i - 1 + hull.length) % hull.length];
              const p1 = hull[i];
              const p2 = hull[(i + 1) % hull.length];
              const p3 = hull[(i + 2) % hull.length];
              
              // Calculate control points for cardinal spline
              const cp1x = p1.x + (p2.x - p0.x) / 6 * tension;
              const cp1y = p1.y + (p2.y - p0.y) / 6 * tension;
              const cp2x = p2.x - (p3.x - p1.x) / 6 * tension;
              const cp2y = p2.y - (p3.y - p1.y) / 6 * tension;
              
              ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
            }
            
            ctx.closePath();
            
            if (isFill) {
              ctx.fill();
            } else {
              ctx.stroke();
            }
          };

          // Draw filled hull with transparency
          ctx.save();
          ctx.globalAlpha = 0.15;
          ctx.fillStyle = color;
          drawSmoothCurve(true);
          ctx.restore();

          // Draw border
          ctx.save();
          ctx.strokeStyle = color;
          ctx.lineWidth = 3 / globalScale;
          ctx.setLineDash([5 / globalScale, 5 / globalScale]);
          drawSmoothCurve(false);
          ctx.setLineDash([]);
          ctx.restore();

          // Draw community label
          const centerX = nodes.reduce((sum: number, n) => sum + n.x, 0) / nodes.length;
          const centerY = nodes.reduce((sum: number, n) => sum + n.y, 0) / nodes.length;
          
          ctx.save();
          ctx.font = `bold ${14 / globalScale}px Sans-Serif`;
          ctx.fillStyle = color;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`Community ${communityIndex + 1}`, centerX, centerY - 40 / globalScale);
          ctx.restore();
        });
      },
      [allCases, graphData.nodes, nodeToCase, getCommunityColor, getConvexHull]
    );

    const paintLink = useCallback(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (link: any, ctx: CanvasRenderingContext2D) => {
        const start = link.source;
        const end = link.target;

        // Draw link
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.strokeStyle = getLinkColor(link);
        ctx.lineWidth = link.status === ChangeStatus.NEW ? 2 : 1;
        if (link.status === ChangeStatus.NEW) {
          ctx.setLineDash([5, 5]);
        } else {
          ctx.setLineDash([]);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw arrow
        const arrowLength = 8;
        const angle = Math.atan2(end.y - start.y, end.x - start.x);

        ctx.beginPath();
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(
          end.x - arrowLength * Math.cos(angle - Math.PI / 6),
          end.y - arrowLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
          end.x - arrowLength * Math.cos(angle + Math.PI / 6),
          end.y - arrowLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fillStyle = getLinkColor(link);
        ctx.fill();

        // Draw edge label if enabled
        if (showEdgeLabels && link.relationshipType) {
          const midX = (start.x + end.x) / 2;
          const midY = (start.y + end.y) / 2;
          const label = link.relationshipType;
          const fontSize = 10;

          ctx.font = `${fontSize}px Sans-Serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          // Measure text for background
          const textMetrics = ctx.measureText(label);
          const textWidth = textMetrics.width;
          const padding = 3;

          // Draw semi-transparent background
          ctx.fillStyle =
            theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.9)';
          ctx.fillRect(
            midX - textWidth / 2 - padding,
            midY - fontSize / 2 - padding,
            textWidth + padding * 2,
            fontSize + padding * 2
          );

          // Draw text
          ctx.fillStyle = theme.palette.text.secondary;
          ctx.fillText(label, midX, midY);
        }
      },
      [getLinkColor, showEdgeLabels, theme]
    );

    return (
      <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
        <Box
          sx={{
            width: '100%',
            height: '100%',
            bgcolor: theme.palette.mode === 'dark' ? '#1a1a1a' : '#f5f5f5',
            borderRadius: 1,
            overflow: 'hidden',
            cursor: edgeCreateMode ? 'crosshair' : 'default',
          }}
        >
          <ForceGraph2D
            ref={graphRef}
            graphData={graphData}
            width={width}
            height={height}
            backgroundColor={theme.palette.mode === 'dark' ? '#1a1a1a' : '#f5f5f5'}
            nodeCanvasObject={paintNode}
            linkCanvasObject={paintLink}
            nodeCanvasObjectMode={() => 'after'}
            onNodeHover={handleNodeHover}
            onNodeClick={handleNodeClick}
            onLinkClick={handleLinkClick}
            enableNodeDrag={true}
            enableZoomInteraction={true}
            enablePanInteraction={true}
            cooldownTicks={100}
            onEngineStop={() => {
              // Only zoom to fit on initial load, not on every simulation stop
              if (!hasInitialized && graphData.nodes.length > 0) {
                graphRef.current?.zoomToFit(400, 50);
                setHasInitialized(true);
              }
            }}
            d3AlphaDecay={0.02}
            d3VelocityDecay={0.3}
            onRenderFramePost={(ctx, globalScale) => {
              if (showCommunities) {
                drawCommunityHulls(ctx, globalScale);
              }
            }}
          />
        </Box>

        {/* Zoom Controls */}
        <Stack
          spacing={1}
          sx={{
            position: 'absolute',
            bottom: 16,
            right: 16,
            zIndex: 1000,
          }}
        >
          <Tooltip title="Zoom In" placement="left">
            <Paper elevation={3}>
              <IconButton
                onClick={handleZoomIn}
                color="primary"
                size="medium"
                sx={{
                  bgcolor: theme.palette.background.paper,
                  '&:hover': {
                    bgcolor: theme.palette.action.hover,
                  },
                }}
              >
                <ZoomInIcon />
              </IconButton>
            </Paper>
          </Tooltip>
          <Tooltip title="Zoom Out" placement="left">
            <Paper elevation={3}>
              <IconButton
                onClick={handleZoomOut}
                color="primary"
                size="medium"
                sx={{
                  bgcolor: theme.palette.background.paper,
                  '&:hover': {
                    bgcolor: theme.palette.action.hover,
                  },
                }}
              >
                <ZoomOutIcon />
              </IconButton>
            </Paper>
          </Tooltip>
        </Stack>

        {/* Hover tooltip */}
        {hoveredNode && (
          <Paper
            sx={{
              position: 'absolute',
              top: 16,
              right: 16,
              p: 2,
              maxWidth: 300,
              zIndex: 1000,
            }}
            elevation={4}
          >
            <Typography variant="h6" gutterBottom>
              {hoveredNode.name}
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Type: {hoveredNode.type}
            </Typography>
            <Typography
              variant="body2"
              color={hoveredNode.status === ChangeStatus.NEW ? 'success.main' : 'text.secondary'}
              gutterBottom
              sx={{ fontWeight: 'bold' }}
            >
              Status: {hoveredNode.status === ChangeStatus.NEW ? 'Proposed New' : 'Existing'}
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              Properties:
            </Typography>
            <Box sx={{ pl: 2 }}>
              {Object.entries(hoveredNode.properties).map(([key, value]) => (
                <Typography key={key} variant="caption" display="block">
                  <strong>{key}:</strong> {String(value)}
                </Typography>
              ))}
            </Box>
          </Paper>
        )}
      </Box>
    );
  }
);

GraphVisualization.displayName = 'GraphVisualization';

export default GraphVisualization;
