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
  Button,
  ToggleButtonGroup,
  ToggleButton,
  Badge,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
} from '@mui/material';
import {
  PlayArrow,
  Pause,
  SkipNext,
  SkipPrevious,
  CellTower,
  Devices,
  ArrowForward,
  Person,
  Warning,
  Folder,
  CheckCircle,
} from '@mui/icons-material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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
  useSearchParams();

  const [loading, setLoading] = useState(true);
  const [currentHour, setCurrentHour] = useState(25);
  const [isPlaying, setIsPlaying] = useState(false);
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

  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch initial config
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/demo/config');
        const data = await res.json();
        if (data.success) {
          setTowers(data.towers);
          setKeyFrames(data.keyFrames);
        }
      } catch (err) {
        console.error('Failed to fetch config:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  // Fetch positions and hotspots when hour changes
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [posRes, hotRes] = await Promise.all([
          fetch(`/api/demo/positions/${currentHour}`),
          fetch(`/api/demo/hotspots/${currentHour}`),
        ]);
        const posData = await posRes.json();
        const hotData = await hotRes.json();

        if (posData.success) setPositions(posData.positions);
        if (hotData.success) setHotspots(hotData.hotspots);
      } catch (err) {
        console.error('Failed to fetch positions:', err);
      }
    };
    fetchData();
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

  // Playback
  useEffect(() => {
    if (isPlaying) {
      playIntervalRef.current = setInterval(() => {
        setCurrentHour((h) => (h >= 71 ? 0 : h + 1));
      }, 500);
    } else {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    }
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [isPlaying]);

  const jumpToKeyFrame = useCallback((kf: KeyFrame) => {
    setCurrentHour(kf.hour);
    setMapCenter([kf.lat, kf.lng]);
    setMapZoom(14);
    setSelectedCase(kf);
    setIsPlaying(false);
  }, []);

  const handleCaseChipClick = (event: React.MouseEvent<HTMLElement>) => {
    if (casesAtCurrentHour.length > 1) {
      setCaseMenuAnchor(event.currentTarget);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <CircularProgress sx={{ color: '#f97316' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', bgcolor: '#09090b' }}>
      {/* Map */}
      <Box sx={{ flex: 1, position: 'relative' }}>
        <MapContainer
          center={mapCenter}
          zoom={mapZoom}
          style={{ height: '100%', width: '100%', background: '#09090b' }}
          zoomControl={false}
        >
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
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

          {/* Hotspots */}
          {hotspots.map((hs) => (
            <CircleMarker
              key={hs.towerId}
              center={[hs.lat, hs.lng]}
              radius={Math.min(30, 8 + hs.deviceCount * 3)}
              pathOptions={{
                color: hs.suspectCount > 0 ? '#ef4444' : '#f97316',
                fillColor: hs.suspectCount > 0 ? '#ef4444' : '#f97316',
                fillOpacity: 0.3,
                weight: 2,
              }}
            >
              <Popup>
                <strong>📡 {hs.towerName}</strong>
                <br />
                {hs.deviceCount} devices{hs.suspectCount > 0 && `, ${hs.suspectCount} suspects`}
              </Popup>
            </CircleMarker>
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

        {/* Header */}
        <Paper
          sx={{
            position: 'absolute',
            top: 16,
            left: 16,
            right: 340,
            p: 2,
            bgcolor: 'rgba(9, 9, 11, 0.9)',
            border: '1px solid #27272a',
            borderRadius: 2,
            backdropFilter: 'blur(8px)',
            zIndex: 1000,
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" alignItems="center" spacing={2}>
              <Avatar sx={{ bgcolor: '#f97316', width: 36, height: 36 }}>
                <CellTower sx={{ fontSize: 20 }} />
              </Avatar>
              <Box>
                <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700 }}>
                  Hotspot Explorer
                </Typography>
                <Typography variant="caption" sx={{ color: '#52525b' }}>
                  {towers.length} towers • {positions.length} devices
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
                    : '#fbbf2420',
                  color: selectedCase ? PRIORITY_COLORS[selectedCase.priority] : '#fbbf24',
                  cursor: casesAtCurrentHour.length > 1 ? 'pointer' : 'default',
                  '& .MuiChip-icon': {
                    color: selectedCase ? PRIORITY_COLORS[selectedCase.priority] : '#fbbf24',
                  },
                }}
              />
            )}

            {/* Case selection menu */}
            <Menu
              anchorEl={caseMenuAnchor}
              open={Boolean(caseMenuAnchor)}
              onClose={() => setCaseMenuAnchor(null)}
              PaperProps={{ sx: { bgcolor: '#18181b', border: '1px solid #27272a' } }}
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
                    color: '#fff',
                    '&:hover': { bgcolor: '#27272a' },
                    '&.Mui-selected': { bgcolor: '#27272a' },
                  }}
                >
                  <ListItemIcon>
                    {selectedCase?.id === c.id ? (
                      <CheckCircle sx={{ color: '#22c55e' }} />
                    ) : (
                      <Folder sx={{ color: PRIORITY_COLORS[c.priority] }} />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary={c.caseNumber}
                    secondary={c.neighborhood}
                    primaryTypographyProps={{ sx: { color: '#fff', fontSize: '0.875rem' } }}
                    secondaryTypographyProps={{ sx: { color: '#71717a' } }}
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
            bottom: 16,
            left: 16,
            right: 340,
            p: 2,
            bgcolor: 'rgba(9, 9, 11, 0.95)',
            border: '1px solid #27272a',
            borderRadius: 2,
            zIndex: 1000,
          }}
        >
          <Stack direction="row" alignItems="center" spacing={2}>
            <IconButton
              onClick={() => setCurrentHour((h) => Math.max(0, h - 1))}
              sx={{ color: '#71717a' }}
            >
              <SkipPrevious />
            </IconButton>
            <IconButton onClick={() => setIsPlaying(!isPlaying)} sx={{ color: '#f97316' }}>
              {isPlaying ? <Pause /> : <PlayArrow />}
            </IconButton>
            <IconButton
              onClick={() => setCurrentHour((h) => Math.min(71, h + 1))}
              sx={{ color: '#71717a' }}
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
                    : '#52525b',
                  '& .MuiSlider-mark': {
                    bgcolor: '#fbbf24',
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
                color: isKeyFrame ? '#fbbf24' : '#71717a',
                minWidth: 120,
                fontFamily: 'monospace',
                fontWeight: isKeyFrame ? 700 : 400,
              }}
            >
              {formatHour(currentHour)}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
            <Typography variant="caption" sx={{ color: '#3f3f46', mr: 1 }}>
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
                    currentHour === kf.hour ? `${PRIORITY_COLORS[kf.priority]}20` : '#1f1f23',
                  color: currentHour === kf.hour ? PRIORITY_COLORS[kf.priority] : '#52525b',
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
            bottom: 130,
            left: 16,
            p: 1.5,
            bgcolor: 'rgba(9, 9, 11, 0.9)',
            border: '1px solid #27272a',
            borderRadius: 1,
            zIndex: 1000,
          }}
        >
          <Stack spacing={0.5}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Box sx={{ fontSize: 12 }}>📡</Box>
              <Typography variant="caption" sx={{ color: '#52525b' }}>
                Tower
              </Typography>
            </Stack>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#ef4444' }} />
              <Typography variant="caption" sx={{ color: '#52525b' }}>
                Suspect
              </Typography>
            </Stack>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Box
                sx={{ width: 8, height: 8, borderRadius: '50%', border: '2px dashed #f97316' }}
              />
              <Typography variant="caption" sx={{ color: '#52525b' }}>
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
          borderLeft: '1px solid #27272a',
          bgcolor: '#0f0f0f',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
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
              <Typography variant="subtitle2" sx={{ color: '#fff', fontWeight: 700 }}>
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
            <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
              {selectedCase.neighborhood}, {selectedCase.city}
            </Typography>
            <Typography variant="caption" sx={{ color: '#71717a', display: 'block', mt: 0.5 }}>
              {selectedCase.description}
            </Typography>
          </Paper>
        ) : (
          <Paper
            elevation={0}
            sx={{ p: 2, borderRadius: 0, bgcolor: '#18181b', borderBottom: '1px solid #27272a' }}
          >
            <Typography variant="subtitle2" sx={{ color: '#52525b' }}>
              No case at this time
            </Typography>
            <Typography variant="caption" sx={{ color: '#3f3f46' }}>
              Navigate to a key frame to view case details
            </Typography>
          </Paper>
        )}

        {/* Hotspots */}
        <Paper
          elevation={0}
          sx={{ p: 2, borderRadius: 0, bgcolor: '#18181b', borderBottom: '1px solid #27272a' }}
        >
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography variant="subtitle2" sx={{ color: '#fff', fontWeight: 700 }}>
              Active Hotspots
            </Typography>
            <Chip
              label={hotspots.length}
              size="small"
              sx={{ bgcolor: '#f9731620', color: '#f97316', height: 20, fontSize: '0.7rem' }}
            />
          </Stack>

          {hotspots.length === 0 ? (
            <Typography variant="caption" sx={{ color: '#3f3f46' }}>
              No hotspots active
            </Typography>
          ) : (
            <Stack spacing={1}>
              {hotspots.slice(0, 4).map((hs) => (
                <Card
                  key={hs.towerId}
                  sx={{
                    bgcolor: '#09090b',
                    border: `1px solid ${hs.suspectCount > 0 ? '#ef444430' : '#27272a'}`,
                    cursor: 'pointer',
                    '&:hover': { borderColor: '#f97316' },
                  }}
                  onClick={() => {
                    setMapCenter([hs.lat, hs.lng]);
                    setMapZoom(15);
                  }}
                >
                  <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="body2" sx={{ color: '#fff', fontWeight: 500 }}>
                        📡 {hs.towerName}
                      </Typography>
                      <Stack direction="row" spacing={1}>
                        <Badge
                          badgeContent={hs.deviceCount}
                          sx={{
                            '& .MuiBadge-badge': {
                              bgcolor: '#3b82f6',
                              fontSize: '0.65rem',
                              minWidth: 16,
                              height: 16,
                            },
                          }}
                        >
                          <Devices sx={{ color: '#52525b', fontSize: 16 }} />
                        </Badge>
                        {hs.suspectCount > 0 && (
                          <Badge
                            badgeContent={hs.suspectCount}
                            sx={{
                              '& .MuiBadge-badge': {
                                bgcolor: '#ef4444',
                                fontSize: '0.65rem',
                                minWidth: 16,
                                height: 16,
                              },
                            }}
                          >
                            <Person sx={{ color: '#52525b', fontSize: 16 }} />
                          </Badge>
                        )}
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}
        </Paper>

        {/* Devices */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography variant="overline" sx={{ color: '#3f3f46', fontSize: '0.65rem' }}>
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
                  color: '#52525b',
                  '&.Mui-selected': { color: '#f97316', bgcolor: '#f9731620' },
                }}
              >
                <Devices sx={{ fontSize: 14 }} />
              </ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          <Stack spacing={0.5}>
            {positions
              .filter((d) => d.isSuspect)
              .map((d) => (
                <Card key={d.deviceId} sx={{ bgcolor: '#18181b', border: '1px solid #ef444430' }}>
                  <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#ef4444' }} />
                      <Box>
                        <Typography
                          variant="caption"
                          sx={{ color: '#fff', fontWeight: 600, display: 'block', lineHeight: 1.2 }}
                        >
                          {d.ownerAlias ? `"${d.ownerAlias}"` : d.ownerName || 'Unknown'}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: '#52525b', fontSize: '0.65rem' }}
                        >
                          {d.deviceName}
                        </Typography>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            {positions
              .filter((d) => !d.isSuspect)
              .slice(0, 3)
              .map((d) => (
                <Card key={d.deviceId} sx={{ bgcolor: '#18181b', border: '1px solid #27272a' }}>
                  <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: '#3b82f6' }} />
                      <Typography variant="caption" sx={{ color: '#52525b' }}>
                        {d.ownerName || 'Unknown'}
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
          </Stack>
        </Box>

        {/* Action */}
        <Box sx={{ p: 2, borderTop: '1px solid #27272a' }}>
          <Button
            variant="contained"
            fullWidth
            endIcon={<ArrowForward />}
            onClick={() => navigate('/graph-explorer')}
            sx={{
              bgcolor: '#f97316',
              color: '#000',
              fontWeight: 700,
              '&:hover': { bgcolor: '#fb923c' },
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
