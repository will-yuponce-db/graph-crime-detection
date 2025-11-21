import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Chip,
  Box,
  Typography,
  IconButton,
  Stepper,
  Step,
  StepLabel,
  StepButton,
  Alert,
} from '@mui/material';
import {
  Close as CloseIcon,
  ArrowForward as NextIcon,
  Check as CheckIcon,
} from '@mui/icons-material';
import type { Case } from '../types/case';
import { CaseStatus, CasePriority } from '../types/case';

interface CaseEditDialogProps {
  open: boolean;
  caseData: Case | null;
  onClose: () => void;
  onSave: (caseId: string, updates: Partial<Case>) => void;
}

const statusOrder = [
  CaseStatus.LEADS,
  CaseStatus.ACTIVE_INVESTIGATION,
  CaseStatus.PROSECUTION,
  CaseStatus.CLOSED,
];

const statusLabels: Record<CaseStatus, string> = {
  [CaseStatus.LEADS]: 'Leads',
  [CaseStatus.ACTIVE_INVESTIGATION]: 'Investigation',
  [CaseStatus.PROSECUTION]: 'Prosecution',
  [CaseStatus.CLOSED]: 'Closed',
};

const statusDescriptions: Record<CaseStatus, string> = {
  [CaseStatus.LEADS]: 'Initial leads and intelligence gathering',
  [CaseStatus.ACTIVE_INVESTIGATION]: 'Active investigation in progress',
  [CaseStatus.PROSECUTION]: 'Case referred to prosecution',
  [CaseStatus.CLOSED]: 'Case closed - resolved or archived',
};

const CaseEditDialog: React.FC<CaseEditDialogProps> = ({ open, caseData, onClose, onSave }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<CasePriority>(CasePriority.MEDIUM);
  const [status, setStatus] = useState<CaseStatus>(CaseStatus.LEADS);
  const [leadAgent, setLeadAgent] = useState('');
  const [classification, setClassification] = useState('CONFIDENTIAL');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    if (caseData) {
      setName(caseData.name);
      setDescription(caseData.description);
      setPriority(caseData.priority);
      setStatus(caseData.status);
      setLeadAgent(caseData.leadAgent || '');
      setClassification(caseData.classification);
      setNotes(caseData.notes || '');
      setTags(caseData.tags || []);
    }
  }, [caseData]);

  const handleSave = () => {
    if (!caseData) return;

    onSave(caseData.id, {
      name,
      description,
      priority,
      status,
      leadAgent: leadAgent || undefined,
      classification,
      notes: notes || undefined,
      tags,
    });
    onClose();
  };

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const currentStepIndex = statusOrder.indexOf(status);

  const canMoveToNextStatus = currentStepIndex < statusOrder.length - 1;
  const nextStatus = canMoveToNextStatus ? statusOrder[currentStepIndex + 1] : null;

  const handleMoveToNextStatus = () => {
    if (nextStatus) {
      setStatus(nextStatus);
    }
  };

  const getStatusColor = (s: CaseStatus) => {
    switch (s) {
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

  if (!caseData) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Edit Case</Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={3}>
          {/* Case Lifecycle Stepper */}
          <Box>
            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
              Case Lifecycle
            </Typography>
            <Stepper activeStep={currentStepIndex} alternativeLabel sx={{ mt: 2 }}>
              {statusOrder.map((s, index) => (
                <Step key={s} completed={index < currentStepIndex}>
                  <StepButton
                    onClick={() => setStatus(s)}
                    sx={{
                      '& .MuiStepLabel-label': {
                        fontSize: '0.875rem',
                      },
                    }}
                  >
                    <StepLabel
                      sx={{
                        '& .MuiStepIcon-root': {
                          color: index <= currentStepIndex ? getStatusColor(s) : 'inherit',
                        },
                      }}
                    >
                      {statusLabels[s]}
                    </StepLabel>
                  </StepButton>
                </Step>
              ))}
            </Stepper>

            {/* Quick Status Transition */}
            {canMoveToNextStatus && (
              <Alert
                severity="info"
                sx={{ mt: 2 }}
                action={
                  <Button
                    color="inherit"
                    size="small"
                    startIcon={<NextIcon />}
                    onClick={handleMoveToNextStatus}
                  >
                    Move to {statusLabels[nextStatus!]}
                  </Button>
                }
              >
                <Typography variant="caption">
                  Current: <strong>{statusDescriptions[status]}</strong>
                </Typography>
              </Alert>
            )}

            {status === CaseStatus.CLOSED && (
              <Alert severity="success" sx={{ mt: 2 }} icon={<CheckIcon />}>
                Case is closed
              </Alert>
            )}
          </Box>

          {/* Basic Information */}
          <TextField
            label="Case Name"
            fullWidth
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <TextField
            label="Description"
            fullWidth
            multiline
            rows={3}
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          {/* Priority and Classification */}
          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Priority</InputLabel>
              <Select
                value={priority}
                onChange={(e) => setPriority(e.target.value as CasePriority)}
                label="Priority"
              >
                <MenuItem value={CasePriority.CRITICAL}>Critical</MenuItem>
                <MenuItem value={CasePriority.HIGH}>High</MenuItem>
                <MenuItem value={CasePriority.MEDIUM}>Medium</MenuItem>
                <MenuItem value={CasePriority.LOW}>Low</MenuItem>
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel>Classification</InputLabel>
              <Select
                value={classification}
                onChange={(e) => setClassification(e.target.value)}
                label="Classification"
              >
                <MenuItem value="UNCLASSIFIED">Unclassified</MenuItem>
                <MenuItem value="CONFIDENTIAL">Confidential</MenuItem>
                <MenuItem value="SECRET">Secret</MenuItem>
                <MenuItem value="TOP SECRET">Top Secret</MenuItem>
              </Select>
            </FormControl>
          </Box>

          {/* Lead Agent */}
          <TextField
            label="Lead Agent"
            fullWidth
            value={leadAgent}
            onChange={(e) => setLeadAgent(e.target.value)}
            helperText="Optional: Assign a lead investigator"
          />

          {/* Tags */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Tags
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <TextField
                size="small"
                placeholder="Add tag..."
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                sx={{ flexGrow: 1 }}
              />
              <Button onClick={handleAddTag} variant="outlined" size="small">
                Add
              </Button>
            </Box>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {tags.map((tag) => (
                <Chip key={tag} label={tag} size="small" onDelete={() => handleRemoveTag(tag)} />
              ))}
            </Stack>
          </Box>

          {/* Notes */}
          <TextField
            label="Notes"
            fullWidth
            multiline
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Case notes, observations, next steps..."
          />
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={!name.trim() || !description.trim()}
        >
          Save Changes
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CaseEditDialog;
