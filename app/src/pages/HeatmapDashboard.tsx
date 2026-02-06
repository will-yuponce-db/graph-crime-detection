import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Slider,
  IconButton,
  Chip,
  Stack,
  Avatar,
  Card,
  CardContent,
  CardActionArea,
  Button,
  ToggleButtonGroup,
  ToggleButton,
  Badge,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  TextField,
  InputAdornment,
  InputBase,
  useTheme,
  Divider,
  Tabs,
  Tab,
  Tooltip as MuiTooltip,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  PlayArrow,
  Pause,
  SkipNext,
  SkipPrevious,
  CellTower,
  Devices,
  ArrowForward,
  ArrowUpward,
  ArrowDownward,
  ArrowBack,
  ZoomIn,
  ZoomOut,
  CenterFocusStrong,
  Person,
  Warning,
  Folder,
  CheckCircle,
  Cloud,
  Search,
  Clear,
  AttachMoney,
  Security,
  LocationOn,
  Timeline,
  Groups,
  Gavel,
  Phone,
  Hub,
  Refresh,
} from '@mui/icons-material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Marker,
  Popup,
  Tooltip,
  Polygon,
  Polyline,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { cellToBoundary, latLngToCell } from 'h3-js';
import {
  fetchConfig,
  fetchPositions,
  fetchPositionsBulk,
  fetchHotspots,
  fetchCases,
  fetchSuspects,
  fetchRelationships,
  fetchDeviceTail,
  fetchEntitiesWithLinkStatus,
  USE_DATABRICKS,
  type CaseData,
  type Suspect,
  type Relationship,
  type DeviceTail,
} from '../services/api';

// Extended suspect type with linked device info
interface LinkedDevice {
  deviceId: string;
  relationship: string;
  source: string;
}

interface SuspectWithDevices extends Suspect {
  linkedDevices?: LinkedDevice[];
}
import AIInsightCard, { AIInsightButton } from '../components/AIInsightCard';
import { analyzeHotspotAnomalies, narrateTimeline, type Insight } from '../services/insights';

// Types
interface CellTower {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  city: string;
}

interface DevicePosition {
  deviceId: string;
  deviceName: string;
  lat: number;
  lng: number;
  towerId: string | null;
  towerName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  ownerAlias: string | null;
  isSuspect: boolean;
  isBurner?: boolean;
  deviceType?: string;
}

interface Hotspot {
  towerId: string;
  towerName: string;
  lat: number;
  lng: number;
  city: string;
  deviceCount: number;
  suspectCount: number;
}

interface KeyFrame {
  id: string;
  caseNumber: string;
  hour: number;
  lat: number;
  lng: number;
  neighborhood: string;
  city: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

const PRIORITY_COLORS: Record<string, string> = {
  low: '#71717a',
  medium: '#eab308',
  high: '#f97316',
  critical: '#ef4444',
};

// Crime type to emoji mapping
const CRIME_TYPE_ICONS: Record<string, { emoji: string; label: string }> = {
  burglary: { emoji: '🏠', label: 'Burglary' },
  robbery: { emoji: '💰', label: 'Robbery' },
  assault: { emoji: '👊', label: 'Assault' },
  fraud: { emoji: '💳', label: 'Fraud' },
  drug: { emoji: '💊', label: 'Drug Crime' },
  narcotics: { emoji: '💊', label: 'Narcotics' },
  theft: { emoji: '🔓', label: 'Theft' },
  larceny: { emoji: '🔓', label: 'Larceny' },
  vehicle: { emoji: '🚗', label: 'Vehicle Crime' },
  'motor vehicle': { emoji: '🚗', label: 'Motor Vehicle' },
  carjacking: { emoji: '🚗', label: 'Carjacking' },
  homicide: { emoji: '⚰️', label: 'Homicide' },
  murder: { emoji: '⚰️', label: 'Murder' },
  arson: { emoji: '🔥', label: 'Arson' },
  vandalism: { emoji: '🎨', label: 'Vandalism' },
  trespass: { emoji: '🚧', label: 'Trespass' },
  weapons: { emoji: '🔫', label: 'Weapons' },
  kidnapping: { emoji: '🚨', label: 'Kidnapping' },
  cybercrime: { emoji: '💻', label: 'Cybercrime' },
  identity: { emoji: '🪪', label: 'Identity Crime' },
  extortion: { emoji: '📜', label: 'Extortion' },
  default: { emoji: '📋', label: 'Case' },
};

// Get crime type info from description
const getCrimeTypeInfo = (description: string): { emoji: string; label: string } => {
  const desc = description.toLowerCase();
  for (const [key, value] of Object.entries(CRIME_TYPE_ICONS)) {
    if (key !== 'default' && desc.includes(key)) {
      return value;
    }
  }
  return CRIME_TYPE_ICONS.default;
};

// Create dynamic case icon based on crime type
const createCaseIcon = (crimeType: { emoji: string }, priority: string) => {
  const color = PRIORITY_COLORS[priority] || PRIORITY_COLORS.medium;
  return L.divIcon({
    className: 'case-icon',
    html: `<div style="font-size: 22px; filter: drop-shadow(0 0 6px ${color});">${crimeType.emoji}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
};

// Map controller component
const MapController: React.FC<{ center: [number, number]; zoom: number }> = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1 });
  }, [center, zoom, map]);
  return null;
};

// Format hour to readable time
const formatHour = (hour: number): string => {
  const day = Math.floor(hour / 24) + 1;
  const h = hour % 24;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `Day ${day}, ${displayHour}:00 ${ampm}`;
};

// Color palette for non-suspect associates - distinct, visually pleasing colors
const associateColors = [
  '#10b981', // Emerald
  '#3b82f6', // Blue
  '#f97316', // Orange
  '#ec4899', // Pink
  '#14b8a6', // Teal
  '#8b5cf6', // Violet
  '#eab308', // Yellow
  '#06b6d4', // Cyan
  '#84cc16', // Lime
  '#f43f5e', // Rose
  '#6366f1', // Indigo
  '#22d3ee', // Sky
  '#a855f7', // Purple
  '#fb923c', // Amber
  '#2dd4bf', // Turquoise
  '#4ade80', // Green
];

// Simple hash function to get consistent color per owner ID
const getAssociateColor = (id: string | null) => {
  if (!id) return '#6b7280'; // Gray fallback for null/undefined
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return associateColors[Math.abs(hash) % associateColors.length];
};

const HeatmapDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const theme = useTheme();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bulkLoadProgress, setBulkLoadProgress] = useState<number | null>(null); // null = not started, 0-100 = loading, 100 = done
  const [currentHour, setCurrentHour] = useState(25);
  const [timeWindow, setTimeWindow] = useState<[number, number]>([0, 71]);
  const [startInput, setStartInput] = useState(formatHour(0));
  const [endInput, setEndInput] = useState(formatHour(71));
  const [startError, setStartError] = useState<string | null>(null);
  const [endError, setEndError] = useState<string | null>(null);
  const [scrubHour, setScrubHour] = useState<number | null>(null);
  const [pendingCaseJump, setPendingCaseJump] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // 0.5x, 1x, 2x, 5x
  const [showDevices, setShowDevices] = useState(true);
  const [showDeviceLabels, setShowDeviceLabels] = useState(false);
  const [showTrails, setShowTrails] = useState(true);
  const [showTrailsOnly, setShowTrailsOnly] = useState(false); // When true, only show trailed entity positions
  const [showHexHeatmap, setShowHexHeatmap] = useState(false);
  const [navExpanded, setNavExpanded] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([38.9076, -77.0723]);
  const [mapZoom, setMapZoom] = useState(13);
  const [cityFilterParam, setCityFilterParam] = useState<string | null>(null);
  const lastAppliedCityRef = useRef<string | null>(null);
  const autoFocusKeyRef = useRef<string | null>(null);
  const autoTailedDeviceIdsRef = useRef<Set<string>>(new Set());

  // Data from API
  const [towers, setTowers] = useState<CellTower[]>([]);
  const [keyFrames, setKeyFrames] = useState<KeyFrame[]>([]);
  const [positions, setPositions] = useState<DevicePosition[]>([]);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [cases, setCases] = useState<CaseData[]>([]);
  const [suspects, setSuspects] = useState<SuspectWithDevices[]>([]);
  const [deviceLinkMap, setDeviceLinkMap] = useState<Map<string, LinkedDevice[]>>(new Map());
  const [relationships, setRelationships] = useState<Relationship[]>([]);

  // UI state
  const [selectedCase, setSelectedCase] = useState<KeyFrame | null>(null);
  const [casePinned, setCasePinned] = useState(false); // Track if case was manually selected from case bar
  const [caseMenuAnchor, setCaseMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedHotspotKey, setSelectedHotspotKey] = useState<string | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<DevicePosition | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarTab, setSidebarTab] = useState(0); // 0=Overview, 1=Cases, 2=Suspects, 3=Devices

  // Device tail (tracking trail) state
  const [tailedDevices, setTailedDevices] = useState<Map<string, DeviceTail>>(new Map());
  const [tailLoading, setTailLoading] = useState<Set<string>>(new Set());

  // Entity filter from URL (used when navigating from GraphExplorer to track specific persons)
  const [focusedEntityIds, setFocusedEntityIds] = useState<Set<string>>(new Set());

  // Cache for ALL positions (bulk loaded for smooth playback) - declared early for entityTrails
  const positionsCacheRef = useRef<Map<number, DevicePosition[]>>(new Map());
  // Track cache population to trigger entityTrails rebuild
  const [cacheReady, setCacheReady] = useState(false);

  // Build trails from cached positions for focused entities (clipped to time window)
  // Also merge in any manually-fetched trails from tailedDevices
  const entityTrails = useMemo(() => {
    const trails = new Map<string, DeviceTail>();
    
    // First, add any manually-fetched trails from tailedDevices
    // These have priority since they're specifically fetched for the entity
    for (const [deviceId, trail] of tailedDevices) {
      // Extract entity ID (remove 'device_' prefix if present)
      const entityId = deviceId.startsWith('device_') ? deviceId.slice(7) : deviceId;
      // Only include if it's a focused entity or if no focus filter is active
      if (focusedEntityIds.size === 0 || focusedEntityIds.has(entityId) || focusedEntityIds.has(deviceId)) {
        // Clip trail to time window
        const [windowStart, windowEnd] = timeWindow;
        const clippedTrail = trail.trail.filter(p => p.hour >= windowStart && p.hour <= windowEnd);
        if (clippedTrail.length > 0) {
          trails.set(entityId, {
            ...trail,
            entityId,
            trail: clippedTrail,
            totalPoints: clippedTrail.length,
          });
        }
      }
    }
    
    // Then try to build trails from bulk positions cache for any focused entities
    // that don't already have a trail
    if (focusedEntityIds.size > 0 && cacheReady) {
      const [windowStart, windowEnd] = timeWindow;
      
      for (const entityId of focusedEntityIds) {
        // Skip if we already have a trail for this entity from tailedDevices
        if (trails.has(entityId)) continue;
        
        const trailPoints: Array<{ hour: number; lat: number; lng: number; city?: string }> = [];
        let entityName = `Entity ${entityId}`;
        let isSuspect = false;
        let alias: string | null = null;
        let baseCity = '';
        let baseLat = 0;
        let baseLng = 0;
        
        // Collect positions only within the time window
        for (let hour = windowStart; hour <= windowEnd; hour++) {
          const hourPositions = positionsCacheRef.current.get(hour) || [];
          const match = hourPositions.find(
            (p) => p.ownerId === entityId || p.deviceId === entityId || p.deviceId === `device_${entityId}`
          );
          
          if (match) {
            trailPoints.push({
              hour,
              lat: match.lat,
              lng: match.lng,
              city: match.towerName || undefined,
            });
            // Capture entity info from first match
            if (trailPoints.length === 1) {
              entityName = match.ownerName || match.deviceName || entityName;
              isSuspect = match.isSuspect || false;
              alias = match.ownerAlias || null;
              baseCity = match.towerName || '';
              baseLat = match.lat;
              baseLng = match.lng;
            }
          }
        }
        
        if (trailPoints.length > 0) {
          trails.set(entityId, {
            deviceId: `device_${entityId}`,
            entityId,
            entityName,
            alias,
            isSuspect,
            threatLevel: isSuspect ? 'High' : 'Low',
            trail: trailPoints,
            totalPoints: trailPoints.length,
            baseLocation: {
              lat: baseLat,
              lng: baseLng,
              city: baseCity,
              state: '',
            },
          });
        }
      }
    }
    
    return trails;
  }, [focusedEntityIds, cacheReady, timeWindow, tailedDevices]);

  // AI Insights state
  const [hotspotInsight, setHotspotInsight] = useState<Insight | null>(null);
  const [hotspotInsightLoading, setHotspotInsightLoading] = useState(false);
  const [hotspotInsightError, setHotspotInsightError] = useState<string | null>(null);
  const [timelineInsight, setTimelineInsight] = useState<Insight | null>(null);
  const [timelineInsightLoading, setTimelineInsightLoading] = useState(false);
  const [timelineInsightError, setTimelineInsightError] = useState<string | null>(null);

  // Generate hotspot insight
  const generateHotspotInsight = useCallback(async () => {
    setHotspotInsightLoading(true);
    setHotspotInsightError(null);
    try {
      const insight = await analyzeHotspotAnomalies(currentHour, cityFilterParam);
      setHotspotInsight(insight);
    } catch (err) {
      setHotspotInsightError(err instanceof Error ? err.message : 'Failed to analyze hotspots');
    } finally {
      setHotspotInsightLoading(false);
    }
  }, [currentHour, cityFilterParam]);

  // Generate timeline insight
  const generateTimelineInsight = useCallback(async () => {
    setTimelineInsightLoading(true);
    setTimelineInsightError(null);
    try {
      const entityIds = focusedEntityIds.size > 0 ? Array.from(focusedEntityIds) : undefined;
      const insight = await narrateTimeline(
        Math.max(0, currentHour - 6),
        Math.min(71, currentHour + 6),
        { entityIds, city: cityFilterParam }
      );
      setTimelineInsight(insight);
    } catch (err) {
      setTimelineInsightError(err instanceof Error ? err.message : 'Failed to generate timeline');
    } finally {
      setTimelineInsightLoading(false);
    }
  }, [currentHour, cityFilterParam, focusedEntityIds]);

  // Toggle device tail (tracking trail) on/off
  const toggleDeviceTail = useCallback(async (deviceId: string) => {
    // If already tailed, remove it
    if (tailedDevices.has(deviceId)) {
      setTailedDevices((prev) => {
        const next = new Map(prev);
        next.delete(deviceId);
        return next;
      });
      return;
    }

    // Otherwise, fetch and add the tail
    setTailLoading((prev) => new Set(prev).add(deviceId));
    try {
      const tail = await fetchDeviceTail(deviceId);
      setTailedDevices((prev) => {
        const next = new Map(prev);
        next.set(deviceId, tail);
        return next;
      });
    } catch (err) {
      console.error('Failed to fetch device tail:', err);
    } finally {
      setTailLoading((prev) => {
        const next = new Set(prev);
        next.delete(deviceId);
        return next;
      });
    }
  }, [tailedDevices]);

  // Clear all tails
  const clearAllTails = useCallback(() => {
    setTailedDevices(new Map());
  }, []);

  const parseHourParam = useCallback((raw: string | null): number | null => {
    if (!raw) return null;
    // Supports "18", "18-02", "hour18", etc — take the first integer.
    const m = raw.match(/-?\d+/);
    if (!m) return null;
    const n = parseInt(m[0], 10);
    if (!Number.isFinite(n)) return null;
    // Keep within the 0-71 demo window
    const normalized = ((Math.round(n) % 72) + 72) % 72;
    return normalized;
  }, []);

  const parseHourInput = useCallback(
    (raw: string | null): number | null => {
      if (!raw) return null;
      const text = raw.trim().toLowerCase();
      if (!text) return null;

      // Day-aware patterns like "day2 3pm"
      const dayHourMatch = text.match(/day\s*(\d)[,\s]*\s*(\d{1,2})(?::\d{2})?\s*(am|pm)?/);
      if (dayHourMatch) {
        const dayIdx = Math.max(1, Math.min(3, parseInt(dayHourMatch[1], 10))) - 1; // 0-based day
        let hour = parseInt(dayHourMatch[2], 10);
        const ampm = dayHourMatch[3];
        if (ampm === 'pm' && hour < 12) hour += 12;
        if (ampm === 'am' && hour === 12) hour = 0;
        hour = Math.min(Math.max(hour, 0), 23);
        return Math.min(Math.max(dayIdx * 24 + hour, 0), 71);
      }

      // Simple hour with optional am/pm (assumes day 1)
      const simple = text.match(/(\d{1,2})(?::\d{2})?\s*(am|pm)?/);
      if (simple) {
        let hour = parseInt(simple[1], 10);
        const ampm = simple[2];
        if (ampm === 'pm' && hour < 12) hour += 12;
        if (ampm === 'am' && hour === 12) hour = 0;
        hour = Math.min(Math.max(hour, 0), 23);
        return hour;
      }

      // Fallback to numeric parse across full 0-71 range
      const n = parseInt(text, 10);
      if (!Number.isFinite(n)) return null;
      return Math.min(Math.max(n, 0), 71);
    },
    []
  );

  const parseWindowParams = useCallback(
    (startRaw: string | null, endRaw: string | null): [number, number] | null => {
      const start = parseHourParam(startRaw);
      const end = parseHourParam(endRaw);
      if (start == null && end == null) return null;
      const s = start ?? 0;
      const e = end ?? start ?? 71;
      return [Math.min(s, e), Math.max(s, e)];
    },
    [parseHourParam]
  );

  const getHotspotKey = useCallback((hs: Hotspot) => `${hs.towerId}|${hs.city}`, []);

  // Fallback radius for connectedness (meters)
  const CONNECTED_RADIUS_M = 150;

  const haversineMeters = useCallback((lat1: number, lng1: number, lat2: number, lng2: number) => {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371000; // meters
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }, []);

  // Build fast lookups for tower coordinates
  const towerById = useMemo(() => {
    const m = new Map<string, CellTower>();
    for (const t of towers) m.set(t.id, t);
    return m;
  }, [towers]);

  // Connected device count per hotspot (hybrid: towerId match + within-radius fallback)
  const connectedCountByHotspotKey = useMemo(() => {
    const deviceIdsByKey = new Map<string, Set<string>>();
    const hotspotByTowerId = new Map<string, Hotspot[]>();

    for (const hs of hotspots) {
      const key = getHotspotKey(hs);
      deviceIdsByKey.set(key, new Set());
      const list = hotspotByTowerId.get(hs.towerId) || [];
      list.push(hs);
      hotspotByTowerId.set(hs.towerId, list);
    }

    for (const p of positions) {
      let matchedByTowerId = false;
      // Primary: towerId match
      if (p.towerId) {
        const hsList = hotspotByTowerId.get(p.towerId);
        if (hsList && hsList.length > 0) {
          matchedByTowerId = true;
          for (const hs of hsList) {
            deviceIdsByKey.get(getHotspotKey(hs))?.add(p.deviceId);
          }
        }
      }

      // Fallback: within radius of hotspot tower coordinates
      if (!matchedByTowerId) {
        for (const hs of hotspots) {
          const tower = towerById.get(hs.towerId);
          if (!tower) continue;
          const d = haversineMeters(p.lat, p.lng, tower.latitude, tower.longitude);
          if (d <= CONNECTED_RADIUS_M) {
            deviceIdsByKey.get(getHotspotKey(hs))?.add(p.deviceId);
          }
        }
      }
    }

    const out: Record<string, number> = {};
    for (const [k, set] of deviceIdsByKey.entries()) out[k] = set.size;
    return out;
  }, [positions, hotspots, towerById, getHotspotKey, haversineMeters]);

  const getConnectedCount = useCallback(
    (hs: Hotspot) => {
      const key = getHotspotKey(hs);
      const v = connectedCountByHotspotKey[key];
      return typeof v === 'number' ? v : hs.deviceCount;
    },
    [connectedCountByHotspotKey, getHotspotKey]
  );

  // Derived selected hotspot (stable even when list is filtered/sorted)
  const selectedHotspot = selectedHotspotKey
    ? hotspots.find((hs) => getHotspotKey(hs) === selectedHotspotKey) || null
    : null;

  // Filtered data based on URL city filter + search query
  const filteredHotspots = hotspots.filter((hs) => {
    const cityOk = cityFilterParam
      ? hs.city.toLowerCase().includes(cityFilterParam.toLowerCase())
      : true;
    if (!cityOk) return false;

    if (searchQuery === '') return true;
    const q = searchQuery.toLowerCase();
    return hs.towerName.toLowerCase().includes(q) || hs.city.toLowerCase().includes(q);
  });

  let filteredPositions = positions.filter((d) => {
    // "Trails Only" mode - only show positions from entities being trailed
    if (showTrailsOnly && entityTrails.size > 0) {
      const matchesOwner = d.ownerId && focusedEntityIds.has(d.ownerId);
      const matchesDevice = focusedEntityIds.has(d.deviceId);
      if (!matchesOwner && !matchesDevice) return false;
    }

    // Filter by search query
    if (searchQuery === '') return true;
    const q = searchQuery.toLowerCase();
    return (
      d.deviceName.toLowerCase().includes(q) ||
      (d.ownerName && d.ownerName.toLowerCase().includes(q)) ||
      (d.ownerAlias && d.ownerAlias.toLowerCase().includes(q))
    );
  });

  // When entity trails are built, auto-center the map on the first trail's starting position
  useEffect(() => {
    if (entityTrails.size === 0) {
      autoFocusKeyRef.current = null;
      return;
    }

    const focusKey = Array.from(entityTrails.keys()).sort().join('|');
    
    if (autoFocusKeyRef.current !== focusKey) {
      // Center on first trail's current position
      const firstTrail = entityTrails.values().next().value;
      if (firstTrail && firstTrail.trail.length > 0) {
        // Find the position by hour, not by array index
        const currentIdx = firstTrail.trail.findIndex((p: { hour: number }) => p.hour >= currentHour);
        const effectiveIdx = currentIdx === -1 
          ? firstTrail.trail.length - 1 // Past the end, use last
          : currentIdx === 0 && firstTrail.trail[0].hour > currentHour
            ? 0 // Before start, use first
            : currentIdx;
        const pos = firstTrail.trail[effectiveIdx];
        if (pos && typeof pos.lat === 'number' && typeof pos.lng === 'number') {
          setMapCenter([pos.lat, pos.lng]);
          setMapZoom((prev) => (prev < 12 ? 12 : prev));
          autoFocusKeyRef.current = focusKey;
        }
      }
    }
  }, [entityTrails, currentHour, setMapZoom, setMapCenter]);

  const filteredCases = cases.filter((c) => {
    const cityOk = cityFilterParam
      ? c.city.toLowerCase().includes(cityFilterParam.toLowerCase())
      : true;
    if (!cityOk) return false;

    if (searchQuery === '') return true;
    const q = searchQuery.toLowerCase();
    return (
      c.caseNumber.toLowerCase().includes(q) ||
      c.title.toLowerCase().includes(q) ||
      c.city.toLowerCase().includes(q)
    );
  });

  const filteredSuspects = suspects.filter(
    (s) =>
      searchQuery === '' ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.alias && s.alias.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Helper: Get suspect by owner ID from position
  const getSuspectFromPosition = (position: DevicePosition): Suspect | undefined => {
    return suspects.find((s) => s.id === position.ownerId);
  };

  // Helper: Get relationships for a suspect
  const getRelationshipsForSuspect = (suspectId: string): Relationship[] => {
    return relationships.filter((r) => r.person1Id === suspectId || r.person2Id === suspectId);
  };

  // Helper: Format currency
  const formatCurrency = (amount: number | undefined): string => {
    if (!amount) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Helper: Get threat level color
  const getThreatLevelColor = (level: string): string => {
    switch (level?.toLowerCase()) {
      case 'high':
        return theme.palette.accent.red;
      case 'medium':
        return theme.palette.accent.orange;
      case 'low':
        return theme.palette.accent.green;
      default:
        return theme.palette.text.secondary;
    }
  };

  // Summary statistics
  const stats = {
    totalCases: cases.length,
    activeCases: cases.filter((c) => c.status === 'investigating').length,
    // Backend endpoint already filters when calling /persons?suspects=true; treat returned entities as "suspects"
    totalSuspects: suspects.length,
    highThreatSuspects: suspects.filter((s) => (s.threatLevel || '').toLowerCase() === 'high')
      .length,
    totalDevices: positions.length,
    suspectDevices: positions.filter((p) => p.isSuspect).length,
    totalEstimatedLoss: cases.reduce((sum, c) => sum + (c.estimatedLoss || 0), 0),
    activeHotspots: hotspots.filter((h) => h.suspectCount > 0).length,
  };

  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hourFetchAbortRef = useRef<AbortController | null>(null);
  const isScrubbingRef = useRef(false);

  // Cache for hotspots
  const hotspotsCacheRef = useRef<Map<string, Hotspot[]>>(new Map());

  const getHotspotCacheKey = useCallback(
    (hour: number, windowRange: [number, number]) => `${hour}-${windowRange[0]}-${windowRange[1]}`,
    []
  );

  const clampHourToWindow = useCallback(
    (hour: number) => Math.min(Math.max(hour, timeWindow[0]), timeWindow[1]),
    [timeWindow]
  );

  // (Removed) Hotspot ring pulse/delta tracking: hex heatmap defines hotspots now.

  // Per-hour activity by H3 cell (compute from actual lat/lng, resolution 9)
  const activityByCell = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of positions) {
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
      try {
        const cell = latLngToCell(p.lat, p.lng, 9); // resolution 9
        m.set(cell, (m.get(cell) || 0) + 1);
      } catch {
        // skip invalid coords
      }
    }
    return m;
  }, [positions]);

  const topActiveCells = useMemo(() => {
    const entries = Array.from(activityByCell.entries());
    entries.sort((a, b) => b[1] - a[1]);
    return entries.slice(0, 1000); // Cap for map performance; data is complete
  }, [activityByCell]);

  const maxCellActivity = useMemo(() => {
    let max = 0;
    for (const [, count] of topActiveCells) max = Math.max(max, count);
    return max || 1;
  }, [topActiveCells]);

  const hexPolygons = useMemo(() => {
    return topActiveCells
      .map(([cell, count]) => {
        try {
          // geoJson=true => [lng, lat] coordinates
          const boundary = cellToBoundary(cell, true);
          const latLngs = boundary.map(([lng, lat]) => [lat, lng] as [number, number]);
          return { cell, count, latLngs };
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Array<{ cell: string; count: number; latLngs: [number, number][] }>;
  }, [topActiveCells]);

  // Map navigation functions
  const PAN_AMOUNT = 0.02; // Degrees to pan
  const panMap = (direction: 'up' | 'down' | 'left' | 'right') => {
    setMapCenter(([lat, lng]) => {
      switch (direction) {
        case 'up':
          return [lat + PAN_AMOUNT, lng] as [number, number];
        case 'down':
          return [lat - PAN_AMOUNT, lng] as [number, number];
        case 'left':
          return [lat, lng - PAN_AMOUNT] as [number, number];
        case 'right':
          return [lat, lng + PAN_AMOUNT] as [number, number];
        default:
          return [lat, lng] as [number, number];
      }
    });
  };

  const zoomMap = (direction: 'in' | 'out') => {
    setMapZoom((z) => {
      if (direction === 'in') return Math.min(z + 1, 18);
      return Math.max(z - 1, 5);
    });
  };

  const resetMapView = () => {
    setMapCenter([38.9076, -77.0723]);
    setMapZoom(13);
  };

  // Map tile URL based on theme
  const mapTileUrl =
    theme.palette.mode === 'dark'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

  // Phase 1: Load essential data immediately (show map fast)
  // Uses Promise.allSettled so partial data loads even if some requests fail (e.g. backend cold start)
  const loadEssentialData = useCallback(async (retryCount = 0) => {
    setLoadError(null);
    const results = await Promise.allSettled([
      fetchConfig(),
      fetchCases(),
      fetchSuspects(),
      fetchRelationships(),
      fetchPositions(currentHour),
      fetchHotspots(currentHour, { startHour: timeWindow[0], endHour: timeWindow[1] }),
      fetchEntitiesWithLinkStatus().catch(() => ({ persons: [], devices: [], stats: {} })),
    ]);

    const config = results[0].status === 'fulfilled' ? results[0].value : { towers: [], keyFrames: [], timeRange: { min: 0, max: 71 }, totalHours: 72 };
    const casesData = results[1].status === 'fulfilled' ? results[1].value : [];
    const suspectsData = results[2].status === 'fulfilled' ? results[2].value : [];
    const relationshipsData = results[3].status === 'fulfilled' ? results[3].value : [];
    const currentPositions = results[4].status === 'fulfilled' ? results[4].value : [];
    const currentHotspots = results[5].status === 'fulfilled' ? results[5].value : [];
    const entitiesLinkStatus = results[6].status === 'fulfilled' ? results[6].value : { persons: [], devices: [], stats: {} };

    const failedCount = results.filter((r) => r.status === 'rejected').length;
    if (failedCount > 0) {
      const errMsg = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      const msg = errMsg?.reason instanceof Error ? errMsg.reason.message : String(errMsg?.reason ?? 'Unknown error');
      setLoadError(`${failedCount} request(s) failed. ${msg}`);
      // Retry once after 2s on first load (handles backend cold start)
      if (retryCount === 0 && failedCount >= 1) {
        await new Promise((r) => setTimeout(r, 2000));
        return loadEssentialData(1);
      }
    } else {
      setLoadError(null);
    }

    const linkMap = new Map<string, LinkedDevice[]>();
    for (const person of entitiesLinkStatus.persons || []) {
      if (person.linkedDevices && person.linkedDevices.length > 0) {
        linkMap.set(person.id, person.linkedDevices as LinkedDevice[]);
      }
    }
    setDeviceLinkMap(linkMap);

    const suspectsWithDevices: SuspectWithDevices[] = (suspectsData || []).map((s) => ({
      ...s,
      linkedDevices: linkMap.get(s.id) || [],
    }));

    setTowers(config.towers || []);
    setKeyFrames(config.keyFrames || []);
    setCases(casesData || []);
    setSuspects(suspectsWithDevices);
    setRelationships(relationshipsData || []);
    setPositions(currentPositions || []);
    setHotspots(currentHotspots || []);

    positionsCacheRef.current.set(currentHour, currentPositions || []);
    hotspotsCacheRef.current.set(
      getHotspotCacheKey(currentHour, timeWindow),
      currentHotspots || []
    );
  }, [currentHour, timeWindow, getHotspotCacheKey]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        await loadEssentialData();
        if (!cancelled) setLoadError(null);
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to load data';
          setLoadError(msg);
          console.error('Failed to fetch essential data:', err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phase 2: Bulk load all positions in background for smooth playback
  useEffect(() => {
    if (loading) return; // Wait until essential data is loaded
    
    const loadBulkData = async () => {
      setBulkLoadProgress(0);
      try {
        const bulkPositions = await fetchPositionsBulk({ limit: 5000 });
        
        // Populate the cache with all 72 hours
        if (bulkPositions.positionsByHour) {
          for (let hour = 0; hour < 72; hour++) {
            const hourPositions = bulkPositions.positionsByHour[hour] || [];
            positionsCacheRef.current.set(hour, hourPositions);
          }
        }
        setCacheReady(true);
        setBulkLoadProgress(100);
        
        // Auto-hide the "Ready" indicator after 3 seconds
        setTimeout(() => setBulkLoadProgress(null), 3000);
      } catch (err) {
        console.error('Failed to bulk load, falling back to progressive loading:', err);
        // Fallback: progressively load around the cursor
        loadAroundCursor(currentHour);
      }
    };
    
    // Fallback: load hours around cursor progressively
    const loadAroundCursor = async (centerHour: number) => {
      setBulkLoadProgress(0);
      const hoursToLoad: number[] = [];
      
      // Generate hours in expanding rings around the cursor: 0, +1, -1, +2, -2, etc.
      for (let offset = 0; offset <= 36; offset++) {
        const ahead = (centerHour + offset) % 72;
        const behind = (centerHour - offset + 72) % 72;
        if (!hoursToLoad.includes(ahead)) hoursToLoad.push(ahead);
        if (!hoursToLoad.includes(behind)) hoursToLoad.push(behind);
      }
      
      // Load in batches of 6 hours for progress updates
      const batchSize = 6;
      for (let i = 0; i < hoursToLoad.length; i += batchSize) {
        const batch = hoursToLoad.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (hour) => {
            if (positionsCacheRef.current.has(hour)) return;
            try {
              const positions = await fetchPositions(hour);
              positionsCacheRef.current.set(hour, positions || []);
            } catch {
              // Ignore individual hour failures
            }
          })
        );
        setBulkLoadProgress(Math.round(((i + batchSize) / hoursToLoad.length) * 100));
      }
      
      setCacheReady(true);
      setBulkLoadProgress(100);
      setTimeout(() => setBulkLoadProgress(null), 3000);
    };
    
    loadBulkData();
  }, [loading]);

  // Update positions for the current hour - use bulk-loaded cache for instant updates
  useEffect(() => {
    // If bulk loaded, use cache directly - no network calls needed during playback
    const cachedPositions = positionsCacheRef.current.get(currentHour);
    const windowKey = getHotspotCacheKey(currentHour, timeWindow);
    if (cachedPositions) {
      setPositions(cachedPositions);
      // Only fetch hotspots if not cached (they're smaller and change less)
      const cachedHotspots = hotspotsCacheRef.current.get(windowKey);
      if (cachedHotspots) {
        setHotspots(cachedHotspots);
        return;
      }
    }

    // Fallback: fetch from API if cache miss (should be rare after bulk load)
    const loadData = async () => {
      if (hourFetchAbortRef.current) {
        hourFetchAbortRef.current.abort();
      }
      const controller = new AbortController();
      hourFetchAbortRef.current = controller;

      try {
        // Only fetch what's missing
        const needsPositions = !cachedPositions;
        const needsHotspots = !hotspotsCacheRef.current.get(windowKey);

        const [positionsData, hotspotsData] = await Promise.all([
          needsPositions ? fetchPositions(currentHour, { signal: controller.signal }) : Promise.resolve(cachedPositions),
          needsHotspots
            ? fetchHotspots(currentHour, {
                signal: controller.signal,
                startHour: timeWindow[0],
                endHour: timeWindow[1],
              })
            : Promise.resolve(hotspotsCacheRef.current.get(windowKey)),
        ]);
        if (controller.signal.aborted) return;

        if (needsPositions && positionsData) {
          positionsCacheRef.current.set(currentHour, positionsData);
          setPositions(positionsData);
        }
        if (needsHotspots && hotspotsData) {
          hotspotsCacheRef.current.set(windowKey, hotspotsData);
          setHotspots(hotspotsData);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error('Failed to fetch data:', err);
      }
    };

    // Only fetch if we don't have the data
    if (!cachedPositions || !hotspotsCacheRef.current.get(windowKey)) {
      loadData();
    }

    return () => {
      if (hourFetchAbortRef.current) {
        hourFetchAbortRef.current.abort();
      }
    };
  }, [currentHour, timeWindow, getHotspotCacheKey]);

  // Get cases at current hour
  const casesAtCurrentHour = keyFrames.filter((kf) => kf.hour === currentHour);
  const isKeyFrame = casesAtCurrentHour.length > 0;

  // Auto-select case when landing on key frame (unless a case is manually pinned)
  useEffect(() => {
    // If a case is pinned from the case bar, don't auto-change selection
    if (casePinned) return;
    
    const cases = keyFrames.filter((kf) => kf.hour === currentHour);
    if (cases.length === 1) {
      setSelectedCase(cases[0]);
    } else if (cases.length > 1) {
      setSelectedCase(cases[0]);
    } else {
      setSelectedCase(null);
    }
  }, [currentHour, keyFrames, casePinned]);

  // Keep playhead/scrub within the selected window
  useEffect(() => {
    setCurrentHour((h) => clampHourToWindow(h));
    setScrubHour((h) => (h === null ? null : clampHourToWindow(h)));
    setStartInput((prev) => (prev === formatHour(timeWindow[0]) ? prev : formatHour(timeWindow[0])));
    setEndInput((prev) => (prev === formatHour(timeWindow[1]) ? prev : formatHour(timeWindow[1])));
  }, [clampHourToWindow, timeWindow]);

  // Playback with speed control
  useEffect(() => {
    if (isPlaying) {
      const interval = 500 / playbackSpeed; // Faster speed = shorter interval
      playIntervalRef.current = setInterval(() => {
        setCurrentHour((h) => {
          if (h < timeWindow[0]) return timeWindow[0];
          if (h >= timeWindow[1]) return timeWindow[0];
          return h + 1;
        });
      }, interval);
    } else {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    }
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [isPlaying, playbackSpeed, timeWindow]);

  const jumpToKeyFrame = useCallback((kf: KeyFrame, pin = true) => {
    setCurrentHour(kf.hour);
    setMapCenter([kf.lat, kf.lng]);
    setMapZoom(14);
    setSelectedCase(kf);
    setCasePinned(pin); // Pin the case so it stays selected when navigating away
    setIsPlaying(false);
  }, []);

  const buildNetworkDeepLink = useCallback(() => {
    const params = new URLSearchParams();
    params.set('hour', String(currentHour));
    if (selectedHotspot?.city) params.set('city', selectedHotspot.city);
    if (selectedHotspot?.towerId) params.set('hotspot', selectedHotspot.towerId);

    // If a key frame case is selected, pass the case and its top linked entity IDs (if available)
    if (selectedCase?.caseNumber) {
      const caseRow =
        cases.find(
          (c) => c.caseNumber === selectedCase.caseNumber || c.id === selectedCase.caseNumber
        ) || null;
      if (caseRow?.id) params.set('caseId', caseRow.id);

      const ids = (caseRow?.persons || [])
        .map((p) => p.id)
        .filter(Boolean)
        .slice(0, 12);
      if (ids.length > 0) params.set('entityIds', ids.join(','));
    }

    return `/graph-explorer?${params.toString()}`;
  }, [
    cases,
    currentHour,
    selectedCase?.caseNumber,
    selectedHotspot?.city,
    selectedHotspot?.towerId,
  ]);

  // Handle deep link from case view - store pending case on mount
  useEffect(() => {
    const caseParam = searchParams.get('case');
    if (caseParam) {
      setPendingCaseJump(caseParam);
    }
  }, [searchParams]);

  // Deep-link params (hour/city/entityIds) from URL
  useEffect(() => {
    const city = searchParams.get('city');
    setCityFilterParam(city || null);

    const hourParam = searchParams.get('hour');
    const parsed = parseHourParam(hourParam);
    if (parsed != null) {
      setIsPlaying(false);
      setScrubHour(null);
      setCurrentHour(parsed);
    }

    const windowParsed = parseWindowParams(
      searchParams.get('startHour'),
      searchParams.get('endHour')
    );
    if (windowParsed) {
      setTimeWindow((prev) => {
        if (prev[0] === windowParsed[0] && prev[1] === windowParsed[1]) return prev;
        return windowParsed;
      });
      setStartInput(formatHour(windowParsed[0]));
      setEndInput(formatHour(windowParsed[1]));
      setStartError(null);
      setEndError(null);
    }

    // Parse entityIds for person tracking
    const entityIdsParam = searchParams.get('entityIds');
    if (entityIdsParam) {
      const ids = entityIdsParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      setFocusedEntityIds(new Set(ids));
    } else {
      setFocusedEntityIds(new Set());
    }
  }, [searchParams, parseHourParam, parseWindowParams]);

  // When focused entities are set from URL, automatically fetch their trails
  // This ensures we get trail data even if the entity isn't in the bulk positions
  useEffect(() => {
    if (focusedEntityIds.size === 0) return;
    if (!cacheReady) return; // Wait for bulk data to load first
    
    // Check which focused entities don't have trails from the bulk cache
    const missingEntities: string[] = [];
    for (const entityId of focusedEntityIds) {
      // Check if entity exists in any hour of the positions cache
      let foundInCache = false;
      for (const [, hourPositions] of positionsCacheRef.current) {
        const match = hourPositions.find(
          (p) => p.ownerId === entityId || p.deviceId === entityId || p.deviceId === `device_${entityId}`
        );
        if (match) {
          foundInCache = true;
          break;
        }
      }
      // Also check if we already have a manual tail for this entity
      if (!foundInCache && !tailedDevices.has(`device_${entityId}`) && !tailedDevices.has(entityId)) {
        missingEntities.push(entityId);
      }
    }
    
    // Fetch trails for missing entities using the device-tail endpoint
    if (missingEntities.length > 0) {
      missingEntities.forEach((entityId) => {
        // Use device_entityId format since that's what the API expects
        const deviceId = entityId.startsWith('device_') ? entityId : `device_${entityId}`;
        if (!tailLoading.has(deviceId) && !tailedDevices.has(deviceId)) {
          toggleDeviceTail(deviceId);
        }
      });
    }
  }, [focusedEntityIds, cacheReady, tailedDevices, tailLoading, toggleDeviceTail]);

  // If a city filter is provided, recenter the map to a tower in that city (best effort).
  useEffect(() => {
    if (!cityFilterParam) return;
    // When tracking specific entities, keep the map focused on them instead of recentering to city.
    if (focusedEntityIds.size > 0) return;
    if (towers.length === 0) return;
    if (lastAppliedCityRef.current === cityFilterParam) return;

    const cityLower = cityFilterParam.toLowerCase();
    const match =
      towers.find((t) => t.city && t.city.toLowerCase().includes(cityLower)) ||
      hotspots.find((h) => h.city && h.city.toLowerCase().includes(cityLower));

    if (match && 'latitude' in match && 'longitude' in match) {
      setMapCenter([match.latitude, match.longitude]);
      setMapZoom(12);
      lastAppliedCityRef.current = cityFilterParam;
    } else if (match && 'lat' in match && 'lng' in match) {
      setMapCenter([match.lat, match.lng]);
      setMapZoom(12);
      lastAppliedCityRef.current = cityFilterParam;
    }
  }, [cityFilterParam, towers, hotspots]);

  // Jump to case once keyFrames are loaded
  useEffect(() => {
    if (pendingCaseJump && keyFrames.length > 0) {
      const targetCase = keyFrames.find(
        (kf) => kf.caseNumber === pendingCaseJump || kf.id === pendingCaseJump
      );
      if (targetCase) {
        jumpToKeyFrame(targetCase);
      }
      setPendingCaseJump(null);
    }
  }, [pendingCaseJump, keyFrames, jumpToKeyFrame]);

  const handleCaseChipClick = (event: React.MouseEvent<HTMLElement>) => {
    if (casesAtCurrentHour.length > 1) {
      setCaseMenuAnchor(event.currentTarget);
    }
  };

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
    <Box
      sx={{
        height: 'calc(100vh - 64px)',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
      }}
    >
      {loadError && (
        <Paper
          elevation={0}
          sx={{
            m: 1,
            p: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            bgcolor: 'error.dark',
            color: 'error.contrastText',
            borderRadius: 1,
          }}
        >
          <Warning fontSize="small" />
          <Typography variant="body2" sx={{ flex: 1 }}>
            {loadError}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Refresh />}
            onClick={() => {
              setLoading(true);
              setLoadError(null);
              loadEssentialData().finally(() => setLoading(false));
            }}
            sx={{ color: 'inherit', borderColor: 'currentColor' }}
          >
            Retry
          </Button>
        </Paper>
      )}
      <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
      {/* Global CSS for trail animations */}
      <style>{`
        @keyframes trailPulse {
          0% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.3); opacity: 0.4; }
          100% { transform: scale(1); opacity: 0.8; }
        }
        .trail-pulse-outer path {
          animation: trailPulse 1.5s ease-in-out infinite;
          transform-origin: center;
        }
        .leaflet-tooltip-pane .leaflet-tooltip {
          transition: transform 0.3s ease-out;
        }
        /* Reset Leaflet default marker styling for custom trail markers */
        .trail-waypoint-marker,
        .trail-current-label,
        .device-label {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        .trail-current-label::before,
        .trail-current-label::after,
        .device-label::before,
        .device-label::after {
          display: none !important;
        }
        .leaflet-marker-icon.trail-current-label,
        .leaflet-marker-icon.device-label {
          background: transparent !important;
          width: auto !important;
          height: auto !important;
        }
      `}</style>
      {/* Map */}
      <Box sx={{ flex: 1, position: 'relative' }}>
        <MapContainer
          center={mapCenter}
          zoom={mapZoom}
          style={{
            height: '100%',
            width: '100%',
            background: theme.palette.background.default,
            zIndex: 0, // keep map under floating UI
          }}
          zoomControl={false}
        >
          <TileLayer url={mapTileUrl} />
          <MapController center={mapCenter} zoom={mapZoom} />

          {/* Hex heatmap (H3) */}
          {showHexHeatmap &&
            hexPolygons.map(({ cell, count, latLngs }) => {
              const intensity = Math.min(1, Math.max(0, count / maxCellActivity));
              // Red scale: more devices = redder/more opaque
              const fillOpacity = 0.15 + intensity * 0.45; // 0.15 → 0.60
              const strokeOpacity = 0.3 + intensity * 0.5; // 0.30 → 0.80
              return (
                <Polygon
                  key={cell}
                  positions={latLngs}
                  pathOptions={{
                    color: `rgba(239, 68, 68, ${strokeOpacity})`,
                    weight: 1.5,
                    fillColor: `rgba(239, 68, 68, ${fillOpacity})`,
                    fillOpacity: 1,
                  }}
                >
                  <Tooltip direction="top" opacity={0.95}>
                    <div style={{ padding: '4px 8px', minWidth: '160px' }}>
                      <div style={{ fontWeight: 700, fontSize: '12px', marginBottom: '4px' }}>
                        Hex {cell.slice(-6)}
                      </div>
                      <div style={{ fontSize: '11px', color: '#666' }}>Devices (hour): {count}</div>
                    </div>
                  </Tooltip>
                </Polygon>
              );
            })}


          {/* Devices */}
          {showDevices &&
            filteredPositions.map((d) => {
              const rawLabel =
                (d.ownerAlias && d.ownerAlias.trim()) ||
                (d.ownerName && d.ownerName.trim()) ||
                (d.deviceName && d.deviceName.trim()) ||
                d.deviceId.slice(-6);
              const label = rawLabel.length > 24 ? `${rawLabel.slice(0, 21)}...` : rawLabel;
              const isFocusedOwner = d.ownerId ? focusedEntityIds.has(d.ownerId) : false;
              
              // Skip rendering device dot for tracked entities when trails are showing
              // (the trail markers already show the entity's position)
              if (isFocusedOwner && showTrails && entityTrails.size > 0) {
                return null;
              }

              return (
                <React.Fragment key={d.deviceId}>
                  {isFocusedOwner && (
                    <CircleMarker
                      center={[d.lat, d.lng]}
                      radius={14}
                      pathOptions={{
                        color: '#22d3ee',
                        fillColor: '#22d3ee33',
                        fillOpacity: 0.35,
                        weight: 3,
                      }}
                    />
                  )}
                  {/* Suspect double ring - outer glow */}
                  {d.isSuspect && !isFocusedOwner && (
                    <CircleMarker
                      center={[d.lat, d.lng]}
                      radius={16}
                      pathOptions={{
                        color: '#ef444440',
                        fillColor: '#ef444420',
                        fillOpacity: 0.25,
                        weight: 4,
                      }}
                    />
                  )}
                  {/* Suspect double ring - solid accent ring */}
                  {d.isSuspect && !isFocusedOwner && (
                    <CircleMarker
                      center={[d.lat, d.lng]}
                      radius={11}
                      pathOptions={{
                        color: '#f97316',
                        fillColor: 'transparent',
                        fillOpacity: 0,
                        weight: 2.5,
                      }}
                    />
                  )}
                  <CircleMarker
                    center={[d.lat, d.lng]}
                    radius={d.isSuspect || isFocusedOwner ? 7 : 5}
                    pathOptions={{
                      color: isFocusedOwner ? '#06b6d4' : d.isSuspect ? '#ef4444' : getAssociateColor(d.ownerId),
                      fillColor: isFocusedOwner ? '#06b6d4' : d.isSuspect ? '#ef4444' : getAssociateColor(d.ownerId),
                      fillOpacity: 0.9,
                      weight: d.isSuspect || isFocusedOwner ? 2.5 : 1.5,
                    }}
                  >
                    <Popup>
                      <div
                        style={{
                          padding: '4px',
                          minWidth: '160px',
                          fontFamily: 'system-ui, -apple-system, sans-serif',
                        }}
                      >
                        {/* Header */}
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: '12px',
                            marginBottom: '6px',
                            color: isFocusedOwner ? '#06b6d4' : d.isSuspect ? '#ef4444' : getAssociateColor(d.ownerId),
                          }}
                        >
                          {isFocusedOwner
                            ? '🎯 TRACKED'
                            : d.isSuspect
                              ? '⚠️ SUSPECT'
                              : '👤 Associate'}
                        </div>
                        
                        {/* Name */}
                        <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '2px' }}>
                          {d.ownerAlias ? `"${d.ownerAlias}"` : d.ownerName || 'Unknown'}
                        </div>
                        {d.ownerAlias && d.ownerName && (
                          <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>
                            {d.ownerName}
                          </div>
                        )}
                        
                        {/* Device info */}
                        <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>
                          📱 {d.deviceName}
                          {d.isBurner && (
                            <span style={{ color: '#a855f7', fontWeight: 600, marginLeft: '4px' }}>
                              🔥 BURNER
                            </span>
                          )}
                        </div>
                        
                        {d.deviceType && d.deviceType !== 'mobile' && (
                          <div style={{ fontSize: '9px', color: '#666', textTransform: 'uppercase', marginBottom: '4px' }}>
                            {d.deviceType}
                          </div>
                        )}
                        
                        {d.towerName && (
                          <div style={{ fontSize: '10px', color: '#888', marginBottom: '6px' }}>
                            📡 {d.towerName}
                          </div>
                        )}
                        
                        {/* Action button - Start/Stop Trail */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const trackId = d.ownerId || d.deviceId;
                            const isCurrentlyTracked = focusedEntityIds.has(trackId);
                            const newParams = new URLSearchParams(searchParams);
                            const currentIds = (newParams.get('entityIds') || '').split(',').filter(Boolean);
                            
                            if (isCurrentlyTracked) {
                              // Remove from tracking
                              const newIds = currentIds.filter(id => id !== trackId);
                              if (newIds.length > 0) {
                                newParams.set('entityIds', newIds.join(','));
                              } else {
                                newParams.delete('entityIds');
                              }
                            } else {
                              // Add to tracking
                              const newIds = [...new Set([...currentIds, trackId])];
                              newParams.set('entityIds', newIds.join(','));
                            }
                            navigate(`?${newParams.toString()}`, { replace: true });
                          }}
                          style={{
                            width: '100%',
                            marginTop: '4px',
                            padding: '6px 12px',
                            fontSize: '11px',
                            fontWeight: 600,
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            background: focusedEntityIds.has(d.ownerId || d.deviceId) ? '#ef4444' : '#3b82f6',
                            color: 'white',
                          }}
                        >
                          {focusedEntityIds.has(d.ownerId || d.deviceId) ? '🛑 Stop Trail' : '📍 Start Trail'}
                        </button>
                      </div>
                    </Popup>
                  </CircleMarker>
                  {showDeviceLabels && (
                    <Marker
                      position={[d.lat, d.lng]}
                      icon={L.divIcon({
                        className: 'device-label',
                        html: `<div style="
                          font-size: 10px;
                          font-weight: 600;
                          color: ${d.isSuspect ? '#fef2f2' : '#e0f2fe'};
                          white-space: nowrap;
                          pointer-events: none;
                        ">${label}</div>`,
                        iconSize: [0, 0],
                        iconAnchor: [-10, 4],
                      })}
                      interactive={false}
                    />
                  )}
                </React.Fragment>
              );
          })}

          {/* Entity Trails (from tracked entities) - Connect-the-dots style */}
          {showTrails && Array.from(entityTrails.entries()).map(([entityId, tail]) => {
            if (tail.trail.length < 1) return null;

            // Full trail path (all positions within window)
            const allPositions: [number, number][] = tail.trail.map((p) => [p.lat, p.lng]);
            // Find current index based on actual hour values in trail (accounts for time window)
            const currentIndex = tail.trail.findIndex((p) => p.hour >= currentHour);
            const effectiveIndex = currentIndex === -1 
              ? tail.trail.length - 1 // Past the end, show all
              : currentIndex === 0 && tail.trail[0].hour > currentHour
                ? 0 // Before the start, show first point
                : currentIndex;
            // Trail up to current time (traveled path)
            const traveledPositions: [number, number][] = allPositions.slice(0, effectiveIndex + 1);
            
            const tailColor = tail.isSuspect ? '#ef4444' : '#3b82f6';
            const currentPosition = allPositions[effectiveIndex] || allPositions[0];

            return (
              <React.Fragment key={`trail-${entityId}`}>
                {/* Full trail line (ghost - shows complete path) */}
                {allPositions.length > 1 && (
                  <Polyline
                    positions={allPositions}
                    pathOptions={{
                      color: tailColor,
                      weight: 3,
                      opacity: 0.25,
                      lineCap: 'round',
                      lineJoin: 'round',
                    }}
                  />
                )}

                {/* Traveled trail line (solid, shows progress) */}
                {traveledPositions.length > 1 && (
                  <Polyline
                    positions={traveledPositions}
                    pathOptions={{
                      color: tailColor,
                      weight: 4,
                      opacity: 0.9,
                      lineCap: 'round',
                      lineJoin: 'round',
                    }}
                  >
                    <Tooltip sticky>
                      <div style={{ fontFamily: 'system-ui', fontSize: '12px' }}>
                        <strong>🔍 Tracking: {tail.entityName}</strong>
                        {tail.alias && <div style={{ color: '#666' }}>"{tail.alias}"</div>}
                        <div style={{ marginTop: '4px', color: '#888', fontSize: '10px' }}>
                          Position {effectiveIndex + 1} / {allPositions.length}
                        </div>
                      </div>
                    </Tooltip>
                  </Polyline>
                )}

                {/* Numbered waypoint markers - like connect-the-dots */}
                {allPositions.map((pos, idx) => {
                  const isVisited = idx <= effectiveIndex;
                  const isCurrent = idx === effectiveIndex;
                  const isStart = idx === 0;
                  const isEnd = idx === allPositions.length - 1;
                  
                  // Show every waypoint, or sample for very long trails
                  const shouldShowNumber = allPositions.length <= 20 || 
                    idx % Math.ceil(allPositions.length / 20) === 0 ||
                    isStart || isEnd || isCurrent;
                  
                  if (!shouldShowNumber && !isCurrent) return null;

                  return (
                    <Marker
                      key={`waypoint-${entityId}-${idx}`}
                      position={pos}
                      icon={L.divIcon({
                        className: 'trail-waypoint-marker',
                        html: `<div style="
                          width: ${isCurrent ? '28px' : '22px'};
                          height: ${isCurrent ? '28px' : '22px'};
                          border-radius: 50%;
                          background: ${isCurrent ? tailColor : isVisited ? tailColor : '#94a3b8'};
                          border: 3px solid ${isCurrent ? '#ffffff' : isVisited ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.5)'};
                          color: white;
                          font-size: ${isCurrent ? '11px' : '10px'};
                          font-weight: 700;
                          display: flex;
                          align-items: center;
                          justify-content: center;
                          box-shadow: ${isCurrent ? '0 0 12px ' + tailColor + ', 0 2px 8px rgba(0,0,0,0.4)' : '0 2px 4px rgba(0,0,0,0.3)'};
                          opacity: ${isVisited ? 1 : 0.6};
                          ${isCurrent ? 'animation: trailPulse 1.5s ease-in-out infinite;' : ''}
                        ">${idx + 1}</div>`,
                        iconSize: [isCurrent ? 28 : 22, isCurrent ? 28 : 22],
                        iconAnchor: [isCurrent ? 14 : 11, isCurrent ? 14 : 11],
                      })}
                    >
                      <Tooltip direction="top" offset={[0, -12]}>
                        <div style={{ fontFamily: 'system-ui', fontSize: '11px', textAlign: 'center' }}>
                          <strong style={{ color: tailColor }}>
                            {isStart ? '▶ Start' : isEnd ? '⏹ End' : `Point ${idx + 1}`}
                          </strong>
                          <br />
                          <span style={{ color: '#666' }}>{formatHour(tail.trail[idx]?.hour ?? idx)}</span>
                          {tail.trail[idx]?.city && (
                            <>
                              <br />
                              <span style={{ color: '#888', fontSize: '10px' }}>{tail.trail[idx].city}</span>
                            </>
                          )}
                        </div>
                      </Tooltip>
                    </Marker>
                  );
                })}

                {/* Current position label - permanent tooltip */}
                <Marker
                  position={currentPosition}
                  icon={L.divIcon({
                    className: 'trail-current-label',
                    html: `<div style="
                      background: ${tailColor};
                      color: white;
                      padding: 4px 8px;
                      border-radius: 12px;
                      font-size: 11px;
                      font-weight: 600;
                      white-space: nowrap;
                      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                      transform: translateY(-40px);
                    ">📍 ${tail.entityName} • ${formatHour(tail.trail[effectiveIndex]?.hour ?? 0)}</div>`,
                    iconSize: [0, 0],
                    iconAnchor: [0, 0],
                  })}
                  interactive={false}
                />
              </React.Fragment>
            );
          })}

          {/* Case marker - show when on key frame OR when case is pinned */}
          {(isKeyFrame || casePinned) && selectedCase && (() => {
            const crimeInfo = getCrimeTypeInfo(selectedCase.description);
            return (
              <Marker 
                position={[selectedCase.lat, selectedCase.lng]} 
                icon={createCaseIcon(crimeInfo, selectedCase.priority)}
              >
                <Popup>
                  <strong>{crimeInfo.emoji} {selectedCase.caseNumber}</strong>
                  <br />
                  <span style={{ color: '#6b7280', fontSize: '0.9em' }}>{crimeInfo.label}</span>
                  <br />
                  {selectedCase.neighborhood}
                  <br />
                  {selectedCase.description}
                </Popup>
              </Marker>
            );
          })()}
        </MapContainer>

        {/* Map Navigation Controls - Collapsible */}
        <Paper
          sx={{
            position: 'absolute',
            top: 90,
            right: 12,
            p: navExpanded ? 1.25 : 0.5,
            bgcolor: theme.palette.surface.overlay,
            border: 1,
            borderColor: 'border.main',
            borderRadius: 2,
            backdropFilter: 'blur(8px)',
            zIndex: (theme) => theme.zIndex.modal + 2,
          }}
        >
          {navExpanded ? (
            <Stack spacing={0.5} alignItems="center">
              <Box
                sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', mb: 0.5 }}
              >
                <Typography
                  variant="caption"
                  sx={{ color: 'text.secondary', fontSize: '0.65rem', letterSpacing: 0.5 }}
                >
                  NAV
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => setNavExpanded(false)}
                  sx={{ color: 'text.secondary', p: 0.25, '&:hover': { color: theme.palette.accent.orange } }}
                  title="Collapse"
                >
                  <Clear sx={{ fontSize: 14 }} />
                </IconButton>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <IconButton
                  size="small"
                  onClick={() => panMap('up')}
                  sx={{
                    color: 'text.secondary',
                    '&:hover': { color: theme.palette.accent.orange, bgcolor: 'rgba(255,255,255,0.04)' },
                    p: 0.75,
                  }}
                  title="Pan Up"
                >
                  <ArrowUpward sx={{ fontSize: 18 }} />
                </IconButton>
              </Box>
              <Stack direction="row" spacing={0.5} justifyContent="center">
                <IconButton
                  size="small"
                  onClick={() => panMap('left')}
                  sx={{
                    color: 'text.secondary',
                    '&:hover': { color: theme.palette.accent.orange, bgcolor: 'rgba(255,255,255,0.04)' },
                    p: 0.75,
                  }}
                  title="Pan Left"
                >
                  <ArrowBack sx={{ fontSize: 18 }} />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={resetMapView}
                  sx={{
                    color: 'text.secondary',
                    '&:hover': { color: theme.palette.accent.blue, bgcolor: 'rgba(255,255,255,0.04)' },
                    p: 0.75,
                  }}
                  title="Reset View"
                >
                  <CenterFocusStrong sx={{ fontSize: 18 }} />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => panMap('right')}
                  sx={{
                    color: 'text.secondary',
                    '&:hover': { color: theme.palette.accent.orange, bgcolor: 'rgba(255,255,255,0.04)' },
                    p: 0.75,
                  }}
                  title="Pan Right"
                >
                  <ArrowForward sx={{ fontSize: 18 }} />
                </IconButton>
              </Stack>
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <IconButton
                  size="small"
                  onClick={() => panMap('down')}
                  sx={{
                    color: 'text.secondary',
                    '&:hover': { color: theme.palette.accent.orange, bgcolor: 'rgba(255,255,255,0.04)' },
                    p: 0.75,
                  }}
                  title="Pan Down"
                >
                  <ArrowDownward sx={{ fontSize: 18 }} />
                </IconButton>
              </Box>
              <Stack
                direction="row"
                spacing={0.5}
                justifyContent="center"
                sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: 'border.main' }}
              >
                <IconButton
                  size="small"
                  onClick={() => zoomMap('out')}
                  sx={{
                    color: 'text.secondary',
                    '&:hover': { color: theme.palette.accent.orange, bgcolor: 'rgba(255,255,255,0.04)' },
                    p: 0.75,
                  }}
                  title="Zoom Out"
                >
                  <ZoomOut sx={{ fontSize: 18 }} />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => zoomMap('in')}
                  sx={{
                    color: 'text.secondary',
                    '&:hover': { color: theme.palette.accent.orange, bgcolor: 'rgba(255,255,255,0.04)' },
                    p: 0.75,
                  }}
                  title="Zoom In"
                >
                  <ZoomIn sx={{ fontSize: 18 }} />
                </IconButton>
              </Stack>
            </Stack>
          ) : (
            <IconButton
              size="small"
              onClick={() => setNavExpanded(true)}
              sx={{ color: 'text.secondary', p: 0.5, '&:hover': { color: theme.palette.accent.orange } }}
              title="Expand Nav"
            >
              <CenterFocusStrong sx={{ fontSize: 18 }} />
            </IconButton>
          )}
        </Paper>

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
            backdropFilter: 'blur(8px)',
            zIndex: (theme) => theme.zIndex.modal + 2,
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" alignItems="center" spacing={2}>
              <Avatar sx={{ bgcolor: theme.palette.accent.orange, width: 36, height: 36 }}>
                <CellTower sx={{ fontSize: 20 }} />
              </Avatar>
              <Box>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography variant="subtitle1" sx={{ color: 'text.primary', fontWeight: 700 }}>
                    Hotspot Explorer
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
                  {Array.from(entityTrails.entries()).map(([entityId, trail]) => (
                    <Chip
                      key={entityId}
                      icon={<Person sx={{ fontSize: 12 }} />}
                      label={trail.alias ? `"${trail.alias}"` : trail.entityName}
                      size="small"
                      onDelete={() => {
                        // Remove this entity from URL
                        const newParams = new URLSearchParams(searchParams);
                        const currentIds = (newParams.get('entityIds') || '').split(',').filter(Boolean);
                        const newIds = currentIds.filter(id => id !== entityId);
                        if (newIds.length > 0) {
                          newParams.set('entityIds', newIds.join(','));
                        } else {
                          newParams.delete('entityIds');
                        }
                        navigate(`?${newParams.toString()}`, { replace: true });
                      }}
                      sx={{
                        height: 18,
                        fontSize: '0.6rem',
                        bgcolor: trail.isSuspect ? `${theme.palette.accent.red}20` : `${theme.palette.accent.blue}20`,
                        color: trail.isSuspect ? theme.palette.accent.red : theme.palette.accent.blue,
                        '& .MuiChip-icon': { color: trail.isSuspect ? theme.palette.accent.red : theme.palette.accent.blue },
                        '& .MuiChip-deleteIcon': {
                          color: trail.isSuspect ? theme.palette.accent.red : theme.palette.accent.blue,
                          fontSize: 14,
                          '&:hover': { color: theme.palette.accent.red },
                        },
                      }}
                    />
                  ))}
                </Stack>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {towers.length} cells • {positions.length} entities
                </Typography>
              </Box>
            </Stack>

            <Stack direction="row" alignItems="center" spacing={2}>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={showHexHeatmap}
                    onChange={(e) => setShowHexHeatmap(e.target.checked)}
                  />
                }
                label="Hex heatmap"
                sx={{
                  m: 0,
                  '& .MuiFormControlLabel-label': {
                    fontSize: '0.75rem',
                    color: 'text.secondary',
                    userSelect: 'none',
                  },
                }}
              />

              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={showDeviceLabels}
                    onChange={(e) => setShowDeviceLabels(e.target.checked)}
                  />
                }
                label="Device labels"
                sx={{
                  m: 0,
                  '& .MuiFormControlLabel-label': {
                    fontSize: '0.75rem',
                    color: 'text.secondary',
                    userSelect: 'none',
                  },
                }}
              />

              {entityTrails.size > 0 && (
                <>
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={showTrails}
                        onChange={(e) => setShowTrails(e.target.checked)}
                      />
                    }
                    label="Show trails"
                    sx={{
                      m: 0,
                      '& .MuiFormControlLabel-label': {
                        fontSize: '0.75rem',
                        color: 'text.secondary',
                        userSelect: 'none',
                      },
                    }}
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={showTrailsOnly}
                        onChange={(e) => setShowTrailsOnly(e.target.checked)}
                      />
                    }
                    label="Trails only"
                    sx={{
                      m: 0,
                      '& .MuiFormControlLabel-label': {
                        fontSize: '0.75rem',
                        color: 'text.secondary',
                        userSelect: 'none',
                      },
                    }}
                  />
                </>
              )}

              {(isKeyFrame || casePinned) && selectedCase && (() => {
                const headerCrimeInfo = getCrimeTypeInfo(selectedCase.description);
                return (
                  <Chip
                    icon={
                      casesAtCurrentHour.length > 1 && !casePinned
                        ? <Warning />
                        : <span style={{ fontSize: '1rem' }}>{headerCrimeInfo.emoji}</span>
                    }
                    label={
                      casesAtCurrentHour.length > 1 && !casePinned
                        ? `${casesAtCurrentHour.length} CASES`
                        : `${selectedCase.caseNumber}${casePinned && !isKeyFrame ? ' (pinned)' : ''}`
                    }
                    onClick={handleCaseChipClick}
                    onDelete={casePinned ? () => setCasePinned(false) : undefined}
                    sx={{
                      bgcolor: `${PRIORITY_COLORS[selectedCase.priority]}20`,
                      color: PRIORITY_COLORS[selectedCase.priority],
                      cursor: casesAtCurrentHour.length > 1 ? 'pointer' : 'default',
                      boxShadow: casePinned ? `0 0 0 2px ${PRIORITY_COLORS[selectedCase.priority]}40` : 'none',
                      '& .MuiChip-icon': {
                        color: PRIORITY_COLORS[selectedCase.priority],
                      },
                      '& .MuiChip-deleteIcon': {
                        fontSize: 16,
                        color: PRIORITY_COLORS[selectedCase.priority],
                        '&:hover': { color: theme.palette.accent.red },
                      },
                    }}
                  />
                );
              })()}
            </Stack>

            {/* Case selection menu */}
            <Menu
              anchorEl={caseMenuAnchor}
              open={Boolean(caseMenuAnchor)}
              onClose={() => setCaseMenuAnchor(null)}
              PaperProps={{
                sx: {
                  bgcolor: 'background.paper',
                  border: 1,
                  borderColor: 'border.main',
                },
              }}
            >
              {casesAtCurrentHour.map((c) => {
                const menuCrimeInfo = getCrimeTypeInfo(c.description);
                return (
                  <MenuItem
                    key={c.id}
                    onClick={() => {
                      setSelectedCase(c);
                      setCaseMenuAnchor(null);
                    }}
                    selected={selectedCase?.id === c.id}
                    sx={{
                      color: 'text.primary',
                      '&:hover': { bgcolor: 'action.hover' },
                      '&.Mui-selected': { bgcolor: 'action.selected' },
                    }}
                  >
                    <ListItemIcon>
                      {selectedCase?.id === c.id ? (
                        <CheckCircle sx={{ color: theme.palette.accent.green }} />
                      ) : (
                        <span style={{ fontSize: '1.25rem' }}>{menuCrimeInfo.emoji}</span>
                      )}
                    </ListItemIcon>
                    <ListItemText
                      primary={`${c.caseNumber}`}
                      secondary={`${menuCrimeInfo.label} • ${c.neighborhood}`}
                      primaryTypographyProps={{ sx: { color: 'text.primary', fontSize: '0.875rem' } }}
                      secondaryTypographyProps={{ sx: { color: 'text.secondary' } }}
                    />
                  </MenuItem>
                );
              })}
            </Menu>
          </Stack>
        </Paper>

        {/* Timeline */}
        <Paper
          sx={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            p: 2,
            bgcolor: theme.palette.surface.overlay,
            borderTop: 1,
            borderColor: 'border.main',
            borderRadius: 0,
            zIndex: (theme) => theme.zIndex.modal + 1,
            pointerEvents: 'auto',
          }}
        >
          <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
            <Stack direction="row" alignItems="center" sx={{ minWidth: 140 }}>
              <IconButton
                onClick={() => {
                  setScrubHour(null);
                  isScrubbingRef.current = false;
                  setIsPlaying(false);
                  setCurrentHour((h) => Math.max(timeWindow[0], h - 1));
                }}
                sx={{ color: 'text.secondary' }}
              >
                <SkipPrevious />
              </IconButton>
              <IconButton
                onClick={() => setIsPlaying(!isPlaying)}
                sx={{ color: theme.palette.accent.orange }}
              >
                {isPlaying ? <Pause /> : <PlayArrow />}
              </IconButton>
              <IconButton
                onClick={() => {
                  setScrubHour(null);
                  isScrubbingRef.current = false;
                  setIsPlaying(false);
                  setCurrentHour((h) => Math.min(timeWindow[1], h + 1));
                }}
                sx={{ color: 'text.secondary' }}
              >
                <SkipNext />
              </IconButton>
            </Stack>

            <Box sx={{ flex: 1 }}>
              <Slider
                value={scrubHour ?? currentHour}
                onChange={(_, v) => {
                  if (!isScrubbingRef.current) {
                    isScrubbingRef.current = true;
                    setIsPlaying(false);
                  }
                setScrubHour(clampHourToWindow(v as number));
                }}
                onChangeCommitted={(_, v) => {
                  isScrubbingRef.current = false;
                  setIsPlaying(false);
                  setScrubHour(null);
                  // Commit the hour -> triggers one fetch (no spam while dragging)
                setCurrentHour(clampHourToWindow(v as number));
                }}
                min={0}
                max={71}
                marks={keyFrames.map((kf) => ({ value: kf.hour, label: '' }))}
                sx={{
                  color: (isKeyFrame || casePinned) && selectedCase
                    ? PRIORITY_COLORS[selectedCase.priority]
                    : 'text.secondary',
                  '& .MuiSlider-mark': {
                    bgcolor: theme.palette.accent.yellow,
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                  },
                }}
              />
            </Box>

            <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 340, justifyContent: 'flex-end' }}>
              <Typography
                variant="body2"
                sx={{
                  color: (isKeyFrame || casePinned) && selectedCase ? PRIORITY_COLORS[selectedCase.priority] : 'text.secondary',
                  minWidth: 120,
                  fontFamily: 'monospace',
                  fontWeight: (isKeyFrame || casePinned) ? 700 : 400,
                }}
              >
                {formatHour(scrubHour ?? currentHour)}
              </Typography>

              {/* Speed Controls */}
              <Stack direction="row" spacing={0.5}>
                {[0.5, 1, 2, 5].map((speed) => (
                  <Chip
                    key={speed}
                    label={`${speed}x`}
                    size="small"
                    onClick={() => setPlaybackSpeed(speed)}
                    sx={{
                      bgcolor:
                        playbackSpeed === speed
                          ? theme.palette.accent.orange
                          : theme.palette.mode === 'dark'
                            ? '#1f1f23'
                            : '#e2e8f0',
                      color:
                        playbackSpeed === speed
                          ? theme.palette.mode === 'dark'
                            ? '#000'
                            : '#fff'
                          : 'text.secondary',
                      fontSize: '0.65rem',
                      height: 22,
                      minWidth: 36,
                      cursor: 'pointer',
                      fontWeight: playbackSpeed === speed ? 700 : 400,
                      '&:hover': {
                        bgcolor:
                          playbackSpeed === speed
                            ? theme.palette.primary.light
                            : theme.palette.mode === 'dark'
                              ? '#2a2a2e'
                              : '#cbd5e1',
                      },
                    }}
                  />
                ))}
              </Stack>

              {/* Bulk load indicator */}
              {bulkLoadProgress !== null && bulkLoadProgress < 100 && (
                <MuiTooltip title="Loading timeline data for smooth playback...">
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <CircularProgress size={14} sx={{ color: theme.palette.accent.blue }} />
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6rem' }}>
                      Preloading...
                    </Typography>
                  </Stack>
                </MuiTooltip>
              )}
              {bulkLoadProgress === 100 && (
                <MuiTooltip title="Timeline fully loaded - playback will be smooth!">
                  <Chip
                    label="Ready"
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: '0.55rem',
                      bgcolor: `${theme.palette.accent.green}20`,
                      color: theme.palette.accent.green,
                    }}
                  />
                </MuiTooltip>
              )}
            </Stack>
          </Stack>

        <Stack direction="row" alignItems="center" spacing={2}>
          <Typography variant="body2" sx={{ minWidth: 140, color: 'text.secondary' }}>
            Time window
          </Typography>
          <Box sx={{ flex: 1 }}>
            <Slider
              value={timeWindow}
              onChange={(_, v) => {
                const [rawStart, rawEnd] = v as number[];
                const start = Math.max(0, Math.min(rawStart, rawEnd));
                const end = Math.min(71, Math.max(rawStart, rawEnd));
                setTimeWindow([start, end]);
                setIsPlaying(false);
              }}
              onChangeCommitted={(_, v) => {
                const [rawStart, rawEnd] = v as number[];
                const start = Math.max(0, Math.min(rawStart, rawEnd));
                const end = Math.min(71, Math.max(rawStart, rawEnd));
                setTimeWindow([start, end]);
              }}
              min={0}
              max={71}
              disableSwap
              sx={{ color: theme.palette.accent.orange }}
            />
          </Box>
          <Stack spacing={0.5} direction="row" alignItems="center" sx={{ minWidth: 340, justifyContent: 'flex-end' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
              Start
            </Typography>
            <InputBase
              value={startInput}
              placeholder={formatHour(timeWindow[0])}
              onChange={(e) => {
                setStartInput(e.target.value);
                setStartError(null);
              }}
              onBlur={() => {
                const parsed = parseHourInput(startInput);
                if (parsed == null) {
                  setStartError('Use 0-71 or like "Day2 3pm"');
                  return;
                }
                setStartError(null);
                setTimeWindow(([_, end]) => {
                  const next: [number, number] = [Math.min(parsed, end), Math.max(parsed, end)];
                  setStartInput(formatHour(next[0]));
                  return next;
                });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  (e.target as HTMLInputElement).blur();
                }
              }}
              inputProps={{ inputMode: 'text' }}
              sx={{
                width: 120,
                flexShrink: 0,
                px: 1,
                py: 0.5,
                fontSize: '0.7rem',
                fontFamily: 'monospace',
                border: '1px solid',
                borderColor: startError ? theme.palette.error.main : 'border.main',
                borderRadius: 1,
                bgcolor: 'background.paper',
                '& input': { p: 0 },
              }}
            />
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', ml: 0.5 }}>
              End
            </Typography>
            <InputBase
              value={endInput}
              placeholder={formatHour(timeWindow[1])}
              onChange={(e) => {
                setEndInput(e.target.value);
                setEndError(null);
              }}
              onBlur={() => {
                const parsed = parseHourInput(endInput);
                if (parsed == null) {
                  setEndError('Use 0-71 or like "Day2 3pm"');
                  return;
                }
                setEndError(null);
                setTimeWindow(([start, _]) => {
                  const next: [number, number] = [Math.min(start, parsed), Math.max(start, parsed)];
                  setEndInput(formatHour(next[1]));
                  return next;
                });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  (e.target as HTMLInputElement).blur();
                }
              }}
              inputProps={{ inputMode: 'text' }}
              sx={{
                width: 120,
                flexShrink: 0,
                px: 1,
                py: 0.5,
                fontSize: '0.7rem',
                fontFamily: 'monospace',
                border: '1px solid',
                borderColor: endError ? theme.palette.error.main : 'border.main',
                borderRadius: 1,
                bgcolor: 'background.paper',
                '& input': { p: 0 },
              }}
            />
          </Stack>
        </Stack>

          <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', mr: 1 }}>
              JUMP TO:
            </Typography>
            {keyFrames.map((kf) => {
              const isPinned = casePinned && selectedCase?.id === kf.id;
              const isAtHour = currentHour === kf.hour;
              const isActive = isPinned || isAtHour;
              const crimeInfo = getCrimeTypeInfo(kf.description);
              return (
                <MuiTooltip key={kf.id} title={crimeInfo.label} arrow placement="top">
                <Chip
                  label={`${crimeInfo.emoji} ${kf.caseNumber}`}
                  size="small"
                  onClick={() => {
                    if (isPinned) {
                      // Clicking pinned case again unpins it
                      setCasePinned(false);
                    } else {
                      jumpToKeyFrame(kf, true);
                    }
                  }}
                  onDelete={isPinned ? () => setCasePinned(false) : undefined}
                  sx={{
                    bgcolor: isActive
                      ? `${PRIORITY_COLORS[kf.priority]}20`
                      : theme.palette.mode === 'dark'
                        ? '#1f1f23'
                        : '#f1f5f9',
                    color: isActive ? PRIORITY_COLORS[kf.priority] : 'text.secondary',
                    fontSize: '0.65rem',
                    height: 22,
                    cursor: 'pointer',
                    border: `1px solid ${isActive ? PRIORITY_COLORS[kf.priority] : 'transparent'}`,
                    boxShadow: isPinned ? `0 0 0 2px ${PRIORITY_COLORS[kf.priority]}40` : 'none',
                    '&:hover': {
                      bgcolor: `${PRIORITY_COLORS[kf.priority]}30`,
                      color: PRIORITY_COLORS[kf.priority],
                    },
                    '& .MuiChip-deleteIcon': {
                      fontSize: 14,
                      color: PRIORITY_COLORS[kf.priority],
                      '&:hover': { color: theme.palette.accent.red },
                    },
                  }}
                />
                </MuiTooltip>
              );
            })}
          </Stack>
        </Paper>

        {/* Legend */}
        <Paper
          sx={{
            position: 'absolute',
            top: 130,
            left: 12,
            px: 1.5,
            py: 1,
            bgcolor: theme.palette.surface.overlay,
            border: 1,
            borderColor: 'border.main',
            borderRadius: 2,
            backdropFilter: 'blur(8px)',
            zIndex: (theme) => theme.zIndex.modal + 2,
          }}
        >
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Stack direction="row" alignItems="center" spacing={0.75}>
              {/* Double ring visual for suspects */}
              <Box
                sx={{
                  position: 'relative',
                  width: 16,
                  height: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {/* Outer glow ring */}
                <Box
                  sx={{
                    position: 'absolute',
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    bgcolor: 'rgba(239, 68, 68, 0.15)',
                    border: '2px solid rgba(239, 68, 68, 0.25)',
                  }}
                />
                {/* Solid accent ring */}
                <Box
                  sx={{
                    position: 'absolute',
                    width: 11,
                    height: 11,
                    borderRadius: '50%',
                    border: `1.5px solid ${theme.palette.accent.orange}`,
                  }}
                />
                {/* Inner dot */}
                <Box
                  sx={{
                    position: 'absolute',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    bgcolor: theme.palette.accent.red,
                  }}
                />
              </Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                Person of Interest
              </Typography>
            </Stack>
            <Stack direction="row" alignItems="center" spacing={0.75}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  border: `1.5px dashed ${theme.palette.accent.orange}`,
                }}
              />
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                Case
              </Typography>
            </Stack>
          </Stack>
        </Paper>
      </Box>

      {/* Sidebar */}
      <Box
        sx={{
          width: 380,
          borderLeft: 1,
          borderColor: 'border.main',
          bgcolor: 'background.paper',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Search Box */}
        <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'border.main' }}>
          <TextField
            size="small"
            placeholder="Search cases, persons, devices..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search sx={{ color: 'text.secondary', fontSize: 18 }} />
                </InputAdornment>
              ),
              endAdornment: searchQuery && (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearchQuery('')}>
                    <Clear sx={{ fontSize: 16 }} />
                  </IconButton>
                </InputAdornment>
              ),
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: theme.palette.mode === 'dark' ? '#1f1f23' : '#f1f5f9',
                fontSize: '0.8rem',
                '& fieldset': { borderColor: 'transparent' },
                '&:hover fieldset': { borderColor: 'border.main' },
                '&.Mui-focused fieldset': { borderColor: theme.palette.accent.orange },
              },
            }}
          />
        </Box>

        {/* Tabs */}
        <Tabs
          value={sidebarTab}
          onChange={(_, v) => setSidebarTab(v)}
          variant="fullWidth"
          sx={{
            borderBottom: 1,
            borderColor: 'border.main',
            minHeight: 36,
            '& .MuiTab-root': {
              minHeight: 36,
              fontSize: '0.7rem',
              fontWeight: 600,
              textTransform: 'none',
            },
            '& .Mui-selected': { color: theme.palette.accent.orange },
            '& .MuiTabs-indicator': { bgcolor: theme.palette.accent.orange },
          }}
        >
          <Tab icon={<Timeline sx={{ fontSize: 14 }} />} iconPosition="start" label="Overview" />
          <Tab icon={<Folder sx={{ fontSize: 14 }} />} iconPosition="start" label="Cases" />
          <Tab icon={<Person sx={{ fontSize: 14 }} />} iconPosition="start" label="Persons" />
          <Tab icon={<Devices sx={{ fontSize: 14 }} />} iconPosition="start" label="Devices" />
        </Tabs>

        {/* Tab Content */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {/* Overview Tab */}
          {sidebarTab === 0 && (
            <Box>
              {/* Summary Statistics */}
              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  borderRadius: 0,
                  bgcolor: theme.palette.mode === 'dark' ? '#1a1a1e' : '#f8fafc',
                  borderBottom: 1,
                  borderColor: 'border.main',
                }}
              >
                <Typography variant="overline" sx={{ color: 'text.secondary', fontSize: '0.6rem' }}>
                  Intelligence Summary
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mt: 1.5 }}>
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: 1,
                      bgcolor: `${theme.palette.accent.orange}10`,
                      border: `1px solid ${theme.palette.accent.orange}30`,
                    }}
                  >
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Folder sx={{ color: theme.palette.accent.orange, fontSize: 16 }} />
                      <Typography
                        variant="h6"
                        sx={{ color: theme.palette.accent.orange, fontWeight: 700 }}
                      >
                        {stats.totalCases}
                      </Typography>
                    </Stack>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Total Cases
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: theme.palette.accent.green,
                        display: 'block',
                        fontSize: '0.6rem',
                      }}
                    >
                      {stats.activeCases} active
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: 1,
                      bgcolor: `${theme.palette.accent.red}10`,
                      border: `1px solid ${theme.palette.accent.red}30`,
                    }}
                  >
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Security sx={{ color: theme.palette.accent.red, fontSize: 16 }} />
                      <Typography
                        variant="h6"
                        sx={{ color: theme.palette.accent.red, fontWeight: 700 }}
                      >
                        {stats.totalSuspects}
                      </Typography>
                    </Stack>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Persons of Interest
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: theme.palette.accent.red, display: 'block', fontSize: '0.6rem' }}
                    >
                      {stats.highThreatSuspects} high risk
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: 1,
                      bgcolor: `${theme.palette.accent.blue}10`,
                      border: `1px solid ${theme.palette.accent.blue}30`,
                    }}
                  >
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Devices sx={{ color: theme.palette.accent.blue, fontSize: 16 }} />
                      <Typography
                        variant="h6"
                        sx={{ color: theme.palette.accent.blue, fontWeight: 700 }}
                      >
                        {stats.totalDevices}
                      </Typography>
                    </Stack>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Devices Tracked
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: theme.palette.accent.red, display: 'block', fontSize: '0.6rem' }}
                    >
                      {stats.suspectDevices} flagged devices
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: 1,
                      bgcolor: `${theme.palette.accent.yellow}10`,
                      border: `1px solid ${theme.palette.accent.yellow}30`,
                    }}
                  >
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <AttachMoney sx={{ color: theme.palette.accent.yellow, fontSize: 16 }} />
                      <Typography
                        variant="body2"
                        sx={{ color: theme.palette.accent.yellow, fontWeight: 700 }}
                      >
                        {formatCurrency(stats.totalEstimatedLoss)}
                      </Typography>
                    </Stack>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Est. Total Loss
                    </Typography>
                  </Box>
                </Box>
              </Paper>

              {/* AI Data Intelligence */}
              <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'border.main' }}>
                <Stack spacing={1.5}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Typography
                      variant="overline"
                      sx={{ color: theme.palette.accent.purple, letterSpacing: 2, fontSize: '0.6rem' }}
                    >
                      🤖 AI DATA INTELLIGENCE
                    </Typography>
                    <Stack direction="row" spacing={0.5}>
                      <AIInsightButton
                        label="Analyze"
                        onClick={generateHotspotInsight}
                        loading={hotspotInsightLoading}
                        size="small"
                      />
                    </Stack>
                  </Stack>

                  {/* Hotspot Insight */}
                  {(hotspotInsight || hotspotInsightLoading || hotspotInsightError) && (
                    <AIInsightCard
                      insight={hotspotInsight}
                      loading={hotspotInsightLoading}
                      error={hotspotInsightError}
                      onRefresh={generateHotspotInsight}
                      onDismiss={() => {
                        setHotspotInsight(null);
                        setHotspotInsightError(null);
                      }}
                      compact
                      defaultExpanded
                      showRawData
                    />
                  )}

                  {/* Timeline Insight */}
                  {focusedEntityIds.size > 0 && (
                    <Box>
                      <AIInsightButton
                        label="Narrate Timeline"
                        onClick={generateTimelineInsight}
                        loading={timelineInsightLoading}
                        size="small"
                      />
                      {(timelineInsight || timelineInsightLoading || timelineInsightError) && (
                        <Box sx={{ mt: 1 }}>
                          <AIInsightCard
                            insight={timelineInsight}
                            loading={timelineInsightLoading}
                            error={timelineInsightError}
                            onRefresh={generateTimelineInsight}
                            onDismiss={() => {
                              setTimelineInsight(null);
                              setTimelineInsightError(null);
                            }}
                            compact
                            defaultExpanded
                            showRawData
                          />
                        </Box>
                      )}
                    </Box>
                  )}

                  {!hotspotInsight && !hotspotInsightLoading && !hotspotInsightError && (
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Click "Analyze" for AI-powered hotspot analysis
                    </Typography>
                  )}
                </Stack>
              </Box>

              {/* Selected Case Info - show when on key frame OR when case is pinned */}
              {(isKeyFrame || casePinned) && selectedCase && (() => {
                const caseCrimeInfo = getCrimeTypeInfo(selectedCase.description);
                return (
                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    borderRadius: 0,
                    bgcolor: `${PRIORITY_COLORS[selectedCase.priority]}10`,
                    borderBottom: `2px solid ${PRIORITY_COLORS[selectedCase.priority]}`,
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    <Typography sx={{ fontSize: 20 }}>{caseCrimeInfo.emoji}</Typography>
                    <Typography variant="subtitle2" sx={{ color: 'text.primary', fontWeight: 700 }}>
                      {selectedCase.caseNumber}
                    </Typography>
                    <Chip
                      label={caseCrimeInfo.label}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: '0.6rem',
                        bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                        color: 'text.secondary',
                      }}
                    />
                    <Chip
                      label={selectedCase.priority.toUpperCase()}
                      size="small"
                      sx={{
                        ml: 'auto',
                        height: 18,
                        fontSize: '0.6rem',
                        bgcolor: `${PRIORITY_COLORS[selectedCase.priority]}20`,
                        color: PRIORITY_COLORS[selectedCase.priority],
                      }}
                    />
                  </Stack>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {selectedCase.neighborhood}, {selectedCase.city}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}
                  >
                    {selectedCase.description}
                  </Typography>
                  {/* Find matching case data for more details */}
                  {cases.find(
                    (c) => c.caseNumber === selectedCase.caseNumber || c.id === selectedCase.id
                  ) && (
                    <Box
                      sx={{
                        mt: 1.5,
                        pt: 1.5,
                        borderTop: `1px solid ${PRIORITY_COLORS[selectedCase.priority]}30`,
                      }}
                    >
                      <Stack direction="row" spacing={2}>
                        {cases.find((c) => c.caseNumber === selectedCase.caseNumber)
                          ?.estimatedLoss && (
                          <Box>
                            <Typography
                              variant="caption"
                              sx={{ color: 'text.secondary', display: 'block' }}
                            >
                              Est. Loss
                            </Typography>
                            <Typography
                              variant="body2"
                              sx={{ color: theme.palette.accent.yellow, fontWeight: 600 }}
                            >
                              {formatCurrency(
                                cases.find((c) => c.caseNumber === selectedCase.caseNumber)
                                  ?.estimatedLoss
                              )}
                            </Typography>
                          </Box>
                        )}
                        <Box>
                          <Typography
                            variant="caption"
                            sx={{ color: 'text.secondary', display: 'block' }}
                          >
                            Status
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{
                              color: 'text.primary',
                              fontWeight: 600,
                              textTransform: 'capitalize',
                            }}
                          >
                            {cases.find((c) => c.caseNumber === selectedCase.caseNumber)?.status ||
                              'Investigating'}
                          </Typography>
                        </Box>
                      </Stack>
                    </Box>
                  )}
                </Paper>
                );
              })()}

              {/* Selected Hotspot Detail */}
              {selectedHotspot && (
                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    borderRadius: 0,
                    bgcolor: `${theme.palette.accent.orange}10`,
                    borderBottom: `2px solid ${theme.palette.accent.orange}`,
                  }}
                >
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    sx={{ mb: 1 }}
                  >
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <CellTower sx={{ color: theme.palette.accent.orange, fontSize: 18 }} />
                      <Typography
                        variant="subtitle2"
                        sx={{ color: 'text.primary', fontWeight: 700 }}
                      >
                        {selectedHotspot.towerName}
                      </Typography>
                    </Stack>
                    <IconButton size="small" onClick={() => setSelectedHotspotKey(null)}>
                      <Clear sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Stack>
                  <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 1 }}>
                    <LocationOn sx={{ fontSize: 12, color: 'text.secondary' }} />
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {selectedHotspot.city}
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={3} sx={{ mt: 1 }}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography
                        variant="h5"
                        sx={{ color: theme.palette.accent.blue, fontWeight: 700 }}
                      >
                        {getConnectedCount(selectedHotspot)}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Connected devices
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography
                        variant="h5"
                        sx={{ color: theme.palette.accent.red, fontWeight: 700 }}
                      >
                        {selectedHotspot.suspectCount}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Persons of Interest
                      </Typography>
                    </Box>
                  </Stack>
                  <Button
                    variant="contained"
                    fullWidth
                    startIcon={<Hub />}
                    endIcon={<ArrowForward />}
                    onClick={() => navigate(buildNetworkDeepLink())}
                    sx={{
                      mt: 2,
                      bgcolor: theme.palette.accent.orange,
                      color: theme.palette.mode === 'dark' ? '#000' : '#fff',
                      fontWeight: 700,
                      '&:hover': { bgcolor: theme.palette.primary.light },
                    }}
                  >
                    Continue Investigation
                  </Button>
                  {selectedHotspot.suspectCount > 0 && (
                    <Chip
                      icon={<Warning sx={{ fontSize: 12 }} />}
                      label="High Activity Zone"
                      size="small"
                      sx={{
                        mt: 1.5,
                        bgcolor: `${theme.palette.accent.red}20`,
                        color: theme.palette.accent.red,
                        fontSize: '0.65rem',
                        '& .MuiChip-icon': { color: theme.palette.accent.red },
                      }}
                    />
                  )}
                </Paper>
              )}

              {/* Active Hotspots List */}
              <Box sx={{ p: 2 }}>
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  sx={{ mb: 1 }}
                >
                  <Typography variant="subtitle2" sx={{ color: 'text.primary', fontWeight: 700 }}>
                    Active Hotspots
                  </Typography>
                  <Chip
                    label={`${stats.activeHotspots}/${hotspots.length}`}
                    size="small"
                    sx={{
                      bgcolor: `${theme.palette.accent.orange}20`,
                      color: theme.palette.accent.orange,
                      height: 20,
                      fontSize: '0.7rem',
                    }}
                  />
                </Stack>
                <Stack spacing={1}>
                  {filteredHotspots.slice(0, 5).map((hs, idx) => (
                    <Card
                      key={`${hs.towerId}-${idx}`}
                      sx={{
                        bgcolor:
                          selectedHotspotKey === getHotspotKey(hs)
                            ? `${theme.palette.accent.orange}15`
                            : 'background.default',
                        border: 1,
                        borderColor:
                          selectedHotspotKey === getHotspotKey(hs)
                            ? theme.palette.accent.orange
                            : hs.suspectCount > 0
                              ? `${theme.palette.accent.red}30`
                              : 'border.main',
                        '&:hover': { borderColor: theme.palette.accent.orange },
                      }}
                    >
                      <CardActionArea
                        onClick={() => {
                          setMapCenter([hs.lat, hs.lng]);
                          setMapZoom(15);
                          setSelectedHotspotKey(getHotspotKey(hs));
                        }}
                      >
                        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Box>
                              <Typography
                                variant="body2"
                                sx={{ color: 'text.primary', fontWeight: 500 }}
                              >
                                📡 {hs.towerName}
                              </Typography>
                              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                {hs.city}
                              </Typography>
                            </Box>
                            <Stack direction="row" spacing={1}>
                              <Badge
                                badgeContent={getConnectedCount(hs)}
                                sx={{
                                  '& .MuiBadge-badge': {
                                    bgcolor: theme.palette.accent.blue,
                                    color: '#fff',
                                    fontSize: '0.6rem',
                                    minWidth: 16,
                                    height: 16,
                                  },
                                }}
                              >
                                <Devices sx={{ color: 'text.secondary', fontSize: 16 }} />
                              </Badge>
                              {hs.suspectCount > 0 && (
                                <Badge
                                  badgeContent={hs.suspectCount}
                                  sx={{
                                    '& .MuiBadge-badge': {
                                      bgcolor: theme.palette.accent.red,
                                      color: '#fff',
                                      fontSize: '0.6rem',
                                      minWidth: 16,
                                      height: 16,
                                    },
                                  }}
                                >
                                  <Person sx={{ color: 'text.secondary', fontSize: 16 }} />
                                </Badge>
                              )}
                            </Stack>
                          </Stack>
                        </CardContent>
                      </CardActionArea>
                    </Card>
                  ))}
                </Stack>
              </Box>
            </Box>
          )}

          {/* Cases Tab */}
          {sidebarTab === 1 && (
            <Box sx={{ p: 2 }}>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ mb: 2 }}
              >
                <Typography variant="subtitle2" sx={{ color: 'text.primary', fontWeight: 700 }}>
                  All Cases
                </Typography>
                <Chip
                  label={searchQuery ? `${filteredCases.length}/${cases.length}` : cases.length}
                  size="small"
                  sx={{
                    bgcolor: `${theme.palette.accent.orange}20`,
                    color: theme.palette.accent.orange,
                    height: 20,
                    fontSize: '0.7rem',
                  }}
                />
              </Stack>
              <Stack spacing={1.5}>
                {filteredCases.map((c) => {
                const matchingKeyFrame = keyFrames.find(
                  (kf) => kf.caseNumber === c.caseNumber || kf.id === c.id
                );
                const cardCrimeInfo = getCrimeTypeInfo(c.title || c.description || '');
                return (
                  <Card
                    key={c.id}
                    sx={{
                      bgcolor: 'background.default',
                      border: 1,
                      borderColor:
                        selectedCase?.caseNumber === c.caseNumber
                          ? theme.palette.accent.orange
                          : 'border.main',
                      cursor: matchingKeyFrame ? 'pointer' : 'default',
                      transition: 'border-color 0.2s, transform 0.2s',
                      '&:hover': {
                        borderColor: theme.palette.accent.orange,
                        transform: matchingKeyFrame ? 'scale(1.01)' : 'none',
                      },
                    }}
                    onClick={() => {
                      if (matchingKeyFrame) {
                        jumpToKeyFrame(matchingKeyFrame);
                      }
                    }}
                  >
                    <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
                        <Box sx={{ flex: 1 }}>
                          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                            <span style={{ fontSize: 14 }}>{cardCrimeInfo.emoji}</span>
                            <Typography
                              variant="body2"
                              sx={{ color: 'text.primary', fontWeight: 600 }}
                            >
                              {c.caseNumber}
                            </Typography>
                            <Chip
                              label={cardCrimeInfo.label}
                              size="small"
                              sx={{
                                height: 16,
                                fontSize: '0.55rem',
                                bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                                color: 'text.secondary',
                              }}
                            />
                            <Chip
                              label={c.priority || 'Medium'}
                              size="small"
                              sx={{
                                height: 16,
                                fontSize: '0.55rem',
                                bgcolor: `${PRIORITY_COLORS[c.priority?.toLowerCase() || 'medium']}20`,
                                color: PRIORITY_COLORS[c.priority?.toLowerCase() || 'medium'],
                              }}
                            />
                          </Stack>
                          <Typography
                            variant="caption"
                            sx={{
                              color: 'text.primary',
                              display: 'block',
                              mb: 0.5,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                            }}
                          >
                            {c.title}
                          </Typography>
                          <Stack direction="row" alignItems="center" spacing={0.5}>
                            <LocationOn sx={{ fontSize: 10, color: 'text.secondary' }} />
                            <Typography
                              variant="caption"
                              sx={{ color: 'text.secondary', fontSize: '0.65rem' }}
                            >
                              {c.city}, {c.state}
                            </Typography>
                          </Stack>
                        </Box>
                        <Box sx={{ textAlign: 'right', ml: 1 }}>
                          {c.estimatedLoss && (
                            <Typography
                              variant="body2"
                              sx={{ color: theme.palette.accent.yellow, fontWeight: 700 }}
                            >
                              {formatCurrency(c.estimatedLoss)}
                            </Typography>
                          )}
                          <Chip
                            label={c.status || 'investigating'}
                            size="small"
                            sx={{
                              height: 16,
                              fontSize: '0.55rem',
                              mt: 0.5,
                              bgcolor:
                                c.status === 'investigating'
                                  ? `${theme.palette.accent.blue}20`
                                  : `${theme.palette.accent.green}20`,
                              color:
                                c.status === 'investigating'
                                  ? theme.palette.accent.blue
                                  : theme.palette.accent.green,
                              textTransform: 'capitalize',
                            }}
                          />
                        </Box>
                      </Stack>
                      {c.description && (
                        <Typography
                          variant="caption"
                          sx={{
                            color: 'text.secondary',
                            mt: 1,
                            fontSize: '0.65rem',
                            lineHeight: 1.4,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                          }}
                        >
                          {c.description}
                        </Typography>
                      )}
                      <Divider sx={{ my: 1 }} />
                      <Stack direction="row" spacing={2}>
                        <Box>
                          <Typography
                            variant="caption"
                            sx={{ color: 'text.secondary', fontSize: '0.6rem' }}
                          >
                            Assigned To
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{ color: 'text.primary', display: 'block', fontWeight: 500 }}
                          >
                            {c.assignedTo || 'Analyst Team'}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography
                            variant="caption"
                            sx={{ color: 'text.secondary', fontSize: '0.6rem' }}
                          >
                            Neighborhood
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{ color: 'text.primary', display: 'block', fontWeight: 500 }}
                          >
                            {c.neighborhood || 'N/A'}
                          </Typography>
                        </Box>
                      </Stack>
                    </CardContent>
                  </Card>
                );
              })}
              </Stack>
            </Box>
          )}

          {/* Persons Tab */}
          {sidebarTab === 2 && (
            <Box sx={{ p: 2 }}>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ mb: 1 }}
              >
                <Typography variant="subtitle2" sx={{ color: 'text.primary', fontWeight: 700 }}>
                  Entity Intelligence
                </Typography>
                <Chip
                  label={
                    searchQuery ? `${filteredSuspects.length}/${suspects.length}` : suspects.length
                  }
                  size="small"
                  sx={{
                    bgcolor: `${theme.palette.accent.red}20`,
                    color: theme.palette.accent.red,
                    height: 20,
                    fontSize: '0.7rem',
                  }}
                />
              </Stack>
              {/* Device link status summary */}
              {(() => {
                const withoutDevices = suspects.filter(s => !s.linkedDevices || s.linkedDevices.length === 0).length;
                const withDevices = suspects.length - withoutDevices;
                return (
                  <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                    <Chip
                      icon={<Devices sx={{ fontSize: 12 }} />}
                      label={`${withDevices} linked`}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: '0.65rem',
                        bgcolor: `${theme.palette.accent.green}15`,
                        color: theme.palette.accent.green,
                        '& .MuiChip-icon': { ml: 0.5, color: theme.palette.accent.green },
                      }}
                    />
                    {withoutDevices > 0 && (
                      <Chip
                        icon={<Warning sx={{ fontSize: 12 }} />}
                        label={`${withoutDevices} no device`}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: '0.65rem',
                          bgcolor: `${theme.palette.accent.orange}15`,
                          color: theme.palette.accent.orange,
                          '& .MuiChip-icon': { ml: 0.5, color: theme.palette.accent.orange },
                        }}
                      />
                    )}
                  </Stack>
                );
              })()}
              <Stack spacing={1.5}>
                {filteredSuspects.map((s) => {
                  const suspectRelationships = getRelationshipsForSuspect(s.id);
                  // Find the device position for this suspect
                  const suspectPosition = positions.find((p) => p.ownerId === s.id);
                  const clickTooltip = suspectPosition
                    ? 'Click to locate on map'
                    : 'Click to view network connections';
                  return (
                    <MuiTooltip key={s.id} title={clickTooltip} placement="left" arrow>
                      <Card
                        sx={{
                          bgcolor: 'background.default',
                          border: 1,
                          borderColor: `${getThreatLevelColor(s.threatLevel || '')}40`,
                          cursor: 'pointer',
                          '&:hover': { borderColor: getThreatLevelColor(s.threatLevel || '') },
                        }}
                        onClick={() => {
                          if (suspectPosition) {
                            // Focus on their device position on the map
                            setSelectedDevice(suspectPosition);
                            setMapCenter([suspectPosition.lat, suspectPosition.lng]);
                            setMapZoom(16);
                          } else {
                            // Navigate to Network Analysis to explore their connections
                            const params = new URLSearchParams();
                            params.set('hour', String(currentHour));
                            params.set('entityIds', s.id);
                            navigate(`/graph-explorer?${params.toString()}`);
                          }
                        }}
                      >
                      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Stack
                          direction="row"
                          alignItems="flex-start"
                          justifyContent="space-between"
                        >
                          <Box sx={{ flex: 1 }}>
                            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                              <Avatar
                                sx={{
                                  width: 28,
                                  height: 28,
                                  bgcolor: `${getThreatLevelColor(s.threatLevel || '')}30`,
                                  color: getThreatLevelColor(s.threatLevel || ''),
                                }}
                              >
                                <Person sx={{ fontSize: 16 }} />
                              </Avatar>
                              <Box>
                                <Typography
                                  variant="body2"
                                  sx={{ color: 'text.primary', fontWeight: 600 }}
                                >
                                  {s.name}
                                </Typography>
                                {s.alias && (
                                  <Typography
                                    variant="caption"
                                    sx={{ color: 'text.secondary', fontSize: '0.65rem' }}
                                  >
                                    aka "{s.alias}"
                                  </Typography>
                                )}
                              </Box>
                            </Stack>
                          </Box>
                          <Stack alignItems="flex-end" spacing={0.5}>
                            <Chip
                              label={s.threatLevel || 'Unknown'}
                              size="small"
                              sx={{
                                height: 18,
                                fontSize: '0.6rem',
                                fontWeight: 700,
                                bgcolor: `${getThreatLevelColor(s.threatLevel || '')}20`,
                                color: getThreatLevelColor(s.threatLevel || ''),
                              }}
                            />
                            {s.totalScore && (
                              <Typography
                                variant="caption"
                                sx={{ color: 'text.secondary', fontSize: '0.6rem' }}
                              >
                                Score: {s.totalScore.toFixed(2)}
                              </Typography>
                            )}
                          </Stack>
                        </Stack>

                        {/* Criminal History */}
                        {s.criminalHistory && (
                          <Box
                            sx={{
                              mt: 1,
                              p: 1,
                              bgcolor: theme.palette.mode === 'dark' ? '#1a1a1e' : '#f8fafc',
                              borderRadius: 1,
                            }}
                          >
                            <Stack
                              direction="row"
                              alignItems="center"
                              spacing={0.5}
                              sx={{ mb: 0.5 }}
                            >
                              <Gavel sx={{ fontSize: 12, color: 'text.secondary' }} />
                              <Typography
                                variant="caption"
                                sx={{
                                  color: 'text.secondary',
                                  fontWeight: 600,
                                  fontSize: '0.6rem',
                                }}
                              >
                                Criminal History
                              </Typography>
                            </Stack>
                            <Typography
                              variant="caption"
                              sx={{ color: 'text.primary', fontSize: '0.65rem' }}
                            >
                              {s.criminalHistory}
                            </Typography>
                          </Box>
                        )}

                        {/* Linked Devices Status */}
                        <Box
                          sx={{
                            mt: 1,
                            p: 1,
                            bgcolor: s.linkedDevices && s.linkedDevices.length > 0
                              ? `${theme.palette.accent.green}08`
                              : `${theme.palette.accent.orange}08`,
                            borderRadius: 1,
                            border: 1,
                            borderColor: s.linkedDevices && s.linkedDevices.length > 0
                              ? `${theme.palette.accent.green}25`
                              : `${theme.palette.accent.orange}25`,
                          }}
                        >
                          <Stack
                            direction="row"
                            alignItems="center"
                            spacing={0.5}
                            sx={{ mb: s.linkedDevices && s.linkedDevices.length > 0 ? 0.5 : 0 }}
                          >
                            <Devices
                              sx={{
                                fontSize: 12,
                                color: s.linkedDevices && s.linkedDevices.length > 0
                                  ? theme.palette.accent.green
                                  : theme.palette.accent.orange,
                              }}
                            />
                            <Typography
                              variant="caption"
                              sx={{
                                fontWeight: 600,
                                fontSize: '0.6rem',
                                color: s.linkedDevices && s.linkedDevices.length > 0
                                  ? theme.palette.accent.green
                                  : theme.palette.accent.orange,
                              }}
                            >
                              {s.linkedDevices && s.linkedDevices.length > 0
                                ? `${s.linkedDevices.length} Linked Device${s.linkedDevices.length > 1 ? 's' : ''}`
                                : 'No Linked Devices'}
                            </Typography>
                            {(!s.linkedDevices || s.linkedDevices.length === 0) && (
                              <Warning sx={{ fontSize: 11, color: theme.palette.accent.orange, ml: 0.5 }} />
                            )}
                          </Stack>
                          {s.linkedDevices && s.linkedDevices.length > 0 && (
                            <Stack
                              direction="row"
                              spacing={0.5}
                              sx={{ flexWrap: 'wrap', gap: 0.5 }}
                            >
                              {s.linkedDevices.slice(0, 3).map((device, idx) => (
                                <Chip
                                  key={idx}
                                  icon={<Devices sx={{ fontSize: 10 }} />}
                                  label={`${device.deviceId.slice(-6)} (${device.relationship})`}
                                  size="small"
                                  sx={{
                                    height: 16,
                                    fontSize: '0.5rem',
                                    bgcolor: `${theme.palette.accent.green}15`,
                                    color: theme.palette.accent.green,
                                    '& .MuiChip-icon': { ml: 0.5, color: theme.palette.accent.green },
                                  }}
                                />
                              ))}
                              {s.linkedDevices.length > 3 && (
                                <Chip
                                  label={`+${s.linkedDevices.length - 3}`}
                                  size="small"
                                  sx={{
                                    height: 16,
                                    fontSize: '0.55rem',
                                    bgcolor: `${theme.palette.accent.green}15`,
                                    color: theme.palette.accent.green,
                                  }}
                                />
                              )}
                            </Stack>
                          )}
                        </Box>

                        {/* Linked Cases & Cities */}
                        <Stack direction="row" spacing={2} sx={{ mt: 1.5 }}>
                          {s.linkedCases && s.linkedCases.length > 0 && (
                            <Box>
                              <Typography
                                variant="caption"
                                sx={{
                                  color: 'text.secondary',
                                  fontSize: '0.6rem',
                                  display: 'block',
                                }}
                              >
                                Linked Cases
                              </Typography>
                              <Stack
                                direction="row"
                                spacing={0.5}
                                sx={{ flexWrap: 'wrap', gap: 0.5 }}
                              >
                                {s.linkedCases.slice(0, 3).map((caseId, idx) => (
                                  <Chip
                                    key={idx}
                                    label={caseId}
                                    size="small"
                                    sx={{
                                      height: 16,
                                      fontSize: '0.55rem',
                                      bgcolor: `${theme.palette.accent.orange}15`,
                                      color: theme.palette.accent.orange,
                                    }}
                                  />
                                ))}
                                {s.linkedCases.length > 3 && (
                                  <Chip
                                    label={`+${s.linkedCases.length - 3}`}
                                    size="small"
                                    sx={{ height: 16, fontSize: '0.55rem' }}
                                  />
                                )}
                              </Stack>
                            </Box>
                          )}
                          {s.linkedCities && s.linkedCities.length > 0 && (
                            <Box>
                              <Typography
                                variant="caption"
                                sx={{
                                  color: 'text.secondary',
                                  fontSize: '0.6rem',
                                  display: 'block',
                                }}
                              >
                                Active In
                              </Typography>
                              <Stack
                                direction="row"
                                spacing={0.5}
                                sx={{ flexWrap: 'wrap', gap: 0.5 }}
                              >
                                {s.linkedCities.slice(0, 2).map((city, idx) => (
                                  <Chip
                                    key={idx}
                                    icon={<LocationOn sx={{ fontSize: 10 }} />}
                                    label={city}
                                    size="small"
                                    sx={{
                                      height: 16,
                                      fontSize: '0.55rem',
                                      '& .MuiChip-icon': { ml: 0.5 },
                                    }}
                                  />
                                ))}
                              </Stack>
                            </Box>
                          )}
                        </Stack>

                        {/* Relationships */}
                        {suspectRelationships.length > 0 && (
                          <Box sx={{ mt: 1.5, pt: 1, borderTop: 1, borderColor: 'border.main' }}>
                            <Stack
                              direction="row"
                              alignItems="center"
                              spacing={0.5}
                              sx={{ mb: 0.5 }}
                            >
                              <Groups sx={{ fontSize: 12, color: 'text.secondary' }} />
                              <Typography
                                variant="caption"
                                sx={{
                                  color: 'text.secondary',
                                  fontWeight: 600,
                                  fontSize: '0.6rem',
                                }}
                              >
                                Network Connections ({suspectRelationships.length})
                              </Typography>
                            </Stack>
                            <Stack
                              direction="row"
                              spacing={0.5}
                              sx={{ flexWrap: 'wrap', gap: 0.5 }}
                            >
                              {suspectRelationships.slice(0, 3).map((rel, idx) => (
                                <Chip
                                  key={idx}
                                  icon={
                                    rel.type === 'CO_LOCATED' ? (
                                      <LocationOn sx={{ fontSize: 10 }} />
                                    ) : (
                                      <Phone sx={{ fontSize: 10 }} />
                                    )
                                  }
                                  label={`${rel.person1Id === s.id ? rel.person2Name : rel.person1Name} (${rel.type})`}
                                  size="small"
                                  sx={{
                                    height: 18,
                                    fontSize: '0.55rem',
                                    bgcolor:
                                      rel.type === 'CO_LOCATED'
                                        ? `${theme.palette.accent.blue}15`
                                        : `${theme.palette.accent.purple || '#9333ea'}15`,
                                    '& .MuiChip-icon': {
                                      ml: 0.5,
                                      color:
                                        rel.type === 'CO_LOCATED'
                                          ? theme.palette.accent.blue
                                          : theme.palette.accent.purple || '#9333ea',
                                    },
                                  }}
                                />
                              ))}
                            </Stack>
                          </Box>
                        )}
                      </CardContent>
                      </Card>
                    </MuiTooltip>
                  );
                })}
              </Stack>
            </Box>
          )}

          {/* Devices Tab */}
          {sidebarTab === 3 && (
            <Box sx={{ p: 2 }}>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ mb: 2 }}
              >
                <Typography variant="subtitle2" sx={{ color: 'text.primary', fontWeight: 700 }}>
                  Tracked Devices
                </Typography>
                <ToggleButtonGroup
                  value={showDevices}
                  exclusive
                  onChange={(_, v) => v !== null && setShowDevices(v)}
                  size="small"
                >
                  <ToggleButton
                    value={true}
                    sx={{
                      p: 0.5,
                      color: 'text.secondary',
                      '&.Mui-selected': {
                        color: theme.palette.accent.orange,
                        bgcolor: `${theme.palette.accent.orange}20`,
                      },
                    }}
                  >
                    <Devices sx={{ fontSize: 14 }} />
                  </ToggleButton>
                </ToggleButtonGroup>
              </Stack>

              {/* Flagged Devices */}
              <Typography
                variant="overline"
                sx={{
                  color: theme.palette.accent.red,
                  fontSize: '0.6rem',
                  mb: 1,
                  display: 'block',
                }}
              >
                Flagged Devices ({filteredPositions.filter((d) => d.isSuspect).length})
              </Typography>
              <Stack spacing={1} sx={{ mb: 2 }}>
                {filteredPositions
                  .filter((d) => d.isSuspect)
                  .map((d) => {
                    const suspect = getSuspectFromPosition(d);
                    return (
                      <Card
                        key={d.deviceId}
                        sx={{
                          bgcolor:
                            selectedDevice?.deviceId === d.deviceId
                              ? `${theme.palette.accent.red}15`
                              : 'background.default',
                          border: 1,
                          borderColor:
                            selectedDevice?.deviceId === d.deviceId
                              ? theme.palette.accent.red
                              : `${theme.palette.accent.red}30`,
                          cursor: 'pointer',
                          '&:hover': { borderColor: theme.palette.accent.red },
                        }}
                        onClick={() => {
                          setSelectedDevice(d);
                          setMapCenter([d.lat, d.lng]);
                          setMapZoom(16);
                        }}
                      >
                        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                          <Stack direction="row" alignItems="flex-start" spacing={1}>
                            <Box
                              sx={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                bgcolor: theme.palette.accent.red,
                                mt: 0.5,
                              }}
                            />
                            <Box sx={{ flex: 1 }}>
                              <Typography
                                variant="body2"
                                sx={{ color: 'text.primary', fontWeight: 600 }}
                              >
                                {d.ownerAlias ? `"${d.ownerAlias}"` : d.ownerName || 'Unknown'}
                              </Typography>
                              <Stack direction="row" alignItems="center" spacing={0.5}>
                                <Typography
                                  variant="caption"
                                  sx={{ color: 'text.secondary' }}
                                >
                                  {d.deviceName}
                                </Typography>
                                {d.isBurner && (
                                  <Chip
                                    label="🔥 BURNER"
                                    size="small"
                                    sx={{
                                      height: 14,
                                      fontSize: '0.5rem',
                                      bgcolor: `${theme.palette.accent.purple}20`,
                                      color: theme.palette.accent.purple,
                                      fontWeight: 700,
                                    }}
                                  />
                                )}
                              </Stack>
                              {d.towerName && (
                                <Stack
                                  direction="row"
                                  alignItems="center"
                                  spacing={0.5}
                                  sx={{ mt: 0.5 }}
                                >
                                  <CellTower sx={{ fontSize: 10, color: 'text.secondary' }} />
                                  <Typography
                                    variant="caption"
                                    sx={{ color: 'text.secondary', fontSize: '0.6rem' }}
                                  >
                                    {d.towerName}
                                  </Typography>
                                </Stack>
                              )}
                              {suspect && (
                                <Chip
                                  label={suspect.threatLevel || 'Unknown'}
                                  size="small"
                                  sx={{
                                    mt: 0.5,
                                    height: 16,
                                    fontSize: '0.55rem',
                                    bgcolor: `${getThreatLevelColor(suspect.threatLevel || '')}20`,
                                    color: getThreatLevelColor(suspect.threatLevel || ''),
                                  }}
                                />
                              )}
                            </Box>
                            <MuiTooltip title="View on map">
                              <IconButton size="small">
                                <LocationOn
                                  sx={{ fontSize: 14, color: theme.palette.accent.red }}
                                />
                              </IconButton>
                            </MuiTooltip>
                          </Stack>
                        </CardContent>
                      </Card>
                    );
                  })}
              </Stack>

              {/* Associates */}
              <Typography
                variant="overline"
                sx={{
                  color: '#9ca3af',
                  fontSize: '0.6rem',
                  mb: 1,
                  display: 'block',
                }}
              >
                Associates ({filteredPositions.filter((d) => !d.isSuspect).length})
              </Typography>
              <Stack spacing={0.5}>
                {filteredPositions
                  .filter((d) => !d.isSuspect)
                  .slice(0, 10)
                  .map((d) => (
                    <Card
                      key={d.deviceId}
                      sx={{
                        bgcolor:
                          selectedDevice?.deviceId === d.deviceId
                            ? 'rgba(107, 114, 128, 0.15)'
                            : 'background.default',
                        border: 1,
                        borderColor:
                          selectedDevice?.deviceId === d.deviceId ? '#6b7280' : 'border.main',
                        cursor: 'pointer',
                        '&:hover': { borderColor: '#6b7280' },
                      }}
                      onClick={() => {
                        setSelectedDevice(d);
                        setMapCenter([d.lat, d.lng]);
                        setMapZoom(16);
                      }}
                    >
                      <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Box
                            sx={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              bgcolor: getAssociateColor(d.ownerId),
                            }}
                          />
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="caption" sx={{ color: 'text.primary' }}>
                              {d.ownerName || 'Unknown'}
                            </Typography>
                          </Box>
                          <Typography
                            variant="caption"
                            sx={{ color: 'text.secondary', fontSize: '0.6rem' }}
                          >
                            {d.deviceName}
                          </Typography>
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
              </Stack>
            </Box>
          )}
        </Box>

        {/* Action */}
        <Box sx={{ p: 2, borderTop: 1, borderColor: 'border.main' }}>
          <Button
            variant="contained"
            fullWidth
            endIcon={<ArrowForward />}
            onClick={() => navigate(buildNetworkDeepLink())}
            sx={{
              bgcolor: theme.palette.accent.orange,
              color: theme.palette.mode === 'dark' ? '#000' : '#fff',
              fontWeight: 700,
              '&:hover': { bgcolor: theme.palette.primary.light },
            }}
          >
            Analyze Network
          </Button>
        </Box>
      </Box>
      </Box>
    </Box>
  );
};

export default HeatmapDashboard;
