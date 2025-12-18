import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Box, AppBar, Toolbar, Typography, Button, Stack, Chip } from '@mui/material';
import { Map as MapIcon, Hub as GraphIcon, Description as EvidenceIcon } from '@mui/icons-material';
import ThemeToggle from './ThemeToggle';

const Layout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

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
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#0a0a0a' }}>
      {/* Navigation Bar */}
      <AppBar
        position="static"
        elevation={0}
        sx={{ bgcolor: '#0d0d15', borderBottom: '1px solid #222' }}
      >
        <Toolbar sx={{ gap: 2, px: 3 }}>
          {/* Logo / Title */}
          <Typography
            variant="h6"
            sx={{
              fontWeight: 700,
              background: 'linear-gradient(90deg, #ff9800, #ff5722)',
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
              bgcolor: '#ff980020',
              color: '#ff9800',
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
                  bgcolor: isActive(item.path) ? '#ff9800' : 'transparent',
                  color: isActive(item.path) ? '#000' : '#888',
                  fontWeight: isActive(item.path) ? 700 : 400,
                  fontSize: '0.8rem',
                  px: 2,
                  '&:hover': {
                    bgcolor: isActive(item.path) ? '#ffb74d' : '#ffffff10',
                    color: isActive(item.path) ? '#000' : '#fff',
                  },
                }}
              >
                {item.label}
              </Button>
            ))}
          </Stack>

          <ThemeToggle />
        </Toolbar>
      </AppBar>

      {/* Main Content */}
      <Box component="main" sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </Box>
    </Box>
  );
};

export default Layout;
