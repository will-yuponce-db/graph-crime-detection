import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Stack,
  Chip,
  CircularProgress,
  useTheme,
  Tooltip,
} from '@mui/material';
import {
  Folder,
  Security,
  AttachMoney,
  TrendingUp,
  LocationCity,
  Groups,
} from '@mui/icons-material';
import { fetchDashboardStats, type DashboardStats } from '../services/api';
import { monoFontFamily } from '../theme/theme';

interface StatsCardProps {
  compact?: boolean;
  onStatClick?: (stat: string, value: unknown) => void;
}

const StatsCard: React.FC<StatsCardProps> = ({ compact = false, onStatClick }) => {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const isDark = theme.palette.mode === 'dark';

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchDashboardStats();
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load stats');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const formatCurrency = (amount: number): string => {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount}`;
  };

  if (loading) {
    return (
      <Paper sx={{ p: 2, bgcolor: 'background.paper', border: 1, borderColor: 'border.main' }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <CircularProgress size={16} sx={{ color: theme.palette.accent.cyan }} />
          <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: monoFontFamily }}>
            LOADING INTEL...
          </Typography>
        </Stack>
      </Paper>
    );
  }

  if (error || !stats) {
    return (
      <Paper sx={{ p: 2, bgcolor: 'background.paper', border: 1, borderColor: 'border.main' }}>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {error || 'No statistics available'}
        </Typography>
      </Paper>
    );
  }

  const statItems = [
    {
      key: 'cases',
      icon: <Folder sx={{ fontSize: compact ? 16 : 20 }} />,
      value: stats.totalCases,
      label: 'CASES',
      subValue: `${stats.activeCases} active`,
      color: theme.palette.accent.orange,
    },
    {
      key: 'suspects',
      icon: <Security sx={{ fontSize: compact ? 16 : 20 }} />,
      value: stats.totalSuspects,
      label: 'POI',
      subValue: `${stats.highThreatSuspects} high risk`,
      color: theme.palette.accent.red,
    },
    {
      key: 'colocations',
      icon: <Groups sx={{ fontSize: compact ? 16 : 20 }} />,
      value: stats.totalCoLocations,
      label: 'CO-LOC',
      subValue: 'proximity events',
      color: theme.palette.accent.yellow,
    },
    {
      key: 'cities',
      icon: <LocationCity sx={{ fontSize: compact ? 16 : 20 }} />,
      value: stats.cities.length,
      label: 'CITIES',
      subValue: stats.cities.slice(0, 2).join(', '),
      color: isDark ? theme.palette.accent.cyan : theme.palette.accent.blue,
    },
    {
      key: 'loss',
      icon: <AttachMoney sx={{ fontSize: compact ? 16 : 20 }} />,
      value: formatCurrency(stats.totalEstimatedLoss),
      label: 'EST. LOSS',
      subValue: 'total',
      color: theme.palette.accent.green,
      isFormatted: true,
    },
  ];

  if (compact) {
    return (
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {statItems.slice(0, 4).map((item) => (
          <Tooltip key={item.key} title={`${item.label}: ${item.subValue}`}>
            <Chip
              icon={item.icon}
              label={item.isFormatted ? item.value : String(item.value)}
              size="small"
              onClick={() => onStatClick?.(item.key, item.value)}
              sx={{
                bgcolor: `${item.color}15`,
                color: item.color,
                fontFamily: monoFontFamily,
                fontWeight: 600,
                '& .MuiChip-icon': { color: item.color },
                cursor: onStatClick ? 'pointer' : 'default',
              }}
            />
          </Tooltip>
        ))}
      </Stack>
    );
  }

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        bgcolor: isDark ? 'rgba(10, 17, 32, 0.8)' : 'rgba(248, 250, 252, 0.95)',
        backdropFilter: 'blur(8px)',
        border: 1,
        borderColor: 'border.main',
        borderRadius: 2,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <TrendingUp sx={{ color: isDark ? theme.palette.accent.cyan : theme.palette.accent.orange, fontSize: 18 }} />
        <Typography 
          variant="overline" 
          sx={{ 
            color: 'text.secondary', 
            letterSpacing: '0.15em',
            fontFamily: monoFontFamily,
            fontSize: '0.65rem',
          }}
        >
          INTELLIGENCE SUMMARY
        </Typography>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5 }}>
        {statItems.map((item) => (
          <Box
            key={item.key}
            onClick={() => onStatClick?.(item.key, item.value)}
            sx={{
              p: 1.5,
              borderRadius: 1,
              bgcolor: `${item.color}08`,
              border: `1px solid ${item.color}20`,
              cursor: onStatClick ? 'pointer' : 'default',
              transition: 'all 0.2s ease',
              position: 'relative',
              overflow: 'hidden',
              '&::before': {
                content: '""',
                position: 'absolute',
                top: 0,
                left: 0,
                width: '3px',
                height: '100%',
                bgcolor: item.color,
                opacity: 0.6,
              },
              '&:hover': onStatClick
                ? {
                    bgcolor: `${item.color}15`,
                    transform: 'translateY(-2px)',
                    boxShadow: `0 4px 12px ${item.color}20`,
                  }
                : {},
            }}
          >
            <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.5 }}>
              <Box sx={{ color: item.color, opacity: 0.8 }}>{item.icon}</Box>
              <Typography 
                sx={{ 
                  color: item.color, 
                  fontWeight: 700, 
                  lineHeight: 1,
                  fontFamily: monoFontFamily,
                  fontSize: '1.25rem',
                  textShadow: isDark ? `0 0 20px ${item.color}40` : 'none',
                }}
              >
                {item.isFormatted ? item.value : String(item.value)}
              </Typography>
            </Stack>
            <Typography 
              variant="caption" 
              sx={{ 
                color: 'text.secondary', 
                lineHeight: 1.2,
                fontFamily: monoFontFamily,
                fontSize: '0.6rem',
                letterSpacing: '0.1em',
              }}
            >
              {item.label}
            </Typography>
            <Typography
              variant="caption"
              sx={{ 
                color: item.color, 
                display: 'block', 
                fontSize: '0.55rem', 
                mt: 0.25,
                opacity: 0.8,
              }}
            >
              {item.subValue}
            </Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  );
};

export default StatsCard;
