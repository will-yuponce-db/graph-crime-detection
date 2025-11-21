import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Stack,
  Chip,
  IconButton,
  Collapse,
  Alert,
  AlertTitle,
  Divider,
} from '@mui/material';
import {
  Psychology as AIIcon,
  Check as ApproveIcon,
  Close as DeclineIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
  CheckCircle as ApproveAllIcon,
  Cancel as DeclineAllIcon,
  Visibility as ReviewIcon,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  approveDetectedCase,
  declineDetectedCase,
  approveAllDetectedCases,
  declineAllDetectedCases,
} from '../store/casesSlice';
import type { Case } from '../types/case';
import CaseReviewDialog from './CaseReviewDialog';

const DetectedCasesPanel: React.FC = () => {
  const dispatch = useAppDispatch();
  const detectedCases = useAppSelector((state) => state.cases?.detectedCases || []);
  const [expanded, setExpanded] = React.useState(false); // Start collapsed
  const [reviewDialogOpen, setReviewDialogOpen] = React.useState(false);
  const [caseToReview, setCaseToReview] = React.useState<Case | null>(null);

  if (detectedCases.length === 0) {
    return null;
  }

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

  return (
    <Paper
      elevation={3}
      sx={{
        borderRadius: 0,
        borderLeft: 4,
        borderColor: 'warning.main',
        bgcolor: (theme) =>
          theme.palette.mode === 'dark' ? 'rgba(237, 108, 2, 0.1)' : 'rgba(237, 108, 2, 0.05)',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 2,
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <AIIcon color="warning" sx={{ fontSize: 32 }} />
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
              AI-Detected Cases
              <Chip
                label={detectedCases.length}
                size="small"
                color="warning"
                sx={{ fontWeight: 600 }}
              />
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Review and approve detected criminal networks
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button
            variant="outlined"
            size="small"
            color="error"
            startIcon={<DeclineAllIcon />}
            onClick={(e) => {
              e.stopPropagation();
              handleDeclineAll();
            }}
          >
            Decline All
          </Button>
          <Button
            variant="contained"
            size="small"
            color="success"
            startIcon={<ApproveAllIcon />}
            onClick={(e) => {
              e.stopPropagation();
              handleApproveAll();
            }}
          >
            Approve All
          </Button>
          <IconButton size="small">
            {expanded ? <CollapseIcon /> : <ExpandIcon />}
          </IconButton>
        </Box>
      </Box>

      <Collapse in={expanded}>
        <Divider />
        <Box sx={{ p: 2 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            <AlertTitle>Pending Approval</AlertTitle>
            These cases were automatically detected by AI and are not yet saved. Review each case and
            approve to add to your case list, or decline to dismiss.
          </Alert>

          <Stack spacing={2}>
            {detectedCases.map((detectedCase: Case) => (
              <Paper
                key={detectedCase.id}
                variant="outlined"
                sx={{
                  p: 2,
                  '&:hover': {
                    bgcolor: 'action.hover',
                  },
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600 }}>
                        {detectedCase.name}
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
                        sx={{ height: 20 }}
                      />
                    </Box>

                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {detectedCase.description}
                    </Typography>

                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      <Chip
                        label={`${detectedCase.entityIds.length} entities`}
                        size="small"
                        variant="outlined"
                      />
                      {detectedCase.tags.map((tag) => (
                        <Chip key={tag} label={tag} size="small" variant="outlined" />
                      ))}
                    </Box>
                  </Box>

                  <Stack direction="row" spacing={1} sx={{ ml: 2 }}>
                    <Button
                      variant="contained"
                      size="small"
                      color="primary"
                      startIcon={<ReviewIcon />}
                      onClick={() => handleOpenReview(detectedCase)}
                    >
                      Review
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      color="error"
                      startIcon={<DeclineIcon />}
                      onClick={() => handleDecline(detectedCase.id)}
                    >
                      Decline
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      color="success"
                      startIcon={<ApproveIcon />}
                      onClick={() => handleApprove(detectedCase.id)}
                    >
                      Quick Approve
                    </Button>
                  </Stack>
                </Box>
              </Paper>
            ))}
          </Stack>
        </Box>
      </Collapse>

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

export default DetectedCasesPanel;

