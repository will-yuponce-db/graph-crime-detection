import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Button,
  Stack,
  Chip,
  Fab,
  useTheme,
} from '@mui/material';
import {
  Map as MapIcon,
  Hub as GraphIcon,
  Description as EvidenceIcon,
  SmartToy as SmartToyIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import ThemeToggle from './ThemeToggle';
import AgentPanel from './AgentPanel';

const FAB_SIZE = 56;
const FAB_MARGIN = 20;
const FAB_POS_STORAGE_KEY = 'copilotFabPos:v1';

type FabPos = { x: number; y: number };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

const Layout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const [agentOpen, setAgentOpen] = React.useState(false);
  const [fabPos, setFabPos] = React.useState<FabPos>(() => {
    // Default bottom-right, then try to restore from storage.
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    const fallback = { x: vw - FAB_MARGIN - FAB_SIZE, y: vh - FAB_MARGIN - FAB_SIZE };

    try {
      const raw = window.localStorage.getItem(FAB_POS_STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Partial<FabPos>;
      if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return fallback;
      return parsed as FabPos;
    } catch {
      return fallback;
    }
  });

  const draggingRef = React.useRef(false);
  const pointerIdRef = React.useRef<number | null>(null);
  const startPointerRef = React.useRef<{ x: number; y: number } | null>(null);
  const startFabRef = React.useRef<FabPos | null>(null);
  const didDragRef = React.useRef(false);

  // Keep FAB on-screen on resize.
  React.useEffect(() => {
    const onResize = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setFabPos((p) => ({
        x: clamp(p.x, 0, vw - FAB_SIZE),
        y: clamp(p.y, 0, vh - FAB_SIZE),
      }));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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
            onClick={() => setAgentOpen((v) => !v)}
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

      <AgentPanel
        open={agentOpen}
        onClose={() => setAgentOpen(false)}
        anchor={fabPos}
        fabSize={FAB_SIZE}
      />

      {/* Floating Copilot FAB (non-blocking) */}
      <Fab
        aria-label="Open Copilot"
        onPointerDown={(e) => {
          // Only handle primary button / touch.
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          draggingRef.current = true;
          didDragRef.current = false;
          pointerIdRef.current = e.pointerId;
          startPointerRef.current = { x: e.clientX, y: e.clientY };
          startFabRef.current = fabPos;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!draggingRef.current) return;
          if (pointerIdRef.current !== e.pointerId) return;
          const startPointer = startPointerRef.current;
          const startFab = startFabRef.current;
          if (!startPointer || !startFab) return;

          const dx = e.clientX - startPointer.x;
          const dy = e.clientY - startPointer.y;

          if (!didDragRef.current && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
            didDragRef.current = true;
          }

          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const next = {
            x: clamp(startFab.x + dx, 0, vw - FAB_SIZE),
            y: clamp(startFab.y + dy, 0, vh - FAB_SIZE),
          };
          setFabPos(next);
        }}
        onPointerUp={(e) => {
          if (pointerIdRef.current !== e.pointerId) return;
          draggingRef.current = false;
          pointerIdRef.current = null;
          startPointerRef.current = null;
          startFabRef.current = null;
          try {
            window.localStorage.setItem(FAB_POS_STORAGE_KEY, JSON.stringify(fabPos));
          } catch {
            // ignore
          }
        }}
        onClick={() => {
          // Prevent accidental toggles after a drag.
          if (didDragRef.current) return;
          setAgentOpen((v) => !v);
        }}
        sx={{
          position: 'fixed',
          left: fabPos.x,
          top: fabPos.y,
          bgcolor: theme.palette.accent.purple,
          color: '#fff',
          '&:hover': { bgcolor: '#6d28d9' },
          zIndex: (t) => t.zIndex.modal + 3,
          touchAction: 'none',
        }}
      >
        {agentOpen ? <CloseIcon /> : <SmartToyIcon />}
      </Fab>
    </Box>
  );
};

export default Layout;
