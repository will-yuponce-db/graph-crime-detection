import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Card,
  CardContent,
  Chip,
  Avatar,
  Stack,
  Alert,
  CircularProgress,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  useTheme,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from '@mui/material';
import {
  Hub,
  ArrowForward,
  Cloud,
  Close,
  Phone,
  LocationOn,
  Warning,
  History,
  Download,
  People,
  Call,
  Place,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import ForceGraph2D from 'react-force-graph-2d';
import { fetchGraphData, fetchSuspects, USE_DATABRICKS } from '../services/api';

interface GraphNode {
  id: string;
  name: string;
  alias?: string;
  type: 'person' | 'location';
  isSuspect?: boolean;
  city?: string;
  color: string;
  size: number;
  fx?: number;
  fy?: number;
  x?: number;
  y?: number;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  type: string;
  edgeCategory?: 'colocation' | 'social' | 'location';
  count?: number;
  color: string;
  width: number;
  curvature?: number;
}

interface Suspect {
  id: string;
  name: string;
  alias: string | null;
  threatLevel: string;
  criminalHistory: string | null;
  device?: string;
  linkedCities?: string[];
  totalScore?: number;
}

const GraphExplorer: React.FC = () => {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<{ refresh?: () => void } | null>(null);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const theme = useTheme();

  const [loading, setLoading] = useState(true);
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; links: GraphLink[] }>({
    nodes: [],
    links: [],
  });
  const [suspects, setSuspects] = useState<Suspect[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [showBurner, setShowBurner] = useState(false);
  const [selectedSuspect, setSelectedSuspect] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileSuspect, setProfileSuspect] = useState<Suspect | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  // Edge visibility toggles
  const [visibleEdges, setVisibleEdges] = useState<string[]>(['colocation', 'social', 'location']);

  // Node visibility toggles
  const [visibleNodes, setVisibleNodes] = useState<string[]>(['suspects', 'locations']);

  // Filtered graph data based on node and edge visibility
  const filteredGraphData = useMemo(() => {
    // Filter nodes based on visibility
    const filteredNodes = graphData.nodes.filter((node) => {
      if (node.type === 'person' && node.isSuspect) {
        return visibleNodes.includes('suspects');
      }
      if (node.type === 'location') {
        return visibleNodes.includes('locations');
      }
      return true;
    });

    const visibleNodeIds = new Set(filteredNodes.map((n) => n.id));

    // Filter links - must have both endpoints visible AND edge type visible
    const filteredLinks = graphData.links.filter((link) => {
      const sourceId =
        typeof link.source === 'string' ? link.source : (link.source as GraphNode).id;
      const targetId =
        typeof link.target === 'string' ? link.target : (link.target as GraphNode).id;

      // Both nodes must be visible
      if (!visibleNodeIds.has(sourceId) || !visibleNodeIds.has(targetId)) {
        return false;
      }

      // Edge type must be visible
      const category = link.edgeCategory || 'location';
      return visibleEdges.includes(category);
    });

    return {
      nodes: filteredNodes,
      links: filteredLinks,
    };
  }, [graphData, visibleEdges, visibleNodes]);

  // Handle edge toggle
  const handleEdgeToggle = (_event: React.MouseEvent<HTMLElement>, newEdges: string[]) => {
    if (newEdges.length > 0) {
      setVisibleEdges(newEdges);
    }
  };

  // Handle node toggle
  const handleNodeToggle = (_event: React.MouseEvent<HTMLElement>, newNodes: string[]) => {
    if (newNodes.length > 0) {
      setVisibleNodes(newNodes);
    }
  };

  // Handle single click with delay to distinguish from double-click
  const handleCardClick = useCallback((suspectId: string) => {
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
    }
    clickTimeoutRef.current = setTimeout(() => {
      setSelectedSuspect((prev) => (prev === suspectId ? null : suspectId));
      clickTimeoutRef.current = null;
    }, 200);
  }, []);

  // Handle double-click - cancel pending single click
  const handleCardDoubleClick = useCallback((suspect: Suspect) => {
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    setSelectedSuspect(suspect.id);
    setProfileSuspect(suspect);
    setProfileOpen(true);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);

  // Export suspects to CSV
  const exportSuspectsCSV = () => {
    const headers = [
      'Name',
      'Alias',
      'Threat Level',
      'Risk Score',
      'Device',
      'Linked Cities',
      'Criminal History',
    ];
    const rows = suspects.map((s) => [
      s.name,
      s.alias || '',
      s.threatLevel,
      s.totalScore?.toFixed(2) || '',
      s.device || '',
      s.linkedCities?.join('; ') || '',
      s.criminalHistory || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `suspects_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // Fetch graph data from API
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [graphData, suspectsData] = await Promise.all([fetchGraphData(), fetchSuspects()]);

        // Map suspects to expected format
        setSuspects(
          suspectsData.map((p) => ({
            id: p.id,
            name: p.name,
            alias: p.alias,
            threatLevel: p.threatLevel || 'Unknown',
            criminalHistory: p.criminalHistory,
            device: 'Device ' + p.id.slice(-4),
            linkedCities: p.linkedCities,
            totalScore: p.totalScore,
          }))
        );

        // Build fixed-layout graph
        buildGraph(graphData || { nodes: [], links: [] });
      } catch (err) {
        console.error('Failed to fetch graph data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const buildGraph = (apiData: {
    nodes: {
      id: string;
      name: string;
      alias?: string;
      type: string;
      city?: string;
      isSuspect?: boolean;
      linkedCities?: string[];
    }[];
    links: { source: string; target: string; type: string; count?: number; weight?: number }[];
  }) => {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];

    const cx = 0,
      cy = 0;

    // Find suspects from API data
    const suspectNodes = apiData.nodes?.filter((n) => n.type === 'person' && n.isSuspect) || [];
    const locationNodes = apiData.nodes?.filter((n) => n.type === 'location') || [];

    // Add suspects with positions
    if (suspectNodes.length >= 2) {
      // Position top suspects in center
      suspectNodes.slice(0, 4).forEach((suspect, i) => {
        const angle = (i / Math.min(suspectNodes.length, 4)) * Math.PI * 2 - Math.PI / 2;
        const radius = 60;
        nodes.push({
          id: suspect.id,
          name: suspect.name,
          alias: suspect.alias || suspect.id.slice(-4),
          type: 'person',
          color: '#dc2626',
          size: 12 - i * 2,
          isSuspect: true,
          fx: cx + Math.cos(angle) * radius,
          fy: cy + Math.sin(angle) * radius,
        });
      });
    } else {
      // Fallback defaults
      nodes.push(
        {
          id: 'person_marcus',
          name: 'Marcus Williams',
          alias: 'Ghost',
          type: 'person',
          color: '#dc2626',
          size: 12,
          isSuspect: true,
          fx: cx - 80,
          fy: cy,
        },
        {
          id: 'person_darius',
          name: 'Darius Jackson',
          alias: 'Slim',
          type: 'person',
          color: '#dc2626',
          size: 12,
          isSuspect: true,
          fx: cx + 80,
          fy: cy,
        }
      );
    }

    // Use API location nodes or fallback to defaults
    if (locationNodes.length > 0) {
      // Position location nodes in a circle around suspects
      locationNodes.slice(0, 6).forEach((loc, i) => {
        const angle = (i / Math.min(locationNodes.length, 6)) * Math.PI * 2;
        const radius = 180;
        const cityColor =
          loc.city?.includes('DC') || loc.city?.includes('Washington')
            ? '#3b82f6'
            : loc.city?.includes('Nashville')
              ? '#22c55e'
              : '#f97316';
        nodes.push({
          id: loc.id,
          name: loc.name || loc.city || 'Location',
          type: 'location',
          city: loc.city,
          color: cityColor,
          size: 8,
          fx: cx + Math.cos(angle) * radius,
          fy: cy + Math.sin(angle) * radius,
        });
      });
    } else {
      // Fallback: DC and Nashville locations
      const defaultLocations = [
        { id: 'loc_georgetown', name: 'Georgetown', city: 'DC' },
        { id: 'loc_adams_morgan', name: 'Adams Morgan', city: 'DC' },
        { id: 'loc_dupont_circle', name: 'Dupont Circle', city: 'DC' },
        { id: 'loc_east_nashville', name: 'East Nashville', city: 'Nashville' },
        { id: 'loc_the_gulch', name: 'The Gulch', city: 'Nashville' },
      ];

      defaultLocations.forEach((loc, i) => {
        const angle = (i / defaultLocations.length) * Math.PI * 2;
        const radius = 180;
        nodes.push({
          id: loc.id,
          name: loc.name,
          type: 'location',
          city: loc.city,
          color: loc.city === 'DC' ? '#3b82f6' : '#22c55e',
          size: 8,
          fx: cx + Math.cos(angle) * radius,
          fy: cy + Math.sin(angle) * radius,
        });
      });
    }

    // Add links from API data
    const nodeIds = new Set(nodes.map((n) => n.id));
    const personNodeIds = new Set(nodes.filter((n) => n.type === 'person').map((n) => n.id));

    // Process API links
    apiData.links?.forEach((link) => {
      if (nodeIds.has(link.source) && nodeIds.has(link.target)) {
        const isCoLocated = link.type === 'CO_LOCATED';
        const isSocial = link.type === 'SOCIAL' || link.type === 'CONTACTED';

        // CO_LOCATED can only be between people - skip if either node is not a person
        if (isCoLocated && (!personNodeIds.has(link.source) || !personNodeIds.has(link.target))) {
          return;
        }

        // Determine edge category for filtering
        const edgeCategory = isCoLocated ? 'colocation' : isSocial ? 'social' : 'location';

        links.push({
          source: link.source,
          target: link.target,
          type: link.type,
          edgeCategory,
          color: isCoLocated ? '#fbbf24' : isSocial ? '#a78bfa' : '#3b82f640',
          width: isCoLocated ? 3 : isSocial ? 2 : 1,
          count: isCoLocated ? link.count : undefined,
          curvature: isSocial ? 0.25 : 0,
        });
      }
    });

    // Check if we have CO_LOCATED links between suspects from API
    const hasCoLocatedLinks = links.some((l) => l.type === 'CO_LOCATED');
    const suspectNodesList = nodes.filter((n) => n.isSuspect);

    // Always ensure CO_LOCATED links between suspects if we have multiple suspects
    if (!hasCoLocatedLinks && suspectNodesList.length >= 2) {
      // Create CO_LOCATED connections between suspects
      for (let i = 0; i < suspectNodesList.length - 1; i++) {
        for (let j = i + 1; j < suspectNodesList.length; j++) {
          links.push({
            source: suspectNodesList[i].id,
            target: suspectNodesList[j].id,
            type: 'CO_LOCATED',
            edgeCategory: 'colocation',
            color: '#fbbf24',
            width: 3,
            count: Math.floor(Math.random() * 8) + 3, // Random co-location count 3-10
          });
        }
      }
    }

    // If no location links, create default DETECTED connections
    const hasLocationLinks = links.some((l) => {
      const sourceNode = nodes.find(
        (n) => n.id === (typeof l.source === 'string' ? l.source : l.source)
      );
      const targetNode = nodes.find(
        (n) => n.id === (typeof l.target === 'string' ? l.target : l.target)
      );
      return sourceNode?.type === 'location' || targetNode?.type === 'location';
    });

    if (!hasLocationLinks && nodes.length >= 2) {
      // Connect suspects to locations (using DETECTED, not CO_LOCATED)
      const locationNodesList = nodes.filter((n) => n.type === 'location');
      suspectNodesList.forEach((suspect) => {
        locationNodesList.forEach((loc) => {
          links.push({
            source: suspect.id,
            target: loc.id,
            type: 'DETECTED',
            edgeCategory: 'location',
            color: `${loc.color}40`,
            width: 1,
            curvature: 0,
          });
        });
      });
    }

    setGraphData({ nodes, links });
  };

  const handleCollapse = useCallback(() => {
    setCollapsed(true);
    setGraphData((prev) => ({
      nodes: prev.nodes
        .filter((n) => n.isSuspect || n.id === 'loc_georgetown')
        .map((n) => {
          if (n.id === 'loc_georgetown') return { ...n, fx: 0, fy: -150 };
          return n;
        }),
      links: prev.links.filter((l) => {
        const sourceId = typeof l.source === 'object' ? (l.source as GraphNode).id : l.source;
        const targetId = typeof l.target === 'object' ? (l.target as GraphNode).id : l.target;
        const validIds = ['person_marcus', 'person_darius', 'loc_georgetown'];
        return validIds.includes(sourceId) && validIds.includes(targetId);
      }),
    }));
  }, []);

  const handleDetectBurner = useCallback(() => {
    setShowBurner(true);
    setGraphData((prev) => {
      const newNodes = [...prev.nodes];
      const newLinks = [...prev.links];

      newNodes.push({
        id: 'loc_baltimore',
        name: 'Harbor District',
        type: 'location',
        color: '#f97316',
        size: 8,
        city: 'Baltimore',
        fx: 0,
        fy: 180,
      });

      newLinks.push({
        source: 'person_marcus',
        target: 'loc_baltimore',
        type: 'FLED_TO',
        color: '#f9731680',
        width: 2,
      });

      return { nodes: newNodes, links: newLinks };
    });
  }, []);

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '80vh',
          bgcolor: 'background.default',
        }}
      >
        <CircularProgress sx={{ color: theme.palette.accent.orange }} />
      </Box>
    );
  }

  return (
    <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', bgcolor: 'background.default' }}>
      {/* Graph Area */}
      <Box
        ref={containerRef}
        sx={{
          flex: 1,
          position: 'relative',
          background:
            theme.palette.mode === 'dark'
              ? `radial-gradient(ellipse at 30% 20%, rgba(99, 102, 241, 0.08) 0%, transparent 50%),
               radial-gradient(ellipse at 70% 80%, rgba(239, 68, 68, 0.06) 0%, transparent 40%),
               radial-gradient(ellipse at 50% 50%, rgba(251, 146, 60, 0.04) 0%, transparent 60%),
               linear-gradient(180deg, #09090b 0%, #0c0c0f 50%, #09090b 100%)`
              : `radial-gradient(ellipse at 30% 20%, rgba(99, 102, 241, 0.06) 0%, transparent 50%),
               radial-gradient(ellipse at 70% 80%, rgba(239, 68, 68, 0.04) 0%, transparent 40%),
               linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)`,
          overflow: 'hidden',
        }}
      >
        {/* Animated grid pattern overlay */}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            opacity: theme.palette.mode === 'dark' ? 0.03 : 0.02,
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
            pointerEvents: 'none',
          }}
        />
        <ForceGraph2D
          ref={graphRef}
          graphData={filteredGraphData}
          width={containerRef.current?.clientWidth || 800}
          height={containerRef.current?.clientHeight || 600}
          backgroundColor="transparent"
          nodeRelSize={1}
          nodeVal={(node) => (node as GraphNode).size}
          d3AlphaDecay={1}
          d3VelocityDecay={1}
          cooldownTicks={0}
          onNodeHover={(node) => {
            setHoveredNode(node ? (node as GraphNode).id : null);
          }}
          onNodeClick={(node, event) => {
            event.stopPropagation();
            const n = node as GraphNode;
            if (n.type === 'person' && n.isSuspect) {
              setSelectedSuspect(selectedSuspect === n.id ? null : n.id);
            }
          }}
          nodePointerAreaPaint={(node, color, ctx) => {
            const n = node as GraphNode;
            const r = n.size + 8;
            if (typeof node.x !== 'number' || typeof node.y !== 'number') return;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
            ctx.fill();
          }}
          nodeCanvasObject={(node, ctx) => {
            const n = node as GraphNode;
            const baseR = n.size;
            const isHovered = hoveredNode === n.id;
            const isSelected = selectedSuspect === n.id;
            const r = isHovered ? baseR * 1.2 : baseR;

            if (
              typeof node.x !== 'number' ||
              typeof node.y !== 'number' ||
              !isFinite(node.x) ||
              !isFinite(node.y)
            ) {
              return;
            }

            if (n.type === 'person') {
              // Outer glow ring for suspects
              if (n.isSuspect) {
                const pulseScale = 1;
                const pulseAlpha = 0.2;

                // Outer glow ring
                const gradient = ctx.createRadialGradient(
                  node.x,
                  node.y,
                  r * 0.5,
                  node.x,
                  node.y,
                  r * 3 * pulseScale
                );
                gradient.addColorStop(0, `rgba(255, 80, 80, ${pulseAlpha * 0.8})`);
                gradient.addColorStop(0.5, `rgba(255, 50, 50, ${pulseAlpha * 0.4})`);
                gradient.addColorStop(1, 'rgba(255, 50, 50, 0)');

                ctx.beginPath();
                ctx.arc(node.x, node.y, r * 3 * pulseScale, 0, 2 * Math.PI);
                ctx.fillStyle = gradient;
                ctx.fill();
              }

              // Inner glow
              const innerGlow = ctx.createRadialGradient(
                node.x,
                node.y,
                0,
                node.x,
                node.y,
                r * 1.8
              );
              innerGlow.addColorStop(0, 'rgba(255, 100, 100, 0.6)');
              innerGlow.addColorStop(0.6, 'rgba(255, 60, 60, 0.2)');
              innerGlow.addColorStop(1, 'rgba(255, 60, 60, 0)');

              ctx.beginPath();
              ctx.arc(node.x, node.y, r * 1.8, 0, 2 * Math.PI);
              ctx.fillStyle = innerGlow;
              ctx.fill();

              // Main node with gradient
              const mainGrad = ctx.createRadialGradient(
                node.x - r * 0.3,
                node.y - r * 0.3,
                0,
                node.x,
                node.y,
                r
              );
              mainGrad.addColorStop(0, '#ff6b6b');
              mainGrad.addColorStop(0.7, '#dc2626');
              mainGrad.addColorStop(1, '#b91c1c');

              ctx.beginPath();
              ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
              ctx.fillStyle = mainGrad;
              ctx.fill();

              // Highlight ring
              if (n.isSuspect) {
                ctx.strokeStyle = isSelected
                  ? 'rgba(255, 255, 255, 0.95)'
                  : isHovered
                    ? 'rgba(255, 255, 255, 0.8)'
                    : 'rgba(255, 255, 255, 0.5)';
                ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2 : 1.5;
                ctx.stroke();

                // Secondary ring
                ctx.beginPath();
                ctx.arc(node.x, node.y, r + 4, 0, 2 * Math.PI);
                ctx.strokeStyle = `rgba(255, 100, 100, ${isSelected ? 0.6 : 0.3})`;
                ctx.lineWidth = 1;
                ctx.stroke();
              }

              // Specular highlight
              ctx.beginPath();
              ctx.arc(node.x - r * 0.25, node.y - r * 0.25, r * 0.35, 0, 2 * Math.PI);
              ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
              ctx.fill();

              // Label
              ctx.font = `bold 11px "SF Pro Display", "Segoe UI", system-ui, sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';
              ctx.fillStyle = theme.palette.mode === 'dark' ? '#fff' : '#1a1a2e';
              ctx.fillText(n.alias || n.name, node.x, node.y + r + 8);
            } else {
              // Location nodes - hexagonal with glow
              const s = r * 1.2;
              const isLocationHovered = isHovered;

              // Glow effect
              const locGlow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, s * 2.5);
              const baseColor = n.color || '#3b82f6';
              locGlow.addColorStop(0, baseColor.replace(')', ', 0.4)').replace('rgb', 'rgba'));
              locGlow.addColorStop(0.5, baseColor.replace(')', ', 0.15)').replace('rgb', 'rgba'));
              locGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');

              // Apply hex color conversion for glow
              const hexToRgba = (hex: string, alpha: number) => {
                const r = parseInt(hex.slice(1, 3), 16);
                const g = parseInt(hex.slice(3, 5), 16);
                const b = parseInt(hex.slice(5, 7), 16);
                return `rgba(${r}, ${g}, ${b}, ${alpha})`;
              };

              const locGlow2 = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, s * 2.5);
              locGlow2.addColorStop(0, hexToRgba(baseColor, 0.4));
              locGlow2.addColorStop(0.5, hexToRgba(baseColor, 0.15));
              locGlow2.addColorStop(1, 'rgba(0, 0, 0, 0)');

              ctx.beginPath();
              ctx.arc(node.x, node.y, s * 2.5, 0, 2 * Math.PI);
              ctx.fillStyle = locGlow2;
              ctx.fill();

              // Hexagon shape
              ctx.save();
              ctx.translate(node.x, node.y);
              ctx.beginPath();
              for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i - Math.PI / 2;
                const x = Math.cos(angle) * s;
                const y = Math.sin(angle) * s;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
              }
              ctx.closePath();

              // Gradient fill
              const hexGrad = ctx.createLinearGradient(-s, -s, s, s);
              hexGrad.addColorStop(0, hexToRgba(baseColor, 0.9));
              hexGrad.addColorStop(1, hexToRgba(baseColor, 0.6));
              ctx.fillStyle = hexGrad;
              ctx.fill();

              // Border
              ctx.strokeStyle = isLocationHovered
                ? hexToRgba(baseColor, 1)
                : hexToRgba(baseColor, 0.7);
              ctx.lineWidth = isLocationHovered ? 2 : 1.5;
              ctx.stroke();
              ctx.restore();

              // Location icon (simple pin shape)
              ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
              ctx.beginPath();
              ctx.arc(node.x, node.y - 1, s * 0.3, 0, 2 * Math.PI);
              ctx.fill();

              // Label
              ctx.font = `600 10px "SF Pro Display", "Segoe UI", system-ui, sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';

              ctx.fillStyle = hexToRgba(baseColor, 1);
              ctx.fillText(n.name, node.x, node.y + s + 6);

              if (n.city) {
                ctx.font = `500 8px "SF Pro Display", system-ui, sans-serif`;
                ctx.fillStyle =
                  theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.4)';
                ctx.fillText(n.city, node.x, node.y + s + 18);
              }
            }
          }}
          linkCanvasObject={(link, ctx) => {
            const l = link as GraphLink;
            const start = link.source as GraphNode;
            const end = link.target as GraphNode;

            if (!start || !end) return;
            if (
              typeof start.x !== 'number' ||
              typeof start.y !== 'number' ||
              !isFinite(start.x) ||
              !isFinite(start.y)
            )
              return;
            if (
              typeof end.x !== 'number' ||
              typeof end.y !== 'number' ||
              !isFinite(end.x) ||
              !isFinite(end.y)
            )
              return;

            const isImportant = l.type === 'CO_LOCATED' || l.type === 'FLED_TO';

            // Calculate path
            let midX = (start.x + end.x) / 2;
            let midY = (start.y + end.y) / 2;
            let ctrlX = midX;
            let ctrlY = midY;

            if (l.curvature) {
              const dx = end.x - start.x;
              const dy = end.y - start.y;
              ctrlX = midX - dy * l.curvature;
              ctrlY = midY + dx * l.curvature;
              midX = ctrlX;
              midY = ctrlY;
            }

            // Draw glow for important links
            if (isImportant) {
              ctx.beginPath();
              if (l.curvature) {
                ctx.moveTo(start.x, start.y);
                ctx.quadraticCurveTo(ctrlX, ctrlY, end.x, end.y);
              } else {
                ctx.moveTo(start.x, start.y);
                ctx.lineTo(end.x, end.y);
              }
              ctx.strokeStyle =
                l.type === 'FLED_TO' ? 'rgba(251, 146, 60, 0.3)' : 'rgba(251, 191, 36, 0.3)';
              ctx.lineWidth = l.width * 4;
              ctx.stroke();
            }

            // Main line with gradient
            const gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
            const baseColor = l.color || '#3b82f6';

            if (isImportant) {
              gradient.addColorStop(0, l.type === 'FLED_TO' ? '#fb923c' : '#fbbf24');
              gradient.addColorStop(0.5, l.type === 'FLED_TO' ? '#f97316' : '#f59e0b');
              gradient.addColorStop(1, l.type === 'FLED_TO' ? '#fb923c' : '#fbbf24');
            } else {
              gradient.addColorStop(0, baseColor);
              gradient.addColorStop(1, baseColor);
            }

            ctx.beginPath();
            if (l.curvature) {
              ctx.moveTo(start.x, start.y);
              ctx.quadraticCurveTo(ctrlX, ctrlY, end.x, end.y);
            } else {
              ctx.moveTo(start.x, start.y);
              ctx.lineTo(end.x, end.y);
            }
            ctx.strokeStyle = gradient;
            ctx.lineWidth = l.width * (isImportant ? 1.5 : 1);
            ctx.stroke();

            // Label badge for important connections (only CO_LOCATED between people and FLED_TO)
            if ((l.type === 'CO_LOCATED' && l.count) || l.type === 'FLED_TO') {
              const label = l.type === 'CO_LOCATED' ? `${l.count}× co-located` : 'FLED TO';

              ctx.font = `600 9px "SF Pro Display", system-ui, sans-serif`;
              const textWidth = ctx.measureText(label).width;
              const badgeWidth = textWidth + 16;
              const badgeHeight = 20;

              // Badge background with gradient
              const badgeGrad = ctx.createLinearGradient(
                midX - badgeWidth / 2,
                midY - badgeHeight / 2,
                midX + badgeWidth / 2,
                midY + badgeHeight / 2
              );
              if (l.type === 'FLED_TO') {
                badgeGrad.addColorStop(0, '#1c1917');
                badgeGrad.addColorStop(1, '#292524');
              } else {
                badgeGrad.addColorStop(0, '#1a1a2e');
                badgeGrad.addColorStop(1, '#16161f');
              }

              ctx.beginPath();
              ctx.roundRect(
                midX - badgeWidth / 2,
                midY - badgeHeight / 2,
                badgeWidth,
                badgeHeight,
                10
              );
              ctx.fillStyle = badgeGrad;
              ctx.fill();

              // Badge border
              ctx.strokeStyle = l.type === 'FLED_TO' ? '#fb923c' : '#fbbf24';
              ctx.lineWidth = 1.5;
              ctx.stroke();

              // Badge text
              ctx.fillStyle = l.type === 'FLED_TO' ? '#fdba74' : '#fde047';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(label, midX, midY);
            }
          }}
        />

        {/* Header */}
        <Paper
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            p: 2,
            bgcolor:
              theme.palette.mode === 'dark' ? 'rgba(9, 9, 11, 0.8)' : 'rgba(255, 255, 255, 0.85)',
            borderBottom: 1,
            borderColor:
              theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
            borderRadius: 0,
            backdropFilter: 'blur(20px)',
            zIndex: 1000,
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" alignItems="center" spacing={2}>
              <Avatar sx={{ bgcolor: theme.palette.accent.orange, width: 36, height: 36 }}>
                <Hub sx={{ fontSize: 20 }} />
              </Avatar>
              <Box>
                <Typography
                  variant="subtitle1"
                  sx={{ color: 'text.primary', fontWeight: 700, lineHeight: 1.2 }}
                >
                  Network Analysis
                </Typography>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Suspect relationships across jurisdictions
                  </Typography>
                  {USE_DATABRICKS && (
                    <Chip
                      icon={<Cloud sx={{ fontSize: 12 }} />}
                      label="Databricks"
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: '0.6rem',
                        bgcolor: `${theme.palette.accent.orange}20`,
                        color: theme.palette.accent.orange,
                        '& .MuiChip-icon': { color: theme.palette.accent.orange },
                      }}
                    />
                  )}
                </Stack>
              </Box>
            </Stack>

            {/* Node Type Toggles */}
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
                NODES
              </Typography>
              <ToggleButtonGroup
                value={visibleNodes}
                onChange={handleNodeToggle}
                size="small"
                sx={{
                  '& .MuiToggleButton-root': {
                    border: 1,
                    borderColor: 'border.main',
                    color: 'text.secondary',
                    fontSize: '0.7rem',
                    px: 1.5,
                    py: 0.5,
                    textTransform: 'none',
                    '&.Mui-selected': {
                      borderColor: 'transparent',
                    },
                  },
                }}
              >
                <Tooltip title="Show/Hide Suspects">
                  <ToggleButton
                    value="suspects"
                    sx={{
                      '&.Mui-selected': {
                        bgcolor: `${theme.palette.accent.red}20`,
                        color: theme.palette.accent.red,
                        '&:hover': { bgcolor: `${theme.palette.accent.red}30` },
                      },
                    }}
                  >
                    <People sx={{ fontSize: 16, mr: 0.5 }} />
                    Suspects
                  </ToggleButton>
                </Tooltip>
                <Tooltip title="Show/Hide Locations">
                  <ToggleButton
                    value="locations"
                    sx={{
                      '&.Mui-selected': {
                        bgcolor: `${theme.palette.accent.blue}20`,
                        color: theme.palette.accent.blue,
                        '&:hover': { bgcolor: `${theme.palette.accent.blue}30` },
                      },
                    }}
                  >
                    <Place sx={{ fontSize: 16, mr: 0.5 }} />
                    Locations
                  </ToggleButton>
                </Tooltip>
              </ToggleButtonGroup>
            </Stack>

            <Divider orientation="vertical" flexItem sx={{ mx: 1, borderColor: 'border.main' }} />

            {/* Edge Type Toggles */}
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
                EDGES
              </Typography>
              <ToggleButtonGroup
                value={visibleEdges}
                onChange={handleEdgeToggle}
                size="small"
                sx={{
                  '& .MuiToggleButton-root': {
                    border: 1,
                    borderColor: 'border.main',
                    color: 'text.secondary',
                    fontSize: '0.7rem',
                    px: 1.5,
                    py: 0.5,
                    textTransform: 'none',
                    '&.Mui-selected': {
                      borderColor: 'transparent',
                    },
                  },
                }}
              >
                <Tooltip title="Co-location (Device Proximity)">
                  <ToggleButton
                    value="colocation"
                    sx={{
                      '&.Mui-selected': {
                        bgcolor: `${theme.palette.accent.yellow}20`,
                        color: theme.palette.accent.yellow,
                        '&:hover': { bgcolor: `${theme.palette.accent.yellow}30` },
                      },
                    }}
                  >
                    <People sx={{ fontSize: 16, mr: 0.5 }} />
                    Co-location
                  </ToggleButton>
                </Tooltip>
                <Tooltip title="Social Connections (Calls, Messages)">
                  <ToggleButton
                    value="social"
                    sx={{
                      '&.Mui-selected': {
                        bgcolor: `${theme.palette.accent.purple}20`,
                        color: theme.palette.accent.purple,
                        '&:hover': { bgcolor: `${theme.palette.accent.purple}30` },
                      },
                    }}
                  >
                    <Call sx={{ fontSize: 16, mr: 0.5 }} />
                    Social
                  </ToggleButton>
                </Tooltip>
                <Tooltip title="Location Links">
                  <ToggleButton
                    value="location"
                    sx={{
                      '&.Mui-selected': {
                        bgcolor: `${theme.palette.accent.blue}20`,
                        color: theme.palette.accent.blue,
                        '&:hover': { bgcolor: `${theme.palette.accent.blue}30` },
                      },
                    }}
                  >
                    <Place sx={{ fontSize: 16, mr: 0.5 }} />
                    Locations
                  </ToggleButton>
                </Tooltip>
              </ToggleButtonGroup>
            </Stack>

            <Stack direction="row" spacing={1}>
              {!collapsed && (
                <Button
                  variant="outlined"
                  size="small"
                  onClick={handleCollapse}
                  sx={{
                    borderColor: 'border.main',
                    color: 'text.secondary',
                    fontSize: '0.75rem',
                    '&:hover': {
                      borderColor: theme.palette.accent.orange,
                      color: theme.palette.accent.orange,
                    },
                  }}
                >
                  Focus
                </Button>
              )}
              {collapsed && !showBurner && (
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleDetectBurner}
                  sx={{
                    bgcolor: theme.palette.accent.purple,
                    color: '#fff',
                    fontSize: '0.75rem',
                    '&:hover': { bgcolor: '#6d28d9' },
                  }}
                >
                  🔮 Detect Burner
                </Button>
              )}
              <Button
                variant="outlined"
                size="small"
                startIcon={<Download sx={{ fontSize: 14 }} />}
                onClick={exportSuspectsCSV}
                sx={{
                  borderColor: 'border.main',
                  color: 'text.secondary',
                  fontSize: '0.75rem',
                  '&:hover': {
                    borderColor: theme.palette.accent.orange,
                    color: theme.palette.accent.orange,
                  },
                }}
              >
                Export
              </Button>
            </Stack>
          </Stack>
        </Paper>

        {/* Legend */}
        <Paper
          sx={{
            position: 'absolute',
            bottom: 16,
            left: 16,
            p: 2,
            bgcolor:
              theme.palette.mode === 'dark' ? 'rgba(9, 9, 11, 0.85)' : 'rgba(255, 255, 255, 0.9)',
            border: 1,
            borderColor:
              theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
            borderRadius: 3,
            backdropFilter: 'blur(16px)',
            zIndex: 1000,
          }}
        >
          <Typography
            variant="overline"
            sx={{
              color: 'text.secondary',
              fontSize: '0.6rem',
              letterSpacing: 1.5,
              display: 'block',
              mb: 1.5,
            }}
          >
            LEGEND
          </Typography>
          <Stack direction="row" spacing={3}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Box
                sx={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #ff6b6b 0%, #dc2626 100%)',
                  border: '2px solid rgba(255,255,255,0.6)',
                }}
              />
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                Suspect
              </Typography>
            </Stack>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Box
                sx={{
                  width: 12,
                  height: 12,
                  bgcolor: theme.palette.accent.blue,
                  clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
                }}
              />
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                DC
              </Typography>
            </Stack>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Box
                sx={{
                  width: 12,
                  height: 12,
                  bgcolor: theme.palette.accent.green,
                  clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
                }}
              />
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                Nashville
              </Typography>
            </Stack>
            {showBurner && (
              <Stack direction="row" alignItems="center" spacing={1}>
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    bgcolor: theme.palette.accent.orange,
                    clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
                  }}
                />
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                  Baltimore
                </Typography>
              </Stack>
            )}
          </Stack>
        </Paper>
      </Box>

      {/* Sidebar */}
      <Box
        sx={{
          width: 300,
          borderLeft: 1,
          borderColor: 'border.main',
          bgcolor: 'background.paper',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'border.main' }}>
          <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: 2 }}>
            ANALYSIS
          </Typography>
        </Box>

        {/* Key Stats */}
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'border.main' }}>
          <Stack spacing={1.5}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Suspects
              </Typography>
              <Chip
                label={suspects.length || 2}
                size="small"
                sx={{
                  bgcolor: `${theme.palette.accent.red}20`,
                  color: theme.palette.accent.red,
                  height: 20,
                  fontSize: '0.7rem',
                }}
              />
            </Stack>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Co-locations
              </Typography>
              <Chip
                label="10"
                size="small"
                sx={{
                  bgcolor: `${theme.palette.accent.yellow}20`,
                  color: theme.palette.accent.yellow,
                  height: 20,
                  fontSize: '0.7rem',
                }}
              />
            </Stack>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Jurisdictions
              </Typography>
              <Chip
                label="DC → Nashville"
                size="small"
                sx={{
                  bgcolor: `${theme.palette.accent.green}20`,
                  color: theme.palette.accent.green,
                  height: 20,
                  fontSize: '0.7rem',
                }}
              />
            </Stack>
            {showBurner && (
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Burner switch
                </Typography>
                <Chip
                  label="Detected"
                  size="small"
                  sx={{
                    bgcolor: `${theme.palette.accent.purple}20`,
                    color: theme.palette.accent.purple,
                    height: 20,
                    fontSize: '0.7rem',
                  }}
                />
              </Stack>
            )}
          </Stack>
        </Box>

        {/* Suspects */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
          <Typography
            variant="overline"
            sx={{ color: 'text.secondary', letterSpacing: 2, fontSize: '0.65rem' }}
          >
            SUSPECTS
          </Typography>

          {suspects.map((s, i) => (
            <Card
              key={s.id}
              onClick={() => handleCardClick(s.id)}
              onDoubleClick={() => handleCardDoubleClick(s)}
              sx={{
                mt: 1.5,
                bgcolor:
                  selectedSuspect === s.id ? `${theme.palette.accent.red}10` : 'background.default',
                border: 1,
                borderColor: selectedSuspect === s.id ? theme.palette.accent.red : 'border.main',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                '&:hover': { borderColor: theme.palette.accent.red },
              }}
            >
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Stack direction="row" alignItems="center" spacing={1.5}>
                  <Avatar
                    sx={{
                      bgcolor: theme.palette.accent.red,
                      width: 32,
                      height: 32,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {i + 1}
                  </Avatar>
                  <Box sx={{ flex: 1 }}>
                    <Typography
                      variant="body2"
                      sx={{ color: 'text.primary', fontWeight: 600, fontSize: '0.85rem' }}
                    >
                      {s.name}
                    </Typography>
                    {s.alias && (
                      <Typography variant="caption" sx={{ color: theme.palette.accent.orange }}>
                        "{s.alias}"
                      </Typography>
                    )}
                  </Box>
                  {s.totalScore && (
                    <Chip
                      label={s.totalScore.toFixed(1)}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: '0.65rem',
                        bgcolor:
                          s.totalScore > 1.5
                            ? `${theme.palette.accent.red}20`
                            : `${theme.palette.accent.orange}20`,
                        color:
                          s.totalScore > 1.5
                            ? theme.palette.accent.red
                            : theme.palette.accent.orange,
                      }}
                    />
                  )}
                </Stack>
                <Divider sx={{ my: 1, borderColor: 'border.main' }} />
                <Stack spacing={0.5}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: i === 0 && showBurner ? theme.palette.accent.purple : 'text.secondary',
                    }}
                  >
                    📱 {i === 0 && showBurner ? 'Prepaid (E2847) - BURNER' : s.device}
                  </Typography>
                  {s.linkedCities && s.linkedCities.length > 0 && (
                    <Typography
                      variant="caption"
                      sx={{ color: theme.palette.accent.blue, fontSize: '0.65rem' }}
                    >
                      📍 {s.linkedCities.join(', ')}
                    </Typography>
                  )}
                  {s.criminalHistory && (
                    <Typography
                      variant="caption"
                      sx={{ color: 'text.secondary', fontSize: '0.65rem' }}
                    >
                      {s.criminalHistory}
                    </Typography>
                  )}
                </Stack>
              </CardContent>
            </Card>
          ))}

          {showBurner && (
            <Alert
              severity="warning"
              sx={{
                mt: 2,
                bgcolor: `${theme.palette.accent.purple}15`,
                border: 1,
                borderColor: `${theme.palette.accent.purple}40`,
                '& .MuiAlert-icon': { color: theme.palette.accent.purple },
              }}
            >
              <Typography variant="caption" sx={{ color: theme.palette.accent.purple }}>
                Marcus switched to burner phone after Georgetown incident. New device detected in
                Baltimore.
              </Typography>
            </Alert>
          )}
        </Box>

        {/* Action */}
        <Box sx={{ p: 2, borderTop: 1, borderColor: 'border.main' }}>
          <Button
            variant="contained"
            fullWidth
            endIcon={<ArrowForward />}
            onClick={() => navigate('/evidence-card')}
            sx={{
              bgcolor: theme.palette.accent.orange,
              color: theme.palette.mode === 'dark' ? '#000' : '#fff',
              fontWeight: 700,
              '&:hover': { bgcolor: theme.palette.primary.light },
            }}
          >
            View Cases
          </Button>
        </Box>
      </Box>

      {/* Suspect Profile Modal */}
      <Dialog
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: 'background.paper',
            border: 1,
            borderColor: 'border.main',
          },
        }}
      >
        {profileSuspect && (
          <>
            <DialogTitle sx={{ pb: 1 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Stack direction="row" alignItems="center" spacing={2}>
                  <Avatar
                    sx={{
                      bgcolor: theme.palette.accent.red,
                      width: 48,
                      height: 48,
                      fontSize: 18,
                      fontWeight: 700,
                    }}
                  >
                    {profileSuspect.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </Avatar>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      {profileSuspect.name}
                    </Typography>
                    {profileSuspect.alias && (
                      <Typography variant="body2" sx={{ color: theme.palette.accent.orange }}>
                        "{profileSuspect.alias}"
                      </Typography>
                    )}
                  </Box>
                </Stack>
                <IconButton onClick={() => setProfileOpen(false)}>
                  <Close />
                </IconButton>
              </Stack>
            </DialogTitle>
            <DialogContent>
              <Divider sx={{ mb: 2 }} />

              {/* Threat Level */}
              <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
                <Chip
                  icon={<Warning sx={{ fontSize: 16 }} />}
                  label={`Threat: ${profileSuspect.threatLevel}`}
                  sx={{
                    bgcolor:
                      profileSuspect.threatLevel === 'High'
                        ? `${theme.palette.accent.red}20`
                        : `${theme.palette.accent.orange}20`,
                    color:
                      profileSuspect.threatLevel === 'High'
                        ? theme.palette.accent.red
                        : theme.palette.accent.orange,
                  }}
                />
                {profileSuspect.totalScore && (
                  <Chip
                    label={`Risk Score: ${profileSuspect.totalScore.toFixed(1)}`}
                    sx={{
                      bgcolor:
                        profileSuspect.totalScore > 1.5
                          ? `${theme.palette.accent.red}20`
                          : `${theme.palette.accent.yellow}20`,
                      color:
                        profileSuspect.totalScore > 1.5
                          ? theme.palette.accent.red
                          : theme.palette.accent.yellow,
                    }}
                  />
                )}
              </Stack>

              {/* Device Info */}
              <Paper sx={{ p: 2, mb: 2, bgcolor: 'background.default' }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                  <Phone sx={{ color: theme.palette.accent.purple, fontSize: 18 }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Device Information
                  </Typography>
                </Stack>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {profileSuspect.device || 'Unknown device'}
                </Typography>
              </Paper>

              {/* Linked Locations */}
              {profileSuspect.linkedCities && profileSuspect.linkedCities.length > 0 && (
                <Paper sx={{ p: 2, mb: 2, bgcolor: 'background.default' }}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    <LocationOn sx={{ color: theme.palette.accent.blue, fontSize: 18 }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      Linked Locations
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {profileSuspect.linkedCities.map((city) => (
                      <Chip
                        key={city}
                        label={city}
                        size="small"
                        sx={{
                          bgcolor: `${theme.palette.accent.blue}20`,
                          color: theme.palette.accent.blue,
                          fontSize: '0.75rem',
                        }}
                      />
                    ))}
                  </Stack>
                </Paper>
              )}

              {/* Criminal History */}
              {profileSuspect.criminalHistory && (
                <Paper sx={{ p: 2, bgcolor: 'background.default' }}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    <History sx={{ color: theme.palette.accent.red, fontSize: 18 }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      Criminal History
                    </Typography>
                  </Stack>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {profileSuspect.criminalHistory}
                  </Typography>
                </Paper>
              )}
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
              <Button
                variant="outlined"
                onClick={() => setProfileOpen(false)}
                sx={{ borderColor: 'border.main', color: 'text.secondary' }}
              >
                Close
              </Button>
              <Button
                variant="contained"
                onClick={() => {
                  setProfileOpen(false);
                  navigate('/evidence-card');
                }}
                sx={{
                  bgcolor: theme.palette.accent.orange,
                  color: theme.palette.mode === 'dark' ? '#000' : '#fff',
                }}
              >
                View Related Cases
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default GraphExplorer;
