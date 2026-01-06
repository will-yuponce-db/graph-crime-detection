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
  useTheme,
} from '@mui/material';
import { Hub, ArrowForward, Cloud } from '@mui/icons-material';
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

    // Process API links
    apiData.links?.forEach((link) => {
      if (nodeIds.has(link.source) && nodeIds.has(link.target)) {
        const isCoLocated = link.type === 'CO_LOCATED';
        const isSocial = link.type === 'SOCIAL' || link.type === 'CONTACTED';

        links.push({
          source: link.source,
          target: link.target,
          type: link.type,
          color: isCoLocated ? '#fbbf24' : isSocial ? '#a78bfa' : '#3b82f640',
          width: isCoLocated ? 3 : isSocial ? 2 : 1,
          count: link.count,
          curvature: isSocial ? 0.3 : 0,
        });
      }
    });

    // If no links from API, create default connections
    if (links.length === 0 && nodes.length >= 2) {
      // Connect first two suspects
      links.push({
        source: nodes[0].id,
        target: nodes[1].id,
        type: 'CO_LOCATED',
        color: '#fbbf24',
        width: 3,
        count: 10,
      });

      // Connect suspects to locations
      const locationNodeIds = nodes.filter((n) => n.type === 'location');
      nodes
        .filter((n) => n.isSuspect)
        .forEach((suspect) => {
          locationNodeIds.forEach((loc) => {
            links.push({
              source: suspect.id,
              target: loc.id,
              type: 'DETECTED',
              color: `${loc.color}40`,
              width: 1,
              curvature: Math.random() * 0.4 - 0.2,
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
      <Box ref={containerRef} sx={{ flex: 1, position: 'relative' }}>
        <ForceGraph2D
          graphData={graphData}
          width={containerRef.current?.clientWidth || 800}
          height={containerRef.current?.clientHeight || 600}
          backgroundColor={theme.palette.background.default}
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
              ctx.fillStyle = theme.palette.mode === 'dark' ? '#fff' : '#000';
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
                ctx.fillStyle = theme.palette.text.secondary;
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

              ctx.fillStyle = theme.palette.background.paper;
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
            top: 0,
            left: 0,
            right: 0,
            p: 2,
            bgcolor: theme.palette.surface.overlay,
            borderBottom: 1,
            borderColor: 'border.main',
            borderRadius: 0,
            backdropFilter: 'blur(12px)',
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
            </Stack>
          </Stack>
        </Paper>

        {/* Legend */}
        <Paper
          sx={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            p: 1.5,
            bgcolor: theme.palette.surface.overlay,
            borderTop: 1,
            borderRight: 1,
            borderColor: 'border.main',
            borderRadius: 0,
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
                  bgcolor: theme.palette.accent.red,
                  border: '1.5px solid rgba(255,255,255,0.6)',
                }}
              />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Suspect
              </Typography>
            </Stack>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  bgcolor: theme.palette.accent.blue,
                  transform: 'rotate(45deg)',
                }}
              />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                DC
              </Typography>
            </Stack>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  bgcolor: theme.palette.accent.green,
                  transform: 'rotate(45deg)',
                }}
              />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Nashville
              </Typography>
            </Stack>
            {showBurner && (
              <Stack direction="row" alignItems="center" spacing={1}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    bgcolor: theme.palette.accent.orange,
                    transform: 'rotate(45deg)',
                  }}
                />
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
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
              onClick={() => setSelectedSuspect(selectedSuspect === s.id ? null : s.id)}
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
    </Box>
  );
};

export default GraphExplorer;
