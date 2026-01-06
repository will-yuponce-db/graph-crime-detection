import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Box, AppBar, Toolbar, Typography, Button, Stack, Chip, useTheme } from '@mui/material';
import {
  Map as MapIcon,
  Hub as GraphIcon,
  Description as EvidenceIcon,
  SmartToy as SmartToyIcon,
} from '@mui/icons-material';
import ThemeToggle from './ThemeToggle';
import AgentPanel from './AgentPanel';

const Layout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const [agentOpen, setAgentOpen] = React.useState(false);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/' || location.pathname === '/heatmap';
    return location.pathname === path;
  };

  const navItems = [
    { path: '/', label: 'Hotspot Explorer', icon: <MapIcon /> },
    { path: '/graph-explorer', label: 'Network Analysis', icon: <GraphIcon /> },
    { path: '/evidence-card', label: 'Case View', icon: <EvidenceIcon /> },
  ];

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
      }}
    >
      {/* Navigation Bar */}
      <AppBar
        position="static"
        elevation={0}
        sx={{
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'border.main',
        }}
      >
        <Toolbar sx={{ gap: 2, px: 3 }}>
          {/* Logo / Title */}
          <Typography
            variant="h6"
            sx={{
              fontWeight: 700,
              background: `linear-gradient(90deg, ${theme.palette.accent.orange}, #ff5722)`,
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: 1,
              mr: 2,
            }}
          >
            CROSS-JURISDICTIONAL ANALYTICS
          </Typography>

          <Chip
            label="BETA"
            size="small"
            sx={{
              bgcolor: `${theme.palette.accent.orange}20`,
              color: theme.palette.accent.orange,
              fontWeight: 600,
              fontSize: '0.7rem',
            }}
          />

          {/* Navigation */}
          <Stack direction="row" spacing={0.5} sx={{ flexGrow: 1, ml: 4 }}>
            {navItems.map((item) => (
              <Button
                key={item.path}
                variant={isActive(item.path) ? 'contained' : 'text'}
                startIcon={item.icon}
                onClick={() => navigate(item.path)}
                sx={{
                  bgcolor: isActive(item.path) ? theme.palette.accent.orange : 'transparent',
                  color: isActive(item.path)
                    ? theme.palette.mode === 'dark'
                      ? '#000'
                      : '#fff'
                    : 'text.secondary',
                  fontWeight: isActive(item.path) ? 700 : 400,
                  fontSize: '0.8rem',
                  px: 2,
                  '&:hover': {
                    bgcolor: isActive(item.path)
                      ? theme.palette.primary.light
                      : theme.palette.mode === 'dark'
                        ? 'rgba(255, 255, 255, 0.08)'
                        : 'rgba(0, 0, 0, 0.04)',
                    color: isActive(item.path)
                      ? theme.palette.mode === 'dark'
                        ? '#000'
                        : '#fff'
                      : 'text.primary',
                  },
                }}
              >
                {item.label}
              </Button>
            ))}
          </Stack>

          <Button
            variant="outlined"
            startIcon={<SmartToyIcon />}
            onClick={() => setAgentOpen(true)}
            sx={{
              borderColor: 'border.main',
              color: 'text.secondary',
              fontSize: '0.8rem',
              px: 2,
              '&:hover': {
                borderColor: theme.palette.accent.purple,
                color: theme.palette.accent.purple,
              },
            }}
          >
            Copilot
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

      <AgentPanel open={agentOpen} onClose={() => setAgentOpen(false)} />
    </Box>
  );
};

export default Layout;
