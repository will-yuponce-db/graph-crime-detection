import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Checkbox,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemButton,
  Chip,
  Alert,
  TextField,
  FormControlLabel,
  Switch,
  Divider,
  Stack,
  IconButton,
} from '@mui/material';
import {
  MergeType as MergeIcon,
  Close as CloseIcon,
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
} from '@mui/icons-material';
import type { Case } from '../types/case';

interface MergeCasesDialogProps {
  open: boolean;
  cases: Case[];
  preSelectedCaseIds?: string[];
  onClose: () => void;
  onMerge: (targetCaseId: string, sourceCaseIds: string[], options: { keepSourceCases: boolean; newName?: string; newDescription?: string }) => void;
}

const MergeCasesDialog: React.FC<MergeCasesDialogProps> = ({
  open,
  cases,
  preSelectedCaseIds = [],
  onClose,
  onMerge,
}) => {
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>(preSelectedCaseIds);
  const [targetCaseId, setTargetCaseId] = useState<string | null>(preSelectedCaseIds[0] || null);
  const [keepSourceCases, setKeepSourceCases] = useState(false);
  const [customizeName, setCustomizeName] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const handleToggleCase = (caseId: string) => {
    setSelectedCaseIds(prev => {
      if (prev.includes(caseId)) {
        const updated = prev.filter(id => id !== caseId);
        // If removed case was target, set new target
        if (caseId === targetCaseId && updated.length > 0) {
          setTargetCaseId(updated[0]);
        }
        return updated;
      } else {
        // If this is first selection, make it target
        if (prev.length === 0) {
          setTargetCaseId(caseId);
        }
        return [...prev, caseId];
      }
    });
  };

  const handleSetTarget = (caseId: string) => {
    setTargetCaseId(caseId);
    // Ensure target is selected
    if (!selectedCaseIds.includes(caseId)) {
      setSelectedCaseIds([...selectedCaseIds, caseId]);
    }
  };

  const handleMerge = () => {
    if (!targetCaseId || selectedCaseIds.length < 2) return;

    const sourceCaseIds = selectedCaseIds.filter(id => id !== targetCaseId);

    onMerge(targetCaseId, sourceCaseIds, {
      keepSourceCases,
      newName: customizeName ? newName : undefined,
      newDescription: customizeName ? newDescription : undefined,
    });

    // Reset state
    setSelectedCaseIds([]);
    setTargetCaseId(null);
    setKeepSourceCases(false);
    setCustomizeName(false);
    setNewName('');
    setNewDescription('');
    onClose();
  };

  const targetCase = cases.find(c => c.id === targetCaseId);
  const sourceCases = cases.filter(c => selectedCaseIds.includes(c.id) && c.id !== targetCaseId);

  // Calculate merged stats
  const totalEntities = new Set(
    selectedCaseIds.flatMap(id => {
      const c = cases.find(x => x.id === id);
      return c?.entityIds || [];
    })
  ).size;

  const totalDocuments = selectedCaseIds.reduce((sum, id) => {
    const c = cases.find(x => x.id === id);
    return sum + (c?.documents?.length || 0);
  }, 0);

  const totalAgents = new Set(
    selectedCaseIds.flatMap(id => {
      const c = cases.find(x => x.id === id);
      return c?.assignedAgents || [];
    })
  ).size;

  const canMerge = selectedCaseIds.length >= 2 && targetCaseId !== null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <MergeIcon color="primary" />
            <Typography variant="h6">Merge Cases</Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={3}>
          {/* Instructions */}
          <Alert severity="info" icon={<MergeIcon />}>
            <Typography variant="body2" fontWeight={600} gutterBottom>
              How to merge cases:
            </Typography>
            <Typography variant="body2">
              1. Select cases to merge (minimum 2)<br />
              2. Choose target case (keeps its ID and case number)<br />
              3. Entities, documents, and metadata will be combined
            </Typography>
          </Alert>

          {/* Case Selection */}
          <Box>
            <Typography variant="subtitle2" gutterBottom fontWeight={600}>
              Select Cases to Merge ({selectedCaseIds.length} selected)
            </Typography>
            <List sx={{ maxHeight: 300, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
              {cases.map((caseItem) => {
                const isSelected = selectedCaseIds.includes(caseItem.id);
                const isTarget = targetCaseId === caseItem.id;

                return (
                  <ListItem
                    key={caseItem.id}
                    disablePadding
                    secondaryAction={
                      isSelected && (
                        <Button
                          size="small"
                          variant={isTarget ? 'contained' : 'outlined'}
                          onClick={() => handleSetTarget(caseItem.id)}
                          disabled={isTarget}
                        >
                          {isTarget ? 'Target' : 'Set as Target'}
                        </Button>
                      )
                    }
                  >
                    <ListItemButton onClick={() => handleToggleCase(caseItem.id)} dense>
                      <ListItemIcon>
                        <Checkbox
                          edge="start"
                          checked={isSelected}
                          tabIndex={-1}
                          disableRipple
                        />
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" fontWeight={isTarget ? 600 : 400}>
                              {caseItem.name}
                            </Typography>
                            {isTarget && <Chip label="Target" size="small" color="primary" />}
                          </Box>
                        }
                        secondary={
                          <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                            <Chip label={caseItem.caseNumber} size="small" variant="outlined" />
                            <Chip label={caseItem.status} size="small" />
                            <Chip label={`${caseItem.entityIds.length} entities`} size="small" variant="outlined" />
                            <Chip label={`${caseItem.documents?.length || 0} docs`} size="small" variant="outlined" />
                          </Box>
                        }
                      />
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          </Box>

          {/* Preview */}
          {canMerge && (
            <>
              <Divider />
              <Box>
                <Typography variant="subtitle2" gutterBottom fontWeight={600}>
                  Merge Preview
                </Typography>
                <Box sx={{ bgcolor: 'action.hover', p: 2, borderRadius: 1 }}>
                  <Stack spacing={2}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Target Case (will be kept):
                      </Typography>
                      <Typography variant="body2" fontWeight={600}>
                        {targetCase?.name} ({targetCase?.caseNumber})
                      </Typography>
                    </Box>

                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Source Cases (will be merged into target):
                      </Typography>
                      {sourceCases.map(c => (
                        <Typography key={c.id} variant="body2">
                          • {c.name} ({c.caseNumber})
                        </Typography>
                      ))}
                    </Box>

                    <Divider />

                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Total Entities
                        </Typography>
                        <Typography variant="h6" color="primary.main">
                          {totalEntities}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Total Documents
                        </Typography>
                        <Typography variant="h6" color="primary.main">
                          {totalDocuments}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Total Agents
                        </Typography>
                        <Typography variant="h6" color="primary.main">
                          {totalAgents}
                        </Typography>
                      </Box>
                    </Box>
                  </Stack>
                </Box>
              </Box>

              {/* Options */}
              <Box>
                <Typography variant="subtitle2" gutterBottom fontWeight={600}>
                  Merge Options
                </Typography>
                <Stack spacing={2}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={keepSourceCases}
                        onChange={(e) => setKeepSourceCases(e.target.checked)}
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body2">Keep source cases</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Source cases will be marked as "merged" but not deleted
                        </Typography>
                      </Box>
                    }
                  />

                  <FormControlLabel
                    control={
                      <Switch
                        checked={customizeName}
                        onChange={(e) => setCustomizeName(e.target.checked)}
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body2">Customize merged case name</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Provide a new name and description for the merged case
                        </Typography>
                      </Box>
                    }
                  />

                  {customizeName && (
                    <Box sx={{ pl: 4 }}>
                      <Stack spacing={2}>
                        <TextField
                          label="New Case Name"
                          fullWidth
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          placeholder={targetCase?.name}
                          size="small"
                        />
                        <TextField
                          label="New Description"
                          fullWidth
                          multiline
                          rows={2}
                          value={newDescription}
                          onChange={(e) => setNewDescription(e.target.value)}
                          placeholder={targetCase?.description}
                          size="small"
                        />
                      </Stack>
                    </Box>
                  )}
                </Stack>
              </Box>

              {!keepSourceCases && (
                <Alert severity="warning" icon={<WarningIcon />}>
                  <Typography variant="body2">
                    <strong>Warning:</strong> Source cases will be permanently deleted. All their data will be merged into the target case.
                  </Typography>
                </Alert>
              )}
            </>
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleMerge}
          variant="contained"
          disabled={!canMerge}
          startIcon={<MergeIcon />}
        >
          Merge {selectedCaseIds.length} Cases
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default MergeCasesDialog;


