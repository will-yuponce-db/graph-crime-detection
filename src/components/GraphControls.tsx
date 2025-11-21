import React, { useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Switch,
  FormControlLabel,
  Button,
  Divider,
  Chip,
  Stack,
  Slider,
  useTheme,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Label as LabelIcon,
  Workspaces as CommunitiesIcon,
  Analytics as AnalyticsIcon,
  Link as BridgeIcon,
} from '@mui/icons-material';
import {
  getUniqueNodeTypes,
  getUniqueRelationshipTypes,
  getColorForType,
  type GraphData,
} from '../types/graph';

interface GraphControlsProps {
  showProposed: boolean;
  onToggleProposed: (show: boolean) => void;
  selectedNodeTypes: string[];
  onNodeTypeChange: (types: string[]) => void;
  selectedRelationshipTypes: string[];
  onRelationshipTypeChange: (types: string[]) => void;
  showNodeLabels: boolean;
  onToggleNodeLabels: (show: boolean) => void;
  showEdgeLabels: boolean;
  onToggleEdgeLabels: (show: boolean) => void;
  showCommunities: boolean;
  onToggleCommunities: (show: boolean) => void;
  edgeLength: number;
  onEdgeLengthChange: (length: number) => void;
  nodeSize: number;
  onNodeSizeChange: (size: number) => void;
  onResetView: () => void;
  graphData: GraphData; // Add graphData to extract types dynamically
  stats: {
    totalNodes: number;
    totalEdges: number;
    newNodes: number;
    newEdges: number;
  };
  // Analysis visualization props
  showCentrality?: boolean;
  onToggleCentrality?: (show: boolean) => void;
  showBridges?: boolean;
  onToggleBridges?: (show: boolean) => void;
}

const GraphControls: React.FC<GraphControlsProps> = ({
  showProposed,
  onToggleProposed,
  selectedNodeTypes,
  onNodeTypeChange,
  selectedRelationshipTypes,
  onRelationshipTypeChange,
  showNodeLabels,
  onToggleNodeLabels,
  showEdgeLabels,
  onToggleEdgeLabels,
  showCommunities,
  onToggleCommunities,
  edgeLength,
  onEdgeLengthChange,
  nodeSize,
  onNodeSizeChange,
  onResetView,
  graphData,
  stats,
  showCentrality = false,
  onToggleCentrality,
  showBridges = false,
  onToggleBridges,
}) => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  // Extract unique types from the actual data
  const nodeTypes = useMemo(() => getUniqueNodeTypes(graphData), [graphData]);
  const relationshipTypes = useMemo(() => getUniqueRelationshipTypes(graphData), [graphData]);

  // Generate color map for legend
  const nodeTypeColors = useMemo(() => {
    const colorMap = new Map<string, string>();
    nodeTypes.forEach((type) => {
      colorMap.set(type, getColorForType(type, isDarkMode));
    });
    return colorMap;
  }, [nodeTypes, isDarkMode]);

  const handleNodeTypeToggle = (type: string) => {
    if (selectedNodeTypes.includes(type)) {
      onNodeTypeChange(selectedNodeTypes.filter((t) => t !== type));
    } else {
      onNodeTypeChange([...selectedNodeTypes, type]);
    }
  };

  const handleRelationshipTypeToggle = (type: string) => {
    if (selectedRelationshipTypes.includes(type)) {
      onRelationshipTypeChange(selectedRelationshipTypes.filter((t) => t !== type));
    } else {
      onRelationshipTypeChange([...selectedRelationshipTypes, type]);
    }
  };

  const handleSelectAllNodes = () => {
    if (selectedNodeTypes.length === nodeTypes.length) {
      onNodeTypeChange([]);
    } else {
      onNodeTypeChange(nodeTypes);
    }
  };

  const handleSelectAllRelationships = () => {
    if (selectedRelationshipTypes.length === relationshipTypes.length) {
      onRelationshipTypeChange([]);
    } else {
      onRelationshipTypeChange(relationshipTypes);
    }
  };

  return (
    <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Graph Statistics */}
      <Typography variant="h6" gutterBottom>
        Graph Statistics
      </Typography>
      <Stack spacing={1} sx={{ mb: 3 }}>
        <Box display="flex" justifyContent="space-between">
          <Typography variant="body2">Total Nodes:</Typography>
          <Chip label={stats.totalNodes} size="small" color="primary" />
        </Box>
        <Box display="flex" justifyContent="space-between">
          <Typography variant="body2">Total Edges:</Typography>
          <Chip label={stats.totalEdges} size="small" color="primary" />
        </Box>
        <Box display="flex" justifyContent="space-between">
          <Typography variant="body2" color="success.main">
            Proposed Nodes:
          </Typography>
          <Chip label={stats.newNodes} size="small" color="success" />
        </Box>
        <Box display="flex" justifyContent="space-between">
          <Typography variant="body2" color="success.main">
            Proposed Edges:
          </Typography>
          <Chip label={stats.newEdges} size="small" color="success" />
        </Box>
      </Stack>

      <Divider sx={{ my: 2 }} />

      {/* Visibility Controls */}
      <Typography variant="h6" gutterBottom>
        Visibility
      </Typography>
      <Stack spacing={1}>
        <FormControlLabel
          control={
            <Switch
              checked={showProposed}
              onChange={(e) => onToggleProposed(e.target.checked)}
              color="success"
            />
          }
          label={
            <Box display="flex" alignItems="center" gap={1}>
              {showProposed ? <VisibilityIcon /> : <VisibilityOffIcon />}
              <Typography variant="body2">Show Proposed Changes</Typography>
            </Box>
          }
        />
        <FormControlLabel
          control={
            <Switch
              checked={showNodeLabels}
              onChange={(e) => onToggleNodeLabels(e.target.checked)}
              color="primary"
            />
          }
          label={
            <Box display="flex" alignItems="center" gap={1}>
              <LabelIcon />
              <Typography variant="body2">Show Node Labels</Typography>
            </Box>
          }
        />
        <FormControlLabel
          control={
            <Switch
              checked={showEdgeLabels}
              onChange={(e) => onToggleEdgeLabels(e.target.checked)}
              color="primary"
            />
          }
          label={
            <Box display="flex" alignItems="center" gap={1}>
              <LabelIcon />
              <Typography variant="body2">Show Edge Labels</Typography>
            </Box>
          }
        />
        <FormControlLabel
          control={
            <Switch
              checked={showCommunities}
              onChange={(e) => onToggleCommunities(e.target.checked)}
              color="secondary"
            />
          }
          label={
            <Box display="flex" alignItems="center" gap={1}>
              <CommunitiesIcon />
              <Typography variant="body2">Show Community Boundaries</Typography>
            </Box>
          }
        />
        {onToggleCentrality && (
          <FormControlLabel
            control={
              <Switch
                checked={showCentrality}
                onChange={(e) => onToggleCentrality(e.target.checked)}
                color="primary"
              />
            }
            label={
              <Box display="flex" alignItems="center" gap={1}>
                <AnalyticsIcon />
                <Typography variant="body2">Size Nodes by Centrality</Typography>
              </Box>
            }
          />
        )}
        {onToggleBridges && (
          <FormControlLabel
            control={
              <Switch
                checked={showBridges}
                onChange={(e) => onToggleBridges(e.target.checked)}
                color="warning"
              />
            }
            label={
              <Box display="flex" alignItems="center" gap={1}>
                <BridgeIcon />
                <Typography variant="body2">Highlight Bridge Edges</Typography>
              </Box>
            }
          />
        )}
      </Stack>

      <Divider sx={{ my: 2 }} />

      {/* Edge Length Slider */}
      <Typography variant="h6" gutterBottom>
        Layout
      </Typography>
      <Box sx={{ px: 1 }}>
        <Typography variant="body2" gutterBottom>
          Edge Length
        </Typography>
        <Slider
          value={edgeLength}
          onChange={(_, value) => onEdgeLengthChange(value as number)}
          min={30}
          max={200}
          step={10}
          marks={[
            { value: 30, label: 'Close' },
            { value: 80, label: 'Default' },
            { value: 200, label: 'Far' },
          ]}
          valueLabelDisplay="auto"
          sx={{ mb: 2 }}
        />

        <Typography variant="body2" gutterBottom>
          Node Size
        </Typography>
        <Slider
          value={nodeSize}
          onChange={(_, value) => onNodeSizeChange(value as number)}
          min={3}
          max={15}
          step={1}
          marks={[
            { value: 3, label: 'Small' },
            { value: 6, label: 'Default' },
            { value: 15, label: 'Large' },
          ]}
          valueLabelDisplay="auto"
          sx={{ mb: 1 }}
        />
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Node Type Filters */}
      <Box sx={{ mb: 2 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography variant="h6">Node Types</Typography>
          <Button size="small" onClick={handleSelectAllNodes}>
            {selectedNodeTypes.length === nodeTypes.length ? 'Deselect All' : 'Select All'}
          </Button>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {nodeTypes.map((type) => {
            const isSelected = selectedNodeTypes.length === 0 || selectedNodeTypes.includes(type);
            return (
              <Chip
                key={type}
                label={type}
                onClick={() => handleNodeTypeToggle(type)}
                color={isSelected ? 'primary' : 'default'}
                variant={isSelected ? 'filled' : 'outlined'}
                sx={{
                  bgcolor: isSelected ? nodeTypeColors.get(type) : 'transparent',
                  borderColor: nodeTypeColors.get(type),
                  color: isSelected
                    ? theme.palette.getContrastText(nodeTypeColors.get(type) || '#000')
                    : 'inherit',
                  '&:hover': {
                    bgcolor: isSelected
                      ? nodeTypeColors.get(type)
                      : `${nodeTypeColors.get(type)}22`,
                  },
                }}
              />
            );
          })}
        </Stack>
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Relationship Type Filters */}
      <Box sx={{ mb: 2 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography variant="h6">Relationships</Typography>
          <Button size="small" onClick={handleSelectAllRelationships}>
            {selectedRelationshipTypes.length === relationshipTypes.length
              ? 'Deselect All'
              : 'Select All'}
          </Button>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {relationshipTypes.map((type) => {
            const isSelected =
              selectedRelationshipTypes.length === 0 || selectedRelationshipTypes.includes(type);
            return (
              <Chip
                key={type}
                label={type}
                onClick={() => handleRelationshipTypeToggle(type)}
                color={isSelected ? 'secondary' : 'default'}
                variant={isSelected ? 'filled' : 'outlined'}
              />
            );
          })}
        </Stack>
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Legend - Shows only selected types */}
      <Typography variant="h6" gutterBottom>
        Legend
      </Typography>
      <Box sx={{ maxHeight: 300, overflowY: 'auto' }}>
        <Stack spacing={1} sx={{ mb: 2 }}>
          {/* Show only selected node types (or all if none selected) */}
          {(selectedNodeTypes.length === 0 ? nodeTypes : selectedNodeTypes).map((type) => (
            <Box key={type} display="flex" alignItems="center" gap={1}>
              <Box
                sx={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  bgcolor: nodeTypeColors.get(type),
                  flexShrink: 0,
                }}
              />
              <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                {type}
              </Typography>
            </Box>
          ))}

          {/* Separator if there are node types */}
          {(selectedNodeTypes.length === 0 ? nodeTypes.length : selectedNodeTypes.length) > 0 && (
            <Divider sx={{ my: 1 }} />
          )}

          {/* Proposed new indicator - only show if proposed changes are visible */}
          {showProposed && (
            <Box display="flex" alignItems="center" gap={1}>
              <Box
                sx={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  bgcolor: 'success.main',
                  border: '2px solid',
                  borderColor: 'success.dark',
                  flexShrink: 0,
                }}
              />
              <Typography variant="body2">Proposed New</Typography>
            </Box>
          )}
        </Stack>
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Reset Button */}
      <Button variant="outlined" fullWidth startIcon={<RefreshIcon />} onClick={onResetView}>
        Reset View
      </Button>
    </Paper>
  );
};

export default GraphControls;
