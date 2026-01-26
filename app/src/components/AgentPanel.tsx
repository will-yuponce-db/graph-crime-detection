import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Stack,
  Typography,
  IconButton,
  TextField,
  Button,
  Divider,
  Chip,
  CircularProgress,
  Paper,
  useTheme,
  Collapse,
} from '@mui/material';
import { Close, OpenInFull, Send, SmartToy, FiberManualRecord, DragIndicator } from '@mui/icons-material';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import type { AgentMessage, UIAction } from '../agent/actions';
import { executeActions } from '../agent/executeActions';
import { agentStep } from '../services/agent';
import { fetchEvidenceCard } from '../services/api';
import { monoFontFamily } from '../theme/theme';

const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 800;
const MIN_PANEL_HEIGHT = 280;
const MAX_PANEL_HEIGHT = 700;
const DEFAULT_PANEL_WIDTH = 420;
const DEFAULT_PANEL_HEIGHT = 460;

function loadPanelSize() {
  try {
    const stored = window.localStorage.getItem('agentPanelSize');
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        width: clamp(parsed.width || DEFAULT_PANEL_WIDTH, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH),
        height: clamp(parsed.height || DEFAULT_PANEL_HEIGHT, MIN_PANEL_HEIGHT, MAX_PANEL_HEIGHT),
      };
    }
  } catch {
    // ignore
  }
  return { width: DEFAULT_PANEL_WIDTH, height: DEFAULT_PANEL_HEIGHT };
}

function savePanelSize(width: number, height: number) {
  try {
    window.localStorage.setItem('agentPanelSize', JSON.stringify({ width, height }));
  } catch {
    // ignore
  }
}

function newSessionId() {
  return `sess_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function extractCaseId(text: string): string | null {
  // Matches "CASE_TN_005" and also "caseCASE_TN_005" (no space).
  const m = text.match(/case\s*([A-Za-z]{2,10}_[A-Za-z]{2,10}_[0-9]{1,6})/i);
  return m?.[1] || null;
}

export type AgentPanelProps = {
  open: boolean;
  onClose: () => void;
};

const PANEL_POS_STORAGE_KEY = 'copilotPanelPos:v1';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function loadPanelPosition(): { x: number; y: number } | null {
  try {
    const stored = window.localStorage.getItem(PANEL_POS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function savePanelPosition(x: number, y: number) {
  try {
    window.localStorage.setItem(PANEL_POS_STORAGE_KEY, JSON.stringify({ x, y }));
  } catch {
    // ignore
  }
}

const AgentPanel: React.FC<AgentPanelProps> = ({ open, onClose }) => {
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [sessionId, setSessionId] = useState<string>(() => {
    const existing = window.localStorage.getItem('agentSessionId');
    if (existing) return existing;
    const next = newSessionId();
    window.localStorage.setItem('agentSessionId', next);
    return next;
  });

  // Resize state
  const [panelSize, setPanelSize] = useState(loadPanelSize);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef<{ x: number; y: number; width: number; height: number } | null>(
    null
  );

  // Dragging state
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(loadPanelPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);
      resizeStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        width: panelSize.width,
        height: panelSize.height,
      };
    },
    [panelSize]
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeStartRef.current) return;
      const { x, y, width, height } = resizeStartRef.current;
      const deltaX = e.clientX - x;
      const deltaY = e.clientY - y;

      const newWidth = clamp(width + deltaX, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH);
      const newHeight = clamp(height + deltaY, MIN_PANEL_HEIGHT, MAX_PANEL_HEIGHT);

      setPanelSize({ width: newWidth, height: newHeight });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      if (resizeStartRef.current) {
        savePanelSize(panelSize.width, panelSize.height);
      }
      resizeStartRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, panelSize]);

  // Drag handlers
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      // Only start drag if clicking on the header area (not close button)
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      setIsDragging(true);
      
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const currentX = panelPos?.x ?? vw - panelSize.width - 16;
      const currentY = panelPos?.y ?? 80;
      
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        posX: currentX,
        posY: currentY,
      };
    },
    [panelPos, panelSize.width]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const { x, y, posX, posY } = dragStartRef.current;
      const deltaX = e.clientX - x;
      const deltaY = e.clientY - y;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const newX = clamp(posX + deltaX, 0, vw - panelSize.width);
      const newY = clamp(posY + deltaY, 0, vh - panelSize.height);

      setPanelPos({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      if (panelPos) {
        savePanelPosition(panelPos.x, panelPos.y);
      }
      dragStartRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, panelPos, panelSize]);

  // Keep panel on-screen when resizing window
  useEffect(() => {
    const handleWindowResize = () => {
      if (!panelPos) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setPanelPos((prev) => {
        if (!prev) return prev;
        return {
          x: clamp(prev.x, 0, vw - panelSize.width),
          y: clamp(prev.y, 0, vh - panelSize.height),
        };
      });
    };
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [panelSize]);

  const [messages, setMessages] = useState<AgentMessage[]>(() => [
    {
      role: 'assistant',
      content:
        'AI Detective ready. I can help you:\n\n• **Navigate** – open cases, view in network graph\n• **Filter data** – focus on specific cities, time windows\n• **Focus entities** – show connected suspects\n\nTry: "Open case CASE_TN_005" or "Focus on this case in graph"',
      ts: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [latestEvidence, setLatestEvidence] = useState<{
    title: string;
    summary: string;
    recommendedAction: string;
    generatedAt: string;
  } | null>(null);
  const [lastActions, setLastActions] = useState<UIAction[]>([]);

  const suggestedPrompts = useMemo(() => {
    const path = location.pathname;
    const city = searchParams.get('city');
    const entityIds = searchParams.get('entityIds');
    const entityIdList = entityIds ? entityIds.split(',').filter(Boolean) : [];
    const caseId =
      searchParams.get('case_id') || searchParams.get('caseId') || searchParams.get('case');

    if (path === '/' || path === '/heatmap') {
      return [
        city ? `Filter to ${city}` : 'Show hotspots in DC',
        'Open case CASE_TN_005',
        'Go to Network Graph',
      ];
    }
    if (path === '/graph-explorer') {
      if (entityIdList.length >= 1) {
        return [
          'Show everyone connected',
          'Open in Case View',
          city ? `Filter to ${city}` : 'Filter to DC',
        ];
      }
      return [
        'Open case CASE_TN_005',
        city ? `Filter to ${city}` : 'Filter to DC',
        'Go to Heatmap',
      ];
    }
    if (path === '/evidence-card') {
      if (caseId) {
        return [
          `View ${caseId} in network`,
          `View ${caseId} on map`,
          'Go to Network Graph',
        ];
      }
      return [
        'Open case CASE_TN_005',
        'Go to Network Graph',
        'Go to Heatmap',
      ];
    }
    return [
      'Open case CASE_TN_005',
      'Go to Network Graph',
      'Go to Heatmap',
    ];
  }, [location.pathname, searchParams]);

  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Scroll to bottom when opened
    requestAnimationFrame(() => {
      const el = listRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    });
  }, [open]);

  useEffect(() => {
    // If localStorage was cleared mid-session, regenerate deterministically.
    if (sessionId && window.localStorage.getItem('agentSessionId') !== sessionId) {
      window.localStorage.setItem('agentSessionId', sessionId);
    }
  }, [sessionId]);

  const compactHistory = useMemo(
    () =>
      messages.slice(-20).map((m) => ({
        role: m.role,
        content: m.content,
        ts: m.ts,
      })),
    [messages]
  );

  const submit = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setError(null);
    setInput('');
    setLoading(true);
    setLastActions([]);

    const userMsg: AgentMessage = { role: 'user', content: text, ts: Date.now() };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const resp = await agentStep({
        sessionId,
        history: [...compactHistory, { role: 'user', content: text, ts: userMsg.ts }],
        uiContext: { path: location.pathname, search: location.search },
        answer: text,
      });

      const assistantMsg: AgentMessage = {
        role: 'assistant',
        content: resp.assistantMessage || 'Done.',
        ts: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      const actionsFromModel = Array.isArray(resp.actions) ? resp.actions : [];
      let actionsToRun: UIAction[] = actionsFromModel;

      // Fallback: if the model returned no actions but the user provided a case ID, deep-link it.
      if (actionsToRun.length === 0) {
        const caseId = extractCaseId(text);
        if (caseId) {
          actionsToRun = [
            { type: 'navigate', path: '/evidence-card', searchParams: { case_id: caseId } },
          ];
        } else if (/focus\s*(on\s*)?(the\s*)?(this\s*)?case/i.test(text)) {
          // User wants to focus on a case - check if there's one in the URL
          const currentCaseId = searchParams.get('case_id') || searchParams.get('caseId') || searchParams.get('case');
          if (currentCaseId) {
            // Navigate to graph explorer with this case
            actionsToRun = [
              { type: 'navigate', path: '/graph-explorer', searchParams: { caseId: currentCaseId, showLinkedOnly: 'true' } },
            ];
          }
        }
      }

      setLastActions(actionsToRun);

      await executeActions(actionsToRun, {
        navigate,
        currentPath: location.pathname,
        currentSearchParams: searchParams,
        setSearchParams: (next) => setSearchParams(next),
        onGenerateEvidenceCard: async ({ personIds, navigateToEvidenceCard }) => {
          const ids = (personIds || []).filter(Boolean).slice(0, 50);
          if (ids.length === 0) return;

          setEvidenceError(null);
          setEvidenceLoading(true);
          try {
            const card = await fetchEvidenceCard({ personIds: ids });
            setLatestEvidence({
              title: card.title,
              summary: card.summary,
              recommendedAction: card.recommendedAction,
              generatedAt: card.generatedAt,
            });

            if (navigateToEvidenceCard) {
              const sp = new URLSearchParams(location.search);
              sp.set('entityIds', ids.join(','));
              navigate(`/evidence-card?${sp.toString()}`);
            }
          } catch (e) {
            setEvidenceError(e instanceof Error ? e.message : 'Failed to generate evidence card');
          } finally {
            setEvidenceLoading(false);
          }
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Agent request failed');
    } finally {
      setLoading(false);
      requestAnimationFrame(() => {
        const el = listRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
      });
    }
  };

  if (!open) return null;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const margin = 16;
  const panelWidth = Math.min(panelSize.width, vw - margin * 2);
  const panelHeight = Math.min(panelSize.height, vh - margin * 2);

  // Default to top-right corner, offset from navbar
  const left = panelPos?.x ?? vw - panelWidth - margin;
  const top = panelPos?.y ?? 80; // Below navbar

  return (
    <Box
      sx={{
        position: 'fixed',
        left,
        top,
        width: panelWidth,
        height: panelHeight,
        maxWidth: 'calc(100vw - 40px)',
        maxHeight: 'calc(100vh - 32px)',
        zIndex: (t) => t.zIndex.modal + 2,
        display: 'flex',
        flexDirection: 'column',
        pointerEvents: 'auto',
      }}
    >
      <Paper
        elevation={16}
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          border: 1,
          borderColor: theme.palette.mode === 'dark' ? theme.palette.accent.purple + '40' : 'border.main',
          overflow: 'hidden',
          bgcolor: theme.palette.mode === 'dark' ? 'rgba(10, 17, 32, 0.98)' : 'background.paper',
          backdropFilter: 'blur(12px)',
        }}
      >
        <Stack 
          direction="row" 
          alignItems="center" 
          justifyContent="space-between"
          onMouseDown={handleDragStart}
          sx={{ 
            p: 2,
            cursor: isDragging ? 'grabbing' : 'grab',
            userSelect: 'none',
            background: theme.palette.mode === 'dark' 
              ? `linear-gradient(90deg, ${theme.palette.accent.purple}15 0%, transparent 100%)`
              : 'transparent',
          }}
        >
          <Stack direction="row" spacing={1.5} alignItems="center">
            <DragIndicator 
              sx={{ 
                color: 'text.secondary', 
                fontSize: 18, 
                opacity: 0.5,
                mr: -0.5,
              }} 
            />
            <Box sx={{ position: 'relative' }}>
              <SmartToy sx={{ color: theme.palette.accent.purple, fontSize: 24 }} />
              <FiberManualRecord 
                sx={{ 
                  position: 'absolute',
                  bottom: -2,
                  right: -2,
                  fontSize: 8,
                  color: theme.palette.accent.green,
                  animation: 'pulse 2s ease-in-out infinite',
                  '@keyframes pulse': {
                    '0%, 100%': { opacity: 1 },
                    '50%': { opacity: 0.4 },
                  },
                }} 
              />
            </Box>
            <Typography 
              variant="subtitle1" 
              sx={{ 
                fontWeight: 700,
                fontFamily: monoFontFamily,
                fontSize: '0.8rem',
                letterSpacing: '0.05em',
                color: theme.palette.mode === 'dark' ? theme.palette.accent.purple : 'text.primary',
              }}
            >
              AI DETECTIVE
            </Typography>
            <Chip
              label="AI"
              size="small"
              sx={{
                bgcolor: `${theme.palette.accent.cyan}20`,
                color: theme.palette.accent.cyan,
                fontWeight: 700,
                fontFamily: monoFontFamily,
                fontSize: '0.6rem',
                height: 18,
                border: `1px solid ${theme.palette.accent.cyan}40`,
              }}
            />
          </Stack>
          <IconButton onClick={onClose} size="small" sx={{ color: 'text.secondary' }}>
            <Close fontSize="small" />
          </IconButton>
        </Stack>

        <Divider sx={{ borderColor: theme.palette.mode === 'dark' ? theme.palette.accent.purple + '30' : 'border.main' }} />

        <Box
          ref={listRef}
          sx={{
            flex: 1,
            overflow: 'auto',
            p: 2,
            bgcolor: theme.palette.mode === 'dark' ? 'rgba(3, 7, 18, 0.5)' : 'background.default',
          }}
        >
          <Stack spacing={1.5}>
            {suggestedPrompts.length > 0 && (
              <Paper
                sx={{
                  px: 1.5,
                  py: 1.25,
                  border: 1,
                  borderColor: theme.palette.mode === 'dark' ? theme.palette.border.main : 'border.main',
                  bgcolor: theme.palette.mode === 'dark' ? 'rgba(10, 17, 32, 0.6)' : 'background.paper',
                }}
              >
                <Typography 
                  variant="caption" 
                  sx={{ 
                    color: 'text.secondary', 
                    display: 'block',
                    fontFamily: monoFontFamily,
                    fontSize: '0.6rem',
                    letterSpacing: '0.1em',
                  }}
                >
                  SUGGESTIONS
                </Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 0.75, flexWrap: 'wrap' }} useFlexGap>
                  {suggestedPrompts.slice(0, 3).map((p) => (
                    <Chip
                      key={p}
                      label={p}
                      size="small"
                      onClick={() => setInput(p)}
                      sx={{
                        bgcolor:
                          theme.palette.mode === 'dark'
                            ? 'rgba(255,255,255,0.06)'
                            : 'rgba(0,0,0,0.04)',
                        border: 1,
                        borderColor: 'border.main',
                      }}
                    />
                  ))}
                </Stack>
              </Paper>
            )}

            {latestEvidence && (
              <Paper
                sx={{
                  px: 1.5,
                  py: 1.25,
                  border: 1,
                  borderColor: `${theme.palette.accent.purple}55`,
                  bgcolor: `${theme.palette.accent.purple}10`,
                }}
              >
                <Stack spacing={0.75}>
                  <Typography variant="overline" sx={{ letterSpacing: 2, color: 'text.secondary' }}>
                    EVIDENCE SUMMARY
                  </Typography>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {latestEvidence.title}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ color: 'text.secondary', whiteSpace: 'pre-wrap' }}
                  >
                    {latestEvidence.summary}
                  </Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.accent.orange }}>
                    Recommended: {latestEvidence.recommendedAction}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Generated: {new Date(latestEvidence.generatedAt).toLocaleString()}
                  </Typography>
                </Stack>
              </Paper>
            )}

            {(evidenceLoading || evidenceError) && (
              <Paper
                sx={{
                  px: 1.5,
                  py: 1,
                  border: 1,
                  borderColor: 'border.main',
                  bgcolor: 'background.paper',
                }}
              >
                {evidenceLoading ? (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CircularProgress size={16} />
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Generating evidence summary…
                    </Typography>
                  </Stack>
                ) : (
                  <Typography variant="caption" sx={{ color: theme.palette.accent.red }}>
                    {evidenceError}
                  </Typography>
                )}
              </Paper>
            )}

            {messages.map((m) => (
              <Box
                key={`${m.role}-${m.ts}`}
                sx={{
                  display: 'flex',
                  justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <Paper
                  sx={{
                    px: 1.5,
                    py: 1,
                    maxWidth: '85%',
                    bgcolor:
                      m.role === 'user'
                        ? `${theme.palette.accent.orange}22`
                        : theme.palette.mode === 'dark'
                          ? 'rgba(255,255,255,0.06)'
                          : 'rgba(0,0,0,0.04)',
                    border: 1,
                    borderColor: 'border.main',
                  }}
                >
                  {m.role === 'user' ? (
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                      {m.content}
                    </Typography>
                  ) : (
                    <Box
                      sx={{
                        '& p': { 
                          m: 0, 
                          mb: 1,
                          fontSize: '0.875rem',
                          lineHeight: 1.5,
                          '&:last-child': { mb: 0 },
                        },
                        '& strong': { 
                          fontWeight: 700,
                          color: theme.palette.accent.cyan,
                        },
                        '& ul, & ol': { 
                          m: 0, 
                          pl: 2,
                          mb: 1,
                          '&:last-child': { mb: 0 },
                        },
                        '& li': { 
                          fontSize: '0.875rem',
                          lineHeight: 1.5,
                          mb: 0.5,
                          '&:last-child': { mb: 0 },
                        },
                        '& code': {
                          fontFamily: monoFontFamily,
                          fontSize: '0.8rem',
                          bgcolor: theme.palette.mode === 'dark' 
                            ? 'rgba(255,255,255,0.1)' 
                            : 'rgba(0,0,0,0.08)',
                          px: 0.5,
                          py: 0.25,
                          borderRadius: 0.5,
                        },
                        '& h1, & h2, & h3, & h4, & h5, & h6': {
                          m: 0,
                          mb: 1,
                          fontWeight: 700,
                          '&:last-child': { mb: 0 },
                        },
                        '& h1': { fontSize: '1.1rem' },
                        '& h2': { fontSize: '1rem' },
                        '& h3': { fontSize: '0.95rem' },
                      }}
                    >
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </Box>
                  )}
                </Paper>
              </Box>
            ))}

            {error && (
              <Paper
                sx={{
                  px: 1.5,
                  py: 1,
                  border: 1,
                  borderColor: `${theme.palette.accent.red}55`,
                  bgcolor: `${theme.palette.accent.red}10`,
                }}
              >
                <Typography variant="caption" sx={{ color: theme.palette.accent.red }}>
                  {error}
                </Typography>
              </Paper>
            )}
          </Stack>
        </Box>

        <Divider />

        <Box sx={{ p: 2 }}>
          {lastActions.length > 0 && (
            <Paper
              sx={{
                mb: 1.25,
                px: 1.5,
                py: 1,
                border: 1,
                borderColor: 'border.main',
                bgcolor: 'background.paper',
              }}
            >
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                Actions executed
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: 'text.secondary', whiteSpace: 'pre-wrap' }}
              >
                {lastActions.map((a) => JSON.stringify(a)).join('\n')}
              </Typography>
            </Paper>
          )}

          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              fullWidth
              size="small"
              placeholder="Ask or answer…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              disabled={loading}
            />
            <Button
              variant="contained"
              onClick={() => void submit()}
              disabled={loading || !input.trim()}
              sx={{
                bgcolor: theme.palette.accent.purple,
                '&:hover': { bgcolor: '#6d28d9' },
                minWidth: 44,
                px: 1.25,
              }}
            >
              {loading ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <Send />}
            </Button>
          </Stack>

          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button
              size="small"
              variant="text"
              onClick={() => {
                const next = newSessionId();
                window.localStorage.setItem('agentSessionId', next);
                setSessionId(next);
                setMessages((prev) => [
                  ...prev,
                  { role: 'assistant', content: 'Started a new session.', ts: Date.now() },
                ]);
              }}
            >
              New session
            </Button>
          </Stack>
        </Box>

        {/* Resize handle */}
        <Box
          onMouseDown={handleResizeStart}
          sx={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: 20,
            height: 20,
            cursor: 'se-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'text.secondary',
            opacity: 0.5,
            transition: 'opacity 0.15s',
            '&:hover': {
              opacity: 1,
            },
          }}
        >
          <OpenInFull
            sx={{
              fontSize: 12,
              transform: 'rotate(90deg)',
            }}
          />
        </Box>
      </Paper>
    </Box>
  );
};

export default AgentPanel;
