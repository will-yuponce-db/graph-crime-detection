import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Stack,
  Chip,
  IconButton,
  Collapse,
  CircularProgress,
  Button,
  Divider,
  useTheme,
  Tooltip,
  Avatar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Slide,
  TextField,
  InputAdornment,
} from '@mui/material';
import type { TransitionProps } from '@mui/material/transitions';
import {
  AutoAwesome,
  ExpandMore,
  ExpandLess,
  Refresh,
  Close,
  Warning,
  Hub,
  Description,
  FlightTakeoff,
  Timeline,
  AccountTree,
  CheckCircle,
  Info,
  TipsAndUpdates,
  Lightbulb,
  OpenInFull,
  Send,
  QuestionAnswer,
  SmartToy,
  Person,
} from '@mui/icons-material';

// Transition component for the modal
const SlideTransition = React.forwardRef(function Transition(
  props: TransitionProps & { children: React.ReactElement },
  ref: React.Ref<unknown>
) {
  return <Slide direction="up" ref={ref} {...props} />;
});
import type { Insight, InsightType, InsightMessage } from '../services/insights';
import { getRiskColor, getConfidenceColor, askInsightFollowup } from '../services/insights';
import { monoFontFamily } from '../theme/theme';

// Icon mapping
const INSIGHT_ICONS: Record<InsightType, React.ReactNode> = {
  hotspot_anomaly: <Warning sx={{ fontSize: 18 }} />,
  entity_relationships: <Hub sx={{ fontSize: 18 }} />,
  case_summary: <Description sx={{ fontSize: 18 }} />,
  handoff_analysis: <FlightTakeoff sx={{ fontSize: 18 }} />,
  timeline_narration: <Timeline sx={{ fontSize: 18 }} />,
  network_patterns: <AccountTree sx={{ fontSize: 18 }} />,
};

const INSIGHT_LABELS: Record<InsightType, string> = {
  hotspot_anomaly: 'HOTSPOT ANALYSIS',
  entity_relationships: 'RELATIONSHIP INTEL',
  case_summary: 'CASE INTELLIGENCE',
  handoff_analysis: 'HANDOFF ANALYSIS',
  timeline_narration: 'TIMELINE INTEL',
  network_patterns: 'NETWORK PATTERNS',
};

interface AIInsightCardProps {
  insight?: Insight | null;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  onDismiss?: () => void;
  compact?: boolean;
  defaultExpanded?: boolean;
  showRawData?: boolean;
}

const AIInsightCard: React.FC<AIInsightCardProps> = ({
  insight,
  loading = false,
  error = null,
  onRefresh,
  onDismiss,
  compact = false,
  defaultExpanded = true,
  showRawData = false,
}) => {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showData, setShowData] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  
  // Chat state for interrogating insights
  const [chatMessages, setChatMessages] = useState<InsightMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const riskColor = insight ? getRiskColor(insight.riskLevel) : '#71717a';
  const confidenceColor = insight ? getConfidenceColor(insight.confidence) : '#71717a';

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current && chatMessages.length > 0) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Reset chat when insight changes
  useEffect(() => {
    setChatMessages([]);
    setChatInput('');
    setChatError(null);
  }, [insight?.generatedAt]);

  const handleOpenModal = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  const handleSendChat = useCallback(async () => {
    if (!chatInput.trim() || !insight || chatLoading) return;

    const question = chatInput.trim();
    setChatInput('');
    setChatError(null);
    setChatLoading(true);

    // Add user message immediately
    const userMessage: InsightMessage = {
      role: 'user',
      content: question,
      timestamp: new Date().toISOString(),
    };
    setChatMessages(prev => [...prev, userMessage]);

    try {
      const response = await askInsightFollowup(insight, question, chatMessages);
      
      // Add assistant response
      const assistantMessage: InsightMessage = {
        role: 'assistant',
        content: response.answer,
        timestamp: response.timestamp,
      };
      setChatMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Failed to get response');
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, insight, chatLoading, chatMessages]);

  const handleChatKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendChat();
    }
  }, [handleSendChat]);

  const isDark = theme.palette.mode === 'dark';

  if (loading) {
    return (
      <Paper
        sx={{
          p: 2,
          bgcolor: isDark
            ? 'rgba(167, 139, 250, 0.08)'
            : 'rgba(139, 92, 246, 0.1)',
          border: 1,
          borderColor: `${theme.palette.accent.purple}40`,
          borderRadius: 2,
          backdropFilter: 'blur(8px)',
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <CircularProgress size={20} sx={{ color: theme.palette.accent.purple }} />
          <Stack spacing={0.25}>
            <Typography 
              variant="body2" 
              sx={{ 
                color: 'text.primary', 
                fontWeight: 600,
                fontFamily: monoFontFamily,
                fontSize: '0.75rem',
                letterSpacing: '0.05em',
              }}
            >
              ANALYZING INTEL...
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              AI is generating insights from your data
            </Typography>
          </Stack>
        </Stack>
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper
        sx={{
          p: 2,
          bgcolor:
            theme.palette.mode === 'dark' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.1)',
          border: 1,
          borderColor: `${theme.palette.accent.red}40`,
          borderRadius: 2,
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Warning sx={{ color: theme.palette.accent.red, fontSize: 20 }} />
            <Typography variant="body2" sx={{ color: theme.palette.accent.red }}>
              {error}
            </Typography>
          </Stack>
          {onRefresh && (
            <IconButton size="small" onClick={onRefresh} sx={{ color: 'text.secondary' }}>
              <Refresh sx={{ fontSize: 18 }} />
            </IconButton>
          )}
        </Stack>
      </Paper>
    );
  }

  if (!insight) {
    return null;
  }

  const icon = INSIGHT_ICONS[insight.type] || <AutoAwesome sx={{ fontSize: 18 }} />;
  const label = INSIGHT_LABELS[insight.type] || 'AI Insight';

  // Full insight modal for expanded view - inlined to prevent re-mounting on re-renders
  const insightModal = (
    <Dialog
      open={modalOpen}
      onClose={handleCloseModal}
      TransitionComponent={SlideTransition}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: isDark ? 'rgba(10, 17, 32, 0.98)' : '#fefefe',
          backgroundImage: isDark
            ? 'linear-gradient(180deg, rgba(167, 139, 250, 0.08) 0%, transparent 100%)'
            : 'linear-gradient(180deg, rgba(139, 92, 246, 0.05) 0%, transparent 100%)',
          borderRadius: 2,
          maxHeight: '90vh',
          border: isDark ? `1px solid ${theme.palette.accent.purple}30` : 'none',
          backdropFilter: 'blur(12px)',
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: 1,
          borderColor: 'border.main',
          pb: 2,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={2}>
          <Avatar
            sx={{
              width: 48,
              height: 48,
              bgcolor: `${theme.palette.accent.purple}20`,
            }}
          >
            <AutoAwesome sx={{ color: theme.palette.accent.purple, fontSize: 28 }} />
          </Avatar>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
              {insight?.title}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
              <Chip
                icon={icon}
                label={label}
                size="small"
                sx={{
                  height: 24,
                  fontSize: '0.75rem',
                  bgcolor: `${theme.palette.accent.purple}15`,
                  color: theme.palette.accent.purple,
                  '& .MuiChip-icon': { color: theme.palette.accent.purple },
                }}
              />
              <Chip
                icon={<CheckCircle sx={{ fontSize: 14 }} />}
                label={insight?.confidence}
                size="small"
                sx={{
                  height: 24,
                  fontSize: '0.75rem',
                  bgcolor: `${confidenceColor}15`,
                  color: confidenceColor,
                  '& .MuiChip-icon': { color: confidenceColor },
                }}
              />
              <Chip
                icon={<Warning sx={{ fontSize: 14 }} />}
                label={insight?.riskLevel}
                size="small"
                sx={{
                  height: 24,
                  fontSize: '0.75rem',
                  bgcolor: `${riskColor}15`,
                  color: riskColor,
                  '& .MuiChip-icon': { color: riskColor },
                }}
              />
            </Stack>
          </Box>
        </Stack>
        <IconButton onClick={handleCloseModal} sx={{ color: 'text.secondary' }}>
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ py: 3 }}>
        {/* Summary Section */}
        <Box sx={{ mb: 4 }}>
          <Typography
            variant="body1"
            sx={{
              color: 'text.primary',
              lineHeight: 1.8,
              fontSize: '1.05rem',
              letterSpacing: '0.01em',
            }}
          >
            {insight?.summary}
          </Typography>
        </Box>

        {/* Key Findings */}
        {insight?.keyFindings && insight.keyFindings.length > 0 && (
          <Box sx={{ mb: 4 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
              <TipsAndUpdates sx={{ color: theme.palette.accent.yellow, fontSize: 24 }} />
              <Typography
                variant="h6"
                sx={{ color: 'text.primary', fontWeight: 600, letterSpacing: 0.5 }}
              >
                Key Findings
              </Typography>
            </Stack>
            <Stack spacing={1.5}>
              {insight.keyFindings.map((finding, idx) => (
                <Paper
                  key={idx}
                  elevation={0}
                  sx={{
                    p: 2,
                    bgcolor: theme.palette.mode === 'dark'
                      ? 'rgba(234, 179, 8, 0.08)'
                      : 'rgba(234, 179, 8, 0.1)',
                    borderLeft: 4,
                    borderColor: theme.palette.accent.yellow,
                    borderRadius: 1,
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{ color: 'text.primary', lineHeight: 1.6, fontSize: '0.95rem' }}
                  >
                    {finding}
                  </Typography>
                </Paper>
              ))}
            </Stack>
          </Box>
        )}

        {/* Recommendations */}
        {insight?.recommendations && insight.recommendations.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
              <Lightbulb sx={{ color: theme.palette.accent.green, fontSize: 24 }} />
              <Typography
                variant="h6"
                sx={{ color: 'text.primary', fontWeight: 600, letterSpacing: 0.5 }}
              >
                Recommendations
              </Typography>
            </Stack>
            <Stack spacing={1.5}>
              {insight.recommendations.map((rec, idx) => (
                <Paper
                  key={idx}
                  elevation={0}
                  sx={{
                    p: 2,
                    bgcolor: theme.palette.mode === 'dark'
                      ? 'rgba(34, 197, 94, 0.08)'
                      : 'rgba(34, 197, 94, 0.1)',
                    borderLeft: 4,
                    borderColor: theme.palette.accent.green,
                    borderRadius: 1,
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{ color: 'text.primary', lineHeight: 1.6, fontSize: '0.95rem' }}
                  >
                    {rec}
                  </Typography>
                </Paper>
              ))}
            </Stack>
          </Box>
        )}

        {/* Data Context (if available) */}
        {showRawData && insight?.dataContext && (
          <Box>
            <Divider sx={{ my: 3, borderColor: 'border.main' }} />
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
              <Info sx={{ color: theme.palette.accent.cyan, fontSize: 20 }} />
              <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>
                Raw Data Context
              </Typography>
            </Stack>
            <Paper
              sx={{
                p: 2,
                bgcolor: 'background.default',
                border: 1,
                borderColor: 'border.main',
                maxHeight: 300,
                overflow: 'auto',
              }}
            >
                <Typography
                  component="pre"
                  sx={{
                    color: 'text.secondary',
                    fontFamily: monoFontFamily,
                    fontSize: '0.8rem',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    m: 0,
                  }}
                >
                {JSON.stringify(insight.dataContext, null, 2)}
              </Typography>
            </Paper>
          </Box>
        )}

        {/* Interactive Q&A Section */}
        <Divider sx={{ my: 3, borderColor: 'border.main' }} />
        <Box>
          <Stack 
            direction="row" 
            alignItems="center" 
            justifyContent="space-between"
            sx={{ mb: 2 }}
          >
            <Stack direction="row" alignItems="center" spacing={1}>
              <QuestionAnswer sx={{ color: theme.palette.accent.cyan, fontSize: 24 }} />
              <Typography
                variant="h6"
                sx={{ color: 'text.primary', fontWeight: 600, letterSpacing: 0.5 }}
              >
                Ask Follow-up Questions
              </Typography>
            </Stack>
            {chatMessages.length > 0 && (
              <Button
                size="small"
                onClick={() => {
                  setChatMessages([]);
                  setChatError(null);
                }}
                sx={{ color: 'text.secondary', fontSize: '0.75rem' }}
              >
                Clear Chat
              </Button>
            )}
          </Stack>
          
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            Interrogate this analysis — ask for clarification, deeper insights, or follow-up questions about specific findings.
          </Typography>

          {/* Chat Messages */}
          {chatMessages.length > 0 && (
            <Paper
              ref={chatContainerRef}
              sx={{
                p: 2,
                mb: 2,
                bgcolor: isDark ? 'rgba(3, 7, 18, 0.5)' : 'rgba(0, 0, 0, 0.02)',
                border: 1,
                borderColor: 'border.main',
                borderRadius: 2,
                maxHeight: 280,
                overflow: 'auto',
              }}
            >
              <Stack spacing={2}>
                {chatMessages.map((msg, idx) => (
                  <Stack
                    key={idx}
                    direction="row"
                    spacing={1.5}
                    sx={{
                      alignItems: 'flex-start',
                      flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                    }}
                  >
                    <Avatar
                      sx={{
                        width: 28,
                        height: 28,
                        bgcolor: msg.role === 'user' 
                          ? `${theme.palette.accent.orange}25`
                          : `${theme.palette.accent.purple}25`,
                      }}
                    >
                      {msg.role === 'user' ? (
                        <Person sx={{ fontSize: 16, color: theme.palette.accent.orange }} />
                      ) : (
                        <SmartToy sx={{ fontSize: 16, color: theme.palette.accent.purple }} />
                      )}
                    </Avatar>
                    <Paper
                      elevation={0}
                      sx={{
                        p: 1.5,
                        maxWidth: '80%',
                        bgcolor: msg.role === 'user'
                          ? `${theme.palette.accent.orange}12`
                          : isDark 
                            ? 'rgba(255, 255, 255, 0.06)'
                            : 'rgba(0, 0, 0, 0.04)',
                        border: 1,
                        borderColor: msg.role === 'user'
                          ? `${theme.palette.accent.orange}30`
                          : 'border.main',
                        borderRadius: 2,
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          color: 'text.primary',
                          whiteSpace: 'pre-wrap',
                          lineHeight: 1.6,
                        }}
                      >
                        {msg.content}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ 
                          color: 'text.secondary', 
                          display: 'block', 
                          mt: 0.5,
                          fontSize: '0.65rem',
                        }}
                      >
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </Typography>
                    </Paper>
                  </Stack>
                ))}
                
                {/* Loading indicator */}
                {chatLoading && (
                  <Stack direction="row" spacing={1.5} alignItems="flex-start">
                    <Avatar
                      sx={{
                        width: 28,
                        height: 28,
                        bgcolor: `${theme.palette.accent.purple}25`,
                      }}
                    >
                      <SmartToy sx={{ fontSize: 16, color: theme.palette.accent.purple }} />
                    </Avatar>
                    <Paper
                      elevation={0}
                      sx={{
                        p: 1.5,
                        bgcolor: isDark 
                          ? 'rgba(255, 255, 255, 0.06)'
                          : 'rgba(0, 0, 0, 0.04)',
                        border: 1,
                        borderColor: 'border.main',
                        borderRadius: 2,
                      }}
                    >
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <CircularProgress size={14} sx={{ color: theme.palette.accent.purple }} />
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                          Thinking...
                        </Typography>
                      </Stack>
                    </Paper>
                  </Stack>
                )}
              </Stack>
            </Paper>
          )}

          {/* Error message */}
          {chatError && (
            <Paper
              sx={{
                p: 1.5,
                mb: 2,
                bgcolor: `${theme.palette.accent.red}10`,
                border: 1,
                borderColor: `${theme.palette.accent.red}30`,
                borderRadius: 1,
              }}
            >
              <Typography variant="body2" sx={{ color: theme.palette.accent.red }}>
                {chatError}
              </Typography>
            </Paper>
          )}

          {/* Chat Input */}
          <TextField
            fullWidth
            multiline
            maxRows={3}
            placeholder="Ask a question about this analysis..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={handleChatKeyDown}
            disabled={chatLoading}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={handleSendChat}
                    disabled={!chatInput.trim() || chatLoading}
                    sx={{
                      color: chatInput.trim() ? theme.palette.accent.purple : 'text.disabled',
                      '&:hover': {
                        bgcolor: `${theme.palette.accent.purple}15`,
                      },
                    }}
                  >
                    <Send sx={{ fontSize: 20 }} />
                  </IconButton>
                </InputAdornment>
              ),
              sx: {
                bgcolor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                borderRadius: 2,
                '& fieldset': {
                  borderColor: `${theme.palette.accent.purple}30`,
                },
                '&:hover fieldset': {
                  borderColor: `${theme.palette.accent.purple}50`,
                },
                '&.Mui-focused fieldset': {
                  borderColor: theme.palette.accent.purple,
                },
              },
            }}
            sx={{
              '& .MuiInputBase-input': {
                fontSize: '0.9rem',
              },
            }}
          />

          {/* Suggested Questions */}
          {chatMessages.length === 0 && (
            <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap' }} useFlexGap>
              {[
                'Explain the main risk factors',
                'What should I prioritize first?',
                'Any patterns I should watch for?',
              ].map((suggestion) => (
                <Chip
                  key={suggestion}
                  label={suggestion}
                  size="small"
                  onClick={() => setChatInput(suggestion)}
                  sx={{
                    cursor: 'pointer',
                    bgcolor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                    border: 1,
                    borderColor: 'border.main',
                    fontSize: '0.75rem',
                    '&:hover': {
                      bgcolor: `${theme.palette.accent.purple}15`,
                      borderColor: `${theme.palette.accent.purple}40`,
                    },
                  }}
                />
              ))}
            </Stack>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, borderTop: 1, borderColor: 'border.main' }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', mr: 'auto' }}>
          Generated {insight && new Date(insight.generatedAt).toLocaleString()}
        </Typography>
        {onRefresh && (
          <Button
            startIcon={<Refresh />}
            onClick={() => {
              handleCloseModal();
              onRefresh();
            }}
            sx={{ color: 'text.secondary' }}
          >
            Regenerate
          </Button>
        )}
        <Button
          variant="contained"
          onClick={handleCloseModal}
          sx={{
            bgcolor: theme.palette.accent.purple,
            '&:hover': { bgcolor: theme.palette.accent.purple, filter: 'brightness(1.1)' },
          }}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );

  if (compact) {
    return (
      <>
        {insightModal}
        <Paper
          sx={{
            p: 1.5,
            bgcolor:
              theme.palette.mode === 'dark'
                ? 'rgba(139, 92, 246, 0.08)'
                : 'rgba(139, 92, 246, 0.1)',
            border: 1,
            borderColor: `${theme.palette.accent.purple}40`,
            borderRadius: 2,
            cursor: 'pointer',
            transition: 'all 0.2s',
            '&:hover': {
              borderColor: theme.palette.accent.purple,
              transform: 'translateY(-1px)',
            },
          }}
          onClick={() => setExpanded(!expanded)}
        >
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Avatar
              sx={{
                width: 28,
                height: 28,
                bgcolor: `${theme.palette.accent.purple}25`,
              }}
            >
              <AutoAwesome sx={{ color: theme.palette.accent.purple, fontSize: 16 }} />
            </Avatar>
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
                {insight.title}
              </Typography>
            </Box>
            <Chip
              label={insight.riskLevel}
              size="small"
              sx={{
                height: 18,
                fontSize: '0.6rem',
                bgcolor: `${riskColor}20`,
                color: riskColor,
              }}
            />
            <Tooltip title="View Full Analysis">
              <IconButton
                size="small"
                onClick={handleOpenModal}
                sx={{
                  color: theme.palette.accent.purple,
                  p: 0.25,
                  '&:hover': { bgcolor: `${theme.palette.accent.purple}20` },
                }}
              >
                <OpenInFull sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <IconButton size="small" sx={{ color: 'text.secondary', p: 0.25 }}>
              {expanded ? <ExpandLess sx={{ fontSize: 16 }} /> : <ExpandMore sx={{ fontSize: 16 }} />}
            </IconButton>
          </Stack>

          <Collapse in={expanded}>
            <Typography
              variant="caption"
              sx={{ color: 'text.secondary', display: 'block', mt: 1, lineHeight: 1.5 }}
            >
              {insight.summary.slice(0, 200)}
              {insight.summary.length > 200 && '...'}
            </Typography>
            <Button
              size="small"
              onClick={handleOpenModal}
              startIcon={<OpenInFull sx={{ fontSize: 14 }} />}
              sx={{
                mt: 1,
                fontSize: '0.7rem',
                color: theme.palette.accent.purple,
                '&:hover': { bgcolor: `${theme.palette.accent.purple}15` },
              }}
            >
              View Full Analysis
            </Button>
          </Collapse>
        </Paper>
      </>
    );
  }

  return (
    <>
      {insightModal}
      <Paper
        sx={{
          bgcolor:
            theme.palette.mode === 'dark' ? 'rgba(139, 92, 246, 0.06)' : 'rgba(139, 92, 246, 0.08)',
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
            bgcolor: `${theme.palette.accent.purple}12`,
            borderBottom: expanded ? 1 : 0,
            borderColor: `${theme.palette.accent.purple}25`,
            cursor: 'pointer',
          }}
          onClick={() => setExpanded(!expanded)}
        >
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <Avatar
                sx={{
                  width: 32,
                  height: 32,
                  bgcolor: `${theme.palette.accent.purple}25`,
                }}
              >
                <AutoAwesome sx={{ color: theme.palette.accent.purple, fontSize: 18 }} />
              </Avatar>
              <Box>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography variant="subtitle2" sx={{ color: 'text.primary', fontWeight: 700 }}>
                    {insight.title}
                  </Typography>
                  <Chip
                    icon={icon}
                    label={label}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.6rem',
                      bgcolor: `${theme.palette.accent.purple}15`,
                      color: theme.palette.accent.purple,
                      '& .MuiChip-icon': { color: theme.palette.accent.purple },
                    }}
                  />
                </Stack>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Generated {new Date(insight.generatedAt).toLocaleTimeString()}
                </Typography>
              </Box>
            </Stack>

            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Tooltip title={`Confidence: ${insight.confidence}`}>
                <Chip
                  icon={<CheckCircle sx={{ fontSize: 12 }} />}
                  label={insight.confidence}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: '0.6rem',
                    bgcolor: `${confidenceColor}15`,
                    color: confidenceColor,
                    '& .MuiChip-icon': { color: confidenceColor },
                  }}
                />
              </Tooltip>
              <Tooltip title={`Risk Level: ${insight.riskLevel}`}>
                <Chip
                  icon={<Warning sx={{ fontSize: 12 }} />}
                  label={insight.riskLevel}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: '0.6rem',
                    bgcolor: `${riskColor}15`,
                    color: riskColor,
                    '& .MuiChip-icon': { color: riskColor },
                  }}
                />
              </Tooltip>
              <Tooltip title="View Full Analysis">
                <IconButton
                  size="small"
                  onClick={handleOpenModal}
                  sx={{
                    color: theme.palette.accent.purple,
                    '&:hover': { bgcolor: `${theme.palette.accent.purple}20` },
                  }}
                >
                  <OpenInFull sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
              {onRefresh && (
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRefresh();
                  }}
                  sx={{ color: 'text.secondary' }}
              >
                <Refresh sx={{ fontSize: 16 }} />
              </IconButton>
            )}
            {onDismiss && (
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss();
                }}
                sx={{ color: 'text.secondary' }}
              >
                <Close sx={{ fontSize: 16 }} />
              </IconButton>
            )}
            <IconButton size="small" sx={{ color: 'text.secondary' }}>
              {expanded ? <ExpandLess sx={{ fontSize: 18 }} /> : <ExpandMore sx={{ fontSize: 18 }} />}
            </IconButton>
          </Stack>
        </Stack>
      </Box>

      {/* Content */}
      <Collapse in={expanded}>
        <Box sx={{ p: 2 }}>
          {/* Summary */}
          <Typography
            variant="body2"
            sx={{ color: 'text.primary', lineHeight: 1.6, mb: 2 }}
          >
            {insight.summary}
          </Typography>

          {/* Key Findings */}
          {insight.keyFindings.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 1 }}>
                <TipsAndUpdates sx={{ color: theme.palette.accent.yellow, fontSize: 16 }} />
                <Typography
                  variant="overline"
                  sx={{ color: 'text.secondary', letterSpacing: 1.5, fontSize: '0.65rem' }}
                >
                  KEY FINDINGS
                </Typography>
              </Stack>
              <Stack spacing={0.75}>
                {insight.keyFindings.map((finding, idx) => (
                  <Stack key={idx} direction="row" alignItems="flex-start" spacing={1}>
                    <Box
                      sx={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        bgcolor: theme.palette.accent.yellow,
                        mt: 0.75,
                        flexShrink: 0,
                      }}
                    />
                    <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.5 }}>
                      {finding}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}

          {/* Recommendations */}
          {insight.recommendations.length > 0 && (
            <Box>
              <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 1 }}>
                <Lightbulb sx={{ color: theme.palette.accent.green, fontSize: 16 }} />
                <Typography
                  variant="overline"
                  sx={{ color: 'text.secondary', letterSpacing: 1.5, fontSize: '0.65rem' }}
                >
                  RECOMMENDATIONS
                </Typography>
              </Stack>
              <Stack spacing={0.75}>
                {insight.recommendations.map((rec, idx) => (
                  <Stack key={idx} direction="row" alignItems="flex-start" spacing={1}>
                    <Box
                      sx={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        bgcolor: theme.palette.accent.green,
                        mt: 0.75,
                        flexShrink: 0,
                      }}
                    />
                    <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.5 }}>
                      {rec}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}

          {/* Debug: Show raw data context */}
          {showRawData && insight.dataContext && (
            <>
              <Divider sx={{ my: 2, borderColor: 'border.main' }} />
              <Box>
                <Button
                  size="small"
                  variant="text"
                  onClick={() => setShowData(!showData)}
                  sx={{ color: 'text.secondary', fontSize: '0.7rem', mb: 1 }}
                >
                  {showData ? 'Hide' : 'Show'} Data Context
                </Button>
                <Collapse in={showData}>
                  <Paper
                    sx={{
                      p: 1.5,
                      bgcolor: 'background.default',
                      border: 1,
                      borderColor: 'border.main',
                      maxHeight: 200,
                      overflow: 'auto',
                    }}
                  >
                    <Typography
                      variant="caption"
                      component="pre"
                      sx={{
                        color: 'text.secondary',
                        fontFamily: 'monospace',
                        fontSize: '0.65rem',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {JSON.stringify(insight.dataContext, null, 2)}
                    </Typography>
                  </Paper>
                </Collapse>
              </Box>
            </>
          )}
        </Box>
      </Collapse>
    </Paper>
    </>
  );
};

export default AIInsightCard;

// ============== Inline Insight Button ==============

interface AIInsightButtonProps {
  label?: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  size?: 'small' | 'medium';
  variant?: 'contained' | 'outlined' | 'text';
}

export const AIInsightButton: React.FC<AIInsightButtonProps> = ({
  label = 'Generate Insight',
  onClick,
  loading = false,
  disabled = false,
  size = 'small',
  variant = 'outlined',
}) => {
  const theme = useTheme();

  return (
    <Button
      variant={variant}
      size={size}
      onClick={onClick}
      disabled={disabled || loading}
      startIcon={
        loading ? (
          <CircularProgress size={14} sx={{ color: theme.palette.accent.purple }} />
        ) : (
          <AutoAwesome sx={{ fontSize: 16 }} />
        )
      }
      sx={{
        borderColor: theme.palette.accent.purple,
        color: theme.palette.accent.purple,
        '&:hover': {
          bgcolor: `${theme.palette.accent.purple}15`,
          borderColor: theme.palette.accent.purple,
        },
        '&.Mui-disabled': {
          borderColor: 'border.main',
          color: 'text.secondary',
        },
      }}
    >
      {loading ? 'Analyzing...' : label}
    </Button>
  );
};

// ============== Inline Insight Chip ==============

interface AIInsightChipProps {
  insight: Insight;
  onClick?: () => void;
}

export const AIInsightChip: React.FC<AIInsightChipProps> = ({ insight, onClick }) => {
  const theme = useTheme();

  return (
    <Chip
      icon={<AutoAwesome sx={{ fontSize: 14 }} />}
      label={insight.title}
      size="small"
      onClick={onClick}
      sx={{
        bgcolor: `${theme.palette.accent.purple}15`,
        color: theme.palette.accent.purple,
        borderColor: `${theme.palette.accent.purple}40`,
        border: 1,
        '& .MuiChip-icon': { color: theme.palette.accent.purple },
        cursor: onClick ? 'pointer' : 'default',
        '&:hover': onClick
          ? {
              bgcolor: `${theme.palette.accent.purple}25`,
            }
          : {},
      }}
    />
  );
};

