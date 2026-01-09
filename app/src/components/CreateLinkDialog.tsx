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
  Typography,
  Slider,
  Alert,
  CircularProgress,
  Autocomplete,
  Box,
  Chip,
  useTheme,
} from '@mui/material';
import { Link as LinkIcon, Person, DeviceHub } from '@mui/icons-material';
import {
  createDevicePersonLink,
  fetchEntitiesWithLinkStatus,
  type EntityWithLinkStatus,
} from '../services/api';

interface CreateLinkDialogProps {
  open: boolean;
  onClose: () => void;
  onLinkCreated?: () => void;
  initialDeviceId?: string;
  initialPersonId?: string;
}

const RELATIONSHIPS = [
  { value: 'owner', label: 'Owner', description: 'Confirmed device owner' },
  { value: 'suspected_owner', label: 'Suspected Owner', description: 'Likely but unconfirmed owner' },
  { value: 'burner', label: 'Burner Phone', description: 'Temporary/disposable device' },
  { value: 'shared', label: 'Shared Device', description: 'Used by multiple people' },
  { value: 'temporary', label: 'Temporary Use', description: 'Short-term access to device' },
];

const CreateLinkDialog: React.FC<CreateLinkDialogProps> = ({
  open,
  onClose,
  onLinkCreated,
  initialDeviceId,
  initialPersonId,
}) => {
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [loadingEntities, setLoadingEntities] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Entity lists
  const [persons, setPersons] = useState<EntityWithLinkStatus[]>([]);
  const [devices, setDevices] = useState<EntityWithLinkStatus[]>([]);

  // Form state
  const [selectedDevice, setSelectedDevice] = useState<EntityWithLinkStatus | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<EntityWithLinkStatus | null>(null);
  const [relationship, setRelationship] = useState('suspected_owner');
  const [confidence, setConfidence] = useState(0.7);
  const [notes, setNotes] = useState('');

  // Load entities on open
  useEffect(() => {
    if (open) {
      loadEntities();
    }
  }, [open]);

  // Set initial values when entities load
  useEffect(() => {
    if (initialDeviceId && devices.length > 0) {
      const device = devices.find((d) => d.id === initialDeviceId);
      if (device) setSelectedDevice(device);
    }
    if (initialPersonId && persons.length > 0) {
      const person = persons.find((p) => p.id === initialPersonId);
      if (person) setSelectedPerson(person);
    }
  }, [initialDeviceId, initialPersonId, devices, persons]);

  const loadEntities = async () => {
    try {
      setLoadingEntities(true);
      setError(null);
      const data = await fetchEntitiesWithLinkStatus();
      setPersons(data.persons);
      setDevices(data.devices);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load entities');
    } finally {
      setLoadingEntities(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedDevice || !selectedPerson) {
      setError('Please select both a device and a person');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await createDevicePersonLink({
        deviceId: selectedDevice.id,
        personId: selectedPerson.id,
        relationship,
        confidence,
        notes: notes.trim() || undefined,
      });

      onLinkCreated?.();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create link');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedDevice(null);
    setSelectedPerson(null);
    setRelationship('suspected_owner');
    setConfidence(0.7);
    setNotes('');
    setError(null);
    onClose();
  };

  const getConfidenceLabel = (value: number) => {
    if (value >= 0.9) return 'Very High';
    if (value >= 0.7) return 'High';
    if (value >= 0.5) return 'Medium';
    if (value >= 0.3) return 'Low';
    return 'Very Low';
  };

  const getConfidenceColor = (value: number) => {
    if (value >= 0.7) return theme.palette.success.main;
    if (value >= 0.5) return theme.palette.warning.main;
    return theme.palette.error.main;
  };

  // Filter to show only unlinked devices by default, but allow searching all
  const unlinkedDevices = devices.filter((d) => !d.isLinked);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <LinkIcon sx={{ color: theme.palette.accent.purple }} />
          <Typography variant="h6">Create Device-Person Link</Typography>
        </Stack>
      </DialogTitle>

      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {loadingEntities ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Stack spacing={3} sx={{ mt: 1 }}>
            {/* Device Selection */}
            <Autocomplete
              value={selectedDevice}
              onChange={(_, newValue) => setSelectedDevice(newValue)}
              options={devices}
              getOptionLabel={(option) => `${option.id} - ${option.name}`}
              renderOption={(props, option) => (
                <Box component="li" {...props}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ width: '100%' }}>
                    <DeviceHub
                      sx={{
                        fontSize: 16,
                        color: option.isLinked ? theme.palette.success.main : theme.palette.text.secondary,
                      }}
                    />
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2">{option.id}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {option.linkedCities?.join(', ') || 'Unknown location'}
                      </Typography>
                    </Box>
                    {option.isLinked && (
                      <Chip
                        label={`→ ${option.linkedPersonName || option.linkedPersonId}`}
                        size="small"
                        sx={{ height: 20, fontSize: '0.65rem' }}
                      />
                    )}
                    {option.totalScore && (
                      <Chip
                        label={`Score: ${option.totalScore.toFixed(1)}`}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: '0.65rem',
                          bgcolor:
                            (option.totalScore || 0) > 1.5
                              ? `${theme.palette.error.main}20`
                              : `${theme.palette.warning.main}20`,
                        }}
                      />
                    )}
                  </Stack>
                </Box>
              )}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Select Device"
                  placeholder="Search devices..."
                  InputProps={{
                    ...params.InputProps,
                    startAdornment: (
                      <>
                        <DeviceHub sx={{ color: 'text.secondary', mr: 1 }} />
                        {params.InputProps.startAdornment}
                      </>
                    ),
                  }}
                />
              )}
              groupBy={(option) => (option.isLinked ? 'Already Linked' : 'Unlinked')}
            />
            <Typography variant="caption" sx={{ color: 'text.secondary', mt: -2 }}>
              {unlinkedDevices.length} unlinked devices / {devices.length} total
            </Typography>

            {/* Person Selection */}
            <Autocomplete
              value={selectedPerson}
              onChange={(_, newValue) => setSelectedPerson(newValue)}
              options={persons}
              getOptionLabel={(option) => `${option.name}${option.alias ? ` (${option.alias})` : ''}`}
              renderOption={(props, option) => (
                <Box component="li" {...props}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ width: '100%' }}>
                    <Person
                      sx={{
                        fontSize: 16,
                        color: option.isSuspect ? theme.palette.error.main : theme.palette.text.secondary,
                      }}
                    />
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2">{option.name}</Typography>
                      {option.alias && (
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          "{option.alias}"
                        </Typography>
                      )}
                    </Box>
                    {option.riskLevel && (
                      <Chip
                        label={option.riskLevel}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: '0.65rem',
                          bgcolor:
                            option.riskLevel === 'high'
                              ? `${theme.palette.error.main}20`
                              : option.riskLevel === 'medium'
                                ? `${theme.palette.warning.main}20`
                                : `${theme.palette.success.main}20`,
                          color:
                            option.riskLevel === 'high'
                              ? theme.palette.error.main
                              : option.riskLevel === 'medium'
                                ? theme.palette.warning.main
                                : theme.palette.success.main,
                        }}
                      />
                    )}
                    {option.linkedDevices && option.linkedDevices.length > 0 && (
                      <Chip
                        label={`${option.linkedDevices.length} device(s)`}
                        size="small"
                        sx={{ height: 20, fontSize: '0.65rem' }}
                      />
                    )}
                  </Stack>
                </Box>
              )}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Select Person"
                  placeholder="Search persons..."
                  InputProps={{
                    ...params.InputProps,
                    startAdornment: (
                      <>
                        <Person sx={{ color: 'text.secondary', mr: 1 }} />
                        {params.InputProps.startAdornment}
                      </>
                    ),
                  }}
                />
              )}
              groupBy={(option) => (option.isSuspect ? 'Suspects' : 'Other Persons')}
            />

            {/* Relationship Type */}
            <FormControl fullWidth>
              <InputLabel>Relationship</InputLabel>
              <Select
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                label="Relationship"
              >
                {RELATIONSHIPS.map((rel) => (
                  <MenuItem key={rel.value} value={rel.value}>
                    <Stack>
                      <Typography variant="body2">{rel.label}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {rel.description}
                      </Typography>
                    </Stack>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Confidence Slider */}
            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  Confidence Level
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ color: getConfidenceColor(confidence), fontWeight: 600 }}
                >
                  {getConfidenceLabel(confidence)} ({Math.round(confidence * 100)}%)
                </Typography>
              </Stack>
              <Slider
                value={confidence}
                onChange={(_, value) => setConfidence(value as number)}
                min={0}
                max={1}
                step={0.05}
                marks={[
                  { value: 0, label: '0%' },
                  { value: 0.5, label: '50%' },
                  { value: 1, label: '100%' },
                ]}
                sx={{
                  '& .MuiSlider-thumb': {
                    bgcolor: getConfidenceColor(confidence),
                  },
                  '& .MuiSlider-track': {
                    bgcolor: getConfidenceColor(confidence),
                  },
                }}
              />
            </Box>

            {/* Notes */}
            <TextField
              label="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              multiline
              rows={2}
              placeholder="Add any relevant notes about this link..."
            />
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={loading || loadingEntities || !selectedDevice || !selectedPerson}
          startIcon={loading ? <CircularProgress size={16} /> : <LinkIcon />}
          sx={{
            bgcolor: theme.palette.accent.purple,
            '&:hover': { bgcolor: theme.palette.accent.purple, filter: 'brightness(1.1)' },
          }}
        >
          {loading ? 'Creating...' : 'Create Link'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CreateLinkDialog;

