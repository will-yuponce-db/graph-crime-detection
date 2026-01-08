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
  FlightTakeoff,
  LocationCity,
  Groups,
} from '@mui/icons-material';
import { fetchDashboardStats, type DashboardStats } from '../services/api';

interface StatsCardProps {
  compact?: boolean;
  onStatClick?: (stat: string, value: unknown) => void;
}

const StatsCard: React.FC<StatsCardProps> = ({ compact = false, onStatClick }) => {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);

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
          <CircularProgress size={16} sx={{ color: theme.palette.accent.orange }} />
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Loading statistics...
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
      label: 'Cases',
      subValue: `${stats.activeCases} active`,
      color: theme.palette.accent.orange,
    },
    {
      key: 'suspects',
      icon: <Security sx={{ fontSize: compact ? 16 : 20 }} />,
      value: stats.totalSuspects,
      label: 'Suspects',
      subValue: `${stats.highThreatSuspects} high threat`,
      color: theme.palette.accent.red,
    },
    {
      key: 'colocations',
      icon: <Groups sx={{ fontSize: compact ? 16 : 20 }} />,
      value: stats.totalCoLocations,
      label: 'Co-locations',
      subValue: 'proximity events',
      color: theme.palette.accent.yellow,
    },
    {
      key: 'handoffs',
      icon: <FlightTakeoff sx={{ fontSize: compact ? 16 : 20 }} />,
      value: stats.crossJurisdictionHandoffs,
      label: 'Handoffs',
      subValue: 'cross-city',
      color: theme.palette.accent.purple,
    },
    {
      key: 'cities',
      icon: <LocationCity sx={{ fontSize: compact ? 16 : 20 }} />,
      value: stats.cities.length,
      label: 'Cities',
      subValue: stats.cities.slice(0, 2).join(', '),
      color: theme.palette.accent.blue,
    },
    {
      key: 'loss',
      icon: <AttachMoney sx={{ fontSize: compact ? 16 : 20 }} />,
      value: formatCurrency(stats.totalEstimatedLoss),
      label: 'Est. Loss',
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
        bgcolor:
          theme.palette.mode === 'dark' ? 'rgba(26, 26, 30, 0.8)' : 'rgba(248, 250, 252, 0.8)',
        border: 1,
        borderColor: 'border.main',
        borderRadius: 2,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <TrendingUp sx={{ color: theme.palette.accent.orange, fontSize: 18 }} />
        <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: 1.5 }}>
          Intelligence Summary
        </Typography>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5 }}>
        {statItems.map((item) => (
          <Box
            key={item.key}
            onClick={() => onStatClick?.(item.key, item.value)}
            sx={{
              p: 1.5,
              borderRadius: 1.5,
              bgcolor: `${item.color}10`,
              border: `1px solid ${item.color}25`,
              cursor: onStatClick ? 'pointer' : 'default',
              transition: 'all 0.2s',
              '&:hover': onStatClick
                ? {
                    bgcolor: `${item.color}20`,
                    transform: 'translateY(-2px)',
                  }
                : {},
            }}
          >
            <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.5 }}>
              <Box sx={{ color: item.color }}>{item.icon}</Box>
              <Typography variant="h6" sx={{ color: item.color, fontWeight: 700, lineHeight: 1 }}>
                {item.isFormatted ? item.value : String(item.value)}
              </Typography>
            </Stack>
            <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.2 }}>
              {item.label}
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: item.color, display: 'block', fontSize: '0.6rem', mt: 0.25 }}
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
