import React, { useState, useEffect, useCallback, useRef } from 'react';
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
} from '@mui/material';
import { Hub, ArrowForward } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import ForceGraph2D from 'react-force-graph-2d';

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
}

const GraphExplorer: React.FC = () => {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; links: GraphLink[] }>({
    nodes: [],
    links: [],
  });
  const [suspects, setSuspects] = useState<Suspect[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [showBurner, setShowBurner] = useState(false);

  // Fetch graph data from API
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [graphRes, personsRes, devicesRes] = await Promise.all([
          fetch('/api/demo/graph-data'),
          fetch('/api/demo/persons?suspects=true'),
          fetch('/api/demo/devices'),
        ]);

        const graphJson = await graphRes.json();
        const personsJson = await personsRes.json();
        const devicesJson = await devicesRes.json();

        if (personsJson.success) {
          const deviceMap = new Map(
            devicesJson.devices?.map((d: { owner_id: string; name: string }) => [
              d.owner_id,
              d.name,
            ]) || []
          );
          setSuspects(
            personsJson.persons.map(
              (p: {
                id: string;
                name: string;
                alias: string | null;
                threat_level: string;
                criminal_history: string | null;
              }) => ({
                id: p.id,
                name: p.name,
                alias: p.alias,
                threatLevel: p.threat_level,
                criminalHistory: p.criminal_history,
                device: deviceMap.get(p.id) || 'Unknown',
              })
            )
          );
        }

        // Build fixed-layout graph
        buildGraph(graphJson.success ? graphJson : { nodes: [], links: [] });
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
    }[];
    links: { source: string; target: string; type: string; count?: number }[];
  }) => {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];

    const cx = 0,
      cy = 0;

    // Find suspects from API data
    const suspectNodes = apiData.nodes?.filter((n) => n.type === 'person' && n.isSuspect) || [];

    // Add suspects (or use defaults if not in API)
    if (suspectNodes.length >= 2) {
      nodes.push(
        {
          id: suspectNodes[0].id,
          name: suspectNodes[0].name,
          alias: suspectNodes[0].alias,
          type: 'person',
          color: '#dc2626',
          size: 12,
          isSuspect: true,
          fx: cx - 80,
          fy: cy,
        },
        {
          id: suspectNodes[1].id,
          name: suspectNodes[1].name,
          alias: suspectNodes[1].alias,
          type: 'person',
          color: '#dc2626',
          size: 12,
          isSuspect: true,
          fx: cx + 80,
          fy: cy,
        }
      );
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

    // DC locations
    const dcLocations = [
      { id: 'loc_georgetown', name: 'Georgetown', city: 'DC' },
      { id: 'loc_adams_morgan', name: 'Adams Morgan', city: 'DC' },
      { id: 'loc_dupont_circle', name: 'Dupont Circle', city: 'DC' },
    ];

    // Nashville locations
    const nashLocations = [
      { id: 'loc_east_nashville', name: 'East Nashville', city: 'Nashville' },
      { id: 'loc_the_gulch', name: 'The Gulch', city: 'Nashville' },
    ];

    // Position DC locations on left arc
    dcLocations.forEach((loc, i) => {
      const angle = Math.PI * (0.8 + i * 0.2);
      const radius = 180;
      nodes.push({
        id: loc.id,
        name: loc.name,
        type: 'location',
        city: loc.city,
        color: '#3b82f6',
        size: 8,
        fx: cx + Math.cos(angle) * radius,
        fy: cy + Math.sin(angle) * radius,
      });
    });

    // Position Nashville locations on right arc
    nashLocations.forEach((loc, i) => {
      const angle = Math.PI * (0.2 - i * 0.2);
      const radius = 180;
      nodes.push({
        id: loc.id,
        name: loc.name,
        type: 'location',
        city: loc.city,
        color: '#22c55e',
        size: 8,
        fx: cx + Math.cos(angle) * radius,
        fy: cy + Math.sin(angle) * radius,
      });
    });

    // Main connection between suspects
    links.push({
      source: nodes[0].id,
      target: nodes[1].id,
      type: 'CO_LOCATED',
      color: '#fbbf24',
      width: 3,
      count: 10,
    });

    // Both suspects to all locations
    const allLocations = [...dcLocations, ...nashLocations];
    allLocations.forEach((loc) => {
      links.push(
        {
          source: nodes[0].id,
          target: loc.id,
          type: 'DETECTED',
          color: loc.city === 'DC' ? '#3b82f640' : '#22c55e40',
          width: 1,
          curvature: 0.2,
        },
        {
          source: nodes[1].id,
          target: loc.id,
          type: 'DETECTED',
          color: loc.city === 'DC' ? '#3b82f640' : '#22c55e40',
          width: 1,
          curvature: -0.2,
        }
      );
    });

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
          bgcolor: '#0a0a0a',
        }}
      >
        <CircularProgress sx={{ color: '#f97316' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', bgcolor: '#0a0a0a' }}>
      {/* Graph Area */}
      <Box ref={containerRef} sx={{ flex: 1, position: 'relative' }}>
        <ForceGraph2D
          graphData={graphData}
          width={containerRef.current?.clientWidth || 800}
          height={containerRef.current?.clientHeight || 600}
          backgroundColor="#09090b"
          nodeRelSize={1}
          nodeVal={(node) => (node as GraphNode).size}
          d3AlphaDecay={1}
          d3VelocityDecay={1}
          cooldownTicks={0}
          nodeCanvasObject={(node, ctx) => {
            const n = node as GraphNode;
            const r = n.size;

            if (
              typeof node.x !== 'number' ||
              typeof node.y !== 'number' ||
              !isFinite(node.x) ||
              !isFinite(node.y)
            ) {
              return;
            }

            if (n.type === 'person') {
              ctx.beginPath();
              ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
              ctx.fillStyle = '#dc2626';
              ctx.fill();

              if (n.isSuspect) {
                ctx.strokeStyle = 'rgba(255,255,255,0.6)';
                ctx.lineWidth = 1.5;
                ctx.stroke();
              }

              ctx.font = 'bold 11px Inter, -apple-system, sans-serif';
              ctx.textAlign = 'center';
              ctx.fillStyle = '#fff';
              ctx.fillText(n.alias || n.name, node.x, node.y + r + 14);
            } else {
              const s = r;
              ctx.save();
              ctx.translate(node.x, node.y);
              ctx.rotate(Math.PI / 4);
              ctx.fillStyle = n.color;
              ctx.fillRect(-s / 2, -s / 2, s, s);
              ctx.restore();

              ctx.font = '10px Inter, -apple-system, sans-serif';
              ctx.textAlign = 'center';
              ctx.fillStyle = n.color;
              ctx.fillText(n.name, node.x, node.y + r + 12);

              if (n.city) {
                ctx.font = '8px Inter, sans-serif';
                ctx.fillStyle = '#52525b';
                ctx.fillText(n.city, node.x, node.y + r + 22);
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

            ctx.beginPath();
            ctx.strokeStyle = l.color;
            ctx.lineWidth = l.width;

            if (l.curvature) {
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

            if (l.count || l.type === 'FLED_TO') {
              const midX = (start.x + end.x) / 2;
              const midY = (start.y + end.y) / 2;

              const label = l.count ? `${l.count}× co-located` : l.type;

              ctx.font = '9px Inter, -apple-system, sans-serif';
              const textWidth = ctx.measureText(label).width;

              ctx.fillStyle = '#18181b';
              ctx.beginPath();
              ctx.roundRect(midX - textWidth / 2 - 6, midY - 8, textWidth + 12, 16, 8);
              ctx.fill();

              ctx.strokeStyle = l.type === 'FLED_TO' ? '#f97316' : '#fbbf24';
              ctx.lineWidth = 1;
              ctx.stroke();

              ctx.fillStyle = l.type === 'FLED_TO' ? '#fb923c' : '#fcd34d';
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
                  Suspect relationships across jurisdictions
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

        {/* Legend */}
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
                label={suspects.length || 2}
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

          {suspects.map((s, i) => (
            <Card
              key={s.id}
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
                    {s.alias && (
                      <Typography variant="caption" sx={{ color: '#f97316' }}>
                        "{s.alias}"
                      </Typography>
                    )}
                  </Box>
                </Stack>
                <Divider sx={{ my: 1, borderColor: '#27272a' }} />
                <Typography
                  variant="caption"
                  sx={{ color: i === 0 && showBurner ? '#a78bfa' : '#52525b' }}
                >
                  📱 {i === 0 && showBurner ? 'Prepaid (E2847) - BURNER' : s.device}
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
            View Case
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default GraphExplorer;
