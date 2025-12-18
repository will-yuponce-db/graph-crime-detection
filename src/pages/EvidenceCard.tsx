import React, { useState, useEffect } from 'react';
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
} from '@mui/material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Description,
  LocationOn,
  Devices,
  Person,
  Add,
  Visibility,
  Schedule,
  Gavel,
  Search,
  TrendingUp,
} from '@mui/icons-material';

type CaseStatus = 'investigating' | 'review' | 'adjudicated';

interface CaseData {
  id: string;
  caseNumber: string;
  title: string;
  city: string;
  state: string;
  neighborhood: string;
  status: CaseStatus;
  priority: string;
  createdAt: string;
  updatedAt: string;
  assignedTo: string;
  estimatedLoss?: number;
  description?: string;
  persons?: { id: string; name: string; alias?: string }[];
  devices?: { id: string; name: string }[];
}

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

const PRIORITY_COLORS: Record<string, string> = {
  Low: '#71717a',
  Medium: '#eab308',
  High: '#f97316',
  Critical: '#ef4444',
};

const CaseView: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<CaseData[]>([]);
  const [selectedCase, setSelectedCase] = useState<CaseData | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Fetch cases from API
  useEffect(() => {
    const fetchCases = async () => {
      try {
        const res = await fetch('/api/demo/cases');
        const data = await res.json();
        if (data.success) {
          setCases(
            data.cases.map((c: CaseData) => ({
              ...c,
              status: c.status as CaseStatus,
            }))
          );
        }
      } catch (err) {
        console.error('Failed to fetch cases:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchCases();
  }, []);

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

  const handleStatusChange = async (caseId: string, newStatus: CaseStatus) => {
    try {
      await fetch(`/api/demo/cases/${caseId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      setCases((prev) =>
        prev.map((c) =>
          c.id === caseId ? { ...c, status: newStatus, updatedAt: new Date().toISOString() } : c
        )
      );
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const getCasesByStatus = (status: CaseStatus) => cases.filter((c) => c.status === status);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const CaseCard: React.FC<{ caseData: CaseData }> = ({ caseData }) => (
    <Card
      sx={{
        mb: 1.5,
        bgcolor: '#18181b',
        border: `1px solid ${caseData.priority === 'Critical' ? '#ef444440' : '#27272a'}`,
        cursor: 'pointer',
        transition: 'all 0.2s',
        '&:hover': { borderColor: '#f97316', transform: 'translateY(-2px)' },
      }}
      onClick={() => {
        setSelectedCase(caseData);
        setDetailsOpen(true);
      }}
    >
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600 }}>
              {caseData.caseNumber}
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: '#71717a', display: 'block', lineHeight: 1.3 }}
            >
              {caseData.neighborhood}
            </Typography>
          </Box>
          <Stack alignItems="flex-end" spacing={0.5}>
            <Chip
              label={caseData.priority}
              size="small"
              sx={{
                height: 18,
                fontSize: '0.65rem',
                bgcolor: `${PRIORITY_COLORS[caseData.priority]}20`,
                color: PRIORITY_COLORS[caseData.priority],
              }}
            />
          </Stack>
        </Stack>

        <Stack direction="row" spacing={2} sx={{ mt: 1.5 }}>
          <Tooltip title="Suspects">
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Person sx={{ fontSize: 14, color: '#ef4444' }} />
              <Typography variant="caption" sx={{ color: '#71717a' }}>
                {caseData.persons?.length || 0}
              </Typography>
            </Stack>
          </Tooltip>
          <Tooltip title="Devices">
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Devices sx={{ fontSize: 14, color: '#f97316' }} />
              <Typography variant="caption" sx={{ color: '#71717a' }}>
                {caseData.devices?.length || 0}
              </Typography>
            </Stack>
          </Tooltip>
          <Tooltip title="Locations">
            <Stack direction="row" spacing={0.5} alignItems="center">
              <LocationOn sx={{ fontSize: 14, color: '#3b82f6' }} />
              <Typography variant="caption" sx={{ color: '#71717a' }}>
                1
              </Typography>
            </Stack>
          </Tooltip>
        </Stack>

        <Typography variant="caption" sx={{ color: '#52525b', display: 'block', mt: 1 }}>
          {caseData.assignedTo || 'Unassigned'} •{' '}
          {formatDate(caseData.updatedAt || caseData.createdAt)}
        </Typography>
      </CardContent>
    </Card>
  );

  const StatusColumn: React.FC<{ status: CaseStatus }> = ({ status }) => {
    const config = STATUS_CONFIG[status];
    const statusCases = getCasesByStatus(status);

    return (
      <Box sx={{ flex: 1, minWidth: 280 }}>
        <Paper
          sx={{
            p: 1.5,
            mb: 2,
            bgcolor: config.bgColor,
            border: `1px solid ${config.color}40`,
            borderRadius: 2,
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1}>
            <Avatar sx={{ bgcolor: config.color, width: 28, height: 28 }}>
              {React.cloneElement(config.icon, { sx: { fontSize: 16 } })}
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2" sx={{ color: '#fff', fontWeight: 700 }}>
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

        <Box sx={{ maxHeight: 'calc(100vh - 280px)', overflow: 'auto', pr: 1 }}>
          {statusCases.map((c) => (
            <CaseCard key={c.id} caseData={c} />
          ))}
          {statusCases.length === 0 && (
            <Typography variant="body2" sx={{ color: '#52525b', textAlign: 'center', py: 4 }}>
              No cases
            </Typography>
          )}
        </Box>
      </Box>
    );
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <CircularProgress sx={{ color: '#f97316' }} />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: 'calc(100vh - 64px)',
        bgcolor: '#09090b',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <Paper
        elevation={0}
        sx={{ p: 2, borderRadius: 0, bgcolor: '#18181b', borderBottom: '1px solid #27272a' }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Stack direction="row" alignItems="center" spacing={2}>
            <Avatar sx={{ bgcolor: '#f97316' }}>
              <Description />
            </Avatar>
            <Box>
              <Typography variant="h5" sx={{ color: '#fff', fontWeight: 700 }}>
                Case Management
              </Typography>
              <Typography variant="body2" sx={{ color: '#71717a' }}>
                {cases.length} total cases • Drag cards to update status
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={2}>
            <Chip
              icon={<TrendingUp />}
              label={`${getCasesByStatus('investigating').length} Active`}
              sx={{
                bgcolor: '#3b82f620',
                color: '#3b82f6',
                '& .MuiChip-icon': { color: '#3b82f6' },
              }}
            />
            <Button
              variant="outlined"
              startIcon={<Add />}
              onClick={() => navigate('/')}
              sx={{ borderColor: '#27272a', color: '#a1a1aa' }}
            >
              New Case
            </Button>
          </Stack>
        </Stack>
      </Paper>

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
        PaperProps={{ sx: { bgcolor: '#18181b', border: '1px solid #27272a' } }}
      >
        {selectedCase && (
          <>
            <DialogTitle sx={{ bgcolor: '#0f0f0f', borderBottom: '1px solid #27272a' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Stack direction="row" alignItems="center" spacing={2}>
                  <Avatar
                    sx={{ bgcolor: PRIORITY_COLORS[selectedCase.priority], width: 40, height: 40 }}
                  >
                    <Description />
                  </Avatar>
                  <Box>
                    <Typography variant="h6" sx={{ color: '#fff' }}>
                      {selectedCase.caseNumber}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#71717a' }}>
                      {selectedCase.title}
                    </Typography>
                  </Box>
                </Stack>
                <Chip
                  label={STATUS_CONFIG[selectedCase.status].label}
                  sx={{
                    bgcolor: STATUS_CONFIG[selectedCase.status].bgColor,
                    color: STATUS_CONFIG[selectedCase.status].color,
                  }}
                />
              </Stack>
            </DialogTitle>
            <DialogContent sx={{ mt: 2 }}>
              <Stack spacing={3}>
                {/* Location & Details */}
                <Stack direction="row" spacing={4}>
                  <Box>
                    <Typography variant="caption" sx={{ color: '#52525b' }}>
                      LOCATION
                    </Typography>
                    <Typography variant="body1" sx={{ color: '#fff' }}>
                      {selectedCase.neighborhood}, {selectedCase.city}, {selectedCase.state}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: '#52525b' }}>
                      ASSIGNED TO
                    </Typography>
                    <Typography variant="body1" sx={{ color: '#fff' }}>
                      {selectedCase.assignedTo || 'Unassigned'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: '#52525b' }}>
                      CREATED
                    </Typography>
                    <Typography variant="body1" sx={{ color: '#fff' }}>
                      {new Date(selectedCase.createdAt).toLocaleDateString()}
                    </Typography>
                  </Box>
                  {selectedCase.estimatedLoss && (
                    <Box>
                      <Typography variant="caption" sx={{ color: '#52525b' }}>
                        EST. LOSS
                      </Typography>
                      <Typography variant="body1" sx={{ color: '#ef4444' }}>
                        ${selectedCase.estimatedLoss.toLocaleString()}
                      </Typography>
                    </Box>
                  )}
                </Stack>

                {/* Description */}
                {selectedCase.description && (
                  <Box>
                    <Typography variant="caption" sx={{ color: '#52525b' }}>
                      DESCRIPTION
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#a1a1aa', mt: 0.5 }}>
                      {selectedCase.description}
                    </Typography>
                  </Box>
                )}

                {/* Stats */}
                <Stack direction="row" spacing={2}>
                  <Card sx={{ flex: 1, bgcolor: '#09090b', border: '1px solid #27272a' }}>
                    <CardContent sx={{ textAlign: 'center', py: 2 }}>
                      <Person sx={{ color: '#ef4444', fontSize: 32 }} />
                      <Typography variant="h4" sx={{ color: '#fff', fontWeight: 700 }}>
                        {selectedCase.persons?.length || 0}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#71717a' }}>
                        Suspects
                      </Typography>
                    </CardContent>
                  </Card>
                  <Card sx={{ flex: 1, bgcolor: '#09090b', border: '1px solid #27272a' }}>
                    <CardContent sx={{ textAlign: 'center', py: 2 }}>
                      <Devices sx={{ color: '#f97316', fontSize: 32 }} />
                      <Typography variant="h4" sx={{ color: '#fff', fontWeight: 700 }}>
                        {selectedCase.devices?.length || 0}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#71717a' }}>
                        Devices
                      </Typography>
                    </CardContent>
                  </Card>
                  <Card sx={{ flex: 1, bgcolor: '#09090b', border: '1px solid #27272a' }}>
                    <CardContent sx={{ textAlign: 'center', py: 2 }}>
                      <LocationOn sx={{ color: '#3b82f6', fontSize: 32 }} />
                      <Typography variant="h4" sx={{ color: '#fff', fontWeight: 700 }}>
                        1
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#71717a' }}>
                        Locations
                      </Typography>
                    </CardContent>
                  </Card>
                </Stack>

                {/* Status Actions */}
                <Box>
                  <Typography variant="caption" sx={{ color: '#52525b', mb: 1, display: 'block' }}>
                    CHANGE STATUS
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    {(['investigating', 'review', 'adjudicated'] as CaseStatus[]).map((status) => (
                      <Button
                        key={status}
                        variant="outlined"
                        size="small"
                        onClick={() => {
                          handleStatusChange(selectedCase.id, status);
                          setSelectedCase((prev) => (prev ? { ...prev, status } : null));
                        }}
                        sx={{
                          bgcolor:
                            selectedCase.status === status
                              ? STATUS_CONFIG[status].color
                              : 'transparent',
                          borderColor: STATUS_CONFIG[status].color,
                          color:
                            selectedCase.status === status ? '#000' : STATUS_CONFIG[status].color,
                          '&:hover': {
                            bgcolor:
                              selectedCase.status === status
                                ? STATUS_CONFIG[status].color
                                : `${STATUS_CONFIG[status].color}20`,
                          },
                        }}
                      >
                        {STATUS_CONFIG[status].label}
                      </Button>
                    ))}
                  </Stack>
                </Box>
              </Stack>
            </DialogContent>
            <DialogActions sx={{ p: 2, borderTop: '1px solid #27272a' }}>
              <Button onClick={() => setDetailsOpen(false)} sx={{ color: '#71717a' }}>
                Close
              </Button>
              <Button
                variant="contained"
                startIcon={<Visibility />}
                onClick={() => navigate(`/?case=${selectedCase.id}`)}
                sx={{ bgcolor: '#f97316', '&:hover': { bgcolor: '#fb923c' } }}
              >
                View on Map
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default CaseView;
