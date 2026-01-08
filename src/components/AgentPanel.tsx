import React, { useEffect, useMemo, useRef, useState } from 'react';
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
} from '@mui/material';
import { Close, Send, SmartToy } from '@mui/icons-material';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { AgentMessage, UIAction } from '../agent/actions';
import { executeActions } from '../agent/executeActions';
import { agentStep } from '../services/agent';
import { fetchEvidenceCard } from '../services/api';

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
  /**
   * Screen-space (viewport) anchor for positioning the panel.
   * Typically the top-left of the FAB.
   */
  anchor?: { x: number; y: number };
  fabSize?: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

const AgentPanel: React.FC<AgentPanelProps> = ({ open, onClose, anchor, fabSize = 56 }) => {
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

  const [messages, setMessages] = useState<AgentMessage[]>(() => [
    {
      role: 'assistant',
      content:
        'Investigation Copilot ready. Ask a question like: “Show me suspects tied to DC and highlight the top entities.”',
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
    const hour = searchParams.get('hour');
    const entityIds = searchParams.get('entityIds');
    const caseId =
      searchParams.get('case_id') || searchParams.get('caseId') || searchParams.get('case');

    if (path === '/' || path === '/heatmap') {
      return [
        city && hour
          ? `Show hotspots in ${city} at hour ${hour}`
          : 'Show hotspots in DC at hour 18',
        'Continue investigation in Network Analysis for the top entities',
        caseId ? `Open case ${caseId}` : 'Open case CASE_TN_005',
      ];
    }
    if (path === '/graph-explorer') {
      return [
        city
          ? `Focus entities in ${city} and show only co-location edges`
          : 'Show only co-location edges',
        entityIds
          ? 'Generate an evidence summary for these focused entities'
          : 'Select the top 5 suspects and generate a summary',
        'Take me to Case View for the most linked case',
      ];
    }
    return [
      'Open case CASE_TN_005',
      'Generate an evidence summary for top suspects',
      'Go to Network Analysis and focus DC entities',
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
  const desiredPanelWidth = 420;
  const panelWidth = Math.min(desiredPanelWidth, vw - margin * 2);
  const desiredMaxPanelHeight = 460; // keep it visually close to the FAB
  const desiredMinPanelHeight = 280;

  // Default to bottom-right if no anchor is provided.
  const anchorX = anchor?.x ?? vw - margin - fabSize;
  const anchorY = anchor?.y ?? vh - margin - fabSize;

  const gap = 12;

  // Prefer positioning beside the FAB (left/right) when possible to keep it "close".
  const availableRight = vw - (anchorX + fabSize + gap) - margin;
  const availableLeft = anchorX - gap - margin;
  const canRight = availableRight >= panelWidth;
  const canLeft = availableLeft >= panelWidth;
  const openRight = canRight && (!canLeft || availableRight >= availableLeft);

  const left = (() => {
    if (openRight) return anchorX + fabSize + gap;
    if (canLeft) return anchorX - gap - panelWidth;
    // Fallback: center-ish around the FAB, clamped.
    return clamp(anchorX + fabSize / 2 - panelWidth / 2, margin, vw - panelWidth - margin);
  })();

  // Prefer above the FAB; if there isn't enough room, open below.
  const availableAbove = anchorY - gap - margin;
  const availableBelow = vh - (anchorY + fabSize + gap) - margin;
  const canAbove = availableAbove >= desiredMinPanelHeight;
  const canBelow = availableBelow >= desiredMinPanelHeight;
  const openBelow = canBelow && (!canAbove || availableBelow > availableAbove);

  const maxPanelHeight = (() => {
    const available = openBelow ? availableBelow : availableAbove;
    return Math.max(desiredMinPanelHeight, Math.min(desiredMaxPanelHeight, available));
  })();

  const top = (() => {
    const rawTop = openBelow ? anchorY + fabSize + gap : anchorY - gap - maxPanelHeight;
    return clamp(rawTop, margin, vh - maxPanelHeight - margin);
  })();

  return (
    <Box
      sx={{
        position: 'fixed',
        left,
        top,
        width: panelWidth,
        maxWidth: 'calc(100vw - 40px)',
        maxHeight: maxPanelHeight,
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
          borderColor: 'border.main',
          overflow: 'hidden',
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <SmartToy sx={{ color: theme.palette.accent.purple }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Investigation Copilot
            </Typography>
            <Chip
              label="beta"
              size="small"
              sx={{
                bgcolor: `${theme.palette.accent.purple}20`,
                color: theme.palette.accent.purple,
                fontWeight: 700,
              }}
            />
          </Stack>
          <IconButton onClick={onClose}>
            <Close />
          </IconButton>
        </Stack>

        <Divider />

        <Box
          ref={listRef}
          sx={{
            flex: 1,
            overflow: 'auto',
            p: 2,
            bgcolor: 'background.default',
          }}
        >
          <Stack spacing={1.5}>
            {suggestedPrompts.length > 0 && (
              <Paper
                sx={{
                  px: 1.5,
                  py: 1.25,
                  border: 1,
                  borderColor: 'border.main',
                  bgcolor: 'background.paper',
                }}
              >
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                  Suggestions
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
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {m.content}
                  </Typography>
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
      </Paper>
    </Box>
  );
};

export default AgentPanel;
