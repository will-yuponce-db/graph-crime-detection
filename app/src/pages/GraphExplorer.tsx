import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
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
  Collapse,
} from '@mui/material';
import {
  Hub,
  ArrowForward,
  Close,
  Phone,
  LocationOn,
  Warning,
  History,
  People,
  Call,
  Map as MapIcon,
  Clear,
  DeviceHub,
  Link as LinkIcon,
  LinkOff,
  Cloud,
  Download,
  Add,
  ExpandMore,
  Search,
} from '@mui/icons-material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import {
  USE_DATABRICKS,
  setEntityTitle,
  deleteEntityTitle,
  fetchCoLocationLog,
  fetchSocialLog,
  loadAllDataProgressive,
  type FullDataLoadProgress,
  type SocialLogEntry,
  fetchEntitiesWithLinkStatus,
  type EntitiesWithLinkStatusResponse,
} from '../services/api';
import HandoffAlerts from '../components/HandoffAlerts';
import LinkSuggestionsPanel from '../components/LinkSuggestionsPanel';
import CreateLinkDialog from '../components/CreateLinkDialog';
import AIInsightCard, { AIInsightButton } from '../components/AIInsightCard';
import PersonList from '../components/PersonList';
import {
  analyzeEntityRelationships,
  analyzeNetworkPatterns,
  type Insight,
} from '../services/insights';

interface GraphNode {
  id: string;
  name: string;
  alias?: string;
  type: 'person' | 'device';
  isSuspect?: boolean;
  city?: string;
  linkedCities?: string[];
  color: string;
  size: number;
  fx?: number;
  fy?: number;
  x?: number;
  y?: number;
  // Device-specific fields
  ownerId?: string | null;
  relationship?: string;
  isBurner?: boolean;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  type: string;
  edgeCategory?: 'colocation' | 'social' | 'device';
  count?: number;
  color: string;
  width: number;
  curvature?: number;
}

interface LinkedDevice {
  deviceId: string;
  relationship: string;
  source: string;
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
  linkedDevices?: LinkedDevice[];
  linkedCities?: string[];
  totalScore?: number;
  isSuspect?: boolean;
}

const GraphExplorer: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const theme = useTheme();

  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState<FullDataLoadProgress | null>(null);
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; links: GraphLink[] }>({
    nodes: [],
    links: [],
  });
  const [suspects, setSuspects] = useState<Suspect[]>([]);
  // Multi-select for persons (use Set for efficient lookup)
  const [selectedPersonIds, setSelectedPersonIds] = useState<Set<string>>(new Set());
  // Single selection for sidebar highlighting
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

  // Social relationship log (uses same entity selection as co-location)
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [socialEntries, setSocialEntries] = useState<SocialLogEntry[]>([]);

  // Entity title editing state
  const [editingEntityId, setEditingEntityId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  // Edge visibility toggles
  const [visibleEdges, setVisibleEdges] = useState<string[]>(['colocation', 'social', 'device']);

  // Node visibility toggles
  const [visibleNodes, setVisibleNodes] = useState<string[]>([
    'suspects',
    'associates',
    'devices',
  ]);

  // Container dimensions for responsive graph sizing
  const [containerDimensions, setContainerDimensions] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  // Track container dimensions with ResizeObserver for proper graph sizing on load
  // Using useLayoutEffect to measure synchronously before paint
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Set initial dimensions synchronously
    const rect = container.getBoundingClientRect();
    setContainerDimensions({
      width: rect.width,
      height: rect.height,
    });

    // Observe for resize changes
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setContainerDimensions({ width, height });
        }
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [loading]); // Re-run when loading changes (container appears after loading)

  // Graph view mode: 'persons' (default) or 'devices'
  const [graphViewMode, setGraphViewMode] = useState<'persons' | 'devices'>('persons');

  // Entities with link status (for device view)
  const [entitiesData, setEntitiesData] = useState<EntitiesWithLinkStatusResponse | null>(null);
  const [entitiesLoading, setEntitiesLoading] = useState(false);

  // Create link dialog
  const [createLinkOpen, setCreateLinkOpen] = useState(false);
  const [linkInitialDevice, setLinkInitialDevice] = useState<string | undefined>(undefined);
  const [linkInitialPerson, setLinkInitialPerson] = useState<string | undefined>(undefined);

  // AI Insights state
  const [relationshipInsight, setRelationshipInsight] = useState<Insight | null>(null);
  const [relationshipInsightLoading, setRelationshipInsightLoading] = useState(false);
  const [relationshipInsightError, setRelationshipInsightError] = useState<string | null>(null);
  const [networkInsight, setNetworkInsight] = useState<Insight | null>(null);
  const [networkInsightLoading, setNetworkInsightLoading] = useState(false);
  const [networkInsightError, setNetworkInsightError] = useState<string | null>(null);

  // Sidebar section collapse state
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    overview: true,
    handoffs: true,
    aiIntelligence: true,
    colocation: true,
    social: true,
    deviceStatus: true,
    linkSuggestions: true,
    persons: true,
  });

  // Global search filter (searches all node types: persons, devices, locations)
  const [globalSearch, setGlobalSearch] = useState('');

  // Computed set of node IDs matching the current search (any type)
  const searchMatchIds = useMemo(() => {
    if (!globalSearch.trim()) return new Set<string>();
    const q = globalSearch.toLowerCase();
    const matchingIds = new Set<string>();
    
    // Search all graph nodes
    for (const node of graphData.nodes) {
      let matches = false;
      
      // Common fields for all node types
      if (node.name.toLowerCase().includes(q) || node.id.toLowerCase().includes(q)) {
        matches = true;
      }
      
      // Type-specific fields
      if (node.type === 'person') {
        if (node.alias && node.alias.toLowerCase().includes(q)) matches = true;
        if (node.city && node.city.toLowerCase().includes(q)) matches = true;
        if (node.linkedCities && node.linkedCities.some((c) => c.toLowerCase().includes(q))) matches = true;
      } else if (node.type === 'device') {
        if (node.relationship && node.relationship.toLowerCase().includes(q)) matches = true;
        if (node.ownerId && node.ownerId.toLowerCase().includes(q)) matches = true;
        // Match burner phones when searching "burner"
        if (node.isBurner && 'burner'.includes(q)) matches = true;
      }
      
      if (matches) {
        matchingIds.add(node.id);
      }
    }
    
    // Also search suspects data for additional fields (linked devices, criminal history)
    for (const s of suspects) {
      if (matchingIds.has(s.id)) continue; // Already matched
      const deviceMatch = s.linkedDevices?.some(d => d.deviceId.toLowerCase().includes(q));
      const matches =
        deviceMatch ||
        (s.criminalHistory && s.criminalHistory.toLowerCase().includes(q));
      if (matches) {
        matchingIds.add(s.id);
      }
    }
    
    return matchingIds;
  }, [globalSearch, graphData.nodes, suspects]);

  const compactToggleSx = {
    '& .MuiToggleButton-root': {
      border: 1,
      borderColor: 'border.main',
      color: 'text.secondary',
      fontSize: '0.7rem',
      px: 1.1,
      py: 0.4,
      minHeight: 32,
      textTransform: 'none',
      '&.Mui-selected': {
        borderColor: 'transparent',
        boxShadow: 'none',
      },
    },
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Generate relationship insight for selected entities
  const generateRelationshipInsight = useCallback(async () => {
    const entityIds = Array.from(colocationEntityIds);
    if (entityIds.length < 2) return;

    setRelationshipInsightLoading(true);
    setRelationshipInsightError(null);
    try {
      const insight = await analyzeEntityRelationships(entityIds);
      setRelationshipInsight(insight);
    } catch (err) {
      setRelationshipInsightError(
        err instanceof Error ? err.message : 'Failed to analyze relationships'
      );
    } finally {
      setRelationshipInsightLoading(false);
    }
  }, [colocationEntityIds]);

  // Generate network pattern insight
  const generateNetworkInsight = useCallback(async () => {
    setNetworkInsightLoading(true);
    setNetworkInsightError(null);
    try {
      const insight = await analyzeNetworkPatterns(cityFilter);
      setNetworkInsight(insight);
    } catch (err) {
      setNetworkInsightError(err instanceof Error ? err.message : 'Failed to analyze network');
    } finally {
      setNetworkInsightLoading(false);
    }
  }, [cityFilter]);

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

  // Compute set of person IDs that have linked devices (for device mode visualization)
  // Note: devices are many-to-one with persons (each person can have multiple devices, each device has one owner)
  const personsWithDeviceLinks = useMemo(() => {
    const linkedPersonIds = new Set<string>();
    
    // Build a quick lookup of node types
    const nodeTypeById = new Map<string, string>();
    for (const node of graphData.nodes) {
      nodeTypeById.set(node.id, node.type);
    }
    
    // From entitiesData (most accurate when available)
    if (entitiesData?.persons) {
      for (const person of entitiesData.persons) {
        if (person.linkedDevices && person.linkedDevices.length > 0) {
          linkedPersonIds.add(person.id);
        }
      }
    }
    
    // Also check graph links for OWNS relationships
    for (const link of graphData.links) {
      if (link.type === 'OWNS') {
        const sourceId = typeof link.source === 'string' ? link.source : (link.source as GraphNode).id;
        const targetId = typeof link.target === 'string' ? link.target : (link.target as GraphNode).id;
        
        // Only add the person ID (not the device ID)
        if (nodeTypeById.get(sourceId) === 'person') {
          linkedPersonIds.add(sourceId);
        }
        if (nodeTypeById.get(targetId) === 'person') {
          linkedPersonIds.add(targetId);
        }
      }
    }
    
    return linkedPersonIds;
  }, [entitiesData, graphData.nodes, graphData.links]);

  const toggleColocationEntity = useCallback((entityId: string) => {
    setColocationEntityIds((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) next.delete(entityId);
      else next.add(entityId);
      return next;
    });
  }, []);

  // Open create link dialog
  const handleOpenCreateLink = useCallback((deviceId?: string, personId?: string) => {
    setLinkInitialDevice(deviceId);
    setLinkInitialPerson(personId);
    setCreateLinkOpen(true);
  }, []);

  // Close create link dialog
  const handleCloseCreateLink = useCallback(() => {
    setCreateLinkOpen(false);
    setLinkInitialDevice(undefined);
    setLinkInitialPerson(undefined);
  }, []);

  // Handle link created - refresh data
  const handleLinkCreated = useCallback(() => {
    setEntitiesData(null); // Will trigger re-fetch
  }, []);

  // Export suspects to CSV
  const exportSuspectsCSV = () => {
    const headers = [
      'Name',
      'Alias',
      'Threat Level',
      'Risk Score',
      'Linked Devices',
      'Linked Cities',
      'Criminal History',
    ];
    const rows = suspects.map((s) => [
      s.name,
      s.alias || '',
      s.threatLevel,
      s.totalScore?.toFixed(2) || '',
      s.linkedDevices?.map((d) => d.deviceId).join('; ') || '',
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

  const clearColocationSelection = useCallback(() => {
    setColocationEntityIds(new Set());
    setFocusedEntityIds(new Set()); // Also clear focused so the auto-seed effect doesn't re-populate
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

  // Fetch social connections whenever selection changes
  useEffect(() => {
    const ids = Array.from(colocationEntityIds);
    if (ids.length < 2) {
      setSocialEntries([]);
      setSocialError(null);
      setSocialLoading(false);
      return;
    }

    let cancelled = false;
    setSocialLoading(true);
    setSocialError(null);

    fetchSocialLog({ entityIds: ids, limit: 500 })
      .then((resp) => {
        if (cancelled) return;
        setSocialEntries(resp.entries || []);
      })
      .catch((err) => {
        if (cancelled) return;
        setSocialError(err?.message || 'Failed to load social connections');
        setSocialEntries([]);
      })
      .finally(() => {
        if (cancelled) return;
        setSocialLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [colocationEntityIds]);

  // Toggle person selection (multi-select)
  const togglePersonSelection = useCallback((personId: string) => {
    setSelectedPersonIds((prev) => {
      const next = new Set(prev);
      if (next.has(personId)) {
        next.delete(personId);
      } else {
        next.add(personId);
      }
      return next;
    });
  }, []);

  // Clear all person selections
  const clearPersonSelection = useCallback(() => {
    setSelectedPersonIds(new Set());
    setFocusedEntityIds(new Set()); // Also clear focused so the auto-seed effect doesn't re-populate
  }, []);

  // Find all persons reachable from a seed set by traversing person-to-person links (multi-hop)
  const getReachablePersonIds = useCallback(
    (sourceIds: string[]): Set<string> => {
      const personIds = new Set(graphData.nodes.filter((n) => n.type === 'person').map((n) => n.id));

      // Build adjacency for person-to-person links only
      const adjacency = new Map<string, string[]>();
      for (const link of graphData.links) {
        const sourceId =
          typeof link.source === 'string' ? link.source : (link.source as GraphNode).id;
        const targetId =
          typeof link.target === 'string' ? link.target : (link.target as GraphNode).id;

        if (!personIds.has(sourceId) || !personIds.has(targetId)) continue;

        if (!adjacency.has(sourceId)) adjacency.set(sourceId, []);
        if (!adjacency.has(targetId)) adjacency.set(targetId, []);
        adjacency.get(sourceId)!.push(targetId);
        adjacency.get(targetId)!.push(sourceId);
      }

      // BFS across all hops
      const visited = new Set<string>();
      const queue: string[] = [];

      sourceIds.forEach((id) => {
        if (personIds.has(id)) {
          visited.add(id);
          queue.push(id);
        }
      });

      while (queue.length > 0) {
        const current = queue.shift() as string;
        const neighbors = adjacency.get(current) || [];
        for (const next of neighbors) {
          if (!visited.has(next)) {
            visited.add(next);
            queue.push(next);
          }
        }
      }

      return visited;
    },
    [graphData.links, graphData.nodes]
  );

  // Focus on linked suspects - expands selection to all connected persons and hides others
  const focusLinkedSuspects = useCallback(() => {
    const sourceIds = Array.from(selectedPersonIds);
    if (sourceIds.length === 0) return;

    const linkedIds = getReachablePersonIds(sourceIds);
    setSelectedPersonIds(linkedIds);
    setColocationEntityIds(linkedIds);
    setFocusedEntityIds(linkedIds); // This triggers the filter to hide non-focused nodes
  }, [selectedPersonIds, getReachablePersonIds]);

  // Handle focusLinked param - expand selection to linked persons when triggered via agent
  const [, setSearchParamsNav] = useSearchParams();
  useEffect(() => {
    const focusLinkedParam = searchParams.get('focusLinked');
    const entityIdsParam = searchParams.get('entityIds');
    
    if (focusLinkedParam === 'true' && entityIdsParam && graphData.nodes.length > 0) {
      const seedIds = entityIdsParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      
      if (seedIds.length > 0) {
        // Expand to linked persons
        const linkedIds = getReachablePersonIds(seedIds);
        setSelectedPersonIds(linkedIds);
        setColocationEntityIds(linkedIds);
        setFocusedEntityIds(linkedIds);
        
        // Clear the focusLinked param to prevent re-expansion on every render
        const next = new URLSearchParams(searchParams.toString());
        next.delete('focusLinked');
        next.set('entityIds', Array.from(linkedIds).join(','));
        setSearchParamsNav(next, { replace: true });
      }
    }
  }, [searchParams, graphData.nodes.length, getReachablePersonIds, setSearchParamsNav]);

  // Auto-select first focused entity once suspects are loaded
  useEffect(() => {
    if (focusedEntityIds.size === 0) return;
    if (suspects.length === 0) return;
    if (selectedPersonIds.size > 0) return;
    const ids = Array.from(focusedEntityIds);
    const validIds = ids.filter((id) => suspects.some((s) => s.id === id));
    if (validIds.length > 0) {
      setSelectedPersonIds(new Set(validIds));
    }
  }, [focusedEntityIds, suspects, selectedPersonIds.size]);

  // Filtered graph data based on node and edge visibility
  const filteredGraphData = useMemo(() => {
    // Start with optional city filter
    let cityFilteredNodes = cityFilter
      ? graphData.nodes.filter((node) => {
          if (node.type === 'person') {
            // Keep explicitly focused entities even if city metadata is missing
            if (focusedEntityIds.has(node.id)) return true;
            return (node.linkedCities || []).includes(cityFilter);
          }
          return true;
        })
      : graphData.nodes;

    // When focused entities exist, filter to only show them
    if (focusedEntityIds.size > 0) {
      cityFilteredNodes = cityFilteredNodes.filter((node) => {
        // Always include focused persons
        if (node.type === 'person' && focusedEntityIds.has(node.id)) return true;
        // Hide everything else when focusing
        return false;
      });
    }

    // Filter nodes based on visibility toggles
    const filteredNodes = cityFilteredNodes.filter((node) => {
      if (node.type === 'person' && node.isSuspect) {
        return visibleNodes.includes('suspects');
      }
      if (node.type === 'person' && !node.isSuspect) {
        return visibleNodes.includes('associates');
      }
      if (node.type === 'device') {
        return visibleNodes.includes('devices');
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
      const category = link.edgeCategory || 'colocation';
      return visibleEdges.includes(category);
    });

    // Create fresh link objects to prevent force-graph from using cached node references
    // This ensures edges to filtered-out nodes (like devices) don't render
    const freshLinks = filteredLinks.map((link) => ({
      ...link,
      source: typeof link.source === 'string' ? link.source : (link.source as GraphNode).id,
      target: typeof link.target === 'string' ? link.target : (link.target as GraphNode).id,
    }));

    return {
      nodes: filteredNodes,
      links: freshLinks,
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

  // Handle view mode toggle
  const handleViewModeToggle = (_event: React.MouseEvent<HTMLElement>, newMode: 'persons' | 'devices' | null) => {
    if (newMode) {
      setGraphViewMode(newMode);
      
      // Automatically adjust visible nodes based on view mode
      if (newMode === 'devices') {
        // In devices mode: show persons and devices
        setVisibleNodes(['suspects', 'associates', 'devices']);
        setVisibleEdges(['device', 'social', 'colocation']);
      } else {
        // In persons mode: show persons, hide devices
        setVisibleNodes(['suspects', 'associates']);
        setVisibleEdges(['colocation', 'social']);
      }
    }
  };

  // Fetch entities with link status when switching to device view or opening profile modal
  useEffect(() => {
    // Trigger fetch when in device view OR when profile modal is open (to show linked devices)
    if (graphViewMode !== 'devices' && !profileOpen) return;
    if (entitiesData) return; // Already loaded

    let cancelled = false;
    setEntitiesLoading(true);

    fetchEntitiesWithLinkStatus()
      .then((data) => {
        if (cancelled) return;
        setEntitiesData(data);
      })
      .catch((err) => {
        console.error('Failed to load entities with link status:', err);
      })
      .finally(() => {
        if (cancelled) return;
        setEntitiesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [graphViewMode, entitiesData, profileOpen]);

  // Update suspects with linked devices when entitiesData changes
  useEffect(() => {
    if (!entitiesData?.persons) return;

    // Build a map of person ID -> linked devices
    const personDevicesMap = new Map<string, LinkedDevice[]>();
    for (const person of entitiesData.persons) {
      if (person.linkedDevices && person.linkedDevices.length > 0) {
        personDevicesMap.set(person.id, person.linkedDevices as LinkedDevice[]);
      }
    }

    // Update suspects with their linked devices
    setSuspects((prev) =>
      prev.map((s) => ({
        ...s,
        linkedDevices: personDevicesMap.get(s.id) || [],
      }))
    );
  }, [entitiesData]);

  // Handle single click with delay to distinguish from double-click
  const handleCardClick = useCallback((suspectId: string) => {
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
    }
    clickTimeoutRef.current = setTimeout(() => {
      setSelectedPersonIds(new Set([suspectId]));
      clickTimeoutRef.current = null;
    }, 200);
  }, []);

  // Handle double-click - cancel pending single click and open profile
  const handleCardDoubleClick = useCallback((suspect: Suspect) => {
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    setSelectedPersonIds(new Set([suspect.id]));
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
            linkedDevices: [], // Will be populated from entitiesData when available
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
      // Device-specific fields
      ownerId?: string | null;
      relationship?: string;
      isBurner?: boolean;
    }[];
    links: { source: string; target: string; type: string; count?: number; weight?: number; relationship?: string }[];
  }) => {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];

    const cx = 0,
      cy = 0;

    // Find all node types from API data
    const suspectNodes = apiData.nodes?.filter((n) => n.type === 'person' && n.isSuspect) || [];
    const associateNodes = apiData.nodes?.filter((n) => n.type === 'person' && !n.isSuspect) || [];
    const deviceNodes = apiData.nodes?.filter((n) => n.type === 'device') || [];

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

    // Add device nodes - position them near their owner persons
    // Calculate where devices should start (after associates)
    const associateRings = Math.ceil(associateNodes.length / 14);
    if (deviceNodes.length > 0) {
      // Build a map of node positions for owner lookup
      const nodePositions = new Map<string, { x: number; y: number }>();
      nodes.forEach((n) => {
        if (n.fx !== undefined && n.fy !== undefined) {
          nodePositions.set(n.id, { x: n.fx, y: n.fy });
        }
      });

      deviceNodes.forEach((device, i) => {
        // Position near owner if owner exists in graph, otherwise in outer ring
        const ownerPos = device.ownerId ? nodePositions.get(device.ownerId) : null;
        let fx: number, fy: number;

        if (ownerPos) {
          // Position device slightly offset from owner
          const offsetAngle = (i * Math.PI) / 4 + Math.PI / 8; // Spread devices around owner
          const offsetRadius = 25;
          fx = ownerPos.x + Math.cos(offsetAngle) * offsetRadius;
          fy = ownerPos.y + Math.sin(offsetAngle) * offsetRadius;
        } else {
          // Position in outer ring if no owner found
          const deviceBaseRadius = associateBaseRadius + associateRings * 50 + 40;
          const devicesPerRing = 20;
          const ringIndex = Math.floor(i / devicesPerRing);
          const posInRing = i % devicesPerRing;
          const ringCount = Math.min(devicesPerRing, deviceNodes.length - ringIndex * devicesPerRing);
          const angle = (posInRing / ringCount) * Math.PI * 2;
          const radius = deviceBaseRadius + ringIndex * 40;
          fx = cx + Math.cos(angle) * radius;
          fy = cy + Math.sin(angle) * radius;
        }

        nodes.push({
          id: device.id,
          name: device.name,
          type: 'device',
          color: device.isBurner ? '#f59e0b' : '#8b5cf6', // Amber for burner, purple for regular
          size: 4,
          ownerId: device.ownerId,
          relationship: device.relationship,
          isBurner: device.isBurner,
          fx,
          fy,
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
        const isOwns = link.type === 'OWNS';

        // CO_LOCATED can only be between people - skip if either node is not a person
        if (isCoLocated && (!personNodeIds.has(link.source) || !personNodeIds.has(link.target))) {
          return;
        }

        // Determine edge category for filtering
        const edgeCategory = isCoLocated
          ? 'colocation'
          : isSocial
            ? 'social'
            : 'device';

        // Color scheme: amber=colocation, purple=social, cyan=device
        const color = isCoLocated
          ? '#fbbf24'
          : isSocial
            ? '#a78bfa'
            : '#06b6d4';

        links.push({
          source: link.source,
          target: link.target,
          type: link.type,
          edgeCategory,
          color,
          width: isCoLocated ? 2 : isSocial ? 1.5 : isOwns ? 1 : 1,
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

    setGraphData({ nodes, links });
  };

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
        {containerDimensions.width > 0 && containerDimensions.height > 0 && (
        <ForceGraph2D
          ref={graphRef}
          graphData={filteredGraphData}
          width={containerDimensions.width}
          height={containerDimensions.height}
          backgroundColor="transparent"
          nodeRelSize={1}
          nodeVal={(node) => (node as GraphNode).size}
          d3AlphaDecay={1}
          d3VelocityDecay={1}
          cooldownTicks={0}
          enableNodeDrag={true}
          warmupTicks={0}
          minZoom={0.3}
          maxZoom={5}
          onNodeHover={(node) => {
            hoveredNodeRef.current = node ? (node as GraphNode).id : null;
          }}
          onNodeClick={(node, event) => {
            event.stopPropagation();
            const n = node as GraphNode;
            if (n.type === 'person') {
              // Always toggle selection (multi-select by default)
              togglePersonSelection(n.id);
              // Also add to co-location selection for comparison features
              if (event.shiftKey || event.metaKey || event.ctrlKey) {
                toggleColocationEntity(n.id);
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
            const isSelected = selectedPersonIds.has(n.id) || isFocused || isMultiSelected;
            const isSearchMatch = searchMatchIds.has(n.id);
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
              // Check device link status for device mode visualization
              const inDeviceMode = graphViewMode === 'devices';
              const hasDeviceLink = personsWithDeviceLinks.has(n.id);

              // Draw search match halo (outermost ring, behind everything)
              if (isSearchMatch && !isSelected) {
                const searchHaloRadius = r + 10;
                
                // Outer glow - bright green pulse effect
                ctx.beginPath();
                ctx.arc(node.x, node.y, searchHaloRadius + 4, 0, 2 * Math.PI);
                ctx.strokeStyle = 'rgba(34, 197, 94, 0.3)'; // Green glow
                ctx.lineWidth = 8;
                ctx.stroke();
                
                // Inner search ring
                ctx.beginPath();
                ctx.arc(node.x, node.y, searchHaloRadius, 0, 2 * Math.PI);
                ctx.strokeStyle = '#22c55e'; // Bright green
                ctx.lineWidth = 2.5;
                ctx.stroke();
              }
              
              // Draw focus ring first (behind the main node) when selected
              if (isSelected) {
                const focusRingRadius = r + 6;
                const focusRingWidth = 3;
                
                // Outer glow effect - cyan in device mode for linked persons
                ctx.beginPath();
                ctx.arc(node.x, node.y, focusRingRadius + 2, 0, 2 * Math.PI);
                ctx.strokeStyle = inDeviceMode && hasDeviceLink
                  ? 'rgba(6, 182, 212, 0.4)' // Cyan glow for device-linked
                  : n.isSuspect 
                    ? 'rgba(251, 191, 36, 0.3)' // Yellow glow for suspects
                    : 'rgba(167, 139, 250, 0.3)'; // Purple glow for associates
                ctx.lineWidth = 6;
                ctx.stroke();
                
                // Main focus ring
                ctx.beginPath();
                ctx.arc(node.x, node.y, focusRingRadius, 0, 2 * Math.PI);
                ctx.strokeStyle = inDeviceMode && hasDeviceLink
                  ? '#06b6d4' // Cyan ring for device-linked
                  : n.isSuspect 
                    ? '#fbbf24' // Yellow ring for suspects
                    : '#a78bfa'; // Purple ring for associates
                ctx.lineWidth = focusRingWidth;
                ctx.setLineDash([4, 3]); // Dashed line pattern
                ctx.stroke();
                ctx.setLineDash([]); // Reset line dash
              }

              // In device mode, draw device indicator ring for linked persons
              if (inDeviceMode && hasDeviceLink && !isSelected) {
                const deviceRingRadius = r + 4;
                ctx.beginPath();
                ctx.arc(node.x, node.y, deviceRingRadius, 0, 2 * Math.PI);
                ctx.strokeStyle = 'rgba(6, 182, 212, 0.5)'; // Cyan ring
                ctx.lineWidth = 2;
                ctx.stroke();
              }

              // Main node - different colors for suspects vs associates
              // In device mode: dimmer for unlinked persons
              ctx.beginPath();
              ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
              const baseColor = n.isSuspect ? '#dc2626' : '#6b7280';
              ctx.fillStyle = inDeviceMode && !hasDeviceLink 
                ? (n.isSuspect ? '#dc262680' : '#6b728060') // Dimmer for unlinked in device mode
                : baseColor;
              ctx.fill();

              // Highlight ring - cyan in device mode for linked persons
              ctx.strokeStyle = isSelected
                ? 'rgba(255, 255, 255, 0.95)'
                : isHovered
                  ? inDeviceMode && hasDeviceLink
                    ? 'rgba(6, 182, 212, 0.9)' // Cyan hover for device-linked
                    : 'rgba(255, 255, 255, 0.8)'
                  : inDeviceMode && hasDeviceLink
                    ? 'rgba(6, 182, 212, 0.6)' // Cyan border for device-linked
                    : n.isSuspect
                      ? 'rgba(255, 255, 255, 0.5)'
                      : 'rgba(255, 255, 255, 0.3)';
              ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2 : (inDeviceMode && hasDeviceLink ? 1.5 : 1);
              ctx.stroke();

              // Device badge for linked persons in device mode
              if (inDeviceMode && hasDeviceLink) {
                const badgeX = node.x + r * 0.7;
                const badgeY = node.y - r * 0.7;
                const badgeR = Math.max(4, r * 0.4);
                
                // Badge background
                ctx.beginPath();
                ctx.arc(badgeX, badgeY, badgeR, 0, 2 * Math.PI);
                ctx.fillStyle = '#06b6d4'; // Cyan
                ctx.fill();
                ctx.strokeStyle = theme.palette.mode === 'dark' ? '#1a1a2e' : '#fff';
                ctx.lineWidth = 1;
                ctx.stroke();
                
                // Phone icon (simplified rectangle)
                const iconSize = badgeR * 0.6;
                ctx.fillStyle = '#fff';
                ctx.fillRect(badgeX - iconSize * 0.35, badgeY - iconSize * 0.5, iconSize * 0.7, iconSize);
              }

              // Label - scale font size inversely with zoom for consistent screen size
              const labelFontSize = Math.max(8, Math.min(14, (n.isSuspect ? 11 : 9) / zoom));
              ctx.font = `${n.isSuspect ? 'bold' : '500'} ${labelFontSize}px "SF Pro Display", "Segoe UI", system-ui, sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';
              ctx.fillStyle = inDeviceMode && !hasDeviceLink
                ? (theme.palette.mode === 'dark' ? '#9ca3af80' : '#6b728080') // Dimmer label for unlinked
                : n.isSuspect
                  ? theme.palette.mode === 'dark'
                    ? '#fff'
                    : '#1a1a2e'
                  : theme.palette.mode === 'dark'
                    ? '#9ca3af'
                    : '#6b7280';
              ctx.fillText(n.alias || n.name, node.x, node.y + r + 8 / zoom);
            } else if (n.type === 'device') {
              // Device nodes - rounded rectangle with phone icon
              const deviceWidth = r * 2;
              const deviceHeight = r * 2.5;
              const cornerRadius = r * 0.4;

              // Draw search match halo for devices
              if (isSearchMatch) {
                // Outer glow
                ctx.beginPath();
                ctx.roundRect(
                  node.x - deviceWidth / 2 - 8,
                  node.y - deviceHeight / 2 - 8,
                  deviceWidth + 16,
                  deviceHeight + 16,
                  cornerRadius + 4
                );
                ctx.strokeStyle = 'rgba(34, 197, 94, 0.3)';
                ctx.lineWidth = 8;
                ctx.stroke();
                
                // Inner ring
                ctx.beginPath();
                ctx.roundRect(
                  node.x - deviceWidth / 2 - 4,
                  node.y - deviceHeight / 2 - 4,
                  deviceWidth + 8,
                  deviceHeight + 8,
                  cornerRadius + 2
                );
                ctx.strokeStyle = '#22c55e';
                ctx.lineWidth = 2.5;
                ctx.stroke();
              }

              // Device body
              ctx.beginPath();
              ctx.roundRect(
                node.x - deviceWidth / 2,
                node.y - deviceHeight / 2,
                deviceWidth,
                deviceHeight,
                cornerRadius
              );
              ctx.fillStyle = n.isBurner ? '#ef4444' : '#06b6d4';
              ctx.fill();
              ctx.strokeStyle = isHovered ? '#fff' : 'rgba(255,255,255,0.5)';
              ctx.lineWidth = isHovered ? 2 : 1;
              ctx.stroke();

              // Screen area
              const screenPadding = r * 0.3;
              ctx.beginPath();
              ctx.roundRect(
                node.x - deviceWidth / 2 + screenPadding,
                node.y - deviceHeight / 2 + screenPadding,
                deviceWidth - screenPadding * 2,
                deviceHeight - screenPadding * 2 - r * 0.5,
                cornerRadius * 0.5
              );
              ctx.fillStyle = 'rgba(255,255,255,0.15)';
              ctx.fill();

              // Home button
              ctx.beginPath();
              ctx.arc(node.x, node.y + deviceHeight / 2 - r * 0.4, r * 0.15, 0, 2 * Math.PI);
              ctx.fillStyle = 'rgba(255,255,255,0.3)';
              ctx.fill();

              // Label
              const deviceLabelFontSize = Math.max(6, Math.min(10, 8 / zoom));
              ctx.font = `500 ${deviceLabelFontSize}px "SF Pro Display", system-ui, sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';
              ctx.fillStyle = n.isBurner ? '#fca5a5' : '#67e8f9';
              ctx.fillText(n.name, node.x, node.y + deviceHeight / 2 + 6 / zoom);
              
              if (n.isBurner) {
                const burnerFontSize = Math.max(5, Math.min(9, 7 / zoom));
                ctx.font = `600 ${burnerFontSize}px "SF Pro Display", system-ui, sans-serif`;
                ctx.fillStyle = '#ef4444';
                ctx.fillText('BURNER', node.x, node.y + deviceHeight / 2 + 16 / zoom);
              }
            } else {
              // Location nodes - hexagonal
              const s = r * 1.2;
              const isLocationHovered = isHovered;
              const baseColor = n.color || '#3b82f6';

              // Draw search match halo for locations
              if (isSearchMatch) {
                // Outer glow - hexagonal shape
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                  const angle = (Math.PI / 3) * i - Math.PI / 2;
                  const hx = node.x + Math.cos(angle) * (s + 12);
                  const hy = node.y + Math.sin(angle) * (s + 12);
                  if (i === 0) ctx.moveTo(hx, hy);
                  else ctx.lineTo(hx, hy);
                }
                ctx.closePath();
                ctx.strokeStyle = 'rgba(34, 197, 94, 0.3)';
                ctx.lineWidth = 8;
                ctx.stroke();
                
                // Inner ring
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                  const angle = (Math.PI / 3) * i - Math.PI / 2;
                  const hx = node.x + Math.cos(angle) * (s + 6);
                  const hy = node.y + Math.sin(angle) * (s + 6);
                  if (i === 0) ctx.moveTo(hx, hy);
                  else ctx.lineTo(hx, hy);
                }
                ctx.closePath();
                ctx.strokeStyle = '#22c55e';
                ctx.lineWidth = 2.5;
                ctx.stroke();
              }

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
        )}

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
            overflowX: 'auto',
          }}
        >
          <Stack spacing={1.25} sx={{ minWidth: 'fit-content' }}>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              flexWrap="wrap"
              rowGap={1}
              columnGap={1.5}
            >
              <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap" rowGap={0.5}>
                <Typography variant="subtitle2" sx={{ color: 'text.primary', fontWeight: 700 }}>
                  Graph filters
                </Typography>
                {cityFilter && (
                  <Chip
                    label={`City ${cityFilter}`}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.7rem',
                      bgcolor: `${theme.palette.accent.blue}18`,
                      color: theme.palette.accent.blue,
                    }}
                  />
                )}
                {focusedEntityIds.size > 0 && (
                  <Chip
                    label={`Focus ${focusedEntityIds.size}`}
                    size="small"
                    onDelete={() => {
                      setFocusedEntityIds(new Set());
                      setSelectedPersonIds(new Set());
                      setColocationEntityIds(new Set());
                    }}
                    sx={{
                      height: 20,
                      fontSize: '0.7rem',
                      bgcolor: `${theme.palette.accent.purple}24`,
                      color: theme.palette.accent.purple,
                      fontWeight: 600,
                      '& .MuiChip-deleteIcon': {
                        color: theme.palette.accent.purple,
                        fontSize: 14,
                        '&:hover': { color: theme.palette.accent.red },
                      },
                    }}
                  />
                )}
              </Stack>

              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                flexWrap="wrap"
                rowGap={0.75}
                justifyContent="flex-end"
              >
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', letterSpacing: 0.6 }}>
                    View
                  </Typography>
                  <ToggleButtonGroup
                    value={graphViewMode}
                    exclusive
                    onChange={handleViewModeToggle}
                    size="small"
                    sx={compactToggleSx}
                  >
                    <ToggleButton
                      value="persons"
                      sx={{
                        '&.Mui-selected': {
                          bgcolor: `${theme.palette.accent.purple}20`,
                          color: theme.palette.accent.purple,
                          '&:hover': { bgcolor: `${theme.palette.accent.purple}30` },
                        },
                      }}
                    >
                      Persons
                    </ToggleButton>
                    <ToggleButton
                      value="devices"
                      sx={{
                        '&.Mui-selected': {
                          bgcolor: `${theme.palette.accent.green}20`,
                          color: theme.palette.accent.green,
                          '&:hover': { bgcolor: `${theme.palette.accent.green}30` },
                        },
                      }}
                    >
                      Devices
                      {entitiesData && (
                        <Chip
                          label={`${entitiesData.stats.unlinkedDevices} unlinked`}
                          size="small"
                          sx={{
                            ml: 0.5,
                            height: 16,
                            fontSize: '0.6rem',
                            bgcolor:
                              entitiesData.stats.unlinkedDevices > 0
                                ? `${theme.palette.warning.main}28`
                                : `${theme.palette.success.main}24`,
                            color:
                              entitiesData.stats.unlinkedDevices > 0
                                ? theme.palette.warning.main
                                : theme.palette.success.main,
                          }}
                        />
                      )}
                    </ToggleButton>
                  </ToggleButtonGroup>
                </Stack>

                <Stack direction="row" spacing={0.75} alignItems="center">
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', letterSpacing: 0.6 }}>
                    Nodes
                  </Typography>
                  <ToggleButtonGroup
                    value={visibleNodes}
                    onChange={handleNodeToggle}
                    size="small"
                    sx={compactToggleSx}
                  >
                    <Tooltip title="Show/Hide persons of interest">
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
                        Suspects
                      </ToggleButton>
                    </Tooltip>
                    <Tooltip title="Show/Hide associates (other persons linked to network)">
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
                        Associates
                      </ToggleButton>
                    </Tooltip>
                    <Tooltip title="Show/Hide devices linked to persons">
                      <ToggleButton
                        value="devices"
                        sx={{
                          '&.Mui-selected': {
                            bgcolor: 'rgba(139, 92, 246, 0.2)',
                            color: '#8b5cf6',
                            '&:hover': { bgcolor: 'rgba(139, 92, 246, 0.3)' },
                          },
                        }}
                      >
                        Devices
                      </ToggleButton>
                    </Tooltip>
                  </ToggleButtonGroup>
                </Stack>

                <Stack direction="row" spacing={0.75} alignItems="center">
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', letterSpacing: 0.6 }}>
                    Edges
                  </Typography>
                  <ToggleButtonGroup
                    value={visibleEdges}
                    onChange={handleEdgeToggle}
                    size="small"
                    sx={compactToggleSx}
                  >
                    <Tooltip title="Co-location (device proximity)">
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
                        Co-location
                      </ToggleButton>
                    </Tooltip>
                    <Tooltip title="Social connections (calls, messages)">
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
                        Social
                      </ToggleButton>
                    </Tooltip>
                    <Tooltip title="Device ownership links">
                      <ToggleButton
                        value="device"
                        sx={{
                          '&.Mui-selected': {
                            bgcolor: 'rgba(6, 182, 212, 0.2)',
                            color: '#06b6d4',
                            '&:hover': { bgcolor: 'rgba(6, 182, 212, 0.3)' },
                          },
                        }}
                      >
                        Device
                      </ToggleButton>
                    </Tooltip>
                  </ToggleButtonGroup>
                </Stack>
              </Stack>
            </Stack>

        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          flexWrap="wrap"
          rowGap={0.75}
          columnGap={1}
        >
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
            Quick actions
          </Typography>
          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" rowGap={0.5}>
            {graphViewMode === 'devices' && (
              <Button
                size="small"
                startIcon={<Add sx={{ fontSize: 14 }} />}
                onClick={() => handleOpenCreateLink()}
                sx={{
                  fontSize: '0.75rem',
                  textTransform: 'none',
                  color: theme.palette.accent.purple,
                }}
              >
                Link device
              </Button>
            )}
            <Button
              variant="text"
              size="small"
              startIcon={<Download sx={{ fontSize: 14 }} />}
              onClick={exportSuspectsCSV}
              sx={{
                color: 'text.secondary',
                fontSize: '0.75rem',
                px: 1,
                '&:hover': {
                  color: theme.palette.accent.orange,
                  bgcolor: `${theme.palette.accent.orange}10`,
                },
              }}
            >
              Export CSV
            </Button>
            {USE_DATABRICKS && (
              <Chip
                icon={<Cloud sx={{ fontSize: 12 }} />}
                label="Databricks"
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.65rem',
                  bgcolor: `${theme.palette.accent.orange}18`,
                  color: theme.palette.accent.orange,
                  '& .MuiChip-icon': { color: theme.palette.accent.orange },
                }}
              />
            )}
          </Stack>
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
            <Stack direction="row" alignItems="center" spacing={1}>
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: 1,
                  bgcolor: '#8b5cf6',
                }}
              />
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                Device
              </Typography>
            </Stack>
            {graphViewMode === 'devices' && (
              <Stack direction="row" alignItems="center" spacing={1}>
                <Box
                  sx={{
                    position: 'relative',
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    bgcolor: '#dc2626',
                    border: '2px solid #06b6d4',
                  }}
                >
                  {/* Device badge indicator */}
                  <Box
                    sx={{
                      position: 'absolute',
                      top: -3,
                      right: -3,
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: '#06b6d4',
                      border: '1px solid',
                      borderColor: theme.palette.mode === 'dark' ? '#1a1a2e' : '#fff',
                    }}
                  />
                </Box>
                <Typography variant="caption" sx={{ color: '#06b6d4', fontWeight: 500 }}>
                  Device Linked
                </Typography>
              </Stack>
            )}
            {graphViewMode === 'devices' && (
              <Stack direction="row" alignItems="center" spacing={1}>
                <Box
                  sx={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    bgcolor: '#dc262680',
                    border: '1px solid rgba(255,255,255,0.3)',
                  }}
                />
                <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 500 }}>
                  No Device
                </Typography>
              </Stack>
            )}
          </Stack>
        </Paper>
      </Box>

      {/* Sidebar */}
      <Box
        sx={{
          width: 320,
          borderLeft: 1,
          borderColor: 'border.main',
          bgcolor: 'background.paper',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Sidebar Header */}
        <Box
          sx={{
            px: 2,
            py: 1.5,
            borderBottom: 1,
            borderColor: 'border.main',
            flexShrink: 0,
            bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
          }}
        >
          <Typography
            variant="overline"
            sx={{
              color: 'text.primary',
              letterSpacing: 3,
              fontSize: '0.7rem',
              fontWeight: 600,
              mb: 1.5,
              display: 'block',
            }}
          >
            ANALYSIS PANEL
          </Typography>
          
          {/* Global Search */}
          <TextField
            size="small"
            placeholder="Search all nodes..."
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <Search sx={{ fontSize: 18, color: globalSearch.trim() ? '#22c55e' : 'text.secondary', mr: 0.5 }} />
              ),
              endAdornment: globalSearch && (
                <IconButton
                  size="small"
                  onClick={() => setGlobalSearch('')}
                  sx={{ p: 0.25 }}
                >
                  <Clear sx={{ fontSize: 16 }} />
                </IconButton>
              ),
            }}
            sx={{
              width: '100%',
              '& .MuiInputBase-root': {
                bgcolor: globalSearch.trim() 
                  ? 'rgba(34, 197, 94, 0.08)' 
                  : theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                borderRadius: 1.5,
                fontSize: '0.8rem',
              },
              '& .MuiInputBase-input': {
                py: 0.75,
              },
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: globalSearch.trim() ? '#22c55e' : 'border.main',
              },
              '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: globalSearch.trim() ? '#22c55e' : undefined,
              },
              '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: '#22c55e',
              },
            }}
          />
          {globalSearch.trim() && (
            <Typography
              variant="caption"
              sx={{
                color: '#22c55e',
                fontSize: '0.7rem',
                mt: 0.75,
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
              }}
            >
              <Box
                component="span"
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  bgcolor: '#22c55e',
                  display: 'inline-block',
                }}
              />
              {searchMatchIds.size} {searchMatchIds.size === 1 ? 'match' : 'matches'} highlighted
            </Typography>
          )}
        </Box>

        {/* Scrollable sidebar content */}
        <Box sx={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          {/* Key Stats */}
          <Box sx={{ px: 2, py: 1.5 }}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              onClick={() => toggleSection('overview')}
              sx={{ cursor: 'pointer', userSelect: 'none', mb: expandedSections.overview ? 1.5 : 0 }}
            >
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                }}
              >
                Overview
              </Typography>
              <ExpandMore
                sx={{
                  fontSize: 18,
                  color: 'text.secondary',
                  transform: expandedSections.overview ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                }}
              />
            </Stack>
            <Collapse in={expandedSections.overview}>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 1.5,
                }}
              >
                <Paper
                elevation={0}
                sx={{
                  p: 1.5,
                  bgcolor: theme.palette.mode === 'dark' ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.06)',
                  border: 1,
                  borderColor: theme.palette.mode === 'dark' ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.15)',
                  borderRadius: 1.5,
                }}
              >
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
                  Suspects
                </Typography>
                <Typography
                  variant="h6"
                  sx={{ color: theme.palette.accent.red, fontWeight: 700, fontSize: '1.1rem', lineHeight: 1.2 }}
                >
                  {suspects.length || 0}
                </Typography>
              </Paper>
              <Paper
                elevation={0}
                sx={{
                  p: 1.5,
                  bgcolor: theme.palette.mode === 'dark' ? 'rgba(234,179,8,0.08)' : 'rgba(234,179,8,0.06)',
                  border: 1,
                  borderColor: theme.palette.mode === 'dark' ? 'rgba(234,179,8,0.2)' : 'rgba(234,179,8,0.15)',
                  borderRadius: 1.5,
                }}
              >
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
                  Co-locations
                </Typography>
                <Typography
                  variant="h6"
                  sx={{ color: theme.palette.accent.yellow, fontWeight: 700, fontSize: '1.1rem', lineHeight: 1.2 }}
                >
                  {graphData.links.filter((l) => l.type === 'CO_LOCATED').length}
                </Typography>
              </Paper>
              <Paper
                elevation={0}
                sx={{
                  p: 1.5,
                  bgcolor: theme.palette.mode === 'dark' ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.06)',
                  border: 1,
                  borderColor: theme.palette.mode === 'dark' ? 'rgba(59,130,246,0.2)' : 'rgba(59,130,246,0.15)',
                  borderRadius: 1.5,
                }}
              >
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
                  Social Links
                </Typography>
                <Typography
                  variant="h6"
                  sx={{ color: theme.palette.accent.blue, fontWeight: 700, fontSize: '1.1rem', lineHeight: 1.2 }}
                >
                  {graphData.links.filter((l) => l.type === 'SOCIAL').length}
                </Typography>
              </Paper>
              </Box>
            </Collapse>
          </Box>

          <Divider sx={{ mx: 2 }} />

          {/* Handoff Alerts */}
          <Box sx={{ px: 2, py: 1.5 }}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              onClick={() => toggleSection('handoffs')}
              sx={{ cursor: 'pointer', userSelect: 'none', mb: expandedSections.handoffs ? 1.5 : 0 }}
            >
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                }}
              >
                Handoff Alerts
              </Typography>
              <ExpandMore
                sx={{
                  fontSize: 18,
                  color: 'text.secondary',
                  transform: expandedSections.handoffs ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                }}
              />
            </Stack>
            <Collapse in={expandedSections.handoffs}>
              <HandoffAlerts
                compact
                maxItems={3}
                onEntityClick={(entityId) => togglePersonSelection(entityId)}
              />
            </Collapse>
          </Box>

          <Divider sx={{ mx: 2 }} />

          {/* AI Network Intelligence */}
          <Box sx={{ px: 2, py: 1.5 }}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              onClick={() => toggleSection('aiIntelligence')}
              sx={{ cursor: 'pointer', userSelect: 'none', mb: expandedSections.aiIntelligence ? 1.5 : 0 }}
            >
              <Stack direction="row" alignItems="center" spacing={1}>
                <Box
                  sx={{
                    width: 20,
                    height: 20,
                    borderRadius: '6px',
                    bgcolor: `${theme.palette.accent.purple}15`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.7rem',
                  }}
                >
                  🤖
                </Box>
                <Typography
                  variant="caption"
                  sx={{
                    color: theme.palette.accent.purple,
                    letterSpacing: 1.5,
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                  }}
                >
                  AI Network Intelligence
                </Typography>
              </Stack>
              <ExpandMore
                sx={{
                  fontSize: 18,
                  color: 'text.secondary',
                  transform: expandedSections.aiIntelligence ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                }}
              />
            </Stack>
            <Collapse in={expandedSections.aiIntelligence}>
              <Stack spacing={1.5}>
                {/* Network Patterns */}
              <Stack direction="row" spacing={1}>
                <AIInsightButton
                  label="Analyze Network"
                  onClick={generateNetworkInsight}
                  loading={networkInsightLoading}
                  size="small"
                />
                {colocationEntityIds.size >= 2 && (
                  <AIInsightButton
                    label="Explain Links"
                    onClick={generateRelationshipInsight}
                    loading={relationshipInsightLoading}
                    size="small"
                  />
                )}
              </Stack>

              {/* Network Pattern Insight */}
              {(networkInsight || networkInsightLoading || networkInsightError) && (
                <AIInsightCard
                  insight={networkInsight}
                  loading={networkInsightLoading}
                  error={networkInsightError}
                  onRefresh={generateNetworkInsight}
                  onDismiss={() => {
                    setNetworkInsight(null);
                    setNetworkInsightError(null);
                  }}
                  compact
                  defaultExpanded={false}
                />
              )}

              {/* Relationship Insight (when entities selected) */}
              {(relationshipInsight || relationshipInsightLoading || relationshipInsightError) && (
                <AIInsightCard
                  insight={relationshipInsight}
                  loading={relationshipInsightLoading}
                  error={relationshipInsightError}
                  onRefresh={generateRelationshipInsight}
                  onDismiss={() => {
                    setRelationshipInsight(null);
                    setRelationshipInsightError(null);
                  }}
                  compact
                  defaultExpanded={true}
                />
              )}

              {!networkInsight && !networkInsightLoading && colocationEntityIds.size < 2 && (
                <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.4 }}>
                  Analyze network patterns or select 2+ entities to explain their relationships
                </Typography>
              )}
              </Stack>
            </Collapse>
          </Box>

          <Divider sx={{ mx: 2 }} />

          {/* Co-location Log */}
          <Box sx={{ px: 2, py: 1.5 }}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              onClick={() => toggleSection('colocation')}
              sx={{ cursor: 'pointer', userSelect: 'none', mb: expandedSections.colocation ? 1 : 0 }}
            >
              <Stack direction="row" alignItems="center" spacing={1}>
                <History sx={{ fontSize: 16, color: theme.palette.accent.yellow }} />
                <Typography
                  variant="caption"
                  sx={{
                    color: 'text.secondary',
                    letterSpacing: 1.5,
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                  }}
                >
                  Co-location Log
                </Typography>
              </Stack>
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <Button
                  size="small"
                  variant="text"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearColocationSelection();
                  }}
                  sx={{
                    fontSize: '0.7rem',
                    color: 'text.secondary',
                    minWidth: 'auto',
                    px: 1,
                    '&:hover': { color: theme.palette.accent.red },
                  }}
                  disabled={colocationEntityIds.size === 0}
                >
                  Clear
                </Button>
                <ExpandMore
                  sx={{
                    fontSize: 18,
                    color: 'text.secondary',
                    transform: expandedSections.colocation ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s',
                  }}
                />
              </Stack>
            </Stack>
            <Collapse in={expandedSections.colocation}>
              <Typography
              variant="caption"
              sx={{ color: 'text.secondary', display: 'block', mb: 1.5, fontSize: '0.7rem', lineHeight: 1.4 }}
            >
              Shift/Ctrl-click suspects to compare where they were together.
            </Typography>

            {colocationEntityIds.size > 0 && (
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
                {Array.from(colocationEntityIds)
                  .slice(0, 8)
                  .map((id) => (
                    <Chip
                      key={id}
                      label={suspectNameById.get(id) || id}
                      size="small"
                      onDelete={() => toggleColocationEntity(id)}
                      sx={{
                        height: 24,
                        bgcolor: `${theme.palette.accent.yellow}12`,
                        color: theme.palette.accent.yellow,
                        borderRadius: '6px',
                        '& .MuiChip-label': { px: 1, fontSize: '0.7rem' },
                        '& .MuiChip-deleteIcon': { color: theme.palette.accent.yellow, opacity: 0.7, fontSize: 14 },
                      }}
                    />
                  ))}
                {colocationEntityIds.size > 8 && (
                  <Chip
                    label={`+${colocationEntityIds.size - 8}`}
                    size="small"
                    sx={{
                      height: 24,
                      bgcolor: 'background.default',
                      color: 'text.secondary',
                      borderRadius: '6px',
                    }}
                  />
                )}
              </Stack>
            )}

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
                  px: 1.5,
                  py: 0.5,
                  textTransform: 'none',
                  '&.Mui-selected': {
                    bgcolor: `${theme.palette.accent.yellow}15`,
                    color: theme.palette.accent.yellow,
                    borderColor: `${theme.palette.accent.yellow}40`,
                    '&:hover': { bgcolor: `${theme.palette.accent.yellow}20` },
                  },
                },
              }}
            >
              <ToggleButton value="any">Any overlap</ToggleButton>
              <ToggleButton value="all">All together</ToggleButton>
            </ToggleButtonGroup>

            <Box>
              {colocationEntityIds.size < 2 ? (
                <Paper
                  elevation={0}
                  sx={{
                    p: 1.5,
                    bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                    borderRadius: 1.5,
                    textAlign: 'center',
                  }}
                >
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                    Select at least 2 suspects to see co-locations.
                  </Typography>
                </Paper>
              ) : colocationLoading ? (
                <Stack direction="row" alignItems="center" spacing={1} sx={{ py: 2, justifyContent: 'center' }}>
                  <CircularProgress size={16} sx={{ color: theme.palette.accent.yellow }} />
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
                    borderRadius: 1.5,
                  }}
                >
                  <Typography variant="caption">{colocationError}</Typography>
                </Alert>
              ) : colocationEntries.length === 0 ? (
                <Paper
                  elevation={0}
                  sx={{
                    p: 1.5,
                    bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                    borderRadius: 1.5,
                    textAlign: 'center',
                  }}
                >
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                    No shared locations found (within the sampled events).
                  </Typography>
                </Paper>
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
                        elevation={0}
                        sx={{
                          p: 1.5,
                          bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                          border: 1,
                          borderColor: 'border.main',
                          borderRadius: 1.5,
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{ color: 'text.secondary', display: 'block', fontSize: '0.65rem' }}
                        >
                          {timeLabel}
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{ color: 'text.primary', fontWeight: 600, fontSize: '0.8rem', mt: 0.25 }}
                        >
                          {placeLabel}
                          <Typography
                            component="span"
                            variant="caption"
                            sx={{ color: 'text.secondary', ml: 0.5 }}
                          >
                            {cellLabel}
                          </Typography>
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
                          {e.evidenceCount} pings
                        </Typography>
                        {e.participants && e.participants.length > 0 && (
                          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                            {e.participants.map((p) => (
                              <Chip
                                key={p.id}
                                label={p.name}
                                size="small"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  setSelectedPersonIds(new Set([p.id]));
                                }}
                                sx={{
                                  height: 20,
                                  fontSize: '0.65rem',
                                  bgcolor: `${theme.palette.accent.yellow}12`,
                                  color: theme.palette.accent.yellow,
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  '&:hover': {
                                    bgcolor: `${theme.palette.accent.yellow}25`,
                                  },
                                }}
                              />
                            ))}
                          </Stack>
                        )}
                      </Paper>
                    );
                  })}
                </Stack>
              )}
              </Box>
            </Collapse>
          </Box>

          <Divider sx={{ mx: 2 }} />

          {/* Social Relationship Log */}
          <Box sx={{ px: 2, py: 1.5 }}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              onClick={() => toggleSection('social')}
              sx={{ cursor: 'pointer', userSelect: 'none', mb: expandedSections.social ? 1 : 0 }}
            >
              <Stack direction="row" alignItems="center" spacing={1}>
                <Call sx={{ fontSize: 16, color: theme.palette.accent.purple }} />
                <Typography
                  variant="caption"
                  sx={{
                    color: 'text.secondary',
                    letterSpacing: 1.5,
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                  }}
                >
                  Social Connections
                </Typography>
              </Stack>
              <ExpandMore
                sx={{
                  fontSize: 18,
                  color: 'text.secondary',
                  transform: expandedSections.social ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                }}
              />
            </Stack>
            <Collapse in={expandedSections.social}>
              <Typography
                variant="caption"
                sx={{ color: 'text.secondary', display: 'block', mb: 1.5, fontSize: '0.7rem', lineHeight: 1.4 }}
              >
                Calls and messages between selected suspects.
              </Typography>

              <Box>
                {colocationEntityIds.size < 2 ? (
                <Paper
                  elevation={0}
                  sx={{
                    p: 1.5,
                    bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                    borderRadius: 1.5,
                    textAlign: 'center',
                  }}
                >
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                    Select at least 2 suspects to see social connections.
                  </Typography>
                </Paper>
              ) : socialLoading ? (
                <Stack direction="row" alignItems="center" spacing={1} sx={{ py: 2, justifyContent: 'center' }}>
                  <CircularProgress size={16} sx={{ color: theme.palette.accent.purple }} />
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Loading…
                  </Typography>
                </Stack>
              ) : socialError ? (
                <Alert
                  severity="error"
                  sx={{
                    bgcolor: `${theme.palette.accent.red}10`,
                    border: 1,
                    borderColor: `${theme.palette.accent.red}30`,
                    borderRadius: 1.5,
                  }}
                >
                  <Typography variant="caption">{socialError}</Typography>
                </Alert>
              ) : socialEntries.length === 0 ? (
                <Paper
                  elevation={0}
                  sx={{
                    p: 1.5,
                    bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                    borderRadius: 1.5,
                    textAlign: 'center',
                  }}
                >
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                    No social connections found between selected suspects.
                  </Typography>
                </Paper>
              ) : (
                <Stack spacing={1}>
                  {socialEntries.slice(0, 20).map((e, idx) => {
                    const typeLabel =
                      e.type === 'CONTACTED'
                        ? '📞 Call'
                        : e.type === 'MESSAGED'
                          ? '💬 Message'
                          : `🔗 ${e.type}`;
                    const person1Label = e.person1Alias
                      ? `${e.person1Name} "${e.person1Alias}"`
                      : e.person1Name;
                    const person2Label = e.person2Alias
                      ? `${e.person2Name} "${e.person2Alias}"`
                      : e.person2Name;
                    return (
                      <Paper
                        key={`${e.person1Id}-${e.person2Id}-${idx}`}
                        elevation={0}
                        sx={{
                          p: 1.5,
                          bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                          border: 1,
                          borderColor: 'border.main',
                          borderRadius: 1.5,
                        }}
                      >
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Typography
                            variant="caption"
                            sx={{
                              color: theme.palette.accent.purple,
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                              fontSize: '0.75rem',
                            }}
                          >
                            {typeLabel}
                          </Typography>
                          <Chip
                            label={`${e.count}×`}
                            size="small"
                            sx={{
                              height: 18,
                              fontSize: '0.65rem',
                              bgcolor: `${theme.palette.accent.purple}15`,
                              color: theme.palette.accent.purple,
                              borderRadius: '4px',
                            }}
                          />
                        </Stack>
                        <Typography
                          variant="body2"
                          sx={{ color: 'text.primary', fontSize: '0.8rem', mt: 0.75 }}
                        >
                          <Typography
                            component="span"
                            variant="body2"
                            sx={{ fontWeight: 600, fontSize: '0.8rem' }}
                          >
                            {person1Label}
                          </Typography>
                          <Typography
                            component="span"
                            variant="body2"
                            sx={{ color: 'text.secondary', mx: 0.75, fontSize: '0.8rem' }}
                          >
                            ↔
                          </Typography>
                          <Typography
                            component="span"
                            variant="body2"
                            sx={{ fontWeight: 600, fontSize: '0.8rem' }}
                          >
                            {person2Label}
                          </Typography>
                        </Typography>
                        {(e.firstContact || e.lastContact) && (
                          <Typography
                            variant="caption"
                            sx={{ color: 'text.secondary', display: 'block', mt: 0.75, fontSize: '0.65rem' }}
                          >
                            {e.firstContact && e.lastContact
                              ? `${new Date(e.firstContact).toLocaleDateString()} - ${new Date(e.lastContact).toLocaleDateString()}`
                              : e.lastContact
                                ? `Last: ${new Date(e.lastContact).toLocaleDateString()}`
                                : `First: ${new Date(e.firstContact!).toLocaleDateString()}`}
                          </Typography>
                        )}
                      </Paper>
                    );
                  })}
                </Stack>
              )}
              </Box>
            </Collapse>
          </Box>

          <Divider sx={{ mx: 2 }} />

          {/* Device Link Status (when in device view) */}
          {graphViewMode === 'devices' && (
            <Box sx={{ px: 2, py: 1.5 }}>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                onClick={() => toggleSection('deviceStatus')}
                sx={{ cursor: 'pointer', userSelect: 'none', mb: expandedSections.deviceStatus ? 1.5 : 0 }}
              >
                <Stack direction="row" alignItems="center" spacing={1}>
                  <DeviceHub sx={{ fontSize: 16, color: theme.palette.accent.green }} />
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'text.secondary',
                      letterSpacing: 1.5,
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                    }}
                  >
                    Device Link Status
                  </Typography>
                </Stack>
                <ExpandMore
                  sx={{
                    fontSize: 18,
                    color: 'text.secondary',
                    transform: expandedSections.deviceStatus ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s',
                  }}
                />
              </Stack>
              <Collapse in={expandedSections.deviceStatus}>
                {entitiesLoading ? (
                <Stack direction="row" alignItems="center" spacing={1} sx={{ py: 2, justifyContent: 'center' }}>
                  <CircularProgress size={16} />
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Loading...
                  </Typography>
                </Stack>
              ) : entitiesData ? (
                <Stack spacing={1.5}>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Chip
                      icon={<LinkIcon sx={{ fontSize: 14 }} />}
                      label={`${entitiesData.stats.linkedDevices} Linked`}
                      size="small"
                      sx={{
                        height: 26,
                        fontSize: '0.75rem',
                        bgcolor: `${theme.palette.success.main}15`,
                        color: theme.palette.success.main,
                        borderRadius: '6px',
                        '& .MuiChip-icon': { color: theme.palette.success.main },
                      }}
                    />
                    <Chip
                      icon={<LinkOff sx={{ fontSize: 14 }} />}
                      label={`${entitiesData.stats.unlinkedDevices} Unlinked`}
                      size="small"
                      sx={{
                        height: 26,
                        fontSize: '0.75rem',
                        bgcolor: `${theme.palette.warning.main}15`,
                        color: theme.palette.warning.main,
                        borderRadius: '6px',
                        '& .MuiChip-icon': { color: theme.palette.warning.main },
                      }}
                    />
                  </Stack>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                    {entitiesData.stats.totalPersons} persons • {entitiesData.stats.totalDevices} devices
                  </Typography>
                </Stack>
                ) : null}

                <Divider sx={{ mt: 2 }} />
              </Collapse>
            </Box>
          )}

          {/* Link Suggestions Panel */}
          <Box sx={{ px: 2, py: 1.5 }}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              onClick={() => toggleSection('linkSuggestions')}
              sx={{ cursor: 'pointer', userSelect: 'none', mb: expandedSections.linkSuggestions ? 1.5 : 0 }}
            >
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                }}
              >
                Link Suggestions
              </Typography>
              <ExpandMore
                sx={{
                  fontSize: 18,
                  color: 'text.secondary',
                  transform: expandedSections.linkSuggestions ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                }}
              />
            </Stack>
            <Collapse in={expandedSections.linkSuggestions}>
              <LinkSuggestionsPanel
                compact={graphViewMode !== 'devices'}
                maxItems={graphViewMode === 'devices' ? 10 : 2}
                onLinkCreated={handleLinkCreated}
              />
            </Collapse>
          </Box>

          <Divider sx={{ mx: 2 }} />

          <PersonList
            suspects={suspects}
            cityFilter={cityFilter}
            searchMatchIds={searchMatchIds}
            selectedPersonIds={selectedPersonIds}
            expanded={expandedSections.persons}
            onToggleSection={() => toggleSection('persons')}
            editingEntityId={editingEntityId}
            editingTitle={editingTitle}
            onEditingTitleChange={setEditingTitle}
            onSaveTitle={handleSaveTitle}
            onCancelEdit={handleCancelEdit}
            onStartEditTitle={handleStartEditTitle}
            onResetTitle={handleResetTitle}
            onCardClick={handleCardClick}
            onCardDoubleClick={handleCardDoubleClick}
            onToggleColocationEntity={toggleColocationEntity}
          />
        </Box>

        {/* Fixed Footer with Action Buttons */}
        <Box
          sx={{
            p: 2,
            borderTop: 1,
            borderColor: 'border.main',
            bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
            flexShrink: 0,
          }}
        >
          {/* Selection indicator */}
          {selectedPersonIds.size > 0 && (
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 1.5 }}
            >
              <Chip
                icon={<People sx={{ fontSize: 14 }} />}
                label={`${selectedPersonIds.size} selected`}
                size="small"
                onDelete={clearPersonSelection}
                deleteIcon={<Clear sx={{ fontSize: 14 }} />}
                sx={{
                  height: 26,
                  bgcolor: `${theme.palette.accent.blue}12`,
                  color: theme.palette.accent.blue,
                  borderRadius: '6px',
                  '& .MuiChip-label': { fontSize: '0.75rem', fontWeight: 500 },
                  '& .MuiChip-icon': { color: theme.palette.accent.blue },
                  '& .MuiChip-deleteIcon': {
                    color: theme.palette.accent.blue,
                    '&:hover': { color: theme.palette.accent.red },
                  },
                }}
              />
            </Stack>
          )}

          <Stack spacing={1}>
            <Button
              variant="contained"
              fullWidth
              size="small"
              startIcon={<Hub sx={{ fontSize: 16 }} />}
              disabled={selectedPersonIds.size === 0}
              onClick={focusLinkedSuspects}
              sx={{
                py: 1,
                bgcolor: theme.palette.accent.purple,
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.8rem',
                borderRadius: 1.5,
                textTransform: 'none',
                '&:hover': { bgcolor: '#7c3aed' },
                '&.Mui-disabled': {
                  bgcolor: theme.palette.mode === 'dark' ? '#27272a' : '#e5e7eb',
                  color: theme.palette.mode === 'dark' ? '#52525b' : '#9ca3af',
                },
              }}
            >
              Focus Linked Suspects
            </Button>

            <Button
              variant="contained"
              fullWidth
              size="small"
              startIcon={<MapIcon sx={{ fontSize: 16 }} />}
              disabled={selectedPersonIds.size === 0}
              onClick={() => {
                const entityIds = Array.from(selectedPersonIds).join(',');
                navigate(`/heatmap?entityIds=${encodeURIComponent(entityIds)}`);
              }}
              sx={{
                py: 1,
                bgcolor: theme.palette.accent.blue,
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.8rem',
                borderRadius: 1.5,
                textTransform: 'none',
                '&:hover': { bgcolor: '#2563eb' },
                '&.Mui-disabled': {
                  bgcolor: theme.palette.mode === 'dark' ? '#27272a' : '#e5e7eb',
                  color: theme.palette.mode === 'dark' ? '#52525b' : '#9ca3af',
                },
              }}
            >
              View Location History
            </Button>

            <Button
              variant="outlined"
              fullWidth
              size="small"
              endIcon={<ArrowForward sx={{ fontSize: 16 }} />}
              onClick={() => navigate('/evidence-card')}
              sx={{
                py: 1,
                borderColor: theme.palette.accent.orange,
                color: theme.palette.accent.orange,
                fontWeight: 600,
                fontSize: '0.8rem',
                borderRadius: 1.5,
                textTransform: 'none',
                '&:hover': {
                  bgcolor: `${theme.palette.accent.orange}08`,
                  borderColor: theme.palette.accent.orange,
                },
              }}
            >
              View Cases
            </Button>
          </Stack>
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

              {/* Linked Devices */}
              <Paper sx={{ p: 2, mb: 2, bgcolor: 'background.default' }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                  <Phone sx={{ color: theme.palette.accent.purple, fontSize: 18 }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Linked Devices
                  </Typography>
                  {profileSuspect.linkedDevices && profileSuspect.linkedDevices.length > 0 && (
                    <Chip
                      label={profileSuspect.linkedDevices.length}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: '0.65rem',
                        bgcolor: `${theme.palette.accent.purple}20`,
                        color: theme.palette.accent.purple,
                      }}
                    />
                  )}
                </Stack>
                {profileSuspect.linkedDevices && profileSuspect.linkedDevices.length > 0 ? (
                  <Stack spacing={1}>
                    {profileSuspect.linkedDevices.map((device) => (
                      <Stack
                        key={device.deviceId}
                        direction="row"
                        alignItems="center"
                        spacing={1}
                        sx={{
                          p: 1,
                          bgcolor: 'action.hover',
                          borderRadius: 1,
                        }}
                      >
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', flex: 1 }}>
                          {device.deviceId}
                        </Typography>
                        <Chip
                          label={device.relationship.replace('_', ' ')}
                          size="small"
                          sx={{
                            height: 18,
                            fontSize: '0.65rem',
                            textTransform: 'capitalize',
                          }}
                        />
                        <Chip
                          label={device.source}
                          size="small"
                          sx={{
                            height: 18,
                            fontSize: '0.6rem',
                            bgcolor:
                              device.source === 'databricks'
                                ? `${theme.palette.info.main}20`
                                : `${theme.palette.success.main}20`,
                            color:
                              device.source === 'databricks'
                                ? theme.palette.info.main
                                : theme.palette.success.main,
                          }}
                        />
                      </Stack>
                    ))}
                  </Stack>
                ) : (
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    No linked devices
                  </Typography>
                )}
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

      {/* Create Link Dialog */}
      <CreateLinkDialog
        open={createLinkOpen}
        onClose={handleCloseCreateLink}
        onLinkCreated={handleLinkCreated}
        initialDeviceId={linkInitialDevice}
        initialPersonId={linkInitialPerson}
      />
    </Box>
  );
};

export default GraphExplorer;
