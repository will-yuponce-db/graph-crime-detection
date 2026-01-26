import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Stack,
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Chip,
  Tooltip,
  useTheme,
  CircularProgress,
} from '@mui/material';
import {
  Layers as LayersIcon,
  Map as MapIcon,
  Satellite as SatelliteIcon,
  Terrain as TerrainIcon,
  MyLocation as MyLocationIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
  Download as DownloadIcon,
  Share as ShareIcon,
  FilterList as FilterIcon,
  Search as SearchIcon,
  Timeline as TimelineIcon,
  Analytics as AnalyticsIcon,
  LocationOn as LocationIcon,
  KeyboardArrowDown,
  FiberManualRecord,
  Public as GlobeIcon,
  DataObject as DataIcon,
  GridOn as GridIcon,
  Route as RouteIcon,
} from '@mui/icons-material';
import { monoFontFamily } from '../theme/theme';

const ESRI_URL = 'https://koop-esri-237438879023004.aws.databricksapps.com/pubsec-demo.html';

const ESRIIntegration: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Menu anchors
  const [layersAnchor, setLayersAnchor] = useState<null | HTMLElement>(null);
  const [toolsAnchor, setToolsAnchor] = useState<null | HTMLElement>(null);
  const [viewAnchor, setViewAnchor] = useState<null | HTMLElement>(null);

  const handleIframeLoad = () => {
    setLoading(false);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const refreshIframe = () => {
    setLoading(true);
    const iframe = document.getElementById('esri-iframe') as HTMLIFrameElement;
    if (iframe) {
      iframe.src = iframe.src;
    }
  };

  const menuButtonStyle = {
    color: 'text.secondary',
    fontFamily: monoFontFamily,
    fontSize: '0.75rem',
    fontWeight: 600,
    letterSpacing: '0.03em',
    px: 2,
    py: 0.75,
    borderRadius: 1,
    textTransform: 'none' as const,
    '&:hover': {
      bgcolor: isDark ? 'rgba(56, 189, 248, 0.08)' : 'rgba(0, 0, 0, 0.04)',
      color: isDark ? theme.palette.accent.cyan : 'text.primary',
    },
  };

  const iconButtonStyle = {
    color: 'text.secondary',
    borderRadius: 1,
    p: 0.75,
    '&:hover': {
      bgcolor: isDark ? 'rgba(56, 189, 248, 0.08)' : 'rgba(0, 0, 0, 0.04)',
      color: isDark ? theme.palette.accent.cyan : 'text.primary',
    },
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 64px)', // Full viewport minus the main nav bar height
        minHeight: 0,
        overflow: 'hidden',
        bgcolor: 'background.default',
      }}
    >
      {/* ESRI Menu Bar */}
      <Paper
        elevation={0}
        sx={{
          bgcolor: isDark ? 'rgba(10, 17, 32, 0.95)' : 'background.paper',
          backdropFilter: 'blur(12px)',
          borderBottom: 1,
          borderColor: 'border.main',
          px: 2,
          py: 0.5,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          {/* ESRI Branding */}
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mr: 2 }}>
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: isDark ? 'rgba(56, 189, 248, 0.1)' : 'rgba(3, 105, 161, 0.1)',
                border: `1px solid ${isDark ? theme.palette.accent.cyan : theme.palette.primary.main}`,
              }}
            >
              <GlobeIcon
                sx={{
                  fontSize: 20,
                  color: isDark ? theme.palette.accent.cyan : theme.palette.primary.main,
                }}
              />
            </Box>
            <Stack spacing={0}>
              <Typography
                sx={{
                  fontFamily: monoFontFamily,
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  color: isDark ? theme.palette.accent.cyan : theme.palette.primary.main,
                }}
              >
                ESRI ARCGIS
              </Typography>
              <Typography
                sx={{
                  fontFamily: monoFontFamily,
                  fontSize: '0.6rem',
                  color: 'text.secondary',
                  letterSpacing: '0.05em',
                }}
              >
                GIS INTEGRATION
              </Typography>
            </Stack>
          </Stack>

          <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

          {/* Layers Menu */}
          <Button
            startIcon={<LayersIcon sx={{ fontSize: 18 }} />}
            endIcon={<KeyboardArrowDown sx={{ fontSize: 16 }} />}
            onClick={(e) => setLayersAnchor(e.currentTarget)}
            sx={menuButtonStyle}
          >
            LAYERS
          </Button>
          <Menu
            anchorEl={layersAnchor}
            open={Boolean(layersAnchor)}
            onClose={() => setLayersAnchor(null)}
            PaperProps={{
              sx: {
                bgcolor: isDark ? 'surface.elevated' : 'background.paper',
                border: `1px solid ${theme.palette.border.main}`,
                minWidth: 200,
              },
            }}
          >
            <MenuItem onClick={() => setLayersAnchor(null)}>
              <ListItemIcon><MapIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Base Map" secondary="Street view" />
            </MenuItem>
            <MenuItem onClick={() => setLayersAnchor(null)}>
              <ListItemIcon><SatelliteIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Satellite" secondary="Aerial imagery" />
            </MenuItem>
            <MenuItem onClick={() => setLayersAnchor(null)}>
              <ListItemIcon><TerrainIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Terrain" secondary="Topographic" />
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => setLayersAnchor(null)}>
              <ListItemIcon><LocationIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Crime Hotspots" />
            </MenuItem>
            <MenuItem onClick={() => setLayersAnchor(null)}>
              <ListItemIcon><RouteIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Movement Trails" />
            </MenuItem>
            <MenuItem onClick={() => setLayersAnchor(null)}>
              <ListItemIcon><GridIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="H3 Grid Overlay" />
            </MenuItem>
          </Menu>

          {/* Tools Menu */}
          <Button
            startIcon={<AnalyticsIcon sx={{ fontSize: 18 }} />}
            endIcon={<KeyboardArrowDown sx={{ fontSize: 16 }} />}
            onClick={(e) => setToolsAnchor(e.currentTarget)}
            sx={menuButtonStyle}
          >
            TOOLS
          </Button>
          <Menu
            anchorEl={toolsAnchor}
            open={Boolean(toolsAnchor)}
            onClose={() => setToolsAnchor(null)}
            PaperProps={{
              sx: {
                bgcolor: isDark ? 'surface.elevated' : 'background.paper',
                border: `1px solid ${theme.palette.border.main}`,
                minWidth: 200,
              },
            }}
          >
            <MenuItem onClick={() => setToolsAnchor(null)}>
              <ListItemIcon><SearchIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Search Location" />
            </MenuItem>
            <MenuItem onClick={() => setToolsAnchor(null)}>
              <ListItemIcon><FilterIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Filter Data" />
            </MenuItem>
            <MenuItem onClick={() => setToolsAnchor(null)}>
              <ListItemIcon><TimelineIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Time Slider" />
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => setToolsAnchor(null)}>
              <ListItemIcon><DataIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Query Builder" />
            </MenuItem>
            <MenuItem onClick={() => setToolsAnchor(null)}>
              <ListItemIcon><AnalyticsIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Spatial Analysis" />
            </MenuItem>
          </Menu>

          {/* View Menu */}
          <Button
            startIcon={<MapIcon sx={{ fontSize: 18 }} />}
            endIcon={<KeyboardArrowDown sx={{ fontSize: 16 }} />}
            onClick={(e) => setViewAnchor(e.currentTarget)}
            sx={menuButtonStyle}
          >
            VIEW
          </Button>
          <Menu
            anchorEl={viewAnchor}
            open={Boolean(viewAnchor)}
            onClose={() => setViewAnchor(null)}
            PaperProps={{
              sx: {
                bgcolor: isDark ? 'surface.elevated' : 'background.paper',
                border: `1px solid ${theme.palette.border.main}`,
                minWidth: 180,
              },
            }}
          >
            <MenuItem onClick={() => { setViewAnchor(null); toggleFullscreen(); }}>
              <ListItemIcon>
                {isFullscreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
              </ListItemIcon>
              <ListItemText primary={isFullscreen ? "Exit Fullscreen" : "Fullscreen"} />
            </MenuItem>
            <MenuItem onClick={() => { setViewAnchor(null); refreshIframe(); }}>
              <ListItemIcon><RefreshIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Refresh Map" />
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => setViewAnchor(null)}>
              <ListItemIcon><ZoomInIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Zoom In" />
            </MenuItem>
            <MenuItem onClick={() => setViewAnchor(null)}>
              <ListItemIcon><ZoomOutIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Zoom Out" />
            </MenuItem>
            <MenuItem onClick={() => setViewAnchor(null)}>
              <ListItemIcon><MyLocationIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Reset View" />
            </MenuItem>
          </Menu>

          <Box sx={{ flexGrow: 1 }} />

          {/* Status Indicator */}
          <Chip
            icon={
              <FiberManualRecord
                sx={{
                  fontSize: 10,
                  color: loading ? theme.palette.accent.yellow : theme.palette.accent.green,
                  animation: loading ? 'pulse 1s ease-in-out infinite' : 'none',
                  '@keyframes pulse': {
                    '0%, 100%': { opacity: 1 },
                    '50%': { opacity: 0.4 },
                  },
                }}
              />
            }
            label={loading ? 'LOADING' : 'CONNECTED'}
            size="small"
            sx={{
              bgcolor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
              border: `1px solid ${theme.palette.border.main}`,
              fontFamily: monoFontFamily,
              fontSize: '0.65rem',
              fontWeight: 600,
              letterSpacing: '0.05em',
              color: loading ? theme.palette.accent.yellow : theme.palette.accent.green,
              '& .MuiChip-icon': { ml: 1 },
            }}
          />

          <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

          {/* Action Buttons */}
          <Stack direction="row" spacing={0.5}>
            <Tooltip title="Download Data" arrow>
              <IconButton size="small" sx={iconButtonStyle}>
                <DownloadIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Share Map" arrow>
              <IconButton size="small" sx={iconButtonStyle}>
                <ShareIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Settings" arrow>
              <IconButton size="small" sx={iconButtonStyle}>
                <SettingsIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>
      </Paper>

      {/* Iframe Container */}
      <Box
        sx={{
          flexGrow: 1,
          position: 'relative',
          overflow: 'hidden',
          bgcolor: isDark ? '#030712' : '#f1f5f9',
        }}
      >
        {/* Loading Overlay */}
        {loading && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: isDark ? 'rgba(3, 7, 18, 0.9)' : 'rgba(241, 245, 249, 0.9)',
              zIndex: 10,
              gap: 2,
            }}
          >
            <Box
              sx={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CircularProgress
                size={60}
                thickness={2}
                sx={{
                  color: isDark ? theme.palette.accent.cyan : theme.palette.primary.main,
                }}
              />
              <GlobeIcon
                sx={{
                  position: 'absolute',
                  fontSize: 28,
                  color: isDark ? theme.palette.accent.cyan : theme.palette.primary.main,
                  animation: 'spin 3s linear infinite',
                  '@keyframes spin': {
                    '0%': { transform: 'rotate(0deg)' },
                    '100%': { transform: 'rotate(360deg)' },
                  },
                }}
              />
            </Box>
            <Typography
              sx={{
                fontFamily: monoFontFamily,
                fontSize: '0.8rem',
                fontWeight: 600,
                letterSpacing: '0.1em',
                color: isDark ? theme.palette.accent.cyan : theme.palette.primary.main,
              }}
            >
              LOADING ESRI MAP
            </Typography>
            <Typography
              sx={{
                fontFamily: monoFontFamily,
                fontSize: '0.65rem',
                color: 'text.secondary',
                letterSpacing: '0.05em',
              }}
            >
              Establishing connection to GIS services...
            </Typography>
          </Box>
        )}

        {/* ESRI Iframe */}
        <iframe
          id="esri-iframe"
          src={ESRI_URL}
          onLoad={handleIframeLoad}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
          }}
          title="ESRI ArcGIS Integration"
          allow="geolocation; fullscreen"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-downloads"
        />
      </Box>
    </Box>
  );
};

export default ESRIIntegration;
