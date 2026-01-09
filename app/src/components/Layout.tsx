import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Button,
  Stack,
  useTheme,
  Tooltip,
} from '@mui/material';
import {
  Map as MapIcon,
  Hub as GraphIcon,
  Description as EvidenceIcon,
  SmartToy as SmartToyIcon,
  FiberManualRecord,
} from '@mui/icons-material';
import ThemeToggle from './ThemeToggle';
import AgentPanel from './AgentPanel';
import { monoFontFamily } from '../theme/theme';

const Layout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const [agentOpen, setAgentOpen] = React.useState(false);

  const isActive = (path: string) => {
    if (path === '/' || path === '/evidence-card') {
      return location.pathname === '/' || location.pathname === '/evidence-card';
    }
    return location.pathname === path;
  };

  const navItems = [
    { path: '/', label: 'Case View', icon: <EvidenceIcon />, shortLabel: 'CASES' },
    { path: '/heatmap', label: 'Hotspot Explorer', icon: <MapIcon />, shortLabel: 'HOTSPOTS' },
    { path: '/graph-explorer', label: 'Network Analysis', icon: <GraphIcon />, shortLabel: 'NETWORK' },
  ];

  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
        // Subtle gradient overlay for depth
        background: isDark
          ? `linear-gradient(180deg, 
              ${theme.palette.background.default} 0%, 
              rgba(10, 17, 32, 1) 50%,
              ${theme.palette.background.default} 100%)`
          : theme.palette.background.default,
      }}
    >
      {/* Navigation Bar */}
      <AppBar
        position="static"
        elevation={0}
        sx={{
          bgcolor: isDark ? 'rgba(10, 17, 32, 0.8)' : 'background.paper',
          backdropFilter: 'blur(12px)',
          borderBottom: 1,
          borderColor: 'border.main',
        }}
      >
        <Toolbar sx={{ gap: 2, px: 3, minHeight: 64 }}>
          {/* Logo / Title */}
          <Stack direction="row" alignItems="center" spacing={1.5}>
            {/* Status indicator */}
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: theme.palette.accent.green,
                boxShadow: `0 0 8px ${theme.palette.accent.green}`,
                animation: 'pulse 2s ease-in-out infinite',
                '@keyframes pulse': {
                  '0%, 100%': { opacity: 1 },
                  '50%': { opacity: 0.5 },
                },
              }}
            />
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                fontFamily: monoFontFamily,
                fontSize: '0.8rem',
                letterSpacing: '0.15em',
                color: isDark ? theme.palette.accent.cyan : theme.palette.primary.main,
                textShadow: isDark ? `0 0 20px ${theme.palette.accent.cyan}40` : 'none',
              }}
            >
              CROSS-JURISDICTIONAL
            </Typography>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                fontFamily: monoFontFamily,
                fontSize: '0.8rem',
                letterSpacing: '0.15em',
                color: isDark ? theme.palette.accent.orange : theme.palette.secondary.main,
              }}
            >
              ANALYTICS
            </Typography>
          </Stack>

          {/* Navigation */}
          <Stack direction="row" spacing={0.5} sx={{ flexGrow: 1, ml: 4 }}>
            {navItems.map((item) => (
              <Tooltip key={item.path} title={item.label} arrow>
                <Button
                  variant={isActive(item.path) ? 'contained' : 'text'}
                  startIcon={item.icon}
                  onClick={() => navigate(item.path)}
                  sx={{
                    bgcolor: isActive(item.path)
                      ? isDark
                        ? theme.palette.accent.cyan
                        : theme.palette.primary.main
                      : 'transparent',
                    color: isActive(item.path)
                      ? isDark
                        ? '#0c1222'
                        : '#fff'
                      : 'text.secondary',
                    fontWeight: isActive(item.path) ? 700 : 500,
                    fontFamily: monoFontFamily,
                    fontSize: '0.7rem',
                    letterSpacing: '0.05em',
                    px: 2,
                    py: 1,
                    borderRadius: 1,
                    boxShadow: isActive(item.path) && isDark
                      ? `0 0 20px ${theme.palette.accent.cyan}40`
                      : 'none',
                    '&:hover': {
                      bgcolor: isActive(item.path)
                        ? isDark
                          ? theme.palette.accent.cyan
                          : theme.palette.primary.dark
                        : isDark
                          ? 'rgba(56, 189, 248, 0.08)'
                          : 'rgba(0, 0, 0, 0.04)',
                      color: isActive(item.path)
                        ? isDark
                          ? '#0c1222'
                          : '#fff'
                        : isDark
                          ? theme.palette.accent.cyan
                          : 'text.primary',
                    },
                    transition: 'all 0.2s ease',
                  }}
                >
                  {item.shortLabel}
                </Button>
              </Tooltip>
            ))}
          </Stack>

          {/* Timestamp display */}
          <Box
            sx={{
              display: { xs: 'none', md: 'flex' },
              alignItems: 'center',
              gap: 1,
              px: 1.5,
              py: 0.5,
              borderRadius: 1,
              bgcolor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
              border: `1px solid ${theme.palette.border.main}`,
            }}
          >
            <FiberManualRecord
              sx={{
                fontSize: 8,
                color: theme.palette.accent.green,
                animation: 'pulse 2s ease-in-out infinite',
              }}
            />
            <Typography
              variant="caption"
              sx={{
                fontFamily: monoFontFamily,
                fontSize: '0.65rem',
                color: 'text.secondary',
                letterSpacing: '0.05em',
              }}
            >
              LIVE FEED
            </Typography>
          </Box>

          <Button
            variant="outlined"
            startIcon={<SmartToyIcon />}
            onClick={() => setAgentOpen((v) => !v)}
            sx={{
              borderColor: isDark ? theme.palette.accent.purple : 'border.main',
              color: isDark ? theme.palette.accent.purple : 'text.secondary',
              fontFamily: monoFontFamily,
              fontSize: '0.7rem',
              letterSpacing: '0.05em',
              px: 2,
              '&:hover': {
                borderColor: theme.palette.accent.purple,
                color: theme.palette.accent.purple,
                bgcolor: `${theme.palette.accent.purple}10`,
              },
            }}
          >
            AI DETECTIVE
          </Button>

          <ThemeToggle />
        </Toolbar>
      </AppBar>

      {/* Main Content */}
      <Box
        component="main"
        sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <Outlet />
      </Box>

      <AgentPanel
        open={agentOpen}
        onClose={() => setAgentOpen(false)}
      />
    </Box>
  );
};

export default Layout;
