import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Box, Paper, Typography, Chip, Stack, useTheme, Divider } from '@mui/material';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapMarker, Activity } from '../types/activity';
import { ChangeStatus } from '../types/graph';

// Fix for default marker icon in React-Leaflet
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// @ts-expect-error - Leaflet icon setup
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

interface ActivityMapProps {
  markers: MapMarker[];
  onMarkerClick?: (marker: MapMarker) => void;
  onActivityClick?: (activity: Activity) => void;
}

// Component to fit map bounds to markers
const FitBounds: React.FC<{ markers: MapMarker[] }> = ({ markers }) => {
  const map = useMap();
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (markers.length > 0 && !hasInitialized.current) {
      const bounds = L.latLngBounds(markers.map((m) => [m.position.lat, m.position.lng]));
      map.fitBounds(bounds, { padding: [50, 50] });
      hasInitialized.current = true;
    }
  }, [markers, map]);

  return null;
};

const ActivityMap: React.FC<ActivityMapProps> = ({ markers, onMarkerClick, onActivityClick }) => {
  const theme = useTheme();

  // Create custom marker icons based on status
  const createMarkerIcon = (marker: MapMarker) => {
    const color = marker.status === ChangeStatus.NEW ? '#4caf50' : '#1976d2';
    const html = `
      <div style="
        width: 32px;
        height: 32px;
        background-color: ${color};
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        color: white;
        font-weight: bold;
      ">
        📍
      </div>
    `;

    return L.divIcon({
      html,
      className: 'custom-marker',
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -32],
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (markers.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          p: 4,
        }}
      >
        <Typography variant="h6" color="text.secondary">
          No locations with coordinates found
        </Typography>
      </Box>
    );
  }

  // Calculate center point
  const centerLat = markers.reduce((sum, m) => sum + m.position.lat, 0) / markers.length;
  const centerLng = markers.reduce((sum, m) => sum + m.position.lng, 0) / markers.length;

  return (
    <Box sx={{ height: '100%', width: '100%', position: 'relative' }}>
      <MapContainer
        center={[centerLat, centerLng]}
        zoom={4}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url={
            theme.palette.mode === 'dark'
              ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
              : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
          }
        />

        <FitBounds markers={markers} />

        {markers.map((marker) => (
          <Marker
            key={marker.id}
            position={[marker.position.lat, marker.position.lng]}
            icon={createMarkerIcon(marker)}
            eventHandlers={{
              click: () => onMarkerClick?.(marker),
            }}
          >
            <Popup maxWidth={350} minWidth={250}>
              <Box sx={{ p: 1 }}>
                <Stack spacing={1.5}>
                  {/* Header */}
                  <Box>
                    <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600, mb: 0.5 }}>
                      {marker.label}
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                      <Chip
                        label={marker.locationType}
                        size="small"
                        color="primary"
                        sx={{ fontSize: '0.7rem', height: 20 }}
                      />
                      {marker.status === ChangeStatus.NEW && (
                        <Chip
                          label="NEW"
                          size="small"
                          color="success"
                          sx={{ fontSize: '0.7rem', height: 20, fontWeight: 600 }}
                        />
                      )}
                    </Stack>
                  </Box>

                  <Divider />

                  {/* Location Details */}
                  {marker.properties.address && (
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                        Address:
                      </Typography>
                      <Typography variant="body2">{marker.properties.address}</Typography>
                    </Box>
                  )}

                  {marker.properties.first_observed && (
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                        First Observed:
                      </Typography>
                      <Typography variant="body2">{marker.properties.first_observed}</Typography>
                    </Box>
                  )}

                  {marker.properties.surveillance_status && (
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                        Surveillance:
                      </Typography>
                      <Typography variant="body2">{marker.properties.surveillance_status}</Typography>
                    </Box>
                  )}

                  {/* Activities at this location */}
                  {marker.activities.length > 0 && (
                    <>
                      <Divider />
                      <Box>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontWeight: 600, mb: 1, display: 'block' }}
                        >
                          Activities at this location ({marker.activities.length}):
                        </Typography>
                        <Stack spacing={1} sx={{ maxHeight: 200, overflow: 'auto' }}>
                          {marker.activities.slice(0, 5).map((activity) => (
                            <Paper
                              key={activity.id}
                              sx={{
                                p: 1,
                                cursor: onActivityClick ? 'pointer' : 'default',
                                '&:hover': onActivityClick
                                  ? { bgcolor: theme.palette.action.hover }
                                  : {},
                              }}
                              onClick={() => onActivityClick?.(activity)}
                            >
                              <Typography
                                variant="body2"
                                sx={{ fontSize: '0.8rem', fontWeight: 600, mb: 0.5 }}
                              >
                                {activity.title}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {formatDate(activity.date)}
                              </Typography>
                              <Box sx={{ mt: 0.5 }}>
                                <Chip
                                  label={activity.type}
                                  size="small"
                                  sx={{ fontSize: '0.65rem', height: 18 }}
                                />
                              </Box>
                            </Paper>
                          ))}
                          {marker.activities.length > 5 && (
                            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
                              +{marker.activities.length - 5} more activities
                            </Typography>
                          )}
                        </Stack>
                      </Box>
                    </>
                  )}

                  {/* Classification */}
                  {marker.properties.classification && (
                    <>
                      <Divider />
                      <Typography variant="caption" color="warning.main" sx={{ fontWeight: 600 }}>
                        Classification: {marker.properties.classification}
                      </Typography>
                    </>
                  )}
                </Stack>
              </Box>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Legend */}
      <Paper
        sx={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          p: 2,
          zIndex: 1000,
          minWidth: 200,
        }}
        elevation={3}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
          Map Legend
        </Typography>
        <Stack spacing={1}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                bgcolor: '#1976d2',
                border: '2px solid white',
              }}
            />
            <Typography variant="caption">Existing Location</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                bgcolor: '#4caf50',
                border: '2px solid white',
              }}
            />
            <Typography variant="caption">New Location</Typography>
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
};

export default ActivityMap;

