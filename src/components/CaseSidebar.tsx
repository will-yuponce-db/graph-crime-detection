import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  List,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Typography,
  Chip,
  Button,
  TextField,
  InputAdornment,
  Divider,
  IconButton,
  useTheme,
  Paper,
  Stack,
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Dashboard as AllEntitiesIcon,
  Psychology as AIIcon,
  FolderOpen as CasesIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import { Pagination } from '@mui/material';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { 
  selectCase, 
  detectCommunitiesAndCreateCases,
  approveDetectedCase,
  declineDetectedCase,
  approveAllDetectedCases,
  declineAllDetectedCases,
} from '../store/casesSlice';
import { CaseStatus, type Case } from '../types/case';
import CaseReviewDialog from './CaseReviewDialog';

interface CaseSidebarProps {
  onCreateCase: () => void;
}

const CaseSidebar: React.FC<CaseSidebarProps> = ({ onCreateCase }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  
  // Get state from Redux
  const selectedCaseId = useAppSelector(state => state.cases?.selectedCaseId);
  const allCases = useAppSelector(state => state.cases?.cases || []);
  const detectedCases = useAppSelector(state => state.cases?.detectedCases || []);
  const selectedCase = allCases.find(c => c.id === selectedCaseId) || null;
  
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [aiSuggestionsExpanded, setAiSuggestionsExpanded] = useState(true);
  const [fieldedCasesExpanded, setFieldedCasesExpanded] = useState(true);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [caseToReview, setCaseToReview] = useState<Case | null>(null);
  
  // Pagination state
  const [aiSuggestionsPage, setAiSuggestionsPage] = useState(1);
  const [fieldedCasesPage, setFieldedCasesPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  // Handle case selection - updates both Redux and URL
  const handleSelectCase = (caseId: string | null) => {
    // Update Redux state
    dispatch(selectCase(caseId));
    
    // Update URL if we're on a page that supports case filtering
    // Timeline and Map temporarily hidden
    if (['/graph'].includes(location.pathname)) {
      if (caseId) {
        navigate(`${location.pathname}?case=${caseId}`, { replace: true });
      } else {
        navigate(location.pathname, { replace: true });
      }
    }
  };

  // AI detection and approval handlers
  const handleOpenReview = (detectedCase: Case) => {
    setCaseToReview(detectedCase);
    setReviewDialogOpen(true);
  };

  const handleCloseReview = () => {
    setReviewDialogOpen(false);
    setCaseToReview(null);
  };

  const handleApprove = (caseId: string) => {
    dispatch(approveDetectedCase(caseId));
  };

  const handleDecline = (caseId: string) => {
    dispatch(declineDetectedCase(caseId));
  };

  const handleApproveAll = () => {
    dispatch(approveAllDetectedCases());
  };

  const handleDeclineAll = () => {
    dispatch(declineAllDetectedCases());
  };

  // Filter cases by search query
  const filteredCases = allCases.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.caseNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Paginate AI suggestions
  const totalAiPages = Math.ceil(detectedCases.length / ITEMS_PER_PAGE);
  const paginatedDetectedCases = detectedCases.slice(
    (aiSuggestionsPage - 1) * ITEMS_PER_PAGE,
    aiSuggestionsPage * ITEMS_PER_PAGE
  );

  // Paginate fielded cases
  const totalFieldedPages = Math.ceil(filteredCases.length / ITEMS_PER_PAGE);
  const paginatedCases = filteredCases.slice(
    (fieldedCasesPage - 1) * ITEMS_PER_PAGE,
    fieldedCasesPage * ITEMS_PER_PAGE
  );

  // Group paginated cases by status
  const paginatedCasesByStatus = paginatedCases.reduce((acc, c) => {
    if (!acc[c.status]) {
      acc[c.status] = [];
    }
    acc[c.status].push(c);
    return acc;
  }, {} as Record<string, typeof allCases>);

  const getStatusColor = (status: CaseStatus) => {
    switch (status) {
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

  const statusOrder = [
    CaseStatus.LEADS,
    CaseStatus.ACTIVE_INVESTIGATION,
    CaseStatus.PROSECUTION,
    CaseStatus.CLOSED,
  ];

  if (collapsed) {
    return (
      <Paper
        elevation={2}
        sx={{
          width: 48,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          py: 2,
          borderRadius: 0,
        }}
      >
        <IconButton onClick={() => setCollapsed(false)} size="small">
          <ChevronRightIcon />
        </IconButton>
      </Paper>
    );
  }

  return (
    <Paper
      elevation={2}
      sx={{
        width: 320,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 0,
      }}
    >
      {/* Header */}
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem' }}>
          Cases
        </Typography>
        <IconButton onClick={() => setCollapsed(true)} size="small">
          <ChevronLeftIcon />
        </IconButton>
      </Box>

      {/* Search */}
      <Box sx={{ px: 2, pb: 2 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Search cases..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {/* Action Buttons */}
      <Box sx={{ px: 2, pb: 2 }}>
        <Stack spacing={1}>
          <Button
            fullWidth
            variant="contained"
            startIcon={<CasesIcon />}
            onClick={() => navigate('/cases')}
            size="small"
            color="primary"
          >
            Manage Cases
          </Button>
          <Button
            fullWidth
            variant="contained"
            startIcon={<AIIcon />}
            onClick={() => dispatch(detectCommunitiesAndCreateCases())}
            size="small"
            color="secondary"
          >
            Detect Communities
          </Button>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={onCreateCase}
            size="small"
          >
            New Case
          </Button>
        </Stack>
      </Box>

      <Divider />

      {/* Case List */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <List dense>
          {/* All Entities Option */}
          <ListItemButton
            selected={selectedCase === null}
            onClick={() => {
              handleSelectCase(null);
            }}
            sx={{
              py: 1.5,
              borderLeft: selectedCase === null ? `4px solid ${theme.palette.primary.main}` : '4px solid transparent',
            }}
          >
            <ListItemIcon>
              <AllEntitiesIcon color={selectedCase === null ? 'primary' : 'inherit'} />
            </ListItemIcon>
            <ListItemText
              primary="All Entities"
              secondary={`${allCases.reduce((sum, c) => sum + c.entityIds.length, 0)} total`}
              primaryTypographyProps={{
                fontWeight: selectedCase === null ? 600 : 400,
                fontSize: '0.875rem',
              }}
              secondaryTypographyProps={{
                fontSize: '0.75rem',
              }}
            />
          </ListItemButton>

          <Divider sx={{ my: 1 }} />

          {/* AI Suggestions Section */}
          {detectedCases.length > 0 && (
            <>
              <ListItemButton
                onClick={() => setAiSuggestionsExpanded(!aiSuggestionsExpanded)}
                sx={{
                  bgcolor: (theme) =>
                    theme.palette.mode === 'dark' ? 'rgba(237, 108, 2, 0.15)' : 'rgba(237, 108, 2, 0.08)',
                  borderLeft: 4,
                  borderColor: 'warning.main',
                  '&:hover': {
                    bgcolor: (theme) =>
                      theme.palette.mode === 'dark' ? 'rgba(237, 108, 2, 0.25)' : 'rgba(237, 108, 2, 0.15)',
                  },
                  mb: 1,
                }}
              >
                <ListItemIcon>
                  <AIIcon color="warning" sx={{ fontSize: 28 }} />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography component="span" variant="subtitle2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                        AI Suggestions
                      </Typography>
                      <Chip
                        label={detectedCases.length}
                        size="small"
                        color="warning"
                        sx={{ height: 18, fontWeight: 600 }}
                      />
                    </Box>
                  }
                  secondary="Review AI-detected cases"
                  secondaryTypographyProps={{ component: 'span' }}
                />
                <IconButton size="small" sx={{ mr: -1 }}>
                  {aiSuggestionsExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
              </ListItemButton>

              {aiSuggestionsExpanded && (
                <Box sx={{ bgcolor: 'action.hover', py: 1, mb: 1 }}>
                  {/* Bulk Actions */}
                  <Box sx={{ px: 2, pb: 1, display: 'flex', gap: 1 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      onClick={handleDeclineAll}
                      fullWidth
                      sx={{ fontSize: '0.7rem', py: 0.5 }}
                    >
                      Decline All
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      onClick={handleApproveAll}
                      fullWidth
                      sx={{ fontSize: '0.7rem', py: 0.5 }}
                    >
                      Approve All
                    </Button>
                  </Box>

                  {/* Detected Cases List */}
                  <List disablePadding dense>
                    {paginatedDetectedCases.map((detectedCase) => (
                      <Paper
                        key={detectedCase.id}
                        elevation={0}
                        sx={{
                          mx: 1,
                          mb: 1,
                          border: 1,
                          borderColor: 'divider',
                          borderRadius: 1,
                          overflow: 'hidden',
                        }}
                      >
                        <ListItemButton
                          onClick={() => handleOpenReview(detectedCase)}
                          sx={{ py: 0.75, px: 1.5 }}
                        >
                          <ListItemText
                            primary={
                              <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                                <Typography component="span" variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                                  {detectedCase.name.length > 25 ? detectedCase.name.substring(0, 25) + '...' : detectedCase.name}
                                </Typography>
                                <Chip
                                  label={detectedCase.priority}
                                  size="small"
                                  color={
                                    detectedCase.priority === 'Critical'
                                      ? 'error'
                                      : detectedCase.priority === 'High'
                                      ? 'warning'
                                      : 'default'
                                  }
                                  sx={{ height: 16, fontSize: '0.6rem' }}
                                />
                              </Box>
                            }
                            secondary={
                              <Box component="span">
                                <Typography component="span" variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                                  {detectedCase.entityIds.length} entities • {detectedCase.documents?.length || 0} docs
                                </Typography>
                              </Box>
                            }
                            secondaryTypographyProps={{ component: 'span' }}
                          />
                        </ListItemButton>
                        <Divider />
                        <Box sx={{ display: 'flex', gap: 0.5, p: 0.5, bgcolor: 'background.default' }}>
                          <Button
                            size="small"
                            color="error"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDecline(detectedCase.id);
                            }}
                            sx={{ fontSize: '0.65rem', py: 0.25, minWidth: 60, flex: 1 }}
                          >
                            Decline
                          </Button>
                          <Button
                            size="small"
                            color="success"
                            variant="contained"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleApprove(detectedCase.id);
                            }}
                            sx={{ fontSize: '0.65rem', py: 0.25, minWidth: 60, flex: 1 }}
                          >
                            Approve
                          </Button>
                        </Box>
                      </Paper>
                    ))}
                  </List>

                  {/* AI Suggestions Pagination */}
                  {totalAiPages > 1 && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
                      <Pagination
                        count={totalAiPages}
                        page={aiSuggestionsPage}
                        onChange={(_e, page) => setAiSuggestionsPage(page)}
                        size="small"
                        color="secondary"
                        siblingCount={0}
                        boundaryCount={1}
                      />
                    </Box>
                  )}
                </Box>
              )}

              <Divider sx={{ my: 1 }} />
            </>
          )}

          {/* Fielded Cases Header - Collapsible */}
          <ListItemButton
            onClick={() => setFieldedCasesExpanded(!fieldedCasesExpanded)}
            sx={{
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              '&:hover': {
                bgcolor: 'primary.dark',
              },
              mb: 1,
            }}
          >
            <ListItemText
              primary={
                <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography component="span" variant="caption" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>
                    FIELDED CASES
                  </Typography>
                  <Chip
                    label={allCases.length}
                    size="small"
                    sx={{ 
                      height: 18, 
                      fontWeight: 600,
                      bgcolor: 'primary.dark',
                      color: 'primary.contrastText',
                    }}
                  />
                </Box>
              }
            />
            <IconButton size="small" sx={{ color: 'primary.contrastText', mr: -1 }}>
              {fieldedCasesExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </ListItemButton>

          {/* Cases by Status - Collapsible */}
          {fieldedCasesExpanded && statusOrder.map((status) => {
            const casesInStatus = paginatedCasesByStatus[status] || [];
            if (casesInStatus.length === 0) return null;

            return (
              <Box key={status}>
                <Box sx={{ px: 2, py: 1, bgcolor: 'action.hover' }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>
                      {status}
                    </Typography>
                    <Chip
                      label={casesInStatus.length}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: '0.65rem',
                        bgcolor: getStatusColor(status),
                        color: 'white',
                      }}
                    />
                  </Stack>
                </Box>

                {casesInStatus.map((caseItem) => (
                  <ListItemButton
                    key={caseItem.id}
                    selected={selectedCase?.id === caseItem.id}
                    onClick={() => {
                      handleSelectCase(caseItem.id);
                    }}
                    sx={{
                      py: 1,
                      pl: 3,
                      pr: 6,
                      borderLeft: selectedCase?.id === caseItem.id ? `4px solid ${getStatusColor(status)}` : '4px solid transparent',
                    }}
                  >
                    <ListItemIcon>
                      <CasesIcon
                        fontSize="small"
                        sx={{ color: selectedCase?.id === caseItem.id ? getStatusColor(status) : 'inherit' }}
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={caseItem.name}
                      primaryTypographyProps={{
                        variant: 'body2',
                        sx: {
                          fontWeight: selectedCase?.id === caseItem.id ? 600 : 400,
                          fontSize: '0.875rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }
                      }}
                      secondary={
                        <Box component="span" sx={{ display: 'block', mt: 0.5 }}>
                          <Typography component="span" variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', display: 'block' }}>
                            {caseItem.caseNumber}
                          </Typography>
                          <Box component="span" sx={{ mt: 0.5, display: 'block' }}>
                            <Chip
                              label={caseItem.priority}
                              size="small"
                              color={caseItem.priority === 'Critical' ? 'error' : 'default'}
                              sx={{ height: 16, fontSize: '0.65rem', mr: 0.5 }}
                            />
                            <Chip
                              label={`${caseItem.entityIds.length} entities`}
                              size="small"
                              variant="outlined"
                              sx={{ height: 16, fontSize: '0.65rem' }}
                            />
                          </Box>
                        </Box>
                      }
                      secondaryTypographyProps={{
                        component: 'span'
                      }}
                    />
                  </ListItemButton>
                ))}
              </Box>
            );
          })}

          {/* Fielded Cases Pagination */}
          {fieldedCasesExpanded && totalFieldedPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2, px: 2 }}>
              <Pagination
                count={totalFieldedPages}
                page={fieldedCasesPage}
                onChange={(_e, page) => setFieldedCasesPage(page)}
                size="small"
                color="primary"
                siblingCount={0}
                boundaryCount={1}
              />
            </Box>
          )}
        </List>
      </Box>

      {/* Footer Stats */}
      {selectedCase && (
        <>
          <Divider />
          <Box sx={{ p: 2, bgcolor: 'action.hover' }}>
            <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 1 }}>
              Selected Case
            </Typography>
            <Stack spacing={0.5}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                Entities: {selectedCase.entityIds.length}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                Team: {selectedCase.assignedAgents.length} agents
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                Updated: {selectedCase.updatedDate.toLocaleDateString()}
              </Typography>
            </Stack>
          </Box>
        </>
      )}

      {/* Case Review Dialog */}
      <CaseReviewDialog
        open={reviewDialogOpen}
        caseToReview={caseToReview}
        onClose={handleCloseReview}
        onApprove={handleApprove}
        onDecline={handleDecline}
      />
    </Paper>
  );
};

export default CaseSidebar;

