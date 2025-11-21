import React, { useState } from 'react';
import {
  Box,
  FormControl,
  Select,
  MenuItem,
  InputLabel,
  Chip,
  Typography,
  IconButton,
  Tooltip,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import {
  FilterList as FilterIcon,
  Clear as ClearIcon,
  Folder as FolderIcon,
} from '@mui/icons-material';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { selectCase } from '../store/casesSlice';
import type { Case } from '../types/case';

const GlobalCaseFilter: React.FC = () => {
  const dispatch = useAppDispatch();
  const selectedCaseId = useAppSelector(state => state.cases?.selectedCaseId);
  const allCases = useAppSelector(state => state.cases?.cases || []);
  const selectedCase = allCases.find(c => c.id === selectedCaseId);

  const handleCaseChange = (event: SelectChangeEvent<string>) => {
    const caseId = event.target.value;
    dispatch(selectCase(caseId === '' ? null : caseId));
  };

  const handleClearFilter = () => {
    dispatch(selectCase(null));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Leads': return '#78909c';
      case 'Active Investigation': return '#1976d2';
      case 'Prosecution': return '#f57c00';
      case 'Closed': return '#388e3c';
      default: return '#757575';
    }
  };

  const getPriorityColor = (priority: string): 'error' | 'warning' | 'info' | 'default' => {
    switch (priority) {
      case 'Critical': return 'error';
      case 'High': return 'warning';
      case 'Medium': return 'info';
      default: return 'default';
    }
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 280, maxWidth: 400 }}>
      <FilterIcon fontSize="small" sx={{ color: selectedCaseId ? 'primary.main' : 'text.secondary', flexShrink: 0 }} />
      
      <FormControl size="small" fullWidth variant="outlined" sx={{ minWidth: 200 }}>
        <InputLabel id="global-case-filter-label">Filter by Case</InputLabel>
        <Select
          labelId="global-case-filter-label"
          id="global-case-filter"
          value={selectedCaseId || ''}
          onChange={handleCaseChange}
          label="Filter by Case"
          sx={{
            bgcolor: 'background.paper',
            '& .MuiSelect-select': {
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }
          }}
        >
          <MenuItem value="">
            <em>All Entities (No Filter)</em>
          </MenuItem>
          
          {allCases.map((caseItem: Case) => (
            <MenuItem key={caseItem.id} value={caseItem.id}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                <FolderIcon 
                  fontSize="small" 
                  sx={{ color: getStatusColor(caseItem.status), flexShrink: 0 }} 
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography 
                    variant="body2" 
                    sx={{ 
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {caseItem.name}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                    <Chip 
                      label={caseItem.caseNumber} 
                      size="small" 
                      variant="outlined"
                      sx={{ height: 18, fontSize: '0.65rem' }}
                    />
                    <Chip 
                      label={caseItem.priority} 
                      size="small" 
                      color={getPriorityColor(caseItem.priority)}
                      sx={{ height: 18, fontSize: '0.65rem' }}
                    />
                    <Chip 
                      label={`${caseItem.entityIds.length} entities`} 
                      size="small" 
                      sx={{ height: 18, fontSize: '0.65rem' }}
                    />
                  </Box>
                </Box>
              </Box>
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {selectedCaseId && (
        <Tooltip title="Clear case filter">
          <IconButton 
            size="small" 
            onClick={handleClearFilter}
            sx={{ 
              color: 'error.main',
              '&:hover': { bgcolor: 'error.light', color: 'error.contrastText' }
            }}
          >
            <ClearIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}

      {selectedCase && (
        <Box 
          sx={{ 
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            mt: 0.5,
            p: 1,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            borderRadius: 1,
            boxShadow: 2,
            zIndex: 1,
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 600 }}>
            🔍 Filtering: {selectedCase.name}
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', opacity: 0.9 }}>
            Showing {selectedCase.entityIds.length} entities across all views
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default GlobalCaseFilter;

