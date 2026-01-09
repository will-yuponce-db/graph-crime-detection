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
      cyan: string;
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
      cyan?: string;
    };
  }
}

const getDesignTokens = (mode: PaletteMode): ThemeOptions => ({
  palette: {
    mode,
    ...(mode === 'light'
      ? {
          // Light mode - Clean, high-contrast professional aesthetic
          primary: {
            main: '#0369a1',
            light: '#0284c7',
            dark: '#075985',
            contrastText: '#ffffff',
          },
          secondary: {
            main: '#ea580c',
            light: '#f97316',
            dark: '#c2410c',
          },
          background: {
            default: '#f1f5f9',
            paper: '#ffffff',
          },
          text: {
            primary: '#0f172a',
            secondary: '#475569',
          },
          border: {
            main: '#cbd5e1',
            light: '#e2e8f0',
            dark: '#94a3b8',
          },
          surface: {
            main: '#ffffff',
            elevated: '#f8fafc',
            overlay: 'rgba(255, 255, 255, 0.98)',
          },
          accent: {
            orange: '#ea580c',
            red: '#dc2626',
            blue: '#0369a1',
            green: '#16a34a',
            purple: '#7c3aed',
            yellow: '#ca8a04',
            cyan: '#0891b2',
          },
          divider: '#e2e8f0',
        }
      : {
          // Dark mode - Deep, immersive intelligence aesthetic
          // Inspired by SCIF environments and command centers
          primary: {
            main: '#38bdf8',
            light: '#7dd3fc',
            dark: '#0284c7',
            contrastText: '#0c1222',
          },
          secondary: {
            main: '#fb923c',
            light: '#fdba74',
            dark: '#ea580c',
          },
          background: {
            // Deep blue-black for that surveillance feel
            default: '#030712',
            paper: '#0a1120',
          },
          text: {
            primary: '#f1f5f9',
            secondary: '#94a3b8',
          },
          border: {
            main: '#1e3a5f',
            light: '#2d4a6f',
            dark: '#0d1f3c',
          },
          surface: {
            main: '#0a1120',
            elevated: '#111c32',
            overlay: 'rgba(3, 7, 18, 0.98)',
          },
          accent: {
            // High-visibility accent colors for dark backgrounds
            orange: '#fb923c',
            red: '#f87171',
            blue: '#38bdf8',
            green: '#4ade80',
            purple: '#a78bfa',
            yellow: '#fbbf24',
            cyan: '#22d3ee',
          },
          divider: '#1e3a5f',
        }),
  },
  typography: {
    // IBM Plex Sans - technical, distinctive, excellent for data-heavy interfaces
    fontFamily: [
      '"IBM Plex Sans"',
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'sans-serif',
    ].join(','),
    // Monospace for data elements
    fontWeightLight: 300,
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    fontWeightBold: 600,
    h1: {
      fontSize: '2.25rem',
      fontWeight: 600,
      letterSpacing: '-0.02em',
      lineHeight: 1.2,
    },
    h2: {
      fontSize: '1.875rem',
      fontWeight: 600,
      letterSpacing: '-0.01em',
      lineHeight: 1.25,
    },
    h3: {
      fontSize: '1.5rem',
      fontWeight: 600,
      letterSpacing: '-0.01em',
      lineHeight: 1.3,
    },
    h4: {
      fontSize: '1.25rem',
      fontWeight: 600,
      letterSpacing: '0',
      lineHeight: 1.35,
    },
    h5: {
      fontSize: '1.125rem',
      fontWeight: 600,
      letterSpacing: '0',
      lineHeight: 1.4,
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 600,
      letterSpacing: '0.01em',
      lineHeight: 1.45,
    },
    subtitle1: {
      fontSize: '1rem',
      fontWeight: 500,
      letterSpacing: '0.01em',
    },
    subtitle2: {
      fontSize: '0.875rem',
      fontWeight: 500,
      letterSpacing: '0.01em',
    },
    body1: {
      fontSize: '0.9375rem',
      letterSpacing: '0.01em',
      lineHeight: 1.6,
    },
    body2: {
      fontSize: '0.875rem',
      letterSpacing: '0.01em',
      lineHeight: 1.55,
    },
    caption: {
      fontSize: '0.75rem',
      fontWeight: 500,
      letterSpacing: '0.02em',
      lineHeight: 1.4,
    },
    overline: {
      fontSize: '0.6875rem',
      fontWeight: 600,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      lineHeight: 1.5,
    },
    button: {
      fontWeight: 600,
      letterSpacing: '0.02em',
    },
  },
  shape: {
    borderRadius: 6,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          // Subtle noise texture for depth
          backgroundImage: `radial-gradient(ellipse at top, rgba(56, 189, 248, 0.03) 0%, transparent 50%)`,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 6,
          fontWeight: 600,
          padding: '8px 16px',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          },
        },
        outlined: {
          borderWidth: '1.5px',
          '&:hover': {
            borderWidth: '1.5px',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          backgroundImage: 'none',
          border: '1px solid',
          borderColor: 'var(--mui-palette-border-main)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
        elevation1: {
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)',
        },
        elevation2: {
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.07), 0 2px 4px rgba(0, 0, 0, 0.06)',
        },
        elevation3: {
          boxShadow: '0 10px 15px rgba(0, 0, 0, 0.07), 0 4px 6px rgba(0, 0, 0, 0.05)',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          borderRadius: 4,
          height: 26,
        },
        sizeSmall: {
          height: 22,
          fontSize: '0.7rem',
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          fontSize: '0.75rem',
          fontWeight: 500,
          padding: '6px 12px',
          borderRadius: 4,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 6,
            '& fieldset': {
              borderWidth: '1.5px',
            },
            '&:hover fieldset': {
              borderWidth: '1.5px',
            },
            '&.Mui-focused fieldset': {
              borderWidth: '2px',
            },
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
          border: '1px solid',
          borderColor: 'var(--mui-palette-border-main)',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          letterSpacing: '0.01em',
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 6,
        },
      },
    },
    MuiFab: {
      styleOverrides: {
        root: {
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
          '&:hover': {
            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.3)',
          },
        },
      },
    },
    MuiAvatar: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          fontSize: '0.875rem',
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 500,
        },
      },
    },
    MuiBadge: {
      styleOverrides: {
        badge: {
          fontWeight: 600,
        },
      },
    },
    MuiSlider: {
      styleOverrides: {
        root: {
          '& .MuiSlider-thumb': {
            '&:hover, &.Mui-focusVisible': {
              boxShadow: '0 0 0 8px rgba(56, 189, 248, 0.16)',
            },
          },
        },
      },
    },
  },
});

export const createAppTheme = (mode: PaletteMode) => {
  return createTheme(getDesignTokens(mode));
};

// Monospace font for data displays
export const monoFontFamily = '"IBM Plex Mono", "Fira Code", "Consolas", monospace';

// Helper to get alpha colors
export { alpha };
