import React, { useState, useMemo } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Button,
  Card,
  CardContent,
  Tabs,
  Tab,
  Stack,
  Chip,
  useTheme,
  useMediaQuery,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  Pagination,
  TablePagination,
  Menu,
  Checkbox,
} from '@mui/material';
import {
  Add as AddIcon,
  Dashboard as DashboardIcon,
  List as ListIcon,
  MergeType as MergeIcon,
  FilterList as FilterListIcon,
  Description,
} from '@mui/icons-material';
import CaseCard from '../components/CaseCard';
import CaseEditDialog from '../components/CaseEditDialog';
import MergeCasesDialog from '../components/MergeCasesDialog';
import { getCaseStats } from '../data/mockCaseData';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { updateCase, mergeCases } from '../store/casesSlice';
import type { Case } from '../types/case';
import { CaseStatus, CasePriority } from '../types/case';

const CasesPage: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const cases = useAppSelector(state => state.cases?.cases || []);
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedCaseLocal, setSelectedCaseLocal] = useState<Case | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [caseToEdit, setCaseToEdit] = useState<Case | null>(null);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<string[]>([]);
  
  // Pagination state
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(12);

  // Filter state
  const [filterMenuAnchor, setFilterMenuAnchor] = useState<HTMLElement | null>(null);
  const [priorityFilters, setPriorityFilters] = useState<Set<CasePriority>>(new Set());
  const [tagFilters, setTagFilters] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'date' | 'priority' | 'name'>('date');

  // Calculate statistics
  const stats = useMemo(() => getCaseStats(cases), [cases]);

  // Extract all unique tags
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    cases.forEach(c => c.tags.forEach(tag => tags.add(tag)));
    return Array.from(tags).sort();
  }, [cases]);

  // Group cases by status for board view (exclude PENDING_APPROVAL - shown in DetectedCasesPanel)
  const casesByStatus = useMemo(() => {
    const grouped: { [key in CaseStatus]: Case[] } = {
      [CaseStatus.PENDING_APPROVAL]: [],
      [CaseStatus.LEADS]: [],
      [CaseStatus.ACTIVE_INVESTIGATION]: [],
      [CaseStatus.PROSECUTION]: [],
      [CaseStatus.CLOSED]: [],
    };

    cases.forEach((c) => {
      grouped[c.status].push(c);
    });

    return grouped;
  }, [cases]);


  // Filtered and sorted cases
  const filteredAndSortedCases = useMemo(() => {
    let filtered = [...cases];

    // Apply priority filters
    if (priorityFilters.size > 0) {
      filtered = filtered.filter(c => priorityFilters.has(c.priority));
    }

    // Apply tag filters
    if (tagFilters.size > 0) {
      filtered = filtered.filter(c => c.tags.some(tag => tagFilters.has(tag)));
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'priority': {
          const priorityOrder = { [CasePriority.CRITICAL]: 0, [CasePriority.HIGH]: 1, [CasePriority.MEDIUM]: 2, [CasePriority.LOW]: 3 };
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        case 'date':
        default:
          return b.updatedDate.getTime() - a.updatedDate.getTime();
      }
    });

    return filtered;
  }, [cases, priorityFilters, tagFilters, sortBy]);

  // Group filtered cases by status
  const filteredCasesByStatus = useMemo(() => {
    const grouped: { [key in CaseStatus]: Case[] } = {
      [CaseStatus.PENDING_APPROVAL]: [],
      [CaseStatus.LEADS]: [],
      [CaseStatus.ACTIVE_INVESTIGATION]: [],
      [CaseStatus.PROSECUTION]: [],
      [CaseStatus.CLOSED]: [],
    };

    filteredAndSortedCases.forEach((c) => {
      grouped[c.status].push(c);
    });

    return grouped;
  }, [filteredAndSortedCases]);

  // Paginated cases by status for board view
  const paginatedCasesByStatus = useMemo(() => {
    const paginated: { [key in CaseStatus]: Case[] } = {
      [CaseStatus.PENDING_APPROVAL]: [],
      [CaseStatus.LEADS]: [],
      [CaseStatus.ACTIVE_INVESTIGATION]: [],
      [CaseStatus.PROSECUTION]: [],
      [CaseStatus.CLOSED]: [],
    };
    
    Object.entries(filteredCasesByStatus).forEach(([status, statusCases]) => {
      const startIndex = page * rowsPerPage;
      paginated[status as CaseStatus] = statusCases.slice(startIndex, startIndex + rowsPerPage);
    });
    
    return paginated;
  }, [filteredCasesByStatus, page, rowsPerPage]);

  // Paginated cases for list view
  const paginatedFilteredCases = useMemo(() => {
    const startIndex = page * rowsPerPage;
    return filteredAndSortedCases.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredAndSortedCases, page, rowsPerPage]);

  const handleViewModeChange = (_event: React.SyntheticEvent, newValue: 'board' | 'list') => {
    setViewMode(newValue);
    setPage(0); // Reset to first page when changing view
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleCreateCase = () => {
    setCreateDialogOpen(true);
  };

  const handleViewCase = (caseItem: Case) => {
    setSelectedCaseLocal(caseItem);
    setDetailsDialogOpen(true);
  };

  const handleEditCase = (caseItem: Case) => {
    setCaseToEdit(caseItem);
    setEditDialogOpen(true);
    setDetailsDialogOpen(false); // Close details if open
  };

  const handleSaveEdit = (caseId: string, updates: Partial<Case>) => {
    dispatch(updateCase({ caseId, updates }));
    setEditDialogOpen(false);
    setCaseToEdit(null);
  };

  const handleMergeCases = (targetCaseId: string, sourceCaseIds: string[], options: { keepSourceCases?: boolean; newName?: string; newDescription?: string }) => {
    dispatch(mergeCases({ targetCaseId, sourceCaseIds, mergeOptions: options }));
    setMergeDialogOpen(false);
    setSelectedForMerge([]);
  };





  const handleClearFilters = () => {
    setPriorityFilters(new Set());
    setTagFilters(new Set());
    setPage(0);
  };

  const hasActiveFilters = priorityFilters.size > 0 || tagFilters.size > 0;

  // Debug: Log case distribution
  React.useEffect(() => {
    console.log('📊 Cases Page - Case Distribution:', {
      total: cases.length,
      byStatus: {
        leads: casesByStatus[CaseStatus.LEADS]?.length || 0,
        active: casesByStatus[CaseStatus.ACTIVE_INVESTIGATION]?.length || 0,
        prosecution: casesByStatus[CaseStatus.PROSECUTION]?.length || 0,
        closed: casesByStatus[CaseStatus.CLOSED]?.length || 0,
        pending: casesByStatus[CaseStatus.PENDING_APPROVAL]?.length || 0,
      }
    });
  }, [cases, casesByStatus]);


  const handleViewInGraph = (caseItem: Case) => {
    navigate(`/graph?case=${caseItem.id}`);
  };

  // Timeline and Map temporarily hidden
  // const handleViewInTimeline = (caseItem: Case) => {
  //   navigate(`/timeline?case=${caseItem.id}`);
  // };

  // const handleViewInMap = (caseItem: Case) => {
  //   navigate(`/map?case=${caseItem.id}`);
  // };

  const getStatusColor = (status: CaseStatus) => {
    switch (status) {
      case CaseStatus.PENDING_APPROVAL:
        return '#ed6c02'; // warning color
      case CaseStatus.LEADS:
        return '#78909c';
      case CaseStatus.ACTIVE_INVESTIGATION:
        return '#1976d2';
      case CaseStatus.PROSECUTION:
        return '#f57c00';
      case CaseStatus.CLOSED:
        return '#388e3c';
      default:
        return '#757575';
    }
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <Paper
        elevation={2}
        sx={{
          p: { xs: 2, sm: 2.5 },
          borderRadius: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: { xs: 'wrap', sm: 'nowrap' },
          gap: 2,
        }}
      >
        <Typography variant="h5" sx={{ fontWeight: 600, fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
          Case Management
        </Typography>
        <Stack direction="row" spacing={2} sx={{ flexShrink: 0 }}>
          {!isMobile && (
            <Button
              variant="outlined"
              startIcon={<MergeIcon />}
              onClick={() => setMergeDialogOpen(true)}
              disabled={cases.length < 2}
            >
              Merge Cases
            </Button>
          )}
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreateCase}>
            {isMobile ? 'New' : 'New Case'}
          </Button>
        </Stack>
      </Paper>

      {/* Stats Bar */}
      <Paper sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 0 }} elevation={1}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: { xs: 'center', sm: 'space-between' } }}>
          <Card variant="outlined" sx={{ flex: '1 1 150px', minWidth: 150 }}>
            <CardContent sx={{ py: 1.5, px: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Total Cases
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 600 }}>
                {stats.totalCases}
              </Typography>
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ flex: '1 1 150px', minWidth: 150 }}>
            <CardContent sx={{ py: 1.5, px: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Active
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 600, color: theme.palette.primary.main }}>
                {stats.activeCases}
              </Typography>
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ flex: '1 1 150px', minWidth: 150 }}>
            <CardContent sx={{ py: 1.5, px: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Leads
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 600, color: '#78909c' }}>
                {stats.casesByStatus[CaseStatus.LEADS] || 0}
              </Typography>
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ flex: '1 1 150px', minWidth: 150 }}>
            <CardContent sx={{ py: 1.5, px: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Investigation
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 600, color: '#1976d2' }}>
                {stats.casesByStatus[CaseStatus.ACTIVE_INVESTIGATION] || 0}
              </Typography>
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ flex: '1 1 150px', minWidth: 150 }}>
            <CardContent sx={{ py: 1.5, px: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Prosecution
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 600, color: '#f57c00' }}>
                {stats.casesByStatus[CaseStatus.PROSECUTION] || 0}
              </Typography>
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ flex: '1 1 150px', minWidth: 150 }}>
            <CardContent sx={{ py: 1.5, px: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Closed
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 600, color: theme.palette.success.main }}>
                {stats.closedCases}
              </Typography>
            </CardContent>
          </Card>
        </Box>
      </Paper>

      {/* View Mode Toggle & Filters */}
      <Paper sx={{ borderRadius: 0 }} elevation={1}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, py: 1 }}>
          <Tabs value={viewMode} onChange={handleViewModeChange}>
            <Tab icon={<DashboardIcon />} label="Board View" iconPosition="start" value="board" />
            <Tab icon={<ListIcon />} label="List View" iconPosition="start" value="list" />
          </Tabs>
          
          {/* Filter Controls */}
          <Stack direction="row" spacing={2} alignItems="center">
            <Button
              variant="outlined"
              size="small"
              startIcon={<FilterListIcon />}
              onClick={(e) => setFilterMenuAnchor(e.currentTarget)}
            >
              Filters
            </Button>
            {hasActiveFilters && (
              <Chip
                label={`${priorityFilters.size + tagFilters.size} active`}
                size="small"
                color="primary"
                onDelete={handleClearFilters}
              />
            )}
          </Stack>
        </Box>
      </Paper>

      {/* Filter Menu */}
      <Menu
        anchorEl={filterMenuAnchor}
        open={Boolean(filterMenuAnchor)}
        onClose={() => setFilterMenuAnchor(null)}
        PaperProps={{ sx: { width: 320, maxHeight: 500 } }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            Sort By
          </Typography>
          <MenuItem 
            onClick={() => setSortBy('date')}
            selected={sortBy === 'date'}
          >
            Date (Recent First)
          </MenuItem>
          <MenuItem 
            onClick={() => setSortBy('priority')}
            selected={sortBy === 'priority'}
          >
            Priority (High to Low)
          </MenuItem>
          <MenuItem 
            onClick={() => setSortBy('name')}
            selected={sortBy === 'name'}
          >
            Name (A-Z)
          </MenuItem>

          <Divider sx={{ my: 1 }} />

          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            Priority
          </Typography>
          {Object.values(CasePriority).map((priority) => (
            <MenuItem
              key={priority}
              onClick={() => {
                const newFilters = new Set(priorityFilters);
                if (newFilters.has(priority)) {
                  newFilters.delete(priority);
                } else {
                  newFilters.add(priority);
                }
                setPriorityFilters(newFilters);
                setPage(0);
              }}
            >
              <Checkbox
                checked={priorityFilters.has(priority)}
                size="small"
                sx={{ mr: 1 }}
              />
              {priority}
            </MenuItem>
          ))}

          <Divider sx={{ my: 1 }} />

          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            Tags
          </Typography>
          {allTags.length > 0 ? (
            allTags.slice(0, 10).map((tag) => (
              <MenuItem
                key={tag}
                onClick={() => {
                  const newFilters = new Set(tagFilters);
                  if (newFilters.has(tag)) {
                    newFilters.delete(tag);
                  } else {
                    newFilters.add(tag);
                  }
                  setTagFilters(newFilters);
                  setPage(0);
                }}
              >
                <Checkbox
                  checked={tagFilters.has(tag)}
                  size="small"
                  sx={{ mr: 1 }}
                />
                {tag}
              </MenuItem>
            ))
          ) : (
            <MenuItem disabled>
              <Typography variant="body2" color="text.secondary">
                No tags available
              </Typography>
            </MenuItem>
          )}
          {allTags.length > 10 && (
            <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 1, display: 'block' }}>
              +{allTags.length - 10} more tags
            </Typography>
          )}
        </Box>
      </Menu>

      {/* Content */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Pagination Controls - Top */}
        <Paper sx={{ 
          p: { xs: 1.5, sm: 2 }, 
          borderRadius: 0, 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          gap: 2,
          flexWrap: { xs: 'wrap', sm: 'nowrap' }
        }} elevation={1}>
          <Box>
            <Typography variant="body2" color="text.secondary">
              {viewMode === 'list' 
                ? `Showing ${page * rowsPerPage + 1}-${Math.min((page + 1) * rowsPerPage, filteredAndSortedCases.length)} of ${filteredAndSortedCases.length} cases`
                : `Page ${page + 1} • ${rowsPerPage} per page`
              }
            </Typography>
            {hasActiveFilters && (
              <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', mt: 0.5 }}>
                <FilterListIcon fontSize="small" color="primary" />
                <Typography variant="caption" color="primary">
                  {priorityFilters.size} priority filter(s), {tagFilters.size} tag filter(s) active
                </Typography>
                <Button size="small" onClick={handleClearFilters} sx={{ ml: 1, minWidth: 'auto', p: 0.5 }}>
                  Clear
                </Button>
              </Box>
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Per page</InputLabel>
              <Select
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(Number(e.target.value));
                  setPage(0);
                }}
                label="Per page"
              >
                <MenuItem value={6}>6 per page</MenuItem>
                <MenuItem value={12}>12 per page</MenuItem>
                <MenuItem value={24}>24 per page</MenuItem>
                <MenuItem value={48}>48 per page</MenuItem>
              </Select>
            </FormControl>
            {viewMode === 'list' && (
              <Pagination
                count={Math.ceil(cases.length / rowsPerPage)}
                page={page + 1}
                onChange={(e, p) => handleChangePage(e, p - 1)}
                color="primary"
                showFirstButton
                showLastButton
              />
            )}
          </Box>
        </Paper>

        {/* Cases Display */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 3, bgcolor: theme.palette.background.default }}>
          {viewMode === 'board' && (
            <Box sx={{ 
              display: 'flex', 
              gap: 2, 
              overflowX: 'auto', 
              height: '100%',
              p: 2,
              '&::-webkit-scrollbar': {
                height: 8,
              },
              '&::-webkit-scrollbar-track': {
                backgroundColor: 'transparent',
              },
              '&::-webkit-scrollbar-thumb': {
                backgroundColor: 'rgba(0,0,0,0.2)',
                borderRadius: 4,
              },
            }}>
              {Object.entries(paginatedCasesByStatus)
                .filter(([status]) => status !== CaseStatus.PENDING_APPROVAL) // Skip PENDING_APPROVAL in board view
                .map(([status, casesInStatus]) => {
                const totalInStatus = filteredCasesByStatus[status as CaseStatus].length;
                const totalUnfiltered = casesByStatus[status as CaseStatus].length;
                return (
                  <Paper
                    key={status}
                    sx={{
                      flex: '1 1 0',
                      minWidth: 320,
                      maxWidth: 400,
                      p: 2,
                      bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
                      borderTop: `4px solid ${getStatusColor(status as CaseStatus)}`,
                      display: 'flex',
                      flexDirection: 'column',
                      height: 'fit-content',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                        <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600 }}>
                          {status}
                        </Typography>
                        <Chip 
                          label={hasActiveFilters ? `${totalInStatus}/${totalUnfiltered}` : totalInStatus}
                          size="small" 
                          sx={{ fontWeight: 600 }}
                          color={hasActiveFilters ? 'primary' : 'default'}
                        />
                      </Box>
                    </Box>

                    <Stack spacing={2}>
                      {casesInStatus.map((caseItem) => (
                        <CaseCard
                          key={caseItem.id}
                          case={caseItem}
                          onView={handleViewCase}
                          onEdit={handleEditCase}
                          onViewInGraph={handleViewInGraph}
                        />
                      ))}
                      {casesInStatus.length === 0 && totalInStatus === 0 && (
                        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                          No cases
                        </Typography>
                      )}
                      {casesInStatus.length === 0 && totalInStatus > 0 && (
                        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                          No cases on this page
                        </Typography>
                      )}
                    </Stack>
                  </Paper>
                );
              })}
            </Box>
          )}

        {viewMode === 'list' && (
          <Box sx={{ 
            display: 'grid', 
            gridTemplateColumns: { 
              xs: '1fr', 
              sm: 'repeat(auto-fill, minmax(280px, 1fr))', 
              md: 'repeat(auto-fill, minmax(320px, 1fr))' 
            }, 
            gap: { xs: 2, sm: 3 },
            px: { xs: 2, sm: 0 }
          }}>
            {paginatedFilteredCases.map((caseItem) => (
              <CaseCard
                key={caseItem.id}
                case={caseItem}
                onView={handleViewCase}
                onEdit={handleEditCase}
                onViewInGraph={handleViewInGraph}
              />
            ))}
          </Box>
        )}
        </Box>

        {/* Pagination Controls - Bottom */}
        <Paper sx={{ p: 1, borderRadius: 0 }} elevation={1}>
          <TablePagination
            component="div"
            count={filteredAndSortedCases.length}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            rowsPerPageOptions={[6, 12, 24, 48]}
            labelRowsPerPage="Cases per page:"
            showFirstButton
            showLastButton
          />
        </Paper>
      </Box>

      {/* Case Details Dialog */}
      <Dialog open={detailsDialogOpen} onClose={() => setDetailsDialogOpen(false)} maxWidth="md" fullWidth>
        {selectedCaseLocal && (
          <>
            <DialogTitle>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {selectedCaseLocal.caseNumber}
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 600 }}>
                  {selectedCaseLocal.name}
                </Typography>
              </Box>
            </DialogTitle>
            <DialogContent dividers>
              <Stack spacing={3}>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Description
                  </Typography>
                  <Typography variant="body1">{selectedCaseLocal.description}</Typography>
                </Box>

                <Divider />

                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Status
                    </Typography>
                    <Chip
                      label={selectedCaseLocal.status}
                      sx={{
                        bgcolor: getStatusColor(selectedCaseLocal.status),
                        color: 'white',
                        fontWeight: 600,
                      }}
                    />
                  </Box>
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Priority
                    </Typography>
                    <Chip label={selectedCaseLocal.priority} color="warning" sx={{ fontWeight: 600 }} />
                  </Box>
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Created
                    </Typography>
                    <Typography variant="body1">
                      {selectedCaseLocal.createdDate.toLocaleDateString()}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Classification
                    </Typography>
                    <Chip label={selectedCaseLocal.classification} color="error" size="small" />
                  </Box>
                </Box>

                <Divider />

                <Box>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Assigned Team
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {selectedCaseLocal.leadAgent && (
                      <Chip
                        label={`${selectedCaseLocal.leadAgent} (Lead)`}
                        color="primary"
                        variant="filled"
                        size="small"
                      />
                    )}
                    {selectedCaseLocal.assignedAgents.map((agent) => (
                      <Chip key={agent} label={agent} variant="outlined" size="small" />
                    ))}
                  </Stack>
                </Box>

                <Box>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Entities ({selectedCaseLocal.entityIds.length})
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {selectedCaseLocal.entityIds.length} entities assigned to this case
                  </Typography>
                </Box>

                {/* Documents Section */}
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Documents ({selectedCaseLocal.documents?.length || 0})
                  </Typography>
                  {selectedCaseLocal.documents && selectedCaseLocal.documents.length > 0 ? (
                    <Stack spacing={1}>
                      {selectedCaseLocal.documents.map((doc) => {
                        // Extract filename from path or URL
                        const getFilename = () => {
                          if (doc.path) {
                            return doc.path.split('/').pop() || doc.path;
                          }
                          if (doc.url) {
                            try {
                              const urlObj = new URL(doc.url);
                              return urlObj.pathname.split('/').pop() || doc.url;
                            } catch {
                              return doc.url;
                            }
                          }
                          return null;
                        };

                        const filename = getFilename();
                        const displayTitle = doc.title || filename || 'Untitled Document';

                        return (
                          <Paper
                            key={doc.id}
                            variant="outlined"
                            component={RouterLink}
                            to={`/documents?id=${doc.id}`}
                            sx={{
                              p: 1.5,
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 1.5,
                              cursor: 'pointer',
                              textDecoration: 'none',
                              '&:hover': { 
                                bgcolor: 'action.hover',
                                borderColor: 'primary.main',
                              },
                            }}
                          >
                            <Description sx={{ color: 'primary.main', mt: 0.5 }} />
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography 
                                variant="body2" 
                                sx={{ 
                                  fontWeight: 600,
                                  color: 'primary.main',
                                  '&:hover': { textDecoration: 'underline' },
                                }}
                              >
                                {displayTitle}
                              </Typography>
                              {filename && filename !== displayTitle && (
                                <Typography variant="caption" color="text.secondary" display="block" sx={{ fontFamily: 'monospace' }}>
                                  📎 {filename}
                                </Typography>
                              )}
                              <Typography variant="caption" color="text.secondary" display="block">
                                Type: {doc.type.toUpperCase()}
                                {doc.date && ` • Date: ${new Date(doc.date).toLocaleDateString()}`}
                              </Typography>
                              {doc.summary && (
                                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                                  {doc.summary}
                                </Typography>
                              )}
                              {doc.tags && doc.tags.length > 0 && (
                                <Box sx={{ mt: 0.5, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                  {doc.tags.map((tag) => (
                                    <Chip
                                      key={tag}
                                      label={tag}
                                      size="small"
                                      variant="outlined"
                                      sx={{ height: 18, fontSize: '0.65rem' }}
                                    />
                                  ))}
                                </Box>
                              )}
                            </Box>
                          </Paper>
                        );
                      })}
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      No documents attached to this case
                    </Typography>
                  )}
                </Box>

                {selectedCaseLocal.tags.length > 0 && (
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Tags
                    </Typography>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {selectedCaseLocal.tags.map((tag) => (
                        <Chip key={tag} label={tag} size="small" variant="outlined" />
                      ))}
                    </Stack>
                  </Box>
                )}

                {selectedCaseLocal.notes && (
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Notes
                    </Typography>
                    <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
                      <Typography variant="body2">{selectedCaseLocal.notes}</Typography>
                    </Paper>
                  </Box>
                )}
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDetailsDialogOpen(false)}>Close</Button>
              <Button variant="contained" onClick={() => handleEditCase(selectedCaseLocal)}>
                Edit Case
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Edit Case Dialog */}
      <CaseEditDialog
        open={editDialogOpen}
        caseData={caseToEdit}
        onClose={() => {
          setEditDialogOpen(false);
          setCaseToEdit(null);
        }}
        onSave={handleSaveEdit}
      />

      {/* Merge Cases Dialog */}
      <MergeCasesDialog
        open={mergeDialogOpen}
        cases={cases}
        preSelectedCaseIds={selectedForMerge}
        onClose={() => {
          setMergeDialogOpen(false);
          setSelectedForMerge([]);
        }}
        onMerge={handleMergeCases}
      />

      {/* Create Case Dialog - Placeholder */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Case</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField label="Case Name" fullWidth required />
            <TextField label="Description" fullWidth multiline rows={3} required />
            <FormControl fullWidth>
              <InputLabel>Priority</InputLabel>
              <Select defaultValue={CasePriority.MEDIUM}>
                <MenuItem value={CasePriority.CRITICAL}>Critical</MenuItem>
                <MenuItem value={CasePriority.HIGH}>High</MenuItem>
                <MenuItem value={CasePriority.MEDIUM}>Medium</MenuItem>
                <MenuItem value={CasePriority.LOW}>Low</MenuItem>
              </Select>
            </FormControl>
            <TextField label="Lead Agent" fullWidth />
            <TextField label="Classification" fullWidth defaultValue="CONFIDENTIAL" />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => setCreateDialogOpen(false)}>
            Create Case
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CasesPage;

