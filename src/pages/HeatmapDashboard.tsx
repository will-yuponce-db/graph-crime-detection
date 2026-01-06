import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  useTheme,
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
} from '@mui/icons-material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Marker,
  Popup,
  Tooltip,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchConfig, fetchPositions, fetchHotspots, USE_DATABRICKS } from '../services/api';

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

// Tower icon
const towerIcon = L.divIcon({
  className: 'tower-icon',
  html: '<div style="font-size: 16px;">📡</div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

// Case icon
const caseIcon = L.divIcon({
  className: 'case-icon',
  html: '<div style="font-size: 20px; filter: drop-shadow(0 0 4px rgba(249, 115, 22, 0.8));">📋</div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

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

const HeatmapDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const theme = useTheme();

  const [loading, setLoading] = useState(true);
  const [currentHour, setCurrentHour] = useState(25);
  const [pendingCaseJump, setPendingCaseJump] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // 0.5x, 1x, 2x, 5x
  const [showDevices, setShowDevices] = useState(true);
  const [mapCenter, setMapCenter] = useState<[number, number]>([38.9076, -77.0723]);
  const [mapZoom, setMapZoom] = useState(13);

  // Data from API
  const [towers, setTowers] = useState<CellTower[]>([]);
  const [keyFrames, setKeyFrames] = useState<KeyFrame[]>([]);
  const [positions, setPositions] = useState<DevicePosition[]>([]);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);

  // UI state
  const [selectedCase, setSelectedCase] = useState<KeyFrame | null>(null);
  const [caseMenuAnchor, setCaseMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedHotspotIdx, setSelectedHotspotIdx] = useState<number | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<DevicePosition | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Derived selected hotspot
  const selectedHotspot = selectedHotspotIdx !== null ? hotspots[selectedHotspotIdx] : null;

  // Filtered data based on search query
  const filteredHotspots = hotspots.filter(
    (hs) =>
      searchQuery === '' ||
      hs.towerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      hs.city.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredPositions = positions.filter(
    (d) =>
      searchQuery === '' ||
      d.deviceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.ownerName && d.ownerName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (d.ownerAlias && d.ownerAlias.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

  // Fetch initial config
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await fetchConfig();
        setTowers(config.towers || []);
        setKeyFrames(config.keyFrames || []);
      } catch (err) {
        console.error('Failed to fetch config:', err);
      } finally {
        setLoading(false);
      }
    };
    loadConfig();
  }, []);

  // Fetch positions and hotspots when hour changes
  useEffect(() => {
    const loadData = async () => {
      try {
        const [positionsData, hotspotsData] = await Promise.all([
          fetchPositions(currentHour),
          fetchHotspots(currentHour),
        ]);
        setPositions(positionsData || []);
        setHotspots(hotspotsData || []);
      } catch (err) {
        console.error('Failed to fetch positions:', err);
      }
    };
    loadData();
  }, [currentHour]);

  // Get cases at current hour
  const casesAtCurrentHour = keyFrames.filter((kf) => kf.hour === currentHour);
  const isKeyFrame = casesAtCurrentHour.length > 0;

  // Auto-select case when landing on key frame
  useEffect(() => {
    const cases = keyFrames.filter((kf) => kf.hour === currentHour);
    if (cases.length === 1) {
      setSelectedCase(cases[0]);
    } else if (cases.length > 1) {
      setSelectedCase(cases[0]);
    } else {
      setSelectedCase(null);
    }
  }, [currentHour, keyFrames]);

  // Playback with speed control
  useEffect(() => {
    if (isPlaying) {
      const interval = 500 / playbackSpeed; // Faster speed = shorter interval
      playIntervalRef.current = setInterval(() => {
        setCurrentHour((h) => (h >= 71 ? 0 : h + 1));
      }, interval);
    } else {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    }
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [isPlaying, playbackSpeed]);

  const jumpToKeyFrame = useCallback((kf: KeyFrame) => {
    setCurrentHour(kf.hour);
    setMapCenter([kf.lat, kf.lng]);
    setMapZoom(14);
    setSelectedCase(kf);
    setIsPlaying(false);
  }, []);

  // Handle deep link from case view - store pending case on mount
  useEffect(() => {
    const caseParam = searchParams.get('case');
    if (caseParam) {
      setPendingCaseJump(caseParam);
    }
  }, [searchParams]);

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
        bgcolor: 'background.default',
      }}
    >
      {/* Map */}
      <Box sx={{ flex: 1, position: 'relative' }}>
        <MapContainer
          center={mapCenter}
          zoom={mapZoom}
          style={{
            height: '100%',
            width: '100%',
            background: theme.palette.background.default,
          }}
          zoomControl={false}
        >
          <TileLayer url={mapTileUrl} />
          <MapController center={mapCenter} zoom={mapZoom} />

          {/* Cell Towers */}
          {towers.map((tower) => (
            <React.Fragment key={tower.id}>
              <CircleMarker
                center={[tower.latitude, tower.longitude]}
                radius={18}
                pathOptions={{
                  color: '#22c55e15',
                  fillColor: '#22c55e08',
                  fillOpacity: 0.5,
                  weight: 1,
                }}
              />
              <Marker position={[tower.latitude, tower.longitude]} icon={towerIcon}>
                <Popup>
                  <strong>{tower.name}</strong>
                  <br />
                  {tower.city}
                </Popup>
              </Marker>
            </React.Fragment>
          ))}

          {/* Hotspots - subtle ring indicators */}
          {hotspots.map((hs) => (
            <React.Fragment key={hs.towerId}>
              {/* Outer pulse ring for high activity */}
              {hs.suspectCount > 0 && (
                <CircleMarker
                  center={[hs.lat, hs.lng]}
                  radius={Math.min(24, 12 + hs.deviceCount * 2)}
                  pathOptions={{
                    color: 'rgba(239, 68, 68, 0.15)',
                    fillColor: 'transparent',
                    fillOpacity: 0,
                    weight: 1,
                    dashArray: '4, 4',
                  }}
                />
              )}
              {/* Main indicator ring */}
              <CircleMarker
                center={[hs.lat, hs.lng]}
                radius={Math.min(18, 8 + hs.deviceCount * 1.5)}
                pathOptions={{
                  color:
                    hs.suspectCount > 0 ? 'rgba(239, 68, 68, 0.6)' : 'rgba(100, 116, 139, 0.4)',
                  fillColor: hs.suspectCount > 0 ? 'rgba(239, 68, 68, 0.04)' : 'transparent',
                  fillOpacity: 1,
                  weight: hs.suspectCount > 0 ? 1.5 : 1,
                }}
              >
                <Tooltip direction="top" offset={[0, -5]} opacity={0.95}>
                  <div style={{ padding: '4px 8px', minWidth: '120px' }}>
                    <div style={{ fontWeight: 600, fontSize: '12px', marginBottom: '4px' }}>
                      📡 {hs.towerName}
                    </div>
                    <div style={{ fontSize: '11px', color: '#666' }}>
                      {hs.deviceCount} devices
                      {hs.suspectCount > 0 && (
                        <span style={{ color: '#ef4444', fontWeight: 600 }}>
                          {' '}
                          • {hs.suspectCount} suspects
                        </span>
                      )}
                    </div>
                  </div>
                </Tooltip>
                <Popup>
                  <strong>📡 {hs.towerName}</strong>
                  <br />
                  {hs.deviceCount} devices{hs.suspectCount > 0 && `, ${hs.suspectCount} suspects`}
                </Popup>
              </CircleMarker>
            </React.Fragment>
          ))}

          {/* Devices */}
          {showDevices &&
            positions.map((d) => (
              <CircleMarker
                key={d.deviceId}
                center={[d.lat, d.lng]}
                radius={d.isSuspect ? 6 : 4}
                pathOptions={{
                  color: d.isSuspect ? '#ef4444' : '#3b82f6',
                  fillColor: d.isSuspect ? '#ef4444' : '#3b82f6',
                  fillOpacity: 0.8,
                  weight: d.isSuspect ? 2 : 1,
                }}
              >
                <Tooltip direction="top" offset={[0, -5]} opacity={0.95}>
                  <div
                    style={{
                      padding: '4px 8px',
                      minWidth: '140px',
                      fontFamily: 'system-ui, -apple-system, sans-serif',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: '13px',
                        marginBottom: '4px',
                        color: d.isSuspect ? '#ef4444' : '#3b82f6',
                      }}
                    >
                      {d.isSuspect ? '⚠️ SUSPECT' : '📱 Device'}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '12px', marginBottom: '2px' }}>
                      {d.ownerAlias ? `"${d.ownerAlias}"` : d.ownerName || 'Unknown'}
                    </div>
                    {d.ownerAlias && d.ownerName && (
                      <div style={{ fontSize: '11px', color: '#666', marginBottom: '2px' }}>
                        {d.ownerName}
                      </div>
                    )}
                    <div style={{ fontSize: '10px', color: '#888' }}>{d.deviceName}</div>
                    {d.towerName && (
                      <div
                        style={{
                          fontSize: '10px',
                          color: '#888',
                          marginTop: '4px',
                          borderTop: '1px solid #eee',
                          paddingTop: '4px',
                        }}
                      >
                        📡 {d.towerName}
                      </div>
                    )}
                  </div>
                </Tooltip>
                <Popup>
                  <strong>{d.deviceName}</strong>
                  <br />
                  {d.ownerAlias ? `"${d.ownerAlias}"` : d.ownerName || 'Unknown owner'}
                  {d.isSuspect && (
                    <>
                      <br />
                      <span style={{ color: '#ef4444' }}>⚠️ SUSPECT</span>
                    </>
                  )}
                </Popup>
              </CircleMarker>
            ))}

          {/* Case marker - ONLY show when on key frame */}
          {isKeyFrame && selectedCase && (
            <Marker position={[selectedCase.lat, selectedCase.lng]} icon={caseIcon}>
              <Popup>
                <strong>📋 {selectedCase.caseNumber}</strong>
                <br />
                {selectedCase.neighborhood}
                <br />
                {selectedCase.description}
              </Popup>
            </Marker>
          )}
        </MapContainer>

        {/* Map Navigation Controls */}
        <Paper
          sx={{
            position: 'absolute',
            bottom: 110,
            right: 0,
            p: 1,
            bgcolor: theme.palette.surface.overlay,
            borderLeft: 1,
            borderTop: 1,
            borderColor: 'border.main',
            borderRadius: 0,
            backdropFilter: 'blur(8px)',
            zIndex: 1000,
          }}
        >
          <Stack spacing={0.5}>
            <Typography
              variant="caption"
              sx={{ color: 'text.secondary', textAlign: 'center', fontSize: '0.6rem' }}
            >
              NAV
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <IconButton
                size="small"
                onClick={() => panMap('up')}
                sx={{ color: 'text.secondary', '&:hover': { color: theme.palette.accent.orange } }}
                title="Pan Up"
              >
                <ArrowUpward sx={{ fontSize: 18 }} />
              </IconButton>
            </Box>
            <Stack direction="row" spacing={0.5} justifyContent="center">
              <IconButton
                size="small"
                onClick={() => panMap('left')}
                sx={{ color: 'text.secondary', '&:hover': { color: theme.palette.accent.orange } }}
                title="Pan Left"
              >
                <ArrowBack sx={{ fontSize: 18 }} />
              </IconButton>
              <IconButton
                size="small"
                onClick={resetMapView}
                sx={{ color: 'text.secondary', '&:hover': { color: theme.palette.accent.blue } }}
                title="Reset View"
              >
                <CenterFocusStrong sx={{ fontSize: 18 }} />
              </IconButton>
              <IconButton
                size="small"
                onClick={() => panMap('right')}
                sx={{ color: 'text.secondary', '&:hover': { color: theme.palette.accent.orange } }}
                title="Pan Right"
              >
                <ArrowForward sx={{ fontSize: 18 }} />
              </IconButton>
            </Stack>
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <IconButton
                size="small"
                onClick={() => panMap('down')}
                sx={{ color: 'text.secondary', '&:hover': { color: theme.palette.accent.orange } }}
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
                sx={{ color: 'text.secondary', '&:hover': { color: theme.palette.accent.orange } }}
                title="Zoom Out"
              >
                <ZoomOut sx={{ fontSize: 18 }} />
              </IconButton>
              <IconButton
                size="small"
                onClick={() => zoomMap('in')}
                sx={{ color: 'text.secondary', '&:hover': { color: theme.palette.accent.orange } }}
                title="Zoom In"
              >
                <ZoomIn sx={{ fontSize: 18 }} />
              </IconButton>
            </Stack>
          </Stack>
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
            zIndex: 1000,
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
                </Stack>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {towers.length} cells • {positions.length} entities
                </Typography>
              </Box>
            </Stack>

            {isKeyFrame && (
              <Chip
                icon={<Warning />}
                label={
                  casesAtCurrentHour.length > 1
                    ? `${casesAtCurrentHour.length} CASES`
                    : selectedCase?.caseNumber || 'KEY FRAME'
                }
                onClick={handleCaseChipClick}
                sx={{
                  bgcolor: selectedCase
                    ? `${PRIORITY_COLORS[selectedCase.priority]}20`
                    : `${theme.palette.accent.yellow}20`,
                  color: selectedCase
                    ? PRIORITY_COLORS[selectedCase.priority]
                    : theme.palette.accent.yellow,
                  cursor: casesAtCurrentHour.length > 1 ? 'pointer' : 'default',
                  '& .MuiChip-icon': {
                    color: selectedCase
                      ? PRIORITY_COLORS[selectedCase.priority]
                      : theme.palette.accent.yellow,
                  },
                }}
              />
            )}

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
              {casesAtCurrentHour.map((c) => (
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
                      <Folder sx={{ color: PRIORITY_COLORS[c.priority] }} />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary={c.caseNumber}
                    secondary={c.neighborhood}
                    primaryTypographyProps={{ sx: { color: 'text.primary', fontSize: '0.875rem' } }}
                    secondaryTypographyProps={{ sx: { color: 'text.secondary' } }}
                  />
                </MenuItem>
              ))}
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
            zIndex: 1000,
          }}
        >
          <Stack direction="row" alignItems="center" spacing={2}>
            <IconButton
              onClick={() => setCurrentHour((h) => Math.max(0, h - 1))}
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
              onClick={() => setCurrentHour((h) => Math.min(71, h + 1))}
              sx={{ color: 'text.secondary' }}
            >
              <SkipNext />
            </IconButton>

            <Box sx={{ flex: 1, px: 2 }}>
              <Slider
                value={currentHour}
                onChange={(_, v) => setCurrentHour(v as number)}
                min={0}
                max={71}
                marks={keyFrames.map((kf) => ({ value: kf.hour, label: '' }))}
                sx={{
                  color: isKeyFrame
                    ? PRIORITY_COLORS[selectedCase?.priority || 'medium']
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

            <Typography
              variant="body2"
              sx={{
                color: isKeyFrame ? theme.palette.accent.yellow : 'text.secondary',
                minWidth: 120,
                fontFamily: 'monospace',
                fontWeight: isKeyFrame ? 700 : 400,
              }}
            >
              {formatHour(currentHour)}
            </Typography>

            {/* Speed Controls */}
            <Stack direction="row" spacing={0.5} sx={{ ml: 2 }}>
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
          </Stack>

          <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', mr: 1 }}>
              JUMP TO:
            </Typography>
            {keyFrames.map((kf) => (
              <Chip
                key={kf.id}
                label={kf.caseNumber}
                size="small"
                onClick={() => jumpToKeyFrame(kf)}
                sx={{
                  bgcolor:
                    currentHour === kf.hour
                      ? `${PRIORITY_COLORS[kf.priority]}20`
                      : theme.palette.mode === 'dark'
                        ? '#1f1f23'
                        : '#f1f5f9',
                  color: currentHour === kf.hour ? PRIORITY_COLORS[kf.priority] : 'text.secondary',
                  fontSize: '0.65rem',
                  height: 22,
                  cursor: 'pointer',
                  border: `1px solid ${currentHour === kf.hour ? PRIORITY_COLORS[kf.priority] : 'transparent'}`,
                  '&:hover': {
                    bgcolor: `${PRIORITY_COLORS[kf.priority]}30`,
                    color: PRIORITY_COLORS[kf.priority],
                  },
                }}
              />
            ))}
          </Stack>
        </Paper>

        {/* Legend */}
        <Paper
          sx={{
            position: 'absolute',
            bottom: 110,
            left: 0,
            p: 1.5,
            bgcolor: theme.palette.surface.overlay,
            borderRight: 1,
            borderTop: 1,
            borderColor: 'border.main',
            borderRadius: 0,
            zIndex: 1001,
          }}
        >
          <Stack spacing={0.5}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Box sx={{ fontSize: 12 }}>📡</Box>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Tower
              </Typography>
            </Stack>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: theme.palette.accent.red,
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
                  borderRadius: '50%',
                  border: `2px dashed ${theme.palette.accent.orange}`,
                }}
              />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Case
              </Typography>
            </Stack>
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
        }}
      >
        {/* Search Box */}
        <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'border.main' }}>
          <TextField
            size="small"
            placeholder="Search hotspots, devices..."
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

        {/* Selected Case Info */}
        {isKeyFrame && selectedCase ? (
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
              <Folder sx={{ color: PRIORITY_COLORS[selectedCase.priority], fontSize: 18 }} />
              <Typography variant="subtitle2" sx={{ color: 'text.primary', fontWeight: 700 }}>
                {selectedCase.caseNumber}
              </Typography>
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
          </Paper>
        ) : (
          <Paper
            elevation={0}
            sx={{
              p: 2,
              borderRadius: 0,
              bgcolor: 'background.paper',
              borderBottom: 1,
              borderColor: 'border.main',
            }}
          >
            <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>
              No case at this time
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Navigate to a key frame to view case details
            </Typography>
          </Paper>
        )}

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
                <Typography variant="subtitle2" sx={{ color: 'text.primary', fontWeight: 700 }}>
                  {selectedHotspot.towerName}
                </Typography>
              </Stack>
              <Chip
                label="×"
                size="small"
                onClick={() => setSelectedHotspotIdx(null)}
                sx={{
                  cursor: 'pointer',
                  bgcolor: 'transparent',
                  color: 'text.secondary',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              />
            </Stack>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
              {selectedHotspot.city}
            </Typography>
            <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h6" sx={{ color: theme.palette.accent.blue, fontWeight: 700 }}>
                  {selectedHotspot.deviceCount}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Devices
                </Typography>
              </Box>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h6" sx={{ color: theme.palette.accent.red, fontWeight: 700 }}>
                  {selectedHotspot.suspectCount}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Suspects
                </Typography>
              </Box>
            </Stack>
            {selectedHotspot.suspectCount > 0 && (
              <Chip
                label="⚠️ High Activity"
                size="small"
                sx={{
                  mt: 1.5,
                  bgcolor: `${theme.palette.accent.red}20`,
                  color: theme.palette.accent.red,
                  fontSize: '0.65rem',
                }}
              />
            )}
          </Paper>
        )}

        {/* Hotspots */}
        <Paper
          elevation={0}
          sx={{
            p: 2,
            borderRadius: 0,
            bgcolor: 'background.paper',
            borderBottom: 1,
            borderColor: 'border.main',
          }}
        >
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography variant="subtitle2" sx={{ color: 'text.primary', fontWeight: 700 }}>
              Active Hotspots
            </Typography>
            <Chip
              label={
                searchQuery ? `${filteredHotspots.length}/${hotspots.length}` : hotspots.length
              }
              size="small"
              sx={{
                bgcolor: `${theme.palette.accent.orange}20`,
                color: theme.palette.accent.orange,
                height: 20,
                fontSize: '0.7rem',
              }}
            />
          </Stack>

          {filteredHotspots.length === 0 ? (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {searchQuery ? 'No matching hotspots' : 'No hotspots active'}
            </Typography>
          ) : (
            <Stack spacing={1}>
              {filteredHotspots.slice(0, 4).map((hs, idx) => (
                <Card
                  key={`${hs.towerId}-${idx}`}
                  sx={{
                    bgcolor:
                      selectedHotspotIdx === idx
                        ? `${theme.palette.accent.orange}15`
                        : 'background.default',
                    border: 1,
                    borderColor:
                      selectedHotspotIdx === idx
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
                      setSelectedHotspotIdx(idx);
                    }}
                  >
                    <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 500 }}>
                          📡 {hs.towerName}
                        </Typography>
                        <Stack direction="row" spacing={1}>
                          <Badge
                            badgeContent={hs.deviceCount}
                            sx={{
                              '& .MuiBadge-badge': {
                                bgcolor: theme.palette.accent.blue,
                                fontSize: '0.65rem',
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
                                  fontSize: '0.65rem',
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
          )}
        </Paper>

        {/* Devices */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography variant="overline" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
              Devices
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

          <Stack spacing={0.5}>
            {filteredPositions
              .filter((d) => d.isSuspect)
              .map((d) => (
                <Card
                  key={d.deviceId}
                  sx={{
                    bgcolor:
                      selectedDevice?.deviceId === d.deviceId
                        ? `${theme.palette.accent.red}15`
                        : 'background.paper',
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
                  <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Box
                        sx={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          bgcolor: theme.palette.accent.red,
                        }}
                      />
                      <Box>
                        <Typography
                          variant="caption"
                          sx={{
                            color: 'text.primary',
                            fontWeight: 600,
                            display: 'block',
                            lineHeight: 1.2,
                          }}
                        >
                          {d.ownerAlias ? `"${d.ownerAlias}"` : d.ownerName || 'Unknown'}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: 'text.secondary', fontSize: '0.65rem' }}
                        >
                          {d.deviceName}
                        </Typography>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            {filteredPositions
              .filter((d) => !d.isSuspect)
              .slice(0, 3)
              .map((d) => (
                <Card
                  key={d.deviceId}
                  sx={{
                    bgcolor:
                      selectedDevice?.deviceId === d.deviceId
                        ? `${theme.palette.accent.blue}15`
                        : 'background.paper',
                    border: 1,
                    borderColor:
                      selectedDevice?.deviceId === d.deviceId
                        ? theme.palette.accent.blue
                        : 'border.main',
                    cursor: 'pointer',
                    '&:hover': { borderColor: theme.palette.accent.blue },
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
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          bgcolor: theme.palette.accent.blue,
                        }}
                      />
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {d.ownerName || 'Unknown'}
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
          </Stack>
        </Box>

        {/* Action */}
        <Box sx={{ p: 2, borderTop: 1, borderColor: 'border.main' }}>
          <Button
            variant="contained"
            fullWidth
            endIcon={<ArrowForward />}
            onClick={() => navigate('/graph-explorer')}
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
  );
};

export default HeatmapDashboard;
