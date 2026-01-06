import { createTheme, alpha } from '@mui/material/styles';
import type { ThemeOptions, PaletteMode } from '@mui/material/styles';

// Extend the theme to include custom colors
declare module '@mui/material/styles' {
  interface Palette {
    border: {
      main: string;
      light: string;
      dark: string;
    };
    surface: {
      main: string;
      elevated: string;
      overlay: string;
    };
    accent: {
      orange: string;
      red: string;
      blue: string;
      green: string;
      purple: string;
      yellow: string;
    };
  }
  interface PaletteOptions {
    border?: {
      main?: string;
      light?: string;
      dark?: string;
    };
    surface?: {
      main?: string;
      elevated?: string;
      overlay?: string;
    };
    accent?: {
      orange?: string;
      red?: string;
      blue?: string;
      green?: string;
      purple?: string;
      yellow?: string;
    };
  }
}

const getDesignTokens = (mode: PaletteMode): ThemeOptions => ({
  palette: {
    mode,
    ...(mode === 'light'
      ? {
          // Light mode palette - Clean, professional aesthetic
          primary: {
            main: '#3b82f6',
            light: '#60a5fa',
            dark: '#2563eb',
            contrastText: '#ffffff',
          },
          secondary: {
            main: '#f97316',
            light: '#fb923c',
            dark: '#ea580c',
          },
          background: {
            default: '#f8fafc',
            paper: '#ffffff',
          },
          text: {
            primary: '#0f172a',
            secondary: '#475569',
          },
          border: {
            main: '#e2e8f0',
            light: '#f1f5f9',
            dark: '#cbd5e1',
          },
          surface: {
            main: '#ffffff',
            elevated: '#f8fafc',
            overlay: 'rgba(255, 255, 255, 0.95)',
          },
          accent: {
            orange: '#f97316',
            red: '#ef4444',
            blue: '#3b82f6',
            green: '#22c55e',
            purple: '#8b5cf6',
            yellow: '#eab308',
          },
          divider: '#e2e8f0',
        }
      : {
          // Dark mode palette - Sleek, modern dark aesthetic
          primary: {
            main: '#3b82f6',
            light: '#60a5fa',
            dark: '#2563eb',
            contrastText: '#ffffff',
          },
          secondary: {
            main: '#f97316',
            light: '#fb923c',
            dark: '#ea580c',
          },
          background: {
            default: '#09090b',
            paper: '#18181b',
          },
          text: {
            primary: '#fafafa',
            secondary: '#a1a1aa',
          },
          border: {
            main: '#27272a',
            light: '#3f3f46',
            dark: '#18181b',
          },
          surface: {
            main: '#0f0f12',
            elevated: '#1c1c1f',
            overlay: 'rgba(9, 9, 11, 0.95)',
          },
          accent: {
            orange: '#f97316',
            red: '#ef4444',
            blue: '#3b82f6',
            green: '#22c55e',
            purple: '#a78bfa',
            yellow: '#fbbf24',
          },
          divider: '#27272a',
        }),
  },
  typography: {
    fontFamily: [
      'Inter',
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      'sans-serif',
    ].join(','),
    h1: {
      fontSize: '2.5rem',
      fontWeight: 700,
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 700,
    },
    h3: {
      fontSize: '1.75rem',
      fontWeight: 600,
    },
    h4: {
      fontSize: '1.5rem',
      fontWeight: 600,
    },
    h5: {
      fontSize: '1.25rem',
      fontWeight: 600,
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 600,
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
          fontWeight: 600,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
        },
      },
    },
  },
});

export const createAppTheme = (mode: PaletteMode) => {
  return createTheme(getDesignTokens(mode));
};

// Helper to get alpha colors
export { alpha };
