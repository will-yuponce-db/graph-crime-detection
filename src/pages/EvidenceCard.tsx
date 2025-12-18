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
  case_number: string;
  title: string;
  city: string;
  state: string;
  neighborhood: string;
  status: CaseStatus;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  created_at: string;
  updated_at: string;
  assigned_to: string;
  suspect_count: number;
  device_count: number;
  location_count: number;
  estimated_loss?: number;
  description?: string;
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

const PRIORITY_COLORS = {
  Low: '#71717a',
  Medium: '#eab308',
  High: '#f97316',
  Critical: '#ef4444',
};

const CaseView: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [cases, setCases] = useState<CaseData[]>([]);
  const [selectedCase, setSelectedCase] = useState<CaseData | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    loadCases();
  }, []);

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

  const loadCases = () => {
    // Mock case data with different statuses
    const mockCases: CaseData[] = [
      {
        id: 'CASE_001',
        case_number: 'DC-2024-1105',
        title: 'Adams Morgan Residential Burglary',
        city: 'Washington',
        state: 'DC',
        neighborhood: 'Adams Morgan',
        status: 'adjudicated',
        priority: 'Medium',
        created_at: '2024-11-05T02:30:00Z',
        updated_at: '2024-11-20T14:00:00Z',
        assigned_to: 'Det. Johnson',
        suspect_count: 2,
        device_count: 2,
        location_count: 1,
        estimated_loss: 15000,
        description: 'Linked to cross-jurisdictional burglary series',
      },
      {
        id: 'CASE_002',
        case_number: 'DC-2024-1107',
        title: 'Dupont Circle Break-in',
        city: 'Washington',
        state: 'DC',
        neighborhood: 'Dupont Circle',
        status: 'adjudicated',
        priority: 'Medium',
        created_at: '2024-11-07T03:15:00Z',
        updated_at: '2024-11-22T10:00:00Z',
        assigned_to: 'Det. Johnson',
        suspect_count: 2,
        device_count: 2,
        location_count: 1,
        estimated_loss: 22000,
      },
      {
        id: 'CASE_005',
        case_number: 'TN-2024-1121',
        title: 'East Nashville Break-in',
        city: 'Nashville',
        state: 'TN',
        neighborhood: 'East Nashville',
        status: 'review',
        priority: 'High',
        created_at: '2024-11-21T02:30:00Z',
        updated_at: '2024-12-01T09:00:00Z',
        assigned_to: 'Det. Smith',
        suspect_count: 2,
        device_count: 2,
        location_count: 1,
        estimated_loss: 35000,
        description: 'Cross-jurisdictional link confirmed with DC cases',
      },
      {
        id: 'CASE_006',
        case_number: 'TN-2024-1124',
        title: 'The Gulch Residential Burglary',
        city: 'Nashville',
        state: 'TN',
        neighborhood: 'The Gulch',
        status: 'review',
        priority: 'High',
        created_at: '2024-11-24T03:00:00Z',
        updated_at: '2024-12-02T11:00:00Z',
        assigned_to: 'Det. Smith',
        suspect_count: 2,
        device_count: 2,
        location_count: 1,
        estimated_loss: 78000,
      },
      {
        id: 'CASE_008',
        case_number: 'DC-2024-1201',
        title: 'Georgetown Major Burglary',
        city: 'Washington',
        state: 'DC',
        neighborhood: 'Georgetown',
        status: 'investigating',
        priority: 'Critical',
        created_at: '2024-12-01T03:00:00Z',
        updated_at: '2024-12-03T08:00:00Z',
        assigned_to: 'Det. Johnson',
        suspect_count: 2,
        device_count: 3,
        location_count: 1,
        estimated_loss: 125000,
        description: 'PRIMARY INCIDENT - 50 devices detected, burner phone switch detected',
      },
      {
        id: 'CASE_009',
        case_number: 'DC-2024-1203',
        title: 'Capitol Hill Attempted Entry',
        city: 'Washington',
        state: 'DC',
        neighborhood: 'Capitol Hill',
        status: 'investigating',
        priority: 'Medium',
        created_at: '2024-12-03T01:45:00Z',
        updated_at: '2024-12-03T10:00:00Z',
        assigned_to: 'Det. Martinez',
        suspect_count: 0,
        device_count: 5,
        location_count: 1,
        description: 'Alarm triggered, suspect fled - possible series connection',
      },
    ];
    setCases(mockCases);
  };

  const handleStatusChange = (caseId: string, newStatus: CaseStatus) => {
    setCases((prev) =>
      prev.map((c) =>
        c.id === caseId ? { ...c, status: newStatus, updated_at: new Date().toISOString() } : c
      )
    );
  };

  const getCasesByStatus = (status: CaseStatus) => cases.filter((c) => c.status === status);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
          <Box sx={{ flex: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600 }}>
                {caseData.case_number}
              </Typography>
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
            <Typography variant="caption" sx={{ color: '#a1a1aa', display: 'block', mt: 0.5 }}>
              {caseData.neighborhood}, {caseData.state}
            </Typography>
          </Box>
        </Stack>

        <Stack direction="row" spacing={2} sx={{ mt: 1.5 }}>
          <Tooltip title="Suspects">
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Person sx={{ fontSize: 14, color: '#ef4444' }} />
              <Typography variant="caption" sx={{ color: '#71717a' }}>
                {caseData.suspect_count}
              </Typography>
            </Stack>
          </Tooltip>
          <Tooltip title="Devices">
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Devices sx={{ fontSize: 14, color: '#f97316' }} />
              <Typography variant="caption" sx={{ color: '#71717a' }}>
                {caseData.device_count}
              </Typography>
            </Stack>
          </Tooltip>
          <Tooltip title="Locations">
            <Stack direction="row" spacing={0.5} alignItems="center">
              <LocationOn sx={{ fontSize: 14, color: '#3b82f6' }} />
              <Typography variant="caption" sx={{ color: '#71717a' }}>
                {caseData.location_count}
              </Typography>
            </Stack>
          </Tooltip>
        </Stack>

        <Typography variant="caption" sx={{ color: '#52525b', display: 'block', mt: 1 }}>
          {caseData.assigned_to} • {formatDate(caseData.updated_at)}
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
              <Typography variant="caption" sx={{ color: '#71717a' }}>
                {config.description}
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
              New from Hotspot
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {/* Pipeline View */}
      <Box sx={{ flex: 1, p: 3, overflow: 'hidden' }}>
        <Stack direction="row" spacing={3} sx={{ height: '100%' }}>
          <StatusColumn status="investigating" />
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <ArrowForward sx={{ color: '#52525b', fontSize: 32 }} />
          </Box>
          <StatusColumn status="review" />
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <ArrowForward sx={{ color: '#52525b', fontSize: 32 }} />
          </Box>
          <StatusColumn status="adjudicated" />
        </Stack>
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
            <DialogTitle sx={{ bgcolor: '#09090b', borderBottom: '1px solid #27272a' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Stack direction="row" spacing={2} alignItems="center">
                  <Avatar sx={{ bgcolor: PRIORITY_COLORS[selectedCase.priority] }}>
                    {STATUS_CONFIG[selectedCase.status].icon}
                  </Avatar>
                  <Box>
                    <Typography variant="h6" sx={{ color: '#fff' }}>
                      {selectedCase.case_number}
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
                {/* Info Grid */}
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
                      {selectedCase.assigned_to}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: '#52525b' }}>
                      CREATED
                    </Typography>
                    <Typography variant="body1" sx={{ color: '#fff' }}>
                      {new Date(selectedCase.created_at).toLocaleDateString()}
                    </Typography>
                  </Box>
                  {selectedCase.estimated_loss && (
                    <Box>
                      <Typography variant="caption" sx={{ color: '#52525b' }}>
                        EST. LOSS
                      </Typography>
                      <Typography variant="body1" sx={{ color: '#ef4444' }}>
                        ${selectedCase.estimated_loss.toLocaleString()}
                      </Typography>
                    </Box>
                  )}
                </Stack>

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
                        {selectedCase.suspect_count}
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
                        {selectedCase.device_count}
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
                        {selectedCase.location_count}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#71717a' }}>
                        Locations
                      </Typography>
                    </CardContent>
                  </Card>
                </Stack>

                {/* Status Change */}
                <Box>
                  <Typography variant="caption" sx={{ color: '#52525b', display: 'block', mb: 1 }}>
                    UPDATE STATUS
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    {(['investigating', 'review', 'adjudicated'] as CaseStatus[]).map((status) => (
                      <Button
                        key={status}
                        variant={selectedCase.status === status ? 'contained' : 'outlined'}
                        startIcon={STATUS_CONFIG[status].icon}
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
                sx={{ bgcolor: '#f97316', color: '#000' }}
              >
                View in Hotspot Explorer
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default CaseView;
