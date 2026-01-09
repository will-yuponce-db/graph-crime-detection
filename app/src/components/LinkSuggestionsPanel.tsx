import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Stack,
  Alert,
  CircularProgress,
  Chip,
  IconButton,
  Collapse,
  Divider,
  Tooltip,
  LinearProgress,
  useTheme,
} from '@mui/material';
import {
  LinkOff,
  Link as LinkIcon,
  ExpandMore,
  ExpandLess,
  Check,
  Close,
  Info,
  DeviceHub,
  Person,
  Schedule,
  Group,
  Refresh,
} from '@mui/icons-material';
import {
  fetchLinkSuggestions,
  confirmLinkSuggestion,
  rejectLinkSuggestion,
  type LinkSuggestion,
} from '../services/api';

interface LinkSuggestionsPanelProps {
  onLinkCreated?: () => void;
  compact?: boolean;
  maxItems?: number;
}

const LinkSuggestionsPanel: React.FC<LinkSuggestionsPanelProps> = ({
  onLinkCreated,
  compact = false,
  maxItems = 10,
}) => {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<LinkSuggestion[]>([]);
  const [expanded, setExpanded] = useState(!compact);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(null);

  const loadSuggestions = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchLinkSuggestions();
      setSuggestions(data.slice(0, maxItems));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load suggestions');
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuggestions();
  }, [maxItems]);

  const handleConfirm = async (suggestion: LinkSuggestion) => {
    try {
      setProcessingId(suggestion.id);
      await confirmLinkSuggestion(suggestion.id, suggestion.reason);
      setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
      onLinkCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm link');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (suggestion: LinkSuggestion) => {
    try {
      setProcessingId(suggestion.id);
      await rejectLinkSuggestion(suggestion.id, 'User rejected');
      setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject suggestion');
    } finally {
      setProcessingId(null);
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return theme.palette.success.main;
    if (confidence >= 0.6) return theme.palette.warning.main;
    return theme.palette.error.main;
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return 'High';
    if (confidence >= 0.6) return 'Medium';
    return 'Low';
  };

  if (loading) {
    return (
      <Paper
        sx={{
          p: 2,
          bgcolor: theme.palette.mode === 'dark' ? 'rgba(139, 92, 246, 0.05)' : 'rgba(139, 92, 246, 0.08)',
          border: 1,
          borderColor: `${theme.palette.accent.purple}30`,
          borderRadius: 2,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <CircularProgress size={16} sx={{ color: theme.palette.accent.purple }} />
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Loading link suggestions...
          </Typography>
        </Stack>
      </Paper>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  if (suggestions.length === 0) {
    if (compact) return null;
    return (
      <Paper
        sx={{
          p: 2,
          bgcolor: theme.palette.mode === 'dark' ? 'rgba(34, 197, 94, 0.05)' : 'rgba(34, 197, 94, 0.08)',
          border: 1,
          borderColor: `${theme.palette.success.main}30`,
          borderRadius: 2,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <Check sx={{ color: theme.palette.success.main, fontSize: 18 }} />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            No pending link suggestions
          </Typography>
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper
      sx={{
        bgcolor: theme.palette.mode === 'dark' ? 'rgba(139, 92, 246, 0.05)' : 'rgba(139, 92, 246, 0.08)',
        border: 1,
        borderColor: `${theme.palette.accent.purple}30`,
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          '&:hover': { bgcolor: 'action.hover' },
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <LinkIcon sx={{ color: theme.palette.accent.purple, fontSize: 20 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Suggested Links
          </Typography>
          <Chip
            label={suggestions.length}
            size="small"
            sx={{
              height: 20,
              fontSize: '0.7rem',
              bgcolor: `${theme.palette.accent.purple}30`,
              color: theme.palette.accent.purple,
            }}
          />
        </Stack>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Tooltip title="Refresh suggestions">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                loadSuggestions();
              }}
            >
              <Refresh sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <IconButton size="small">
            {expanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
        </Stack>
      </Box>

      <Collapse in={expanded}>
        <Divider />
        <Stack sx={{ maxHeight: 400, overflow: 'auto' }}>
          {suggestions.map((suggestion, idx) => {
            const isProcessing = processingId === suggestion.id;
            const isExpanded = expandedSuggestion === suggestion.id;

            return (
              <Box key={suggestion.id}>
                {idx > 0 && <Divider />}
                <Box
                  sx={{
                    p: 1.5,
                    opacity: isProcessing ? 0.5 : 1,
                    pointerEvents: isProcessing ? 'none' : 'auto',
                  }}
                >
                  {/* Main row */}
                  <Stack direction="row" alignItems="flex-start" spacing={1.5}>
                    {/* Icon */}
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: 1,
                        bgcolor: `${theme.palette.accent.purple}20`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <DeviceHub sx={{ color: theme.palette.accent.purple, fontSize: 18 }} />
                    </Box>

                    {/* Content */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                          {suggestion.suggestedDeviceId}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          →
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: theme.palette.accent.blue }}>
                          {suggestion.personName}
                        </Typography>
                        {suggestion.personAlias && (
                          <Chip
                            label={`"${suggestion.personAlias}"`}
                            size="small"
                            sx={{
                              height: 18,
                              fontSize: '0.65rem',
                              bgcolor: 'action.hover',
                            }}
                          />
                        )}
                      </Stack>

                      {/* Confidence bar */}
                      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                        <LinearProgress
                          variant="determinate"
                          value={suggestion.confidence * 100}
                          sx={{
                            width: 60,
                            height: 4,
                            borderRadius: 2,
                            bgcolor: 'action.hover',
                            '& .MuiLinearProgress-bar': {
                              bgcolor: getConfidenceColor(suggestion.confidence),
                            },
                          }}
                        />
                        <Typography
                          variant="caption"
                          sx={{ color: getConfidenceColor(suggestion.confidence), fontWeight: 500 }}
                        >
                          {getConfidenceLabel(suggestion.confidence)} ({Math.round(suggestion.confidence * 100)}%)
                        </Typography>
                      </Stack>

                      {/* Evidence summary */}
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        {suggestion.evidence.sharedPartners && (
                          <Tooltip title="Shared co-presence partners">
                            <Chip
                              icon={<Group sx={{ fontSize: 12 }} />}
                              label={`${suggestion.evidence.sharedPartners} partners`}
                              size="small"
                              sx={{ height: 20, fontSize: '0.65rem' }}
                            />
                          </Tooltip>
                        )}
                        {suggestion.evidence.timeDiffMinutes != null && (
                          <Tooltip title="Time between device appearances">
                            <Chip
                              icon={<Schedule sx={{ fontSize: 12 }} />}
                              label={`${suggestion.evidence.timeDiffMinutes} min gap`}
                              size="small"
                              sx={{ height: 20, fontSize: '0.65rem' }}
                            />
                          </Tooltip>
                        )}
                        {suggestion.riskLevel && (
                          <Chip
                            label={suggestion.riskLevel}
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: '0.65rem',
                              bgcolor:
                                suggestion.riskLevel === 'high'
                                  ? `${theme.palette.error.main}20`
                                  : suggestion.riskLevel === 'medium'
                                    ? `${theme.palette.warning.main}20`
                                    : `${theme.palette.success.main}20`,
                              color:
                                suggestion.riskLevel === 'high'
                                  ? theme.palette.error.main
                                  : suggestion.riskLevel === 'medium'
                                    ? theme.palette.warning.main
                                    : theme.palette.success.main,
                            }}
                          />
                        )}
                      </Stack>

                      {/* Expandable details */}
                      <Collapse in={isExpanded}>
                        <Box
                          sx={{
                            mt: 1,
                            p: 1,
                            bgcolor: 'action.hover',
                            borderRadius: 1,
                            fontSize: '0.75rem',
                          }}
                        >
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
                            <strong>Reason:</strong> {suggestion.reason}
                          </Typography>
                          {suggestion.evidence.oldLastSeen && (
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                              <strong>Known device last seen:</strong> {suggestion.evidence.oldLastSeen}
                            </Typography>
                          )}
                          {suggestion.evidence.newFirstSeen && (
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                              <strong>New device first seen:</strong> {suggestion.evidence.newFirstSeen}
                            </Typography>
                          )}
                          {suggestion.knownDeviceId && (
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                              <strong>Based on:</strong> {suggestion.knownDeviceId} (known device)
                            </Typography>
                          )}
                        </Box>
                      </Collapse>
                    </Box>

                    {/* Actions */}
                    <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                      <Tooltip title="View details">
                        <IconButton
                          size="small"
                          onClick={() => setExpandedSuggestion(isExpanded ? null : suggestion.id)}
                        >
                          <Info sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Confirm link">
                        <IconButton
                          size="small"
                          onClick={() => handleConfirm(suggestion)}
                          sx={{
                            color: theme.palette.success.main,
                            '&:hover': { bgcolor: `${theme.palette.success.main}20` },
                          }}
                        >
                          {isProcessing ? (
                            <CircularProgress size={14} color="inherit" />
                          ) : (
                            <Check sx={{ fontSize: 16 }} />
                          )}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Reject suggestion">
                        <IconButton
                          size="small"
                          onClick={() => handleReject(suggestion)}
                          sx={{
                            color: theme.palette.error.main,
                            '&:hover': { bgcolor: `${theme.palette.error.main}20` },
                          }}
                        >
                          <Close sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Stack>
                </Box>
              </Box>
            );
          })}
        </Stack>
      </Collapse>
    </Paper>
  );
};

export default LinkSuggestionsPanel;

