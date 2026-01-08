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
  TextField,
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
  Edit,
  Check,
  Undo,
} from '@mui/icons-material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ForceGraph2D from 'react-force-graph-2d';
import {
  USE_DATABRICKS,
  setEntityTitle,
  deleteEntityTitle,
  fetchCoLocationLog,
  loadAllDataProgressive,
  type FullDataLoadProgress,
} from '../services/api';
import HandoffAlerts from '../components/HandoffAlerts';

interface GraphNode {
  id: string;
  name: string;
  alias?: string;
  type: 'person' | 'location';
  isSuspect?: boolean;
  city?: string;
  linkedCities?: string[];
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
  originalName?: string;
  customTitle?: string | null;
  hasCustomTitle?: boolean;
  alias: string | null;
  threatLevel: string;
  criminalHistory: string | null;
  device?: string;
  linkedCities?: string[];
  totalScore?: number;
  isSuspect?: boolean;
}

const GraphExplorer: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<{ refresh?: () => void } | null>(null);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const theme = useTheme();

  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState<FullDataLoadProgress | null>(null);
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
  const [cityFilter, setCityFilter] = useState<string | null>(null);
  const [focusedEntityIds, setFocusedEntityIds] = useState<Set<string>>(new Set());

  // Multi-select for co-location log
  const [colocationEntityIds, setColocationEntityIds] = useState<Set<string>>(new Set());
  const [colocationMode, setColocationMode] = useState<'any' | 'all'>('any');
  const [colocationLoading, setColocationLoading] = useState(false);
  const [colocationError, setColocationError] = useState<string | null>(null);
  const [colocationEntries, setColocationEntries] = useState<
    Array<{
      time: string | null;
      city: string | null;
      state: string | null;
      h3Cell: string | null;
      latitude: number | null;
      longitude: number | null;
      participantCount: number;
      evidenceCount: number;
      participants: Array<{ id: string; name: string }>;
    }>
  >([]);

  // Entity title editing state
  const [editingEntityId, setEditingEntityId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  // Edge visibility toggles
  const [visibleEdges, setVisibleEdges] = useState<string[]>(['colocation', 'social', 'location']);

  // Node visibility toggles
  const [visibleNodes, setVisibleNodes] = useState<string[]>([
    'suspects',
    'associates',
    'locations',
  ]);

  // Track zoom level for label scaling (use ref to avoid re-renders)
  const zoomLevelRef = useRef(1);

  // Track hovered node without triggering re-renders
  const hoveredNodeRef = useRef<string | null>(null);

  // Deep-link params (from Hotspot Explorer / Case View)
  useEffect(() => {
    const city = searchParams.get('city');
    const entityIdsParam = searchParams.get('entityIds');
    setCityFilter(city || null);

    if (entityIdsParam) {
      const ids = entityIdsParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      setFocusedEntityIds(new Set(ids));
    } else {
      setFocusedEntityIds(new Set());
    }
  }, [searchParams]);

  // Seed the co-location selection from deep-linked focused entity IDs (only if the user hasn't started selecting yet)
  useEffect(() => {
    if (colocationEntityIds.size > 0) return;
    if (focusedEntityIds.size < 2) return;
    setColocationEntityIds(new Set(Array.from(focusedEntityIds)));
  }, [focusedEntityIds, colocationEntityIds.size]);

  const suspectNameById = useMemo(() => {
    return new Map(suspects.map((s) => [s.id, s.name]));
  }, [suspects]);

  const toggleColocationEntity = useCallback((entityId: string) => {
    setColocationEntityIds((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) next.delete(entityId);
      else next.add(entityId);
      return next;
    });
  }, []);

  const clearColocationSelection = useCallback(() => {
    setColocationEntityIds(new Set());
  }, []);

  // Fetch colocations whenever selection changes
  useEffect(() => {
    const ids = Array.from(colocationEntityIds);
    if (ids.length < 2) {
      setColocationEntries([]);
      setColocationError(null);
      setColocationLoading(false);
      return;
    }

    let cancelled = false;
    setColocationLoading(true);
    setColocationError(null);

    fetchCoLocationLog({ entityIds: ids, mode: colocationMode, limit: 5000, bucketMinutes: 60 })
      .then((resp) => {
        if (cancelled) return;
        setColocationEntries(resp.entries || []);
      })
      .catch((err) => {
        if (cancelled) return;
        setColocationError(err?.message || 'Failed to load co-locations');
        setColocationEntries([]);
      })
      .finally(() => {
        if (cancelled) return;
        setColocationLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [colocationEntityIds, colocationMode]);

  // Auto-select first focused entity once suspects are loaded
  useEffect(() => {
    if (focusedEntityIds.size === 0) return;
    if (suspects.length === 0) return;
    if (selectedSuspect) return;
    const ids = Array.from(focusedEntityIds);
    const first = ids.find((id) => suspects.some((s) => s.id === id)) || ids[0];
    setSelectedSuspect(first);
  }, [focusedEntityIds, suspects, selectedSuspect]);

  // Filtered graph data based on node and edge visibility
  const filteredGraphData = useMemo(() => {
    // Start with optional city filter
    const cityFilteredNodes = cityFilter
      ? graphData.nodes.filter((node) => {
          if (node.type === 'person') {
            // Keep explicitly focused entities even if city metadata is missing
            if (focusedEntityIds.has(node.id)) return true;
            return (node.linkedCities || []).includes(cityFilter);
          }
          if (node.type === 'location') {
            return node.city === cityFilter;
          }
          return true;
        })
      : graphData.nodes;

    // Filter nodes based on visibility toggles
    const filteredNodes = cityFilteredNodes.filter((node) => {
      if (node.type === 'person' && node.isSuspect) {
        return visibleNodes.includes('suspects');
      }
      if (node.type === 'person' && !node.isSuspect) {
        return visibleNodes.includes('associates');
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
  }, [graphData, visibleEdges, visibleNodes, cityFilter, focusedEntityIds]);

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

  // Start editing entity title
  const handleStartEditTitle = useCallback((suspect: Suspect, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingEntityId(suspect.id);
    setEditingTitle(suspect.name);
  }, []);

  // Save entity title
  const handleSaveTitle = useCallback(
    async (suspectId: string) => {
      if (!editingTitle.trim()) return;

      try {
        await setEntityTitle('persons', suspectId, editingTitle.trim());

        // Update local state
        setSuspects((prev) =>
          prev.map((s) =>
            s.id === suspectId
              ? {
                  ...s,
                  name: editingTitle.trim(),
                  customTitle: editingTitle.trim(),
                  hasCustomTitle: true,
                }
              : s
          )
        );

        // Update graph data node names
        setGraphData((prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) =>
            n.id === suspectId ? { ...n, name: editingTitle.trim() } : n
          ),
        }));

        setEditingEntityId(null);
        setEditingTitle('');
      } catch (err) {
        console.error('Failed to save entity title:', err);
      }
    },
    [editingTitle]
  );

  // Reset entity title to original
  const handleResetTitle = useCallback(async (suspect: Suspect, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!suspect.hasCustomTitle) return;

    try {
      await deleteEntityTitle('persons', suspect.id);

      // Update local state
      const originalName = suspect.originalName || `Entity ${suspect.id}`;
      setSuspects((prev) =>
        prev.map((s) =>
          s.id === suspect.id
            ? { ...s, name: originalName, customTitle: null, hasCustomTitle: false }
            : s
        )
      );

      // Update graph data node names
      setGraphData((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) => (n.id === suspect.id ? { ...n, name: originalName } : n)),
      }));
    } catch (err) {
      console.error('Failed to reset entity title:', err);
    }
  }, []);

  // Cancel editing
  const handleCancelEdit = useCallback(() => {
    setEditingEntityId(null);
    setEditingTitle('');
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

  // Fetch graph data from API with progressive loading
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Use progressive loader for full data fetch
        const { suspects: suspectsData, graphData } = await loadAllDataProgressive({
          onProgress: (progress) => {
            setLoadProgress(progress);
          },
        });

        // Map all persons to expected format (includes suspects and associates)
        setSuspects(
          suspectsData.map((p) => ({
            id: p.id,
            name: p.name,
            originalName: p.originalName || p.name,
            customTitle: p.customTitle,
            hasCustomTitle: p.hasCustomTitle || false,
            alias: p.alias,
            threatLevel: p.threatLevel || 'Unknown',
            criminalHistory: p.criminalHistory,
            device: 'Device ' + p.id.slice(-4),
            linkedCities: p.linkedCities,
            totalScore: p.totalScore,
            isSuspect: p.isSuspect !== false, // Default to true for backwards compat
          }))
        );

        // Build fixed-layout graph
        buildGraph(graphData || { nodes: [], links: [] });
      } catch (err) {
        console.error('Failed to fetch graph data:', err);
      } finally {
        setLoading(false);
        setLoadProgress(null);
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

    // Find all person types from API data
    const suspectNodes = apiData.nodes?.filter((n) => n.type === 'person' && n.isSuspect) || [];
    const associateNodes = apiData.nodes?.filter((n) => n.type === 'person' && !n.isSuspect) || [];
    const locationNodes = apiData.nodes?.filter((n) => n.type === 'location') || [];

    // Add ALL suspects with positions in expanding rings
    if (suspectNodes.length >= 1) {
      // Position all suspects in concentric rings
      const suspectsPerRing = 12; // suspects per ring
      suspectNodes.forEach((suspect, i) => {
        const ringIndex = Math.floor(i / suspectsPerRing);
        const posInRing = i % suspectsPerRing;
        const ringCount = Math.min(
          suspectsPerRing,
          suspectNodes.length - ringIndex * suspectsPerRing
        );
        const angle = (posInRing / ringCount) * Math.PI * 2 - Math.PI / 2;
        const radius = 80 + ringIndex * 60; // Expanding rings

        // Size based on score/rank (top suspects are bigger)
        const size = Math.max(6, 12 - Math.floor(i / 10));

        nodes.push({
          id: suspect.id,
          name: suspect.name,
          alias: suspect.alias || suspect.id.slice(-4),
          type: 'person',
          color: '#dc2626',
          size,
          isSuspect: true,
          linkedCities: suspect.linkedCities,
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
          linkedCities: ['DC'],
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
          linkedCities: ['DC'],
          fx: cx + 80,
          fy: cy,
        }
      );
    }

    // Add associates (non-suspect persons) in rings between suspects and locations
    const suspectRings = Math.ceil(suspectNodes.length / 12);
    const associateBaseRadius = 80 + suspectRings * 60 + 40; // Start just outside suspect rings

    if (associateNodes.length > 0) {
      const associatesPerRing = 14;
      associateNodes.forEach((assoc, i) => {
        const ringIndex = Math.floor(i / associatesPerRing);
        const posInRing = i % associatesPerRing;
        const ringCount = Math.min(
          associatesPerRing,
          associateNodes.length - ringIndex * associatesPerRing
        );
        const angle = (posInRing / ringCount) * Math.PI * 2 + Math.PI / 14; // Offset from suspects
        const radius = associateBaseRadius + ringIndex * 50;

        nodes.push({
          id: assoc.id,
          name: assoc.name,
          alias: assoc.alias || assoc.id.slice(-4),
          type: 'person',
          color: '#6b7280', // Gray for non-suspects
          size: 5,
          isSuspect: false,
          linkedCities: assoc.linkedCities,
          fx: cx + Math.cos(angle) * radius,
          fy: cy + Math.sin(angle) * radius,
        });
      });
    }

    // Calculate where locations should start (after associates)
    const associateRings = Math.ceil(associateNodes.length / 14);
    const locationBaseRadius = associateBaseRadius + associateRings * 50 + 60;

    // Use API location nodes or fallback to defaults
    if (locationNodes.length > 0) {
      // Position ALL location nodes in outer rings around suspects and associates
      const locsPerRing = 16;
      const baseRadius = locationBaseRadius;

      locationNodes.forEach((loc, i) => {
        const ringIndex = Math.floor(i / locsPerRing);
        const posInRing = i % locsPerRing;
        const ringCount = Math.min(locsPerRing, locationNodes.length - ringIndex * locsPerRing);
        const angle = (posInRing / ringCount) * Math.PI * 2;
        const radius = baseRadius + ringIndex * 50;

        // Color by city
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
          size: 6,
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
          width: isCoLocated ? 2 : isSocial ? 1.5 : 1,
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
            width: 2,
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
        width: 1.5,
      });

      return { nodes: newNodes, links: newLinks };
    });
  }, []);

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: '80vh',
          bgcolor: 'background.default',
          gap: 2,
        }}
      >
        <CircularProgress
          variant={loadProgress ? 'determinate' : 'indeterminate'}
          value={loadProgress?.overall.percent || 0}
          size={56}
          sx={{ color: theme.palette.accent.orange }}
        />
        {loadProgress && (
          <Stack spacing={0.5} alignItems="center">
            <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              Loading data... {loadProgress.overall.percent}%
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Suspects: {loadProgress.suspects.loaded}
              {loadProgress.suspects.total ? ` / ${loadProgress.suspects.total}` : ''}
              {loadProgress.suspects.complete && ' ✓'}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Graph: {loadProgress.graph.nodes} nodes, {loadProgress.graph.links} links
              {loadProgress.graph.complete && ' ✓'}
            </Typography>
          </Stack>
        )}
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
          enableNodeDrag={false}
          warmupTicks={0}
          minZoom={0.3}
          maxZoom={5}
          onNodeHover={(node) => {
            hoveredNodeRef.current = node ? (node as GraphNode).id : null;
          }}
          onNodeClick={(node, event) => {
            event.stopPropagation();
            const n = node as GraphNode;
            if (n.type === 'person' && n.isSuspect) {
              const multi = event.shiftKey || event.metaKey || event.ctrlKey;
              if (multi) {
                toggleColocationEntity(n.id);
              } else {
                setSelectedSuspect(selectedSuspect === n.id ? null : n.id);
              }
            }
          }}
          onZoom={({ k }) => {
            zoomLevelRef.current = k;
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
            const isHovered = hoveredNodeRef.current === n.id;
            const isFocused = focusedEntityIds.has(n.id);
            const isMultiSelected = colocationEntityIds.has(n.id);
            const isSelected = selectedSuspect === n.id || isFocused || isMultiSelected;
            const r = isHovered ? baseR * 1.2 : baseR;
            const zoom = zoomLevelRef.current;

            if (
              typeof node.x !== 'number' ||
              typeof node.y !== 'number' ||
              !isFinite(node.x) ||
              !isFinite(node.y)
            ) {
              return;
            }

            if (n.type === 'person') {
              // Main node - different colors for suspects vs associates
              ctx.beginPath();
              ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
              ctx.fillStyle = n.isSuspect ? '#dc2626' : '#6b7280'; // Red for suspects, gray for associates
              ctx.fill();

              // Highlight ring
              ctx.strokeStyle = isSelected
                ? 'rgba(255, 255, 255, 0.95)'
                : isHovered
                  ? 'rgba(255, 255, 255, 0.8)'
                  : n.isSuspect
                    ? 'rgba(255, 255, 255, 0.5)'
                    : 'rgba(255, 255, 255, 0.3)';
              ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2 : 1;
              ctx.stroke();

              // Label - scale font size inversely with zoom for consistent screen size
              const labelFontSize = Math.max(8, Math.min(14, (n.isSuspect ? 11 : 9) / zoom));
              ctx.font = `${n.isSuspect ? 'bold' : '500'} ${labelFontSize}px "SF Pro Display", "Segoe UI", system-ui, sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';
              ctx.fillStyle = n.isSuspect
                ? theme.palette.mode === 'dark'
                  ? '#fff'
                  : '#1a1a2e'
                : theme.palette.mode === 'dark'
                  ? '#9ca3af'
                  : '#6b7280';
              ctx.fillText(n.alias || n.name, node.x, node.y + r + 8 / zoom);
            } else {
              // Location nodes - hexagonal
              const s = r * 1.2;
              const isLocationHovered = isHovered;
              const baseColor = n.color || '#3b82f6';

              // Hexagon shape
              ctx.beginPath();
              for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i - Math.PI / 2;
                const hx = node.x + Math.cos(angle) * s;
                const hy = node.y + Math.sin(angle) * s;
                if (i === 0) ctx.moveTo(hx, hy);
                else ctx.lineTo(hx, hy);
              }
              ctx.closePath();
              ctx.fillStyle = baseColor + 'cc'; // ~80% opacity
              ctx.fill();

              // Border
              ctx.strokeStyle = isLocationHovered ? baseColor : baseColor + 'b3';
              ctx.lineWidth = isLocationHovered ? 2 : 1.5;
              ctx.stroke();

              // Location icon dot
              ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
              ctx.beginPath();
              ctx.arc(node.x, node.y - 1, s * 0.3, 0, 2 * Math.PI);
              ctx.fill();

              // Label - scale font size inversely with zoom for consistent screen size
              const locLabelFontSize = Math.max(6, Math.min(12, 10 / zoom));
              ctx.font = `600 ${locLabelFontSize}px "SF Pro Display", "Segoe UI", system-ui, sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';
              ctx.fillStyle = baseColor;
              ctx.fillText(n.name, node.x, node.y + s + 6 / zoom);

              if (n.city) {
                const cityFontSize = Math.max(5, Math.min(10, 8 / zoom));
                ctx.font = `500 ${cityFontSize}px "SF Pro Display", system-ui, sans-serif`;
                ctx.fillStyle =
                  theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.4)';
                ctx.fillText(n.city, node.x, node.y + s + 18 / zoom);
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

            const zoom = zoomLevelRef.current;
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

            // Main line - solid color instead of gradient
            ctx.beginPath();
            if (l.curvature) {
              ctx.moveTo(start.x, start.y);
              ctx.quadraticCurveTo(ctrlX, ctrlY, end.x, end.y);
            } else {
              ctx.moveTo(start.x, start.y);
              ctx.lineTo(end.x, end.y);
            }
            ctx.strokeStyle = isImportant
              ? l.type === 'FLED_TO'
                ? '#fb923c'
                : '#fbbf24'
              : l.color || '#3b82f6';
            ctx.lineWidth = l.width;
            ctx.stroke();

            // Label badge for important connections (only CO_LOCATED between people and FLED_TO)
            if ((l.type === 'CO_LOCATED' && l.count) || l.type === 'FLED_TO') {
              const label = l.type === 'CO_LOCATED' ? `${l.count}× co-loc` : 'FLED TO';

              // Scale everything inversely with zoom for consistent screen size
              // Use a base size that we divide by zoom
              const scale = 1 / zoom;
              const baseFontSize = 9;
              const fontSize = baseFontSize * scale;

              ctx.font = `600 ${fontSize}px "SF Pro Display", system-ui, sans-serif`;
              const textWidth = ctx.measureText(label).width;

              // Padding and dimensions in screen-space (scaled)
              const paddingX = 8 * scale;
              const paddingY = 5 * scale;
              const badgeWidth = textWidth + paddingX * 2;
              const badgeHeight = fontSize + paddingY * 2;
              const borderRadius = Math.min(badgeHeight / 2, 10 * scale);

              // Badge background
              ctx.beginPath();
              ctx.roundRect(
                midX - badgeWidth / 2,
                midY - badgeHeight / 2,
                badgeWidth,
                badgeHeight,
                borderRadius
              );
              ctx.fillStyle = 'rgba(26, 26, 46, 0.95)';
              ctx.fill();

              // Badge border
              ctx.strokeStyle = l.type === 'FLED_TO' ? '#fb923c' : '#fbbf24';
              ctx.lineWidth = 1.5 * scale;
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
                  {cityFilter && (
                    <Chip
                      label={`City: ${cityFilter}`}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: '0.6rem',
                        bgcolor: `${theme.palette.accent.blue}20`,
                        color: theme.palette.accent.blue,
                      }}
                    />
                  )}
                  {focusedEntityIds.size > 0 && (
                    <Chip
                      label={`Focused: ${focusedEntityIds.size}`}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: '0.6rem',
                        bgcolor: `${theme.palette.accent.purple}20`,
                        color: theme.palette.accent.purple,
                      }}
                    />
                  )}
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
                <Tooltip title="Show/Hide Associates (non-suspects linked to network)">
                  <ToggleButton
                    value="associates"
                    sx={{
                      '&.Mui-selected': {
                        bgcolor: 'rgba(107, 114, 128, 0.2)',
                        color: '#9ca3af',
                        '&:hover': { bgcolor: 'rgba(107, 114, 128, 0.3)' },
                      },
                    }}
                  >
                    <People sx={{ fontSize: 16, mr: 0.5 }} />
                    Associates
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
                  bgcolor: '#dc2626',
                  border: '2px solid rgba(255,255,255,0.5)',
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
                  borderRadius: '50%',
                  bgcolor: '#6b7280',
                  border: '1px solid rgba(255,255,255,0.3)',
                }}
              />
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                Associate
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
                label={suspects.length || 0}
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
                label={graphData.links.filter((l) => l.type === 'CO_LOCATED').length}
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
                Locations
              </Typography>
              <Chip
                label={graphData.nodes.filter((n) => n.type === 'location').length}
                size="small"
                sx={{
                  bgcolor: `${theme.palette.accent.green}20`,
                  color: theme.palette.accent.green,
                  height: 20,
                  fontSize: '0.7rem',
                }}
              />
            </Stack>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Social Links
              </Typography>
              <Chip
                label={graphData.links.filter((l) => l.type === 'SOCIAL').length}
                size="small"
                sx={{
                  bgcolor: `${theme.palette.accent.blue}20`,
                  color: theme.palette.accent.blue,
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

        {/* Handoff Alerts */}
        <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'border.main' }}>
          <HandoffAlerts
            compact
            maxItems={3}
            onEntityClick={(entityId) => setSelectedSuspect(entityId)}
          />
        </Box>

        {/* Co-location Log */}
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'border.main' }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <History sx={{ fontSize: 16, color: theme.palette.accent.yellow }} />
              <Typography
                variant="overline"
                sx={{ color: 'text.secondary', letterSpacing: 2, fontSize: '0.65rem' }}
              >
                CO-LOCATION LOG
              </Typography>
            </Stack>
            <Button
              size="small"
              variant="text"
              onClick={clearColocationSelection}
              sx={{ fontSize: '0.7rem', color: 'text.secondary' }}
              disabled={colocationEntityIds.size === 0}
            >
              Clear
            </Button>
          </Stack>

          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
            Shift/Ctrl-click suspects (graph or list) to compare where they were together.
          </Typography>

          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 1 }}>
            {Array.from(colocationEntityIds)
              .slice(0, 8)
              .map((id) => (
                <Chip
                  key={id}
                  label={suspectNameById.get(id) || id}
                  size="small"
                  onDelete={() => toggleColocationEntity(id)}
                  sx={{
                    bgcolor: `${theme.palette.accent.yellow}15`,
                    color: theme.palette.accent.yellow,
                    '& .MuiChip-deleteIcon': { color: theme.palette.accent.yellow, opacity: 0.8 },
                  }}
                />
              ))}
            {colocationEntityIds.size > 8 && (
              <Chip
                label={`+${colocationEntityIds.size - 8}`}
                size="small"
                sx={{ bgcolor: 'background.default', color: 'text.secondary' }}
              />
            )}
          </Stack>

          <ToggleButtonGroup
            value={colocationMode}
            exclusive
            onChange={(_e, v) => v && setColocationMode(v)}
            size="small"
            sx={{
              mb: 1.5,
              '& .MuiToggleButton-root': {
                border: 1,
                borderColor: 'border.main',
                color: 'text.secondary',
                fontSize: '0.7rem',
                px: 1.25,
                py: 0.25,
                textTransform: 'none',
                '&.Mui-selected': {
                  bgcolor: `${theme.palette.accent.yellow}15`,
                  color: theme.palette.accent.yellow,
                  borderColor: 'transparent',
                  '&:hover': { bgcolor: `${theme.palette.accent.yellow}20` },
                },
              },
            }}
          >
            <ToggleButton value="any">Any overlap</ToggleButton>
            <ToggleButton value="all">All together</ToggleButton>
          </ToggleButtonGroup>

          <Box
            sx={{
              maxHeight: 220,
              overflow: 'auto',
              pr: 0.5,
            }}
          >
            {colocationEntityIds.size < 2 ? (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Select at least 2 suspects to see co-locations.
              </Typography>
            ) : colocationLoading ? (
              <Stack direction="row" alignItems="center" spacing={1}>
                <CircularProgress size={14} sx={{ color: theme.palette.accent.yellow }} />
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Loading…
                </Typography>
              </Stack>
            ) : colocationError ? (
              <Alert
                severity="error"
                sx={{
                  bgcolor: `${theme.palette.accent.red}10`,
                  border: 1,
                  borderColor: `${theme.palette.accent.red}30`,
                }}
              >
                <Typography variant="caption">{colocationError}</Typography>
              </Alert>
            ) : colocationEntries.length === 0 ? (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                No shared locations found (within the sampled events).
              </Typography>
            ) : (
              <Stack spacing={1}>
                {colocationEntries.slice(0, 25).map((e, idx) => {
                  const timeLabel = e.time ? new Date(e.time).toLocaleString() : 'Time unknown';
                  const placeLabel =
                    [e.city, e.state].filter(Boolean).join(', ') || 'Unknown location';
                  const cellLabel = e.h3Cell ? ` • Cell ${String(e.h3Cell).slice(-6)}` : '';
                  return (
                    <Paper
                      key={`${e.time || 'no_time'}-${e.h3Cell || 'no_cell'}-${idx}`}
                      sx={{
                        p: 1.25,
                        bgcolor: 'background.default',
                        border: 1,
                        borderColor: 'border.main',
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary', display: 'block' }}
                      >
                        {timeLabel}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ color: 'text.primary', fontWeight: 600, fontSize: '0.8rem' }}
                      >
                        {placeLabel}
                        <Typography
                          component="span"
                          variant="caption"
                          sx={{ color: 'text.secondary' }}
                        >
                          {cellLabel}
                        </Typography>
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {e.participantCount} participants • {e.evidenceCount} pings
                      </Typography>
                    </Paper>
                  );
                })}
              </Stack>
            )}
          </Box>
        </Box>

        {/* Suspects & Associates */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
          <Typography
            variant="overline"
            sx={{ color: theme.palette.accent.red, letterSpacing: 2, fontSize: '0.65rem' }}
          >
            SUSPECTS ({suspects.filter((s) => s.isSuspect !== false).length})
          </Typography>

          {(cityFilter
            ? suspects.filter(
                (s) => s.isSuspect !== false && (s.linkedCities || []).includes(cityFilter)
              )
            : suspects.filter((s) => s.isSuspect !== false)
          ).map((s, i) => (
            <Card
              key={s.id}
              onClick={(e) => {
                if (editingEntityId === s.id) return;
                const multi = e.shiftKey || e.metaKey || e.ctrlKey;
                if (multi) {
                  e.stopPropagation();
                  toggleColocationEntity(s.id);
                  return;
                }
                handleCardClick(s.id);
              }}
              onDoubleClick={() => editingEntityId !== s.id && handleCardDoubleClick(s)}
              sx={{
                mt: 1.5,
                bgcolor:
                  selectedSuspect === s.id ? `${theme.palette.accent.red}10` : 'background.default',
                border: 1,
                borderColor: selectedSuspect === s.id ? theme.palette.accent.red : 'border.main',
                cursor: editingEntityId === s.id ? 'default' : 'pointer',
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
                    {editingEntityId === s.id ? (
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <TextField
                          size="small"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveTitle(s.id);
                            if (e.key === 'Escape') handleCancelEdit();
                          }}
                          autoFocus
                          sx={{
                            flex: 1,
                            '& .MuiInputBase-input': { fontSize: '0.85rem', py: 0.5 },
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <IconButton
                          size="small"
                          onClick={() => handleSaveTitle(s.id)}
                          sx={{ color: theme.palette.accent.green }}
                        >
                          <Check sx={{ fontSize: 16 }} />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={handleCancelEdit}
                          sx={{ color: 'text.secondary' }}
                        >
                          <Close sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Stack>
                    ) : (
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <Typography
                          variant="body2"
                          sx={{ color: 'text.primary', fontWeight: 600, fontSize: '0.85rem' }}
                        >
                          {s.name}
                        </Typography>
                        {s.hasCustomTitle && (
                          <Chip
                            label="edited"
                            size="small"
                            sx={{
                              height: 14,
                              fontSize: '0.55rem',
                              bgcolor: `${theme.palette.accent.purple}20`,
                              color: theme.palette.accent.purple,
                            }}
                          />
                        )}
                        <Tooltip title="Edit name">
                          <IconButton
                            size="small"
                            onClick={(e) => handleStartEditTitle(s, e)}
                            sx={{
                              ml: 'auto',
                              opacity: 0.5,
                              '&:hover': { opacity: 1, color: theme.palette.accent.orange },
                            }}
                          >
                            <Edit sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                        {s.hasCustomTitle && (
                          <Tooltip title="Reset to original name">
                            <IconButton
                              size="small"
                              onClick={(e) => handleResetTitle(s, e)}
                              sx={{
                                opacity: 0.5,
                                '&:hover': { opacity: 1, color: theme.palette.accent.red },
                              }}
                            >
                              <Undo sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    )}
                    {s.alias && editingEntityId !== s.id && (
                      <Typography variant="caption" sx={{ color: theme.palette.accent.orange }}>
                        "{s.alias}"
                      </Typography>
                    )}
                  </Box>
                  {s.totalScore && editingEntityId !== s.id && (
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

          {/* Associates Section */}
          {suspects.filter((s) => s.isSuspect === false).length > 0 && (
            <>
              <Typography
                variant="overline"
                sx={{
                  color: '#9ca3af',
                  letterSpacing: 2,
                  fontSize: '0.65rem',
                  mt: 3,
                  display: 'block',
                }}
              >
                ASSOCIATES ({suspects.filter((s) => s.isSuspect === false).length})
              </Typography>

              {(cityFilter
                ? suspects.filter(
                    (s) => s.isSuspect === false && (s.linkedCities || []).includes(cityFilter)
                  )
                : suspects.filter((s) => s.isSuspect === false)
              )
                .slice(0, 20)
                .map((s, i) => (
                  <Card
                    key={s.id}
                    onClick={(e) => {
                      const multi = e.shiftKey || e.metaKey || e.ctrlKey;
                      if (multi) {
                        e.stopPropagation();
                        toggleColocationEntity(s.id);
                        return;
                      }
                      handleCardClick(s.id);
                    }}
                    sx={{
                      mt: 1,
                      bgcolor:
                        selectedSuspect === s.id
                          ? 'rgba(107, 114, 128, 0.1)'
                          : 'background.default',
                      border: 1,
                      borderColor: selectedSuspect === s.id ? '#6b7280' : 'border.main',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      '&:hover': { borderColor: '#6b7280' },
                    }}
                  >
                    <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Stack direction="row" alignItems="center" spacing={1.5}>
                        <Avatar
                          sx={{
                            bgcolor: '#6b7280',
                            width: 28,
                            height: 28,
                            fontSize: 10,
                            fontWeight: 600,
                          }}
                        >
                          {i + 1}
                        </Avatar>
                        <Box sx={{ flex: 1 }}>
                          <Typography
                            variant="body2"
                            sx={{ color: 'text.primary', fontWeight: 500, fontSize: '0.8rem' }}
                          >
                            {s.name}
                          </Typography>
                          {s.alias && (
                            <Typography variant="caption" sx={{ color: '#9ca3af' }}>
                              "{s.alias}"
                            </Typography>
                          )}
                        </Box>
                      </Stack>
                      {s.linkedCities && s.linkedCities.length > 0 && (
                        <Typography
                          variant="caption"
                          sx={{ color: '#9ca3af', fontSize: '0.6rem', display: 'block', mt: 0.5 }}
                        >
                          📍 {s.linkedCities.join(', ')}
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                ))}
            </>
          )}

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
