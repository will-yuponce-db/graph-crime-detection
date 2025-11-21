import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { selectCase } from '../store/casesSlice';
import {
  Box,
  Paper,
  Typography,
  Chip,
  Grid,
  Card,
  CardContent,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  OutlinedInput,
  useTheme,
  IconButton,
  Collapse,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import {
  FilterList as FilterIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import ActivityTimeline from '../components/ActivityTimeline';
import ActivityMapComponent from '../components/ActivityMap';
import { mockGraphData } from '../data/mockGraphData';
import {
  extractActivities,
  groupActivitiesByDate,
  extractMapMarkers,
  calculateActivityStats,
  filterActivities,
} from '../utils/activityExtractor';
import { filterActivitiesByCase, filterMarkersByCase } from '../utils/caseFiltering';
import type { Activity, MapMarker, ActivityStats } from '../types/activity';
import { ActivityType } from '../types/activity';

interface ActivityMapPageProps {
  viewMode: 'timeline' | 'map';
}

const ActivityMapPage: React.FC<ActivityMapPageProps> = ({ viewMode }) => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const [searchParams] = useSearchParams();
  
  // Get selected case from Redux
  const selectedCaseId = useAppSelector(state => state.cases?.selectedCaseId);
  const allCases = useAppSelector(state => state.cases?.cases || []);
  const selectedCase = allCases.find(c => c.id === selectedCaseId) || null;
  
  const [selectedActivityTypes, setSelectedActivityTypes] = useState<string[]>([]);
  const [selectedThreatLevels, setSelectedThreatLevels] = useState<string[]>([]);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Handle case parameter from URL
  useEffect(() => {
    const caseIdFromUrl = searchParams.get('case');
    if (caseIdFromUrl && caseIdFromUrl !== selectedCaseId) {
      dispatch(selectCase(caseIdFromUrl));
    }
  }, [searchParams, selectedCaseId, dispatch]);

  // Extract activities from graph data
  const allActivities = useMemo(() => extractActivities(mockGraphData), []);

  // Filter by case first, then by user selections
  const caseFilteredActivities = useMemo(() => {
    return filterActivitiesByCase(allActivities, selectedCase);
  }, [allActivities, selectedCase]);

  // Filter activities based on user selections
  const filteredActivities = useMemo(() => {
    return filterActivities(caseFilteredActivities, {
      activityTypes: selectedActivityTypes.length > 0 ? selectedActivityTypes as ActivityType[] : undefined,
      threatLevels: selectedThreatLevels.length > 0 ? selectedThreatLevels : undefined,
    });
  }, [caseFilteredActivities, selectedActivityTypes, selectedThreatLevels]);

  // Group activities for timeline
  const timelineGroups = useMemo(() => groupActivitiesByDate(filteredActivities), [filteredActivities]);

  // Extract markers for map and filter by case
  const allMarkers = useMemo(() => extractMapMarkers(mockGraphData, filteredActivities), [filteredActivities]);
  const mapMarkers = useMemo(() => filterMarkersByCase(allMarkers, selectedCase), [allMarkers, selectedCase]);

  // Calculate statistics
  const stats: ActivityStats = useMemo(() => calculateActivityStats(filteredActivities), [filteredActivities]);

  // Available filter options
  const activityTypes = Object.values(ActivityType);
  const threatLevels = ['Critical', 'High', 'Medium', 'Low'];


  const handleActivityTypeChange = (event: SelectChangeEvent<string[]>) => {
    const value = event.target.value;
    setSelectedActivityTypes(typeof value === 'string' ? value.split(',') : value);
  };

  const handleThreatLevelChange = (event: SelectChangeEvent<string[]>) => {
    const value = event.target.value;
    setSelectedThreatLevels(typeof value === 'string' ? value.split(',') : value);
  };

  const handleActivityClick = (activity: Activity) => {
    console.log('Activity clicked:', activity);
    // TODO: Show activity details in a dialog or side panel
  };

  const handleMarkerClick = (marker: MapMarker) => {
    console.log('Marker clicked:', marker);
    // TODO: Show location details or switch to timeline filtered by this location
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Paper
        elevation={1}
        sx={{
          p: 2,
          borderRadius: 0,
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {viewMode === 'timeline' ? 'Activity Timeline' : 'Geographic Map'}
          {selectedCase && (
            <Chip 
              label={`Case: ${selectedCase.name}`} 
              size="small" 
              color="primary" 
              sx={{ ml: 2 }} 
            />
          )}
        </Typography>
      </Paper>

      {/* Stats Bar */}
      <Paper sx={{ p: 2, borderRadius: 0 }} elevation={1}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5, px: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Total Activities
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 600 }}>
                  {stats.totalActivities}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5, px: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  New Activities
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 600, color: theme.palette.success.main }}>
                  {stats.newActivities}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5, px: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Existing Activities
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 600, color: theme.palette.primary.main }}>
                  {stats.existingActivities}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5, px: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Unique Locations
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 600, color: theme.palette.secondary.main }}>
                  {stats.uniqueLocations}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Paper>

      {/* Filters */}
      <Paper sx={{ borderRadius: 0 }} elevation={1}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            p: 1.5,
            cursor: 'pointer',
          }}
          onClick={() => setFiltersExpanded(!filtersExpanded)}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FilterIcon />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Filters
            </Typography>
          </Box>
          <IconButton size="small">
            {filtersExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Box>
        <Collapse in={filtersExpanded}>
          <Box sx={{ p: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Activity Types</InputLabel>
                  <Select
                    multiple
                    value={selectedActivityTypes}
                    onChange={handleActivityTypeChange}
                    input={<OutlinedInput label="Activity Types" />}
                    renderValue={(selected) => (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {selected.map((value) => (
                          <Chip key={value} label={value} size="small" />
                        ))}
                      </Box>
                    )}
                  >
                    {activityTypes.map((type) => (
                      <MenuItem key={type} value={type}>
                        {type}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Threat Levels</InputLabel>
                  <Select
                    multiple
                    value={selectedThreatLevels}
                    onChange={handleThreatLevelChange}
                    input={<OutlinedInput label="Threat Levels" />}
                    renderValue={(selected) => (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {selected.map((value) => (
                          <Chip key={value} label={value} size="small" color="error" />
                        ))}
                      </Box>
                    )}
                  >
                    {threatLevels.map((level) => (
                      <MenuItem key={level} value={level}>
                        {level}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Box>
        </Collapse>
      </Paper>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'hidden', bgcolor: theme.palette.background.default }}>
        {viewMode === 'timeline' && (
          <ActivityTimeline timelineGroups={timelineGroups} onActivityClick={handleActivityClick} />
        )}
        {viewMode === 'map' && (
          <ActivityMapComponent
            markers={mapMarkers}
            onMarkerClick={handleMarkerClick}
            onActivityClick={handleActivityClick}
          />
        )}
      </Box>
    </Box>
  );
};

export default ActivityMapPage;

