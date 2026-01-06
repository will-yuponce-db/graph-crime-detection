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
  useTheme,
  TextField,
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
  Schedule,
  Gavel,
  Search,
  TrendingUp,
  Cloud,
  Close,
} from '@mui/icons-material';
import { fetchCases, updateCaseStatus, USE_DATABRICKS } from '../services/api';

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
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<CaseData[]>([]);
  const [selectedCase, setSelectedCase] = useState<CaseData | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [newCaseOpen, setNewCaseOpen] = useState(false);
  const [newCaseData, setNewCaseData] = useState({
    title: '',
    neighborhood: '',
    city: '',
    state: '',
    priority: 'Medium',
    description: '',
    estimatedLoss: '',
  });

  // Fetch cases from API
  useEffect(() => {
    const loadCases = async () => {
      try {
        const casesData = await fetchCases();
        setCases(
          casesData.map((c: CaseData) => ({
            ...c,
            status: (c.status || 'investigating') as CaseStatus,
          }))
        );
      } catch (err) {
        console.error('Failed to fetch cases:', err);
      } finally {
        setLoading(false);
      }
    };
    loadCases();
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
      await updateCaseStatus(caseId, newStatus);
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

  const handleCreateCase = () => {
    const caseNumber = `CASE_${newCaseData.city
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 2)}_${String(cases.length + 1).padStart(3, '0')}`;
    const newCase: CaseData = {
      id: `case_${Date.now()}`,
      caseNumber,
      title: newCaseData.title || `${newCaseData.priority} priority case`,
      city: newCaseData.city,
      state: newCaseData.state,
      neighborhood: newCaseData.neighborhood,
      status: 'investigating',
      priority: newCaseData.priority,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assignedTo: 'Analyst Team',
      estimatedLoss: newCaseData.estimatedLoss ? parseInt(newCaseData.estimatedLoss) : undefined,
      description: newCaseData.description,
    };
    setCases((prev) => [newCase, ...prev]);
    setNewCaseOpen(false);
    setNewCaseData({
      title: '',
      neighborhood: '',
      city: '',
      state: '',
      priority: 'Medium',
      description: '',
      estimatedLoss: '',
    });
  };

  const CaseCard: React.FC<{ caseData: CaseData }> = ({ caseData }) => (
    <Card
      sx={{
        mb: 1.5,
        bgcolor: 'background.paper',
        border: 1,
        borderColor:
          caseData.priority === 'Critical' ? `${theme.palette.accent.red}40` : 'border.main',
        cursor: 'pointer',
        transition: 'all 0.2s',
        '&:hover': {
          borderColor: theme.palette.accent.orange,
          transform: 'translateY(-2px)',
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
            <Typography
              variant="caption"
              sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.3 }}
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
              <Person sx={{ fontSize: 14, color: theme.palette.accent.red }} />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {caseData.persons?.length || 0}
              </Typography>
            </Stack>
          </Tooltip>
          <Tooltip title="Devices">
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Devices sx={{ fontSize: 14, color: theme.palette.accent.orange }} />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {caseData.devices?.length || 0}
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
            border: 1,
            borderColor: `${config.color}40`,
            borderRadius: 2,
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

        <Box sx={{ maxHeight: 'calc(100vh - 280px)', overflow: 'auto', pr: 1 }}>
          {statusCases.map((c) => (
            <CaseCard key={c.id} caseData={c} />
          ))}
          {statusCases.length === 0 && (
            <Typography
              variant="body2"
              sx={{ color: 'text.secondary', textAlign: 'center', py: 4 }}
            >
              No cases
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
          justifyContent: 'center',
          alignItems: 'center',
          height: '80vh',
          bgcolor: 'background.default',
        }}
      >
        <CircularProgress sx={{ color: theme.palette.accent.orange }} />
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
              startIcon={<Add />}
              onClick={() => setNewCaseOpen(true)}
              sx={{ borderColor: 'border.main', color: 'text.secondary' }}
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
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Stack direction="row" alignItems="center" spacing={2}>
                  <Avatar
                    sx={{ bgcolor: PRIORITY_COLORS[selectedCase.priority], width: 40, height: 40 }}
                  >
                    <Description />
                  </Avatar>
                  <Box>
                    <Typography variant="h6" sx={{ color: 'text.primary' }}>
                      {selectedCase.caseNumber}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
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
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      LOCATION
                    </Typography>
                    <Typography variant="body1" sx={{ color: 'text.primary' }}>
                      {selectedCase.neighborhood}, {selectedCase.city}, {selectedCase.state}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      ASSIGNED TO
                    </Typography>
                    <Typography variant="body1" sx={{ color: 'text.primary' }}>
                      {selectedCase.assignedTo || 'Unassigned'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      CREATED
                    </Typography>
                    <Typography variant="body1" sx={{ color: 'text.primary' }}>
                      {new Date(selectedCase.createdAt).toLocaleDateString()}
                    </Typography>
                  </Box>
                  {selectedCase.estimatedLoss && (
                    <Box>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        EST. LOSS
                      </Typography>
                      <Typography variant="body1" sx={{ color: theme.palette.accent.red }}>
                        ${selectedCase.estimatedLoss.toLocaleString()}
                      </Typography>
                    </Box>
                  )}
                </Stack>

                {/* Description */}
                {selectedCase.description && (
                  <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      DESCRIPTION
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                      {selectedCase.description}
                    </Typography>
                  </Box>
                )}

                {/* Stats */}
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
                        {selectedCase.persons?.length || 0}
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
                        {selectedCase.devices?.length || 0}
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

                {/* Status Actions */}
                <Box>
                  <Typography
                    variant="caption"
                    sx={{ color: 'text.secondary', mb: 1, display: 'block' }}
                  >
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
                            selectedCase.status === status ? '#fff' : STATUS_CONFIG[status].color,
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
            <DialogActions sx={{ p: 2, borderTop: 1, borderColor: 'border.main' }}>
              <Button onClick={() => setDetailsOpen(false)} sx={{ color: 'text.secondary' }}>
                Close
              </Button>
              <Button
                variant="contained"
                startIcon={<Visibility />}
                onClick={() => navigate(`/?case=${selectedCase.caseNumber}`)}
                sx={{
                  bgcolor: theme.palette.accent.orange,
                  '&:hover': { bgcolor: theme.palette.primary.light },
                }}
              >
                View on Map
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
                onChange={(e) => setNewCaseData({ ...newCaseData, priority: e.target.value })}
                size="small"
              >
                <MenuItem value="Low">Low</MenuItem>
                <MenuItem value="Medium">Medium</MenuItem>
                <MenuItem value="High">High</MenuItem>
                <MenuItem value="Critical">Critical</MenuItem>
              </TextField>
            </Stack>
            <TextField
              label="Estimated Loss ($)"
              fullWidth
              value={newCaseData.estimatedLoss}
              onChange={(e) => setNewCaseData({ ...newCaseData, estimatedLoss: e.target.value })}
              placeholder="e.g., 15000"
              size="small"
              type="number"
            />
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
