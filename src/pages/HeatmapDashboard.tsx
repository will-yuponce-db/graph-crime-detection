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
  lat: number;
  lng: number;
  city: string;
}

interface Device {
  id: string;
  name: string;
  owner: string;
  isSuspect: boolean;
  positions: { [hour: number]: { lat: number; lng: number; towerId: string | null } };
}

interface CaseKeyFrame {
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

// Cell Towers
const CELL_TOWERS: CellTower[] = [
  { id: 'tower_dc_georgetown', name: 'Georgetown', lat: 38.9076, lng: -77.0723, city: 'DC' },
  { id: 'tower_dc_adams', name: 'Adams Morgan', lat: 38.9214, lng: -77.0425, city: 'DC' },
  { id: 'tower_dc_dupont', name: 'Dupont Circle', lat: 38.9096, lng: -77.0434, city: 'DC' },
  { id: 'tower_dc_capitol', name: 'Capitol Hill', lat: 38.8899, lng: -76.9905, city: 'DC' },
  { id: 'tower_dc_navy', name: 'Navy Yard', lat: 38.8764, lng: -77.003, city: 'DC' },
  { id: 'tower_nash_east', name: 'East Nashville', lat: 36.1866, lng: -86.745, city: 'Nashville' },
  { id: 'tower_nash_gulch', name: 'The Gulch', lat: 36.1512, lng: -86.7893, city: 'Nashville' },
  {
    id: 'tower_balt_harbor',
    name: 'Harbor District',
    lat: 39.2804,
    lng: -76.6081,
    city: 'Baltimore',
  },
];

type DevicePosition = { lat: number; lng: number; towerId: string | null };

// Generate device movement
const generateDevicePositions = (): Device[] => {
  const devices: Device[] = [];

  const suspectPath: DevicePosition[] = [
    ...Array(10)
      .fill(null)
      .map(() => ({
        lat: 38.9214 + (Math.random() - 0.5) * 0.01,
        lng: -77.0425 + (Math.random() - 0.5) * 0.01,
        towerId: 'tower_dc_adams',
      })),
    ...Array(10)
      .fill(null)
      .map(() => ({
        lat: 38.9096 + (Math.random() - 0.5) * 0.01,
        lng: -77.0434 + (Math.random() - 0.5) * 0.01,
        towerId: 'tower_dc_dupont',
      })),
    ...Array(10)
      .fill(null)
      .map(() => ({
        lat: 38.9076 + (Math.random() - 0.5) * 0.005,
        lng: -77.0723 + (Math.random() - 0.5) * 0.005,
        towerId: 'tower_dc_georgetown',
      })),
    ...Array(10)
      .fill(null)
      .map(() => ({
        lat: 38.8764 + (Math.random() - 0.5) * 0.01,
        lng: -77.003 + (Math.random() - 0.5) * 0.01,
        towerId: 'tower_dc_navy',
      })),
    ...Array(15)
      .fill(null)
      .map(() => ({
        lat: 36.1866 + (Math.random() - 0.5) * 0.02,
        lng: -86.745 + (Math.random() - 0.5) * 0.02,
        towerId: 'tower_nash_east',
      })),
    ...Array(17)
      .fill(null)
      .map(() => ({
        lat: 36.1512 + (Math.random() - 0.5) * 0.01,
        lng: -86.7893 + (Math.random() - 0.5) * 0.01,
        towerId: 'tower_nash_gulch',
      })),
  ];

  const marcusPositions: { [h: number]: DevicePosition } = {};
  suspectPath.forEach((pos, i) => {
    marcusPositions[i] = pos;
  });
  devices.push({
    id: 'device_marcus',
    name: 'iPhone (E0412)',
    owner: 'Marcus "Ghost"',
    isSuspect: true,
    positions: marcusPositions,
  });

  const dariusPositions: { [h: number]: DevicePosition } = {};
  suspectPath.forEach((pos, i) => {
    dariusPositions[i] = {
      lat: pos.lat + (Math.random() - 0.5) * 0.002,
      lng: pos.lng + (Math.random() - 0.5) * 0.002,
      towerId: pos.towerId,
    };
  });
  devices.push({
    id: 'device_darius',
    name: 'Samsung (E1098)',
    owner: 'Darius "Slim"',
    isSuspect: true,
    positions: dariusPositions,
  });

  const civilians = ['Alice Chen', 'Bob Martinez', 'Carol Smith', 'David Lee', 'Emma Wilson'];
  civilians.forEach((name, idx) => {
    const positions: { [h: number]: DevicePosition } = {};
    const homeTower = CELL_TOWERS[idx % CELL_TOWERS.length];
    for (let h = 0; h < 72; h++) {
      const wander = Math.random() > 0.8;
      const tower = wander ? CELL_TOWERS[Math.floor(Math.random() * 5)] : homeTower;
      positions[h] = {
        lat: tower.lat + (Math.random() - 0.5) * 0.015,
        lng: tower.lng + (Math.random() - 0.5) * 0.015,
        towerId: tower.id,
      };
    }
    devices.push({
      id: `device_${idx}`,
      name: `Phone ${idx + 100}`,
      owner: name,
      isSuspect: false,
      positions,
    });
  });

  return devices;
};

// Key frames - cases tied to specific hours
const KEY_FRAMES: CaseKeyFrame[] = [
  {
    id: 'CASE_001',
    caseNumber: 'DC-2024-1105',
    hour: 8,
    lat: 38.9214,
    lng: -77.0425,
    neighborhood: 'Adams Morgan',
    city: 'DC',
    description: 'Early surveillance detected',
    priority: 'medium',
  },
  {
    id: 'CASE_002',
    caseNumber: 'DC-2024-1107',
    hour: 15,
    lat: 38.9096,
    lng: -77.0434,
    neighborhood: 'Dupont Circle',
    city: 'DC',
    description: 'Pattern confirmed',
    priority: 'medium',
  },
  {
    id: 'CASE_008',
    caseNumber: 'DC-2024-1201',
    hour: 25,
    lat: 38.9076,
    lng: -77.0723,
    neighborhood: 'Georgetown',
    city: 'DC',
    description: 'PRIMARY INCIDENT - Major burglary',
    priority: 'critical',
  },
  {
    id: 'CASE_005',
    caseNumber: 'TN-2024-1121',
    hour: 48,
    lat: 36.1866,
    lng: -86.745,
    neighborhood: 'East Nashville',
    city: 'Nashville',
    description: 'Cross-jurisdictional connection',
    priority: 'high',
  },
  {
    id: 'CASE_006',
    caseNumber: 'TN-2024-1124',
    hour: 60,
    lat: 36.1512,
    lng: -86.7893,
    neighborhood: 'The Gulch',
    city: 'Nashville',
    description: 'Nashville operation confirmed',
    priority: 'high',
  },
];

const DEVICES = generateDevicePositions();

const PRIORITY_COLORS = {
  low: '#71717a',
  medium: '#eab308',
  high: '#f97316',
  critical: '#ef4444',
};

// Map controller
const MapController: React.FC<{ center: [number, number]; zoom: number }> = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1 });
  }, [center, zoom, map]);
  return null;
};

const towerIcon = L.divIcon({
  html: `<div style="color: #22c55e; font-size: 20px; text-shadow: 0 0 4px #000;">📡</div>`,
  className: '',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const HotspotExplorer: React.FC = () => {
  const navigate = useNavigate();
  useSearchParams(); // Available for future URL param handling

  const [currentHour, setCurrentHour] = useState(25);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showDevices, setShowDevices] = useState(true);
  const [mapCenter, setMapCenter] = useState<[number, number]>([38.9076, -77.0723]);
  const [mapZoom, setMapZoom] = useState(13);
  const [selectedCase, setSelectedCase] = useState<CaseKeyFrame | null>(null);
  const [caseMenuAnchor, setCaseMenuAnchor] = useState<null | HTMLElement>(null);

  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Get cases at current hour
  const casesAtCurrentHour = KEY_FRAMES.filter((kf) => kf.hour === currentHour);
  const isKeyFrame = casesAtCurrentHour.length > 0;

  // Auto-select case when landing on key frame
  useEffect(() => {
    const cases = KEY_FRAMES.filter((kf) => kf.hour === currentHour);
    if (cases.length === 1) {
      setSelectedCase(cases[0]);
    } else if (cases.length === 0) {
      setSelectedCase(null);
    }
  }, [currentHour]);

  // Hotspot data
  const getHotspotData = useCallback(() => {
    const hotspots: { tower: CellTower; deviceCount: number; suspectCount: number }[] = [];
    CELL_TOWERS.forEach((tower) => {
      const devicesAtTower = DEVICES.filter((d) => {
        const pos = d.positions[currentHour];
        return pos && pos.towerId === tower.id;
      });
      if (devicesAtTower.length > 0) {
        hotspots.push({
          tower,
          deviceCount: devicesAtTower.length,
          suspectCount: devicesAtTower.filter((d) => d.isSuspect).length,
        });
      }
    });
    return hotspots;
  }, [currentHour]);

  const hotspots = getHotspotData();

  const getDevicePositions = useCallback(() => {
    return DEVICES.map((d) => ({ ...d, currentPos: d.positions[currentHour] || null })).filter(
      (d) => d.currentPos !== null
    );
  }, [currentHour]);

  const devicePositions = getDevicePositions();

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

  const jumpToKeyFrame = (kf: CaseKeyFrame) => {
    setCurrentHour(kf.hour);
    setSelectedCase(kf);
    setMapCenter([kf.lat, kf.lng]);
    setMapZoom(14);
    setIsPlaying(false);
    setCaseMenuAnchor(null);
  };

  const formatHour = (h: number) => {
    const day = Math.floor(h / 24) + 1;
    const hour = h % 24;
    return `Day ${day}, ${hour.toString().padStart(2, '0')}:00`;
  };

  const handleCaseChipClick = (event: React.MouseEvent<HTMLElement>) => {
    if (casesAtCurrentHour.length > 1) {
      setCaseMenuAnchor(event.currentTarget);
    }
  };

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
          {CELL_TOWERS.map((tower) => (
            <React.Fragment key={tower.id}>
              <CircleMarker
                center={[tower.lat, tower.lng]}
                radius={18}
                pathOptions={{
                  color: '#22c55e15',
                  fillColor: '#22c55e08',
                  fillOpacity: 0.5,
                  weight: 1,
                }}
              />
              <Marker position={[tower.lat, tower.lng]} icon={towerIcon}>
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
              key={hs.tower.id}
              center={[hs.tower.lat, hs.tower.lng]}
              radius={8 + hs.deviceCount * 4}
              pathOptions={{
                color: hs.suspectCount > 0 ? '#ef4444' : '#f97316',
                fillColor: hs.suspectCount > 0 ? '#ef4444' : '#f97316',
                fillOpacity: 0.3 + hs.suspectCount * 0.2,
                weight: 2,
              }}
            />
          ))}

          {/* Devices */}
          {showDevices &&
            devicePositions.map((d) => (
              <CircleMarker
                key={d.id}
                center={[d.currentPos!.lat, d.currentPos!.lng]}
                radius={d.isSuspect ? 6 : 4}
                pathOptions={{
                  color: d.isSuspect ? '#ef4444' : '#3b82f6',
                  fillColor: d.isSuspect ? '#ef4444' : '#3b82f6',
                  fillOpacity: 0.8,
                  weight: d.isSuspect ? 2 : 1,
                }}
              >
                <Popup>
                  <strong>{d.name}</strong>
                  <br />
                  {d.owner}
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
            <CircleMarker
              center={[selectedCase.lat, selectedCase.lng]}
              radius={20}
              pathOptions={{
                color: PRIORITY_COLORS[selectedCase.priority],
                fillColor: 'transparent',
                weight: 3,
                dashArray: '6 4',
              }}
            >
              <Popup>
                <strong>📋 {selectedCase.caseNumber}</strong>
                <br />
                {selectedCase.neighborhood}
                <br />
                {selectedCase.description}
              </Popup>
            </CircleMarker>
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
                  {CELL_TOWERS.length} towers • {DEVICES.length} devices
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
                    secondaryTypographyProps={{ sx: { color: '#71717a', fontSize: '0.75rem' } }}
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
                marks={KEY_FRAMES.map((kf) => ({ value: kf.hour, label: '' }))}
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
            {KEY_FRAMES.map((kf) => (
              <Chip
                key={kf.id}
                label={kf.neighborhood}
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
                  key={hs.tower.id}
                  sx={{
                    bgcolor: '#09090b',
                    border: `1px solid ${hs.suspectCount > 0 ? '#ef444430' : '#27272a'}`,
                    cursor: 'pointer',
                    '&:hover': { borderColor: '#f97316' },
                  }}
                  onClick={() => {
                    setMapCenter([hs.tower.lat, hs.tower.lng]);
                    setMapZoom(15);
                  }}
                >
                  <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="body2" sx={{ color: '#fff', fontWeight: 500 }}>
                        📡 {hs.tower.name}
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
            {devicePositions
              .filter((d) => d.isSuspect)
              .map((d) => (
                <Card key={d.id} sx={{ bgcolor: '#18181b', border: '1px solid #ef444430' }}>
                  <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#ef4444' }} />
                      <Box>
                        <Typography
                          variant="caption"
                          sx={{ color: '#fff', fontWeight: 600, display: 'block', lineHeight: 1.2 }}
                        >
                          {d.owner}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: '#52525b', fontSize: '0.65rem' }}
                        >
                          {d.name}
                        </Typography>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            {devicePositions
              .filter((d) => !d.isSuspect)
              .slice(0, 3)
              .map((d) => (
                <Card key={d.id} sx={{ bgcolor: '#18181b', border: '1px solid #27272a' }}>
                  <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: '#3b82f6' }} />
                      <Typography variant="caption" sx={{ color: '#52525b' }}>
                        {d.owner}
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

export default HotspotExplorer;
