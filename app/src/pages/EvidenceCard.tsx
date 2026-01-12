import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Card,
  CardContent,
  Chip,
  Avatar,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  Badge,
  CircularProgress,
  useTheme,
  TextField,
  Autocomplete,
  MenuItem,
  IconButton,
} from '@mui/material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Description,
  LocationOn,
  Devices,
  Person,
  Add,
  Visibility,
  Hub,
  Schedule,
  Gavel,
  Search,
  TrendingUp,
  Cloud,
  Close,
  Download,
} from '@mui/icons-material';
import {
  createCase,
  updateCaseStatus,
  updateCasePriority,
  USE_DATABRICKS,
  fetchAssignees,
  assignCase,
  fetchCaseDetail,
  fetchEvidenceCard,
  fetchAllCasesProgressive,
} from '../services/api';
import type {
  Assignee,
  CaseLinkedEntity,
  EvidenceCard as EvidenceCardPayload,
  CaseData as ApiCaseData,
} from '../services/api';
import AIInsightCard, { AIInsightButton } from '../components/AIInsightCard';
import { generateCaseSummary, type Insight } from '../services/insights';

type CaseStatus = 'investigating' | 'review' | 'adjudicated';
type CasePriority = 'Low' | 'Medium' | 'High' | 'Critical';

type CaseData = ApiCaseData & {
  priority: CasePriority;
  // Richer summary counts (may be present even if persons/devices arrays are truncated)
  suspectCount?: number;
  deviceCount?: number;
  victimCount?: number | null;
  witnessCount?: number | null;
  poiCount?: number | null;
};

const STATUS_CONFIG = {
  investigating: {
    label: 'Investigating',
    color: '#3b82f6',
    bgColor: '#3b82f620',
    icon: <Search />,
    description: 'Active investigation in progress',
  },
  review: {
    label: 'Under Review',
    color: '#f97316',
    bgColor: '#f9731620',
    icon: <Schedule />,
    description: 'Evidence compiled, pending review',
  },
  adjudicated: {
    label: 'Adjudicated',
    color: '#22c55e',
    bgColor: '#22c55e20',
    icon: <Gavel />,
    description: 'Case closed with decision',
  },
};

const PRIORITY_COLORS: Record<CasePriority, string> = {
  Low: '#71717a',
  Medium: '#eab308',
  High: '#f97316',
  Critical: '#ef4444',
};

const PRIORITY_OPTIONS: CasePriority[] = ['Low', 'Medium', 'High', 'Critical'];

const CaseView: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const theme = useTheme();

  const normalizePriority = useCallback((priority?: string | CasePriority): CasePriority => {
    const value = (priority || '').toLowerCase();
    if (value === 'low') return 'Low';
    if (value === 'high') return 'High';
    if (value === 'critical') return 'Critical';
    return 'Medium';
  }, []);

  const normalizeCase = useCallback(
    (c: ApiCaseData | Partial<ApiCaseData>): CaseData => ({
      ...(c as ApiCaseData),
      status: ((c as ApiCaseData).status || 'investigating') as CaseStatus,
      priority: normalizePriority((c as ApiCaseData).priority),
    }),
    [normalizePriority]
  );
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState<{ loaded: number; total: number | null } | null>(
    null
  );
  const [cases, setCases] = useState<CaseData[]>([]);
  const [selectedCase, setSelectedCase] = useState<CaseData | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [linkedEntitiesLoading, setLinkedEntitiesLoading] = useState(false);
  const [linkedEntitiesError, setLinkedEntitiesError] = useState<string | null>(null);
  const [linkedEntities, setLinkedEntities] = useState<CaseLinkedEntity[]>([]);
  const [newCaseOpen, setNewCaseOpen] = useState(false);
  const [draggedCase, setDraggedCase] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<CaseStatus | null>(null);
  const [newCaseData, setNewCaseData] = useState<{
    title: string;
    neighborhood: string;
    city: string;
    state: string;
    priority: CasePriority;
    description: string;
    estimatedLoss: string;
    assigneeId: string;
  }>({
    title: '',
    neighborhood: '',
    city: '',
    state: '',
    priority: 'Medium',
    description: '',
    estimatedLoss: '',
    assigneeId: '',
  });
  const [assignees, setAssignees] = useState<Assignee[]>([]);

  // Generated evidence summary (from agent deep-link)
  const [generatedEvidenceLoading, setGeneratedEvidenceLoading] = useState(false);
  const [generatedEvidenceError, setGeneratedEvidenceError] = useState<string | null>(null);
  const [generatedEvidence, setGeneratedEvidence] = useState<EvidenceCardPayload | null>(null);

  // AI Case Intelligence
  const [caseInsight, setCaseInsight] = useState<Insight | null>(null);
  const [caseInsightLoading, setCaseInsightLoading] = useState(false);
  const [caseInsightError, setCaseInsightError] = useState<string | null>(null);

  // Generate AI case summary
  const handleGenerateCaseInsight = async (caseId: string) => {
    setCaseInsightLoading(true);
    setCaseInsightError(null);
    try {
      const insight = await generateCaseSummary(caseId);
      setCaseInsight(insight);
    } catch (err) {
      setCaseInsightError(err instanceof Error ? err.message : 'Failed to generate case insight');
    } finally {
      setCaseInsightLoading(false);
    }
  };

  // Fetch cases and assignees from API with progressive loading
  useEffect(() => {
    const loadData = async () => {
      try {
        // Start both fetches - assignees is small, cases uses progressive loading
        const assigneesPromise = fetchAssignees(true);

        // Progressive load all cases
        const casesData = await fetchAllCasesProgressive({
          batchSize: 500,
          onProgress: (progress) => {
            setLoadProgress({ loaded: progress.loaded, total: progress.total });
            // Progressively update cases as batches arrive
            // (already handled by the accumulation in fetchAllCasesProgressive)
          },
        });

        setCases(casesData.map((c) => normalizeCase(c)));

        const assigneesData = await assigneesPromise;
        setAssignees(assigneesData);
      } catch (err) {
        console.error('Failed to fetch data:', err);
      } finally {
        setLoading(false);
        setLoadProgress(null);
      }
    };
    loadData();
  }, [normalizeCase]);

  // Handle URL param for opening specific case
  useEffect(() => {
    const caseId = searchParams.get('case_id');
    if (caseId && cases.length > 0) {
      const found = cases.find((c) => c.id === caseId);
      if (found) {
        setSelectedCase(found);
        setDetailsOpen(true);
      }
    }
  }, [searchParams, cases]);

  // Agent deep-link: if entityIds is present, generate an evidence card summary for those entities.
  useEffect(() => {
    const entityIdsRaw = searchParams.get('entityIds');
    if (!entityIdsRaw) {
      setGeneratedEvidence(null);
      setGeneratedEvidenceError(null);
      setGeneratedEvidenceLoading(false);
      return;
    }

    const ids = entityIdsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 50);

    if (ids.length === 0) return;

    let cancelled = false;
    setGeneratedEvidenceLoading(true);
    setGeneratedEvidenceError(null);

    (async () => {
      try {
        const card = await fetchEvidenceCard({ personIds: ids });
        if (!cancelled) {
          setGeneratedEvidence(card);
        }
      } catch (e) {
        if (!cancelled) {
          setGeneratedEvidence(null);
          setGeneratedEvidenceError(
            e instanceof Error ? e.message : 'Failed to generate evidence summary'
          );
        }
      } finally {
        if (!cancelled) {
          setGeneratedEvidenceLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  // Load richer case detail info when the dialog opens
  useEffect(() => {
    const loadDetails = async () => {
      if (!detailsOpen || !selectedCase?.id) return;
      setLinkedEntitiesLoading(true);
      setLinkedEntitiesError(null);
      try {
        const detail = await fetchCaseDetail(selectedCase.id);
        setLinkedEntities(detail.linkedEntities || []);
      } catch (err) {
        setLinkedEntities([]);
        setLinkedEntitiesError(err instanceof Error ? err.message : 'Failed to load case detail');
      } finally {
        setLinkedEntitiesLoading(false);
      }
    };
    loadDetails();
  }, [detailsOpen, selectedCase?.id]);

  const handleStatusChange = async (caseId: string, newStatus: CaseStatus) => {
    try {
      await updateCaseStatus(caseId, newStatus);
      setCases((prev) =>
        prev.map((c) =>
          c.id === caseId ? { ...c, status: newStatus, updatedAt: new Date().toISOString() } : c
        )
      );
      setSelectedCase((prev) => (prev?.id === caseId ? { ...prev, status: newStatus } : prev));
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const handlePriorityChange = async (caseId: string, newPriority: CasePriority) => {
    try {
      await updateCasePriority(caseId, newPriority);
      setCases((prev) =>
        prev.map((c) =>
          c.id === caseId
            ? {
                ...c,
                priority: normalizePriority(newPriority),
                updatedAt: new Date().toISOString(),
              }
            : c
        )
      );
      setSelectedCase((prev) =>
        prev?.id === caseId ? { ...prev, priority: normalizePriority(newPriority) } : prev
      );
    } catch (err) {
      console.error('Failed to update priority:', err);
    }
  };

  const getCasesByStatus = (status: CaseStatus) => cases.filter((c) => c.status === status);

  // Export cases to CSV
  const exportToCSV = () => {
    const headers = [
      'Case Number',
      'Title',
      'Status',
      'Priority',
      'City',
      'State',
      'Neighborhood',
      'Assigned To',
      'Created',
      'Updated',
    ];
    const rows = cases.map((c) => [
      c.caseNumber,
      c.title,
      c.status,
      c.priority,
      c.city,
      c.state,
      c.neighborhood,
      c.assignedTo,
      new Date(c.createdAt).toLocaleDateString(),
      new Date(c.updatedAt).toLocaleDateString(),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cases_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const renderGeoEvidencePreview = (geoEvidence: unknown) => {
    if (!geoEvidence) {
      return (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          No geo evidence available.
        </Typography>
      );
    }

    if (Array.isArray(geoEvidence)) {
      const items = geoEvidence.slice(0, 3).map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'claim' in (item as Record<string, unknown>)) {
          return String((item as Record<string, unknown>).claim);
        }
        try {
          return JSON.stringify(item);
        } catch {
          return String(item);
        }
      });

      return (
        <Stack spacing={0.5}>
          {items.map((txt, idx) => (
            <Typography key={idx} variant="caption" sx={{ color: 'text.secondary' }}>
              - {txt}
            </Typography>
          ))}
        </Stack>
      );
    }

    if (typeof geoEvidence === 'string') {
      return (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {geoEvidence}
        </Typography>
      );
    }

    try {
      return (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {JSON.stringify(geoEvidence)}
        </Typography>
      );
    } catch {
      return (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {String(geoEvidence)}
        </Typography>
      );
    }
  };

  const handleCreateCase = async () => {
    try {
      const created = await createCase({
        title: newCaseData.title,
        neighborhood: newCaseData.neighborhood,
        city: newCaseData.city,
        state: newCaseData.state,
        priority: newCaseData.priority,
        description: newCaseData.description,
        estimatedLoss: newCaseData.estimatedLoss,
        assigneeId: newCaseData.assigneeId || undefined,
      });

      setCases((prev) => [normalizeCase(created), ...prev]);
      setNewCaseOpen(false);
      setNewCaseData({
        title: '',
        neighborhood: '',
        city: '',
        state: '',
        priority: 'Medium',
        description: '',
        estimatedLoss: '',
        assigneeId: '',
      });
    } catch (err) {
      console.error('Failed to create case:', err);
    }
  };

  const handleAssigneeChange = async (caseId: string, assigneeId: string) => {
    try {
      const result = await assignCase(caseId, assigneeId);
      setCases((prev) =>
        prev.map((c) =>
          c.id === caseId
            ? {
                ...c,
                assignedTo: result.assignee.name,
                assigneeId: result.assignee.id,
                assignee: result.assignee,
                updatedAt: new Date().toISOString(),
              }
            : c
        )
      );
      // Update selected case if it's currently open
      if (selectedCase?.id === caseId) {
        setSelectedCase((prev) =>
          prev
            ? {
                ...prev,
                assignedTo: result.assignee.name,
                assigneeId: result.assignee.id,
                assignee: result.assignee,
              }
            : null
        );
      }
    } catch (err) {
      console.error('Failed to change assignee:', err);
    }
  };

  const CaseCard: React.FC<{ caseData: CaseData }> = ({ caseData }) => {
    const priority = normalizePriority(caseData.priority);

    return (
      <Card
        draggable
        onDragStart={(e) => {
          setDraggedCase(caseData.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragEnd={() => {
          setDraggedCase(null);
          setDragOverColumn(null);
        }}
        sx={{
          mb: 1.5,
          bgcolor: 'background.paper',
          border: 1,
          borderColor: `${PRIORITY_COLORS[priority]}40`,
          borderLeft: `4px solid ${PRIORITY_COLORS[priority]}`,
          cursor: 'grab',
          transition: 'all 0.2s',
          opacity: draggedCase === caseData.id ? 0.5 : 1,
          '&:hover': {
            borderColor: theme.palette.accent.orange,
            transform: 'translateY(-2px)',
          },
          '&:active': {
            cursor: 'grabbing',
          },
        }}
        onClick={() => {
          setSelectedCase(caseData);
          setDetailsOpen(true);
        }}
      >
        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <Box>
              <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 600 }}>
                {caseData.caseNumber}
              </Typography>
              {caseData.title && (
                <Typography
                  variant="caption"
                  sx={{
                    color: 'text.primary',
                    display: 'block',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    lineHeight: 1.3,
                  }}
                >
                  {caseData.title}
                </Typography>
              )}
              <Typography
                variant="caption"
                sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.3 }}
              >
                {caseData.neighborhood}
              </Typography>
            </Box>
            <Stack alignItems="flex-end" spacing={0.5}>
              <Chip
                label={priority}
                size="small"
                sx={{
                  height: 18,
                  fontSize: '0.65rem',
                  bgcolor: `${PRIORITY_COLORS[priority]}20`,
                  color: PRIORITY_COLORS[priority],
                  fontWeight: 700,
                  letterSpacing: '0.03em',
                }}
              />
            </Stack>
          </Stack>

          <Stack direction="row" spacing={2} sx={{ mt: 1.5 }}>
            <Tooltip title="Persons of Interest">
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Person sx={{ fontSize: 14, color: theme.palette.accent.red }} />
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {typeof caseData.suspectCount === 'number'
                    ? caseData.suspectCount
                    : caseData.persons?.length || 0}
                </Typography>
              </Stack>
            </Tooltip>
            <Tooltip title="Devices">
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Devices sx={{ fontSize: 14, color: theme.palette.accent.orange }} />
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {typeof caseData.deviceCount === 'number'
                    ? caseData.deviceCount
                    : caseData.devices?.length || 0}
                </Typography>
              </Stack>
            </Tooltip>
            <Tooltip title="Locations">
              <Stack direction="row" spacing={0.5} alignItems="center">
                <LocationOn sx={{ fontSize: 14, color: theme.palette.accent.blue }} />
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  1
                </Typography>
              </Stack>
            </Tooltip>
          </Stack>

          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
            {caseData.assignedTo || 'Unassigned'} •{' '}
            {formatDate(caseData.updatedAt || caseData.createdAt)}
          </Typography>
        </CardContent>
      </Card>
    );
  };

  const StatusColumn: React.FC<{ status: CaseStatus }> = ({ status }) => {
    const config = STATUS_CONFIG[status];
    const statusCases = getCasesByStatus(status);

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverColumn(status);
    };

    const handleDragLeave = () => {
      setDragOverColumn(null);
    };

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      if (draggedCase) {
        const caseToMove = cases.find((c) => c.id === draggedCase);
        if (caseToMove && caseToMove.status !== status) {
          handleStatusChange(draggedCase, status);
        }
      }
      setDraggedCase(null);
      setDragOverColumn(null);
    };

    return (
      <Box
        sx={{ flex: 1, minWidth: 280 }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Paper
          sx={{
            p: 1.5,
            mb: 2,
            bgcolor: dragOverColumn === status ? `${config.color}30` : config.bgColor,
            border: 2,
            borderColor: dragOverColumn === status ? config.color : `${config.color}40`,
            borderRadius: 2,
            borderStyle: dragOverColumn === status ? 'dashed' : 'solid',
            transition: 'all 0.2s',
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1}>
            <Avatar sx={{ bgcolor: config.color, width: 28, height: 28 }}>
              {React.cloneElement(config.icon, { sx: { fontSize: 16 } })}
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2" sx={{ color: 'text.primary', fontWeight: 700 }}>
                {config.label}
              </Typography>
            </Box>
            <Badge
              badgeContent={statusCases.length}
              color="primary"
              sx={{ '& .MuiBadge-badge': { bgcolor: config.color } }}
            />
          </Stack>
        </Paper>

        <Box sx={{ maxHeight: 'calc(100vh - 280px)', overflow: 'auto', pr: 1, minHeight: 100 }}>
          {statusCases.map((c) => (
            <CaseCard key={c.id} caseData={c} />
          ))}
          {statusCases.length === 0 && (
            <Typography
              variant="body2"
              sx={{ color: 'text.secondary', textAlign: 'center', py: 4 }}
            >
              {dragOverColumn === status ? 'Drop here' : 'No cases'}
            </Typography>
          )}
        </Box>
      </Box>
    );
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: '80vh',
          bgcolor: 'background.default',
          gap: 2,
        }}
      >
        <CircularProgress
          variant={loadProgress?.total ? 'determinate' : 'indeterminate'}
          value={loadProgress?.total ? (loadProgress.loaded / loadProgress.total) * 100 : 0}
          size={56}
          sx={{ color: theme.palette.accent.orange }}
        />
        {loadProgress && (
          <Stack spacing={0.5} alignItems="center">
            <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              Loading cases...
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {loadProgress.loaded} cases loaded
              {loadProgress.total ? ` of ${loadProgress.total}` : ''}
            </Typography>
          </Stack>
        )}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: 'calc(100vh - 64px)',
        bgcolor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          borderRadius: 0,
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'border.main',
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Stack direction="row" alignItems="center" spacing={2}>
            <Avatar sx={{ bgcolor: theme.palette.accent.orange }}>
              <Description />
            </Avatar>
            <Box>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="h5" sx={{ color: 'text.primary', fontWeight: 700 }}>
                  Case Management
                </Typography>
                {USE_DATABRICKS && (
                  <Chip
                    icon={<Cloud sx={{ fontSize: 14 }} />}
                    label="Databricks"
                    size="small"
                    sx={{
                      bgcolor: `${theme.palette.accent.orange}20`,
                      color: theme.palette.accent.orange,
                      '& .MuiChip-icon': { color: theme.palette.accent.orange },
                    }}
                  />
                )}
              </Stack>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {cases.length} total cases • Click to view details
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={2}>
            <Chip
              icon={<TrendingUp />}
              label={`${getCasesByStatus('investigating').length} Active`}
              sx={{
                bgcolor: `${theme.palette.accent.blue}20`,
                color: theme.palette.accent.blue,
                '& .MuiChip-icon': { color: theme.palette.accent.blue },
              }}
            />
            <Button
              variant="outlined"
              startIcon={<Download />}
              onClick={exportToCSV}
              sx={{ borderColor: 'border.main', color: 'text.secondary' }}
            >
              Export CSV
            </Button>
            <Button
              variant="outlined"
              startIcon={<Add />}
              onClick={() => setNewCaseOpen(true)}
              sx={{ borderColor: 'border.main', color: 'text.secondary' }}
            >
              New Case
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {(generatedEvidenceLoading || generatedEvidenceError || generatedEvidence) && (
        <Paper
          elevation={0}
          sx={{
            p: 2,
            borderRadius: 0,
            bgcolor: 'background.paper',
            borderBottom: 1,
            borderColor: 'border.main',
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: 2 }}>
                GENERATED EVIDENCE SUMMARY
              </Typography>

              {generatedEvidenceLoading && (
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                  <CircularProgress size={16} sx={{ color: theme.palette.accent.orange }} />
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    Generating…
                  </Typography>
                </Stack>
              )}

              {generatedEvidenceError && (
                <Typography variant="body2" sx={{ mt: 0.5, color: theme.palette.accent.red }}>
                  {generatedEvidenceError}
                </Typography>
              )}

              {generatedEvidence && (
                <Stack spacing={0.75} sx={{ mt: 0.5 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {generatedEvidence.title}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ color: 'text.secondary', whiteSpace: 'pre-wrap' }}
                  >
                    {generatedEvidence.summary}
                  </Typography>
                  <Typography variant="body2" sx={{ color: theme.palette.accent.orange }}>
                    Recommended: {generatedEvidence.recommendedAction}
                  </Typography>
                </Stack>
              )}
            </Box>

            <IconButton
              onClick={() => {
                const next = new URLSearchParams(searchParams.toString());
                next.delete('entityIds');
                setSearchParams(next);
              }}
              sx={{ mt: 0.25 }}
            >
              <Close />
            </IconButton>
          </Stack>
        </Paper>
      )}

      {/* Kanban Board */}
      <Box sx={{ flex: 1, p: 3, display: 'flex', gap: 3, overflow: 'auto' }}>
        <StatusColumn status="investigating" />
        <StatusColumn status="review" />
        <StatusColumn status="adjudicated" />
      </Box>

      {/* Case Detail Dialog */}
      <Dialog
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: 'background.paper',
            border: 1,
            borderColor: 'border.main',
          },
        }}
      >
        {selectedCase && (
          <>
            <DialogTitle
              sx={{
                bgcolor: 'background.default',
                borderBottom: 1,
                borderColor: 'border.main',
                pb: 2,
              }}
            >
              <Stack spacing={1.5}>
                {/* Row 1: Crime Type (Most Important) */}
                <Box sx={{ textAlign: 'center' }}>
                  <Typography
                    variant="h4"
                    sx={{
                      color: 'text.primary',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      lineHeight: 1.2,
                    }}
                  >
                    {selectedCase.title || 'Unknown Crime Type'}
                  </Typography>
                </Box>

                {/* Row 2: Estimated Loss (2nd Most Important) */}
                {selectedCase.estimatedLoss && (
                  <Box
                    sx={{
                      textAlign: 'center',
                      py: 1.5,
                      px: 3,
                      bgcolor: `${theme.palette.accent.red}15`,
                      borderRadius: 2,
                      border: `2px solid ${theme.palette.accent.red}40`,
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        color: theme.palette.accent.red,
                        fontWeight: 600,
                        letterSpacing: '0.1em',
                        display: 'block',
                        mb: 0.5,
                      }}
                    >
                      ESTIMATED LOSS
                    </Typography>
                    <Typography
                      variant="h3"
                      sx={{
                        color: theme.palette.accent.red,
                        fontWeight: 800,
                      }}
                    >
                      ${selectedCase.estimatedLoss.toLocaleString()}
                    </Typography>
                  </Box>
                )}

                {/* Row 3: Case Number & Meta Info */}
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  sx={{ pt: 1 }}
                >
                  <Stack direction="row" alignItems="center" spacing={1.5}>
                    <Avatar
                      sx={{ bgcolor: PRIORITY_COLORS[selectedCase.priority], width: 36, height: 36 }}
                    >
                      <Description sx={{ fontSize: 18 }} />
                    </Avatar>
                    <Typography variant="body1" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                      {selectedCase.caseNumber}
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={1}>
                    <Chip
                      label={selectedCase.priority.toUpperCase()}
                      sx={{
                        bgcolor: `${PRIORITY_COLORS[selectedCase.priority]}20`,
                        color: PRIORITY_COLORS[selectedCase.priority],
                        fontWeight: 700,
                      }}
                    />
                    <Chip
                      label={STATUS_CONFIG[selectedCase.status].label}
                      sx={{
                        bgcolor: STATUS_CONFIG[selectedCase.status].bgColor,
                        color: STATUS_CONFIG[selectedCase.status].color,
                      }}
                    />
                  </Stack>
                </Stack>
              </Stack>
            </DialogTitle>
            <DialogContent sx={{ mt: 2 }}>
              <Stack spacing={3}>
                {/* 3rd: AI Case Intelligence */}
                <Box
                  sx={{
                    bgcolor: `${theme.palette.accent.purple}08`,
                    border: `1px solid ${theme.palette.accent.purple}30`,
                    borderRadius: 2,
                    p: 2,
                  }}
                >
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    sx={{ mb: 1 }}
                  >
                    <Typography
                      variant="subtitle1"
                      sx={{
                        color: theme.palette.accent.purple,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                      }}
                    >
                      🤖 AI CASE INTELLIGENCE
                    </Typography>
                    <AIInsightButton
                      label="Analyze Case"
                      onClick={() => handleGenerateCaseInsight(selectedCase.id)}
                      loading={caseInsightLoading}
                      size="small"
                    />
                  </Stack>

                  {(caseInsight || caseInsightLoading || caseInsightError) && (
                    <AIInsightCard
                      insight={caseInsight}
                      loading={caseInsightLoading}
                      error={caseInsightError}
                      onRefresh={() => handleGenerateCaseInsight(selectedCase.id)}
                      onDismiss={() => {
                        setCaseInsight(null);
                        setCaseInsightError(null);
                      }}
                      defaultExpanded={true}
                    />
                  )}

                  {!caseInsight && !caseInsightLoading && !caseInsightError && (
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      Generate an AI-powered executive summary of this case with risk assessment and
                      recommendations.
                    </Typography>
                  )}
                </Box>

                {/* 4th: Change Status */}
                <Box>
                  <Typography
                    variant="caption"
                    sx={{ color: 'text.secondary', mb: 1, display: 'block', fontWeight: 600 }}
                  >
                    CHANGE STATUS
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    {(['investigating', 'review', 'adjudicated'] as CaseStatus[]).map((status) => (
                      <Button
                        key={status}
                        variant="outlined"
                        size="small"
                        startIcon={React.cloneElement(STATUS_CONFIG[status].icon, {
                          sx: { fontSize: 16 },
                        })}
                        onClick={() => {
                          handleStatusChange(selectedCase.id, status);
                          setSelectedCase((prev) => (prev ? { ...prev, status } : null));
                        }}
                        sx={{
                          flex: 1,
                          py: 1,
                          bgcolor:
                            selectedCase.status === status
                              ? STATUS_CONFIG[status].color
                              : 'transparent',
                          borderColor: STATUS_CONFIG[status].color,
                          color:
                            selectedCase.status === status ? '#fff' : STATUS_CONFIG[status].color,
                          '&:hover': {
                            bgcolor:
                              selectedCase.status === status
                                ? STATUS_CONFIG[status].color
                                : `${STATUS_CONFIG[status].color}20`,
                            borderColor: STATUS_CONFIG[status].color,
                          },
                        }}
                      >
                        {STATUS_CONFIG[status].label}
                      </Button>
                    ))}
                  </Stack>
                </Box>

                {/* Details: Location & Meta */}
                <Box>
                  <Typography
                    variant="caption"
                    sx={{ color: 'text.secondary', mb: 1, display: 'block', fontWeight: 600 }}
                  >
                    CASE DETAILS
                  </Typography>
                  <Stack direction="row" spacing={4} flexWrap="wrap" useFlexGap>
                    <Box>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        LOCATION
                      </Typography>
                      <Typography variant="body1" sx={{ color: 'text.primary' }}>
                        {selectedCase.neighborhood}, {selectedCase.city}, {selectedCase.state}
                      </Typography>
                    </Box>
                    <Box sx={{ minWidth: 180 }}>
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}
                      >
                        ASSIGNED TO
                      </Typography>
                      {assignees.length > 0 ? (
                        <Autocomplete
                          size="small"
                          fullWidth
                          options={assignees}
                          value={
                            assignees.find((a) => a.id === selectedCase.assigneeId) ||
                            assignees.find((a) => a.name === 'Analyst Team') ||
                            assignees[0] ||
                            null
                          }
                          onChange={(_, value) => {
                            const fallbackId =
                              assignees.find((a) => a.name === 'Analyst Team')?.id ||
                              assignees[0]?.id ||
                              '';
                            handleAssigneeChange(selectedCase.id, value?.id || fallbackId);
                          }}
                          getOptionLabel={(option) => option?.name || ''}
                          isOptionEqualToValue={(option, value) => option.id === value.id}
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              placeholder="Search assignees"
                              sx={{ '& .MuiInputBase-input': { py: 0.75, fontSize: '0.875rem' } }}
                            />
                          )}
                          renderOption={(props, option) => (
                            <Box component="li" {...props} key={option.id}>
                              <Stack direction="row" alignItems="center" spacing={1}>
                                <Avatar
                                  sx={{
                                    width: 20,
                                    height: 20,
                                    fontSize: '0.7rem',
                                    bgcolor: theme.palette.accent.blue,
                                  }}
                                >
                                  {option.name.charAt(0)}
                                </Avatar>
                                <Typography variant="body2">{option.name}</Typography>
                              </Stack>
                            </Box>
                          )}
                        />
                      ) : (
                        <Typography variant="body1" sx={{ color: 'text.primary' }}>
                          {selectedCase.assignedTo || 'Unassigned'}
                        </Typography>
                      )}
                    </Box>
                    <Box>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        CREATED
                      </Typography>
                      <Typography variant="body1" sx={{ color: 'text.primary' }}>
                        {new Date(selectedCase.createdAt).toLocaleDateString()}
                      </Typography>
                    </Box>
                    <Box sx={{ minWidth: 180 }}>
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}
                      >
                        PRIORITY
                      </Typography>
                      <TextField
                        select
                        size="small"
                        value={selectedCase.priority}
                        onChange={(e) =>
                          handlePriorityChange(selectedCase.id, e.target.value as CasePriority)
                        }
                        fullWidth
                        sx={{
                          '& .MuiSelect-select': { py: 0.75, fontWeight: 600 },
                        }}
                      >
                        {PRIORITY_OPTIONS.map((p) => (
                          <MenuItem key={p} value={p}>
                            <Stack direction="row" alignItems="center" spacing={1}>
                              <Box
                                sx={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: '50%',
                                  bgcolor: PRIORITY_COLORS[p],
                                }}
                              />
                              <Typography variant="body2">{p}</Typography>
                            </Stack>
                          </MenuItem>
                        ))}
                      </TextField>
                    </Box>
                  </Stack>

                  {/* Description */}
                  {selectedCase.description && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        DESCRIPTION
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                        {selectedCase.description}
                      </Typography>
                    </Box>
                  )}
                </Box>

                {/* KPIs / Stats */}
                <Box>
                  <Typography
                    variant="caption"
                    sx={{ color: 'text.secondary', mb: 1, display: 'block', fontWeight: 600 }}
                  >
                    KEY METRICS
                  </Typography>
                  <Stack direction="row" spacing={2}>
                    <Card
                      sx={{
                        flex: 1,
                        bgcolor: 'background.default',
                        border: 1,
                        borderColor: 'border.main',
                      }}
                    >
                      <CardContent sx={{ textAlign: 'center', py: 2 }}>
                        <Person sx={{ color: theme.palette.accent.red, fontSize: 32 }} />
                        <Typography variant="h4" sx={{ color: 'text.primary', fontWeight: 700 }}>
                          {typeof selectedCase.suspectCount === 'number'
                            ? selectedCase.suspectCount
                            : selectedCase.persons?.length || 0}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          Suspects
                        </Typography>
                      </CardContent>
                    </Card>
                    <Card
                      sx={{
                        flex: 1,
                        bgcolor: 'background.default',
                        border: 1,
                        borderColor: 'border.main',
                      }}
                    >
                      <CardContent sx={{ textAlign: 'center', py: 2 }}>
                        <Devices sx={{ color: theme.palette.accent.orange, fontSize: 32 }} />
                        <Typography variant="h4" sx={{ color: 'text.primary', fontWeight: 700 }}>
                          {typeof selectedCase.deviceCount === 'number'
                            ? selectedCase.deviceCount
                            : selectedCase.devices?.length || 0}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          Devices
                        </Typography>
                      </CardContent>
                    </Card>
                    <Card
                      sx={{
                        flex: 1,
                        bgcolor: 'background.default',
                        border: 1,
                        borderColor: 'border.main',
                      }}
                    >
                      <CardContent sx={{ textAlign: 'center', py: 2 }}>
                        <LocationOn sx={{ color: theme.palette.accent.blue, fontSize: 32 }} />
                        <Typography variant="h4" sx={{ color: 'text.primary', fontWeight: 700 }}>
                          1
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          Locations
                        </Typography>
                      </CardContent>
                    </Card>
                  </Stack>
                </Box>

                {/* Linked entities (LAST) */}
                <Box>
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    sx={{ mb: 1 }}
                  >
                    <Typography
                      variant="caption"
                      sx={{ color: 'text.secondary', fontWeight: 600 }}
                    >
                      LINKED ENTITIES
                    </Typography>
                    {linkedEntitiesLoading && (
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Loading…
                      </Typography>
                    )}
                  </Stack>

                  {linkedEntitiesError && (
                    <Typography variant="caption" sx={{ color: theme.palette.accent.red }}>
                      {linkedEntitiesError}
                    </Typography>
                  )}

                  {!linkedEntitiesLoading &&
                    !linkedEntitiesError &&
                    linkedEntities.length === 0 && (
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        No linked entities found for this case.
                      </Typography>
                    )}

                  <Stack spacing={1.5}>
                    {linkedEntities.slice(0, 6).map((e) => (
                      <Paper
                        key={e.id}
                        elevation={0}
                        sx={{
                          p: 1.5,
                          bgcolor: 'background.default',
                          border: 1,
                          borderColor: 'border.main',
                        }}
                      >
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
                          <Avatar
                            sx={{ width: 28, height: 28, bgcolor: `${theme.palette.accent.red}20` }}
                          >
                            <Person sx={{ fontSize: 16, color: theme.palette.accent.red }} />
                          </Avatar>
                          <Box sx={{ flex: 1 }}>
                            <Typography
                              variant="body2"
                              sx={{ color: 'text.primary', fontWeight: 600 }}
                            >
                              {e.name}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                              {e.id}
                            </Typography>
                          </Box>
                          {typeof e.overlapScore === 'number' && (
                            <Chip
                              label={`Overlap ${e.overlapScore.toFixed(2)}`}
                              size="small"
                              sx={{ height: 18, fontSize: '0.6rem' }}
                            />
                          )}
                          {e.threatLevel && (
                            <Chip
                              label={`Threat ${e.threatLevel}`}
                              size="small"
                              sx={{
                                height: 18,
                                fontSize: '0.6rem',
                                bgcolor:
                                  (e.threatLevel || '').toLowerCase() === 'high'
                                    ? `${theme.palette.accent.red}20`
                                    : `${theme.palette.accent.orange}20`,
                                color:
                                  (e.threatLevel || '').toLowerCase() === 'high'
                                    ? theme.palette.accent.red
                                    : theme.palette.accent.orange,
                              }}
                            />
                          )}
                        </Stack>

                        {Array.isArray(e.linkedCities) && e.linkedCities.length > 0 && (
                          <Stack
                            direction="row"
                            spacing={0.5}
                            sx={{ mb: 0.75 }}
                            flexWrap="wrap"
                            useFlexGap
                          >
                            {e.linkedCities.slice(0, 3).map((city) => (
                              <Chip
                                key={city}
                                icon={<LocationOn sx={{ fontSize: 12 }} />}
                                label={city}
                                size="small"
                                sx={{ height: 18, fontSize: '0.6rem' }}
                              />
                            ))}
                            {e.linkedCities.length > 3 && (
                              <Chip
                                label={`+${e.linkedCities.length - 3}`}
                                size="small"
                                sx={{ height: 18, fontSize: '0.6rem' }}
                              />
                            )}
                          </Stack>
                        )}

                        <Box sx={{ mt: 0.5 }}>
                          <Typography
                            variant="caption"
                            sx={{ color: 'text.secondary', display: 'block', mb: 0.25 }}
                          >
                            WHY LINKED (GEO EVIDENCE)
                          </Typography>
                          {renderGeoEvidencePreview(e.geoEvidence)}
                        </Box>
                      </Paper>
                    ))}
                  </Stack>
                </Box>
              </Stack>
            </DialogContent>
            <DialogActions sx={{ p: 2, borderTop: 1, borderColor: 'border.main' }}>
              <Button onClick={() => setDetailsOpen(false)} sx={{ color: 'text.secondary' }}>
                Close
              </Button>
              <Button
                variant="outlined"
                startIcon={<Visibility />}
                onClick={() => navigate(`/?case=${selectedCase.caseNumber}`)}
                sx={{ borderColor: 'border.main', color: 'text.secondary' }}
              >
                View on Map
              </Button>
              <Button
                variant="contained"
                startIcon={<Hub />}
                onClick={() => {
                  const ids =
                    linkedEntities.length > 0
                      ? linkedEntities.map((e) => e.id).slice(0, 12)
                      : (selectedCase.persons || []).map((p) => p.id).slice(0, 12);
                  const params = new URLSearchParams();
                  params.set('caseId', selectedCase.id);
                  params.set('caseNumber', selectedCase.caseNumber);
                  params.set('caseStatus', selectedCase.status);
                  params.set('caseTitle', selectedCase.title);
                  if (selectedCase.city) params.set('city', selectedCase.city);
                  if (ids.length > 0) params.set('entityIds', ids.join(','));
                  params.set('showLinkedOnly', 'true'); // Focus on linked entities
                  params.set('focusLinked', 'true'); // Auto-expand to all connected entities
                  navigate(`/graph-explorer?${params.toString()}`);
                }}
                sx={{
                  bgcolor: theme.palette.accent.orange,
                  '&:hover': { bgcolor: theme.palette.primary.light },
                }}
              >
                View in Network
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* New Case Dialog */}
      <Dialog
        open={newCaseOpen}
        onClose={() => setNewCaseOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: 'background.paper',
            border: 1,
            borderColor: 'border.main',
          },
        }}
      >
        <DialogTitle
          sx={{
            bgcolor: 'background.default',
            borderBottom: 1,
            borderColor: 'border.main',
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" alignItems="center" spacing={2}>
              <Avatar sx={{ bgcolor: theme.palette.accent.orange }}>
                <Add />
              </Avatar>
              <Typography variant="h6" sx={{ color: 'text.primary' }}>
                Create New Case
              </Typography>
            </Stack>
            <IconButton onClick={() => setNewCaseOpen(false)} sx={{ color: 'text.secondary' }}>
              <Close />
            </IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Stack spacing={2.5}>
            <TextField
              label="Case Title"
              fullWidth
              value={newCaseData.title}
              onChange={(e) => setNewCaseData({ ...newCaseData, title: e.target.value })}
              placeholder="e.g., burglary - Georgetown"
              size="small"
            />
            <Stack direction="row" spacing={2}>
              <TextField
                label="Neighborhood"
                fullWidth
                value={newCaseData.neighborhood}
                onChange={(e) => setNewCaseData({ ...newCaseData, neighborhood: e.target.value })}
                placeholder="e.g., 1423 Wisconsin Ave NW"
                size="small"
              />
              <TextField
                label="City"
                fullWidth
                value={newCaseData.city}
                onChange={(e) => setNewCaseData({ ...newCaseData, city: e.target.value })}
                placeholder="e.g., Washington"
                size="small"
              />
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField
                label="State"
                fullWidth
                value={newCaseData.state}
                onChange={(e) => setNewCaseData({ ...newCaseData, state: e.target.value })}
                placeholder="e.g., DC"
                size="small"
              />
              <TextField
                select
                label="Priority"
                fullWidth
                value={newCaseData.priority}
                onChange={(e) =>
                  setNewCaseData({
                    ...newCaseData,
                    priority: normalizePriority(e.target.value),
                  })
                }
                size="small"
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <MenuItem key={p} value={p}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Box
                        sx={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          bgcolor: PRIORITY_COLORS[p],
                        }}
                      />
                      <Typography variant="body2">{p}</Typography>
                    </Stack>
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField
                label="Estimated Loss ($)"
                fullWidth
                value={newCaseData.estimatedLoss}
                onChange={(e) => setNewCaseData({ ...newCaseData, estimatedLoss: e.target.value })}
                placeholder="e.g., 15000"
                size="small"
                type="number"
              />
              <Autocomplete
                fullWidth
                size="small"
                options={assignees}
                value={assignees.find((a) => a.id === newCaseData.assigneeId) || null}
                onChange={(_, value) =>
                  setNewCaseData({ ...newCaseData, assigneeId: value?.id || '' })
                }
                getOptionLabel={(option) => option?.name || ''}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                clearOnEscape
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Assign To (searchable)"
                    placeholder="Analyst Team (Default)"
                    size="small"
                  />
                )}
                renderOption={(props, option) => (
                  <Box component="li" {...props} key={option.id}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Avatar
                        sx={{
                          width: 20,
                          height: 20,
                          fontSize: '0.7rem',
                          bgcolor: theme.palette.accent.blue,
                        }}
                      >
                        {option.name.charAt(0)}
                      </Avatar>
                      <Box>
                        <Typography variant="body2">{option.name}</Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {option.role}
                        </Typography>
                      </Box>
                    </Stack>
                  </Box>
                )}
                noOptionsText="No assignees"
              />
            </Stack>
            <TextField
              label="Description"
              fullWidth
              multiline
              rows={3}
              value={newCaseData.description}
              onChange={(e) => setNewCaseData({ ...newCaseData, description: e.target.value })}
              placeholder="Describe the incident..."
              size="small"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: 1, borderColor: 'border.main' }}>
          <Button onClick={() => setNewCaseOpen(false)} sx={{ color: 'text.secondary' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleCreateCase}
            disabled={!newCaseData.neighborhood || !newCaseData.city}
            sx={{
              bgcolor: theme.palette.accent.orange,
              '&:hover': { bgcolor: theme.palette.primary.light },
            }}
          >
            Create Case
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CaseView;
