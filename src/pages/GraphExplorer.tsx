import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Card,
  CardContent,
  Chip,
  Alert,
  CircularProgress,
  Avatar,
  Stack,
  Divider,
} from '@mui/material';
import { Hub, ArrowForward } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import ForceGraph2D from 'react-force-graph-2d';

interface GraphNode {
  id: string;
  name: string;
  type: 'person' | 'location';
  color: string;
  size: number;
  city?: string;
  device?: string;
  isSuspect?: boolean;
  // Fixed positions for cleaner layout
  fx?: number;
  fy?: number;
}

interface GraphLink {
  source: string;
  target: string;
  relationship: string;
  color: string;
  width: number;
  count?: number;
  curvature?: number;
}

const GraphExplorer: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [graphReady, setGraphReady] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showBurner, setShowBurner] = useState(false);
  const graphRef = useRef<{ zoomToFit: (duration: number, padding: number) => void } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; links: GraphLink[] }>({
    nodes: [],
    links: [],
  });

  useEffect(() => {
    buildGraph();
    const timer = setTimeout(() => setGraphReady(true), 200);
    return () => clearTimeout(timer);
  }, []);

  const buildGraph = () => {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];

    // Center point
    const cx = 0,
      cy = 0;

    // Suspects at center (slightly apart)
    nodes.push(
      {
        id: 'marcus',
        name: 'Marcus "Ghost"',
        type: 'person',
        color: '#dc2626',
        size: 12,
        device: 'E0412',
        isSuspect: true,
        fx: cx - 80,
        fy: cy,
      },
      {
        id: 'darius',
        name: 'Darius "Slim"',
        type: 'person',
        color: '#dc2626',
        size: 12,
        device: 'E1098',
        isSuspect: true,
        fx: cx + 80,
        fy: cy,
      }
    );

    // DC Locations - arc on left
    const dcLocations = [
      { id: 'georgetown', name: 'Georgetown', city: 'DC' },
      { id: 'adams', name: 'Adams Morgan', city: 'DC' },
      { id: 'dupont', name: 'Dupont Circle', city: 'DC' },
    ];
    dcLocations.forEach((loc, i) => {
      const angle = Math.PI + (i - 1) * 0.4; // Left side arc
      nodes.push({
        ...loc,
        type: 'location',
        color: '#3b82f6',
        size: 8,
        fx: cx + Math.cos(angle) * 280,
        fy: cy + Math.sin(angle) * 120,
      });
    });

    // Nashville Locations - arc on right
    const nashLocations = [
      { id: 'east_nash', name: 'East Nashville', city: 'Nashville' },
      { id: 'gulch', name: 'The Gulch', city: 'Nashville' },
    ];
    nashLocations.forEach((loc, i) => {
      const angle = (i - 0.5) * 0.5; // Right side
      nodes.push({
        ...loc,
        type: 'location',
        color: '#22c55e',
        size: 8,
        fx: cx + Math.cos(angle) * 280,
        fy: cy + Math.sin(angle) * 140,
      });
    });

    // Main connection between suspects
    links.push({
      source: 'marcus',
      target: 'darius',
      relationship: 'CO_LOCATED',
      color: '#fbbf24',
      width: 3,
      count: 10,
    });

    // Both suspects to all locations (curved for visual separation)
    [...dcLocations, ...nashLocations].forEach((loc) => {
      links.push(
        {
          source: 'marcus',
          target: loc.id,
          relationship: 'DETECTED',
          color: loc.city === 'DC' ? '#3b82f640' : '#22c55e40',
          width: 1,
          curvature: 0.2,
        },
        {
          source: 'darius',
          target: loc.id,
          relationship: 'DETECTED',
          color: loc.city === 'DC' ? '#3b82f640' : '#22c55e40',
          width: 1,
          curvature: -0.2,
        }
      );
    });

    setGraphData({ nodes, links });
    setLoading(false);
  };

  const handleCollapse = useCallback(() => {
    setGraphData((prev) => ({
      nodes: prev.nodes
        .filter((n) => ['marcus', 'darius', 'georgetown'].includes(n.id))
        .map((n) => {
          if (n.id === 'georgetown') return { ...n, fx: 0, fy: -150 };
          return n;
        }),
      links: prev.links.filter((l) => {
        const sourceId = typeof l.source === 'object' ? (l.source as { id: string }).id : l.source;
        const targetId = typeof l.target === 'object' ? (l.target as { id: string }).id : l.target;
        return (
          ['marcus', 'darius', 'georgetown'].includes(sourceId) &&
          ['marcus', 'darius', 'georgetown'].includes(targetId)
        );
      }),
    }));
    setCollapsed(true);
  }, []);

  const handleDetectBurner = useCallback(() => {
    setGraphData((prev) => {
      const newNodes = [...prev.nodes];
      const newLinks = [...prev.links];

      newNodes.push({
        id: 'baltimore',
        name: 'Harbor District',
        type: 'location',
        color: '#f97316',
        size: 8,
        city: 'Baltimore',
        fx: 0,
        fy: 180,
      });

      const marcus = newNodes.find((n) => n.id === 'marcus');
      if (marcus) marcus.device = 'E2847 (burner)';

      newLinks.push({
        source: 'marcus',
        target: 'baltimore',
        relationship: 'FLED_TO',
        color: '#f9731680',
        width: 2,
      });

      return { nodes: newNodes, links: newLinks };
    });
    setShowBurner(true);
  }, []);

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '80vh',
          bgcolor: '#0a0a0a',
        }}
      >
        <CircularProgress sx={{ color: '#f97316' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', bgcolor: '#09090b' }}>
      {/* Main Graph Area */}
      <Box ref={containerRef} sx={{ flex: 1, position: 'relative' }}>
        {graphReady && (
          <ForceGraph2D
            ref={graphRef}
            graphData={graphData}
            width={window.innerWidth - 320}
            height={window.innerHeight - 64}
            backgroundColor="#09090b"
            nodeRelSize={1}
            nodeVal={(node) => (node as GraphNode).size}
            // Disable physics since we're using fixed positions
            d3AlphaDecay={1}
            d3VelocityDecay={1}
            cooldownTicks={0}
            nodeCanvasObject={(node: unknown, ctx) => {
              const n = node as GraphNode;
              const r = n.size;

              // Guard against undefined positions
              if (
                typeof node.x !== 'number' ||
                typeof node.y !== 'number' ||
                !isFinite(node.x) ||
                !isFinite(node.y)
              ) {
                return;
              }

              if (n.type === 'person') {
                // Simple filled circle for people (no gradient to avoid issues)
                ctx.beginPath();
                ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
                ctx.fillStyle = '#dc2626';
                ctx.fill();

                // White ring for suspects
                if (n.isSuspect) {
                  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
                  ctx.lineWidth = 2;
                  ctx.stroke();
                }

                // Name below
                ctx.font = 'bold 11px Inter, -apple-system, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillStyle = '#fff';
                ctx.fillText(n.name, node.x, node.y + r + 14);

                // Device tag
                if (n.device) {
                  ctx.font = '9px Inter, -apple-system, sans-serif';
                  ctx.fillStyle = showBurner && n.id === 'marcus' ? '#a855f7' : '#71717a';
                  ctx.fillText(`📱 ${n.device}`, node.x, node.y + r + 26);
                }
              } else {
                // Clean diamond for locations
                ctx.beginPath();
                ctx.moveTo(node.x, node.y - r);
                ctx.lineTo(node.x + r, node.y);
                ctx.lineTo(node.x, node.y + r);
                ctx.lineTo(node.x - r, node.y);
                ctx.closePath();
                ctx.fillStyle = n.color;
                ctx.fill();

                // Location name
                ctx.font = '10px Inter, -apple-system, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillStyle = n.color;
                ctx.fillText(n.name, node.x, node.y + r + 12);

                // City badge
                if (n.city) {
                  ctx.font = '8px Inter, -apple-system, sans-serif';
                  ctx.fillStyle = '#52525b';
                  ctx.fillText(n.city, node.x, node.y + r + 22);
                }
              }
            }}
            linkCanvasObject={(link: unknown, ctx) => {
              const l = link as GraphLink;
              const start = link.source;
              const end = link.target;

              // Guard against undefined/non-finite positions
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

              // Draw curved or straight line
              ctx.beginPath();
              ctx.strokeStyle = l.color;
              ctx.lineWidth = l.width;

              if (l.curvature) {
                // Curved line
                const midX = (start.x + end.x) / 2;
                const midY = (start.y + end.y) / 2;
                const dx = end.x - start.x;
                const dy = end.y - start.y;
                const ctrlX = midX - dy * l.curvature;
                const ctrlY = midY + dx * l.curvature;

                ctx.moveTo(start.x, start.y);
                ctx.quadraticCurveTo(ctrlX, ctrlY, end.x, end.y);
              } else {
                ctx.moveTo(start.x, start.y);
                ctx.lineTo(end.x, end.y);
              }
              ctx.stroke();

              // Label only for main relationships (not DETECTED)
              if (l.relationship !== 'DETECTED') {
                const midX = (start.x + end.x) / 2;
                const midY = (start.y + end.y) / 2;

                const label = l.count ? `${l.count}× co-located` : l.relationship;

                // Background pill
                ctx.font = '9px Inter, -apple-system, sans-serif';
                const textWidth = ctx.measureText(label).width;

                ctx.fillStyle = '#18181b';
                ctx.beginPath();
                ctx.roundRect(midX - textWidth / 2 - 6, midY - 8, textWidth + 12, 16, 8);
                ctx.fill();

                ctx.strokeStyle = l.relationship === 'FLED_TO' ? '#f97316' : '#fbbf24';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Text
                ctx.fillStyle = l.relationship === 'FLED_TO' ? '#fb923c' : '#fcd34d';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(label, midX, midY);
              }
            }}
            onEngineStop={() => {
              if (graphRef.current) {
                graphRef.current.zoomToFit(200, 60);
              }
            }}
          />
        )}

        {/* Header */}
        <Paper
          sx={{
            position: 'absolute',
            top: 20,
            left: 20,
            right: 340,
            p: 2,
            bgcolor: 'rgba(9, 9, 11, 0.85)',
            border: '1px solid #27272a',
            borderRadius: 2,
            backdropFilter: 'blur(12px)',
            zIndex: 1000,
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" alignItems="center" spacing={2}>
              <Avatar sx={{ bgcolor: '#f97316', width: 36, height: 36 }}>
                <Hub sx={{ fontSize: 20 }} />
              </Avatar>
              <Box>
                <Typography
                  variant="subtitle1"
                  sx={{ color: '#fff', fontWeight: 700, lineHeight: 1.2 }}
                >
                  Network Analysis
                </Typography>
                <Typography variant="caption" sx={{ color: '#52525b' }}>
                  Suspect relationships & movements
                </Typography>
              </Box>
            </Stack>
            <Stack direction="row" spacing={1}>
              {!collapsed && (
                <Button
                  variant="outlined"
                  size="small"
                  onClick={handleCollapse}
                  sx={{
                    borderColor: '#27272a',
                    color: '#a1a1aa',
                    fontSize: '0.75rem',
                    '&:hover': { borderColor: '#f97316', color: '#f97316' },
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
                    bgcolor: '#7c3aed',
                    color: '#fff',
                    fontSize: '0.75rem',
                    '&:hover': { bgcolor: '#6d28d9' },
                  }}
                >
                  🔮 Detect Burner
                </Button>
              )}
            </Stack>
          </Stack>
        </Paper>

        {/* Minimal Legend */}
        <Paper
          sx={{
            position: 'absolute',
            bottom: 20,
            left: 20,
            p: 1.5,
            bgcolor: 'rgba(9, 9, 11, 0.85)',
            border: '1px solid #27272a',
            borderRadius: 2,
            backdropFilter: 'blur(12px)',
            zIndex: 1000,
          }}
        >
          <Stack direction="row" spacing={3}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  bgcolor: '#dc2626',
                  border: '1.5px solid rgba(255,255,255,0.6)',
                }}
              />
              <Typography variant="caption" sx={{ color: '#71717a' }}>
                Suspect
              </Typography>
            </Stack>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Box sx={{ width: 8, height: 8, bgcolor: '#3b82f6', transform: 'rotate(45deg)' }} />
              <Typography variant="caption" sx={{ color: '#71717a' }}>
                DC
              </Typography>
            </Stack>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Box sx={{ width: 8, height: 8, bgcolor: '#22c55e', transform: 'rotate(45deg)' }} />
              <Typography variant="caption" sx={{ color: '#71717a' }}>
                Nashville
              </Typography>
            </Stack>
            {showBurner && (
              <Stack direction="row" alignItems="center" spacing={1}>
                <Box sx={{ width: 8, height: 8, bgcolor: '#f97316', transform: 'rotate(45deg)' }} />
                <Typography variant="caption" sx={{ color: '#71717a' }}>
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
          borderLeft: '1px solid #27272a',
          bgcolor: '#0f0f0f',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box sx={{ p: 2, borderBottom: '1px solid #27272a' }}>
          <Typography variant="overline" sx={{ color: '#52525b', letterSpacing: 2 }}>
            ANALYSIS
          </Typography>
        </Box>

        {/* Key Stats */}
        <Box sx={{ p: 2, borderBottom: '1px solid #27272a' }}>
          <Stack spacing={1.5}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="caption" sx={{ color: '#71717a' }}>
                Suspects
              </Typography>
              <Chip
                label="2"
                size="small"
                sx={{ bgcolor: '#dc262620', color: '#ef4444', height: 20, fontSize: '0.7rem' }}
              />
            </Stack>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="caption" sx={{ color: '#71717a' }}>
                Co-locations
              </Typography>
              <Chip
                label="10"
                size="small"
                sx={{ bgcolor: '#fbbf2420', color: '#fbbf24', height: 20, fontSize: '0.7rem' }}
              />
            </Stack>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="caption" sx={{ color: '#71717a' }}>
                Jurisdictions
              </Typography>
              <Chip
                label="DC → Nashville"
                size="small"
                sx={{ bgcolor: '#22c55e20', color: '#22c55e', height: 20, fontSize: '0.7rem' }}
              />
            </Stack>
            {showBurner && (
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="caption" sx={{ color: '#71717a' }}>
                  Burner switch
                </Typography>
                <Chip
                  label="Detected"
                  size="small"
                  sx={{ bgcolor: '#7c3aed20', color: '#a78bfa', height: 20, fontSize: '0.7rem' }}
                />
              </Stack>
            )}
          </Stack>
        </Box>

        {/* Suspects */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
          <Typography
            variant="overline"
            sx={{ color: '#52525b', letterSpacing: 2, fontSize: '0.65rem' }}
          >
            SUSPECTS
          </Typography>

          {[
            {
              name: 'Marcus Williams',
              alias: 'Ghost',
              device: showBurner ? 'E2847 (burner)' : 'E0412',
            },
            { name: 'Darius Jackson', alias: 'Slim', device: 'E1098' },
          ].map((s, i) => (
            <Card
              key={i}
              sx={{
                mt: 1.5,
                bgcolor: '#18181b',
                border: '1px solid #27272a',
                '&:hover': { borderColor: '#dc2626' },
              }}
            >
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Stack direction="row" alignItems="center" spacing={1.5}>
                  <Avatar
                    sx={{
                      bgcolor: '#dc2626',
                      width: 32,
                      height: 32,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {i + 1}
                  </Avatar>
                  <Box>
                    <Typography
                      variant="body2"
                      sx={{ color: '#fff', fontWeight: 600, fontSize: '0.85rem' }}
                    >
                      {s.name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#f97316' }}>
                      "{s.alias}"
                    </Typography>
                  </Box>
                </Stack>
                <Divider sx={{ my: 1, borderColor: '#27272a' }} />
                <Typography
                  variant="caption"
                  sx={{ color: i === 0 && showBurner ? '#a78bfa' : '#52525b' }}
                >
                  📱 {s.device}
                </Typography>
              </CardContent>
            </Card>
          ))}

          {showBurner && (
            <Alert
              severity="warning"
              sx={{
                mt: 2,
                bgcolor: '#7c3aed15',
                border: '1px solid #7c3aed40',
                '& .MuiAlert-icon': { color: '#a78bfa' },
              }}
            >
              <Typography variant="caption" sx={{ color: '#c4b5fd' }}>
                Marcus switched to burner phone after Georgetown incident. New device detected in
                Baltimore.
              </Typography>
            </Alert>
          )}
        </Box>

        {/* Action */}
        <Box sx={{ p: 2, borderTop: '1px solid #27272a' }}>
          <Button
            variant="contained"
            fullWidth
            endIcon={<ArrowForward />}
            onClick={() => navigate('/evidence-card?case_id=CASE_008')}
            sx={{
              bgcolor: '#f97316',
              color: '#000',
              fontWeight: 700,
              '&:hover': { bgcolor: '#fb923c' },
            }}
          >
            Build Case
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default GraphExplorer;
