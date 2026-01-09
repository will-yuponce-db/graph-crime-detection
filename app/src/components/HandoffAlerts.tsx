import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Stack,
  Chip,
  Avatar,
  IconButton,
  Collapse,
  Badge,
  CircularProgress,
  useTheme,
  Tooltip,
  Button,
} from '@mui/material';
import {
  FlightTakeoff,
  ExpandMore,
  ExpandLess,
  Warning,
  TrendingFlat,
  Schedule,
  Visibility,
  AutoAwesome,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { fetchHandoffCandidates, type HandoffCandidate } from '../services/api';
import { analyzeHandoffs, type Insight } from '../services/insights';
import AIInsightCard from './AIInsightCard';

interface HandoffAlertsProps {
  onEntityClick?: (entityId: string) => void;
  compact?: boolean;
  maxItems?: number;
}

const HandoffAlerts: React.FC<HandoffAlertsProps> = ({
  onEntityClick,
  compact = false,
  maxItems = 5,
}) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [handoffs, setHandoffs] = useState<HandoffCandidate[]>([]);
  const [expanded, setExpanded] = useState(!compact);

  // AI Handoff Analysis
  const [handoffInsight, setHandoffInsight] = useState<Insight | null>(null);
  const [handoffInsightLoading, setHandoffInsightLoading] = useState(false);
  const [handoffInsightError, setHandoffInsightError] = useState<string | null>(null);

  const generateHandoffInsight = useCallback(async (entityId?: string) => {
    setHandoffInsightLoading(true);
    setHandoffInsightError(null);
    try {
      const insight = await analyzeHandoffs(entityId);
      setHandoffInsight(insight);
    } catch (err) {
      setHandoffInsightError(err instanceof Error ? err.message : 'Failed to analyze handoffs');
    } finally {
      setHandoffInsightLoading(false);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const candidates = await fetchHandoffCandidates();
        setHandoffs(candidates);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load handoff data');
        setHandoffs([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleViewInGraph = (entityId: string) => {
    if (onEntityClick) {
      onEntityClick(entityId);
    } else {
      navigate(`/graph-explorer?entityIds=${entityId}`);
    }
  };

  if (loading) {
    return (
      <Paper
        sx={{
          p: 2,
          bgcolor:
            theme.palette.mode === 'dark' ? 'rgba(251, 146, 60, 0.05)' : 'rgba(251, 146, 60, 0.08)',
          border: 1,
          borderColor: `${theme.palette.accent.orange}30`,
          borderRadius: 2,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <CircularProgress size={16} sx={{ color: theme.palette.accent.orange }} />
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Loading cross-jurisdiction alerts...
          </Typography>
        </Stack>
      </Paper>
    );
  }

  if (error || handoffs.length === 0) {
    if (compact) return null;
    return (
      <Paper
        sx={{
          p: 2,
          bgcolor:
            theme.palette.mode === 'dark'
              ? 'rgba(100, 116, 139, 0.1)'
              : 'rgba(100, 116, 139, 0.08)',
          border: 1,
          borderColor: 'border.main',
          borderRadius: 2,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <FlightTakeoff sx={{ color: 'text.secondary', fontSize: 18 }} />
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {error || 'No cross-jurisdiction handoffs detected'}
          </Typography>
        </Stack>
      </Paper>
    );
  }

  const displayedHandoffs = handoffs.slice(0, maxItems);
  const hasMore = handoffs.length > maxItems;

  return (
    <Paper
      sx={{
        bgcolor:
          theme.palette.mode === 'dark' ? 'rgba(251, 146, 60, 0.08)' : 'rgba(251, 146, 60, 0.1)',
        border: 1,
        borderColor: `${theme.palette.accent.orange}40`,
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 1.5,
          bgcolor: `${theme.palette.accent.orange}15`,
          borderBottom: expanded ? 1 : 0,
          borderColor: `${theme.palette.accent.orange}30`,
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Badge badgeContent={handoffs.length} color="warning">
              <Avatar
                sx={{
                  width: 28,
                  height: 28,
                  bgcolor: `${theme.palette.accent.orange}30`,
                }}
              >
                <FlightTakeoff sx={{ color: theme.palette.accent.orange, fontSize: 16 }} />
              </Avatar>
            </Badge>
            <Box>
              <Typography
                variant="subtitle2"
                sx={{ color: 'text.primary', fontWeight: 700, lineHeight: 1.2 }}
              >
                Cross-Jurisdiction Handoffs
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Suspects detected moving between cities
              </Typography>
            </Box>
          </Stack>
          <IconButton size="small" sx={{ color: 'text.secondary' }}>
            {expanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
        </Stack>
      </Box>

      {/* Content */}
      <Collapse in={expanded}>
        <Stack spacing={1} sx={{ p: 1.5 }}>
          {displayedHandoffs.map((handoff, index) => (
            <Paper
              key={`${handoff.entityId}-${index}`}
              elevation={0}
              sx={{
                p: 1.5,
                bgcolor: 'background.paper',
                border: 1,
                borderColor: 'border.main',
                borderRadius: 1.5,
                transition: 'all 0.2s',
                '&:hover': {
                  borderColor: theme.palette.accent.orange,
                  transform: 'translateX(4px)',
                },
              }}
            >
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flex: 1 }}>
                  <Warning sx={{ color: theme.palette.accent.orange, fontSize: 18 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        color: 'text.primary',
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {handoff.entityName}
                    </Typography>
                    <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.25 }}>
                      <Chip
                        label={handoff.originCity}
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: '0.65rem',
                          bgcolor: `${theme.palette.accent.blue}20`,
                          color: theme.palette.accent.blue,
                        }}
                      />
                      <TrendingFlat sx={{ color: 'text.secondary', fontSize: 16 }} />
                      <Chip
                        label={handoff.destinationCity}
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: '0.65rem',
                          bgcolor: `${theme.palette.accent.green}20`,
                          color: theme.palette.accent.green,
                        }}
                      />
                      {handoff.timeDeltaHours && (
                        <Stack direction="row" alignItems="center" spacing={0.25} sx={{ ml: 1 }}>
                          <Schedule sx={{ fontSize: 12, color: 'text.secondary' }} />
                          <Typography
                            variant="caption"
                            sx={{ color: 'text.secondary', fontSize: '0.6rem' }}
                          >
                            {handoff.timeDeltaHours}h
                          </Typography>
                        </Stack>
                      )}
                    </Stack>
                  </Box>
                </Stack>
                <Tooltip title="View in Network Graph">
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleViewInGraph(handoff.entityId);
                    }}
                    sx={{
                      color: 'text.secondary',
                      '&:hover': { color: theme.palette.accent.orange },
                    }}
                  >
                    <Visibility sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Paper>
          ))}

          {hasMore && (
            <Typography
              variant="caption"
              sx={{
                color: theme.palette.accent.orange,
                textAlign: 'center',
                cursor: 'pointer',
                '&:hover': { textDecoration: 'underline' },
              }}
              onClick={() => navigate('/graph-explorer')}
            >
              +{handoffs.length - maxItems} more handoffs detected →
            </Typography>
          )}

          {/* AI Handoff Analysis */}
          {!compact && (
            <Box sx={{ mt: 1.5 }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography
                  variant="caption"
                  sx={{ color: theme.palette.accent.purple, fontWeight: 600 }}
                >
                  🤖 AI Analysis
                </Typography>
                <Button
                  size="small"
                  variant="text"
                  onClick={() => generateHandoffInsight()}
                  disabled={handoffInsightLoading}
                  startIcon={
                    handoffInsightLoading ? (
                      <CircularProgress size={12} sx={{ color: theme.palette.accent.purple }} />
                    ) : (
                      <AutoAwesome sx={{ fontSize: 14 }} />
                    )
                  }
                  sx={{
                    fontSize: '0.65rem',
                    color: theme.palette.accent.purple,
                    py: 0.25,
                    '&:hover': { bgcolor: `${theme.palette.accent.purple}15` },
                  }}
                >
                  {handoffInsightLoading ? 'Analyzing...' : 'Analyze Patterns'}
                </Button>
              </Stack>

              {(handoffInsight || handoffInsightLoading || handoffInsightError) && (
                <AIInsightCard
                  insight={handoffInsight}
                  loading={handoffInsightLoading}
                  error={handoffInsightError}
                  onRefresh={() => generateHandoffInsight()}
                  onDismiss={() => {
                    setHandoffInsight(null);
                    setHandoffInsightError(null);
                  }}
                  compact
                  defaultExpanded={false}
                />
              )}
            </Box>
          )}
        </Stack>
      </Collapse>
    </Paper>
  );
};

export default HandoffAlerts;

