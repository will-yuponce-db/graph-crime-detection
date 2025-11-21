import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Autocomplete,
  Box,
  Typography,
  IconButton,
  Stack,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import type { GraphNode, GraphEdge, NodeProperties, EdgeProperties } from '../types/graph';

interface NodeOption {
  id: string;
  label: string;
  type: string;
}

interface NodeFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (node: Omit<GraphNode, 'status'>) => void;
  onDelete?: (nodeId: string) => void;
  initialData?: GraphNode;
  mode: 'create' | 'edit';
}

interface EdgeFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (edge: Omit<GraphEdge, 'status'>) => void;
  onDelete?: (edgeId: string) => void;
  initialData?: GraphEdge;
  sourceNodeId?: string;
  targetNodeId?: string;
  mode: 'create' | 'edit';
  availableNodes?: GraphNode[]; // Available nodes for autocomplete
}

/**
 * Form for creating/editing nodes
 */
export const NodeForm: React.FC<NodeFormProps> = ({
  open,
  onClose,
  onSave,
  onDelete,
  initialData,
  mode,
}) => {
  const [nodeId, setNodeId] = useState('');
  const [label, setLabel] = useState('');
  const [type, setType] = useState<string>('');
  const [properties, setProperties] = useState<Array<{ key: string; value: string }>>([]);

  useEffect(() => {
    if (initialData) {
      setNodeId(initialData.id);
      setLabel(initialData.label);
      setType(initialData.type);
      setProperties(
        Object.entries(initialData.properties).map(([key, value]) => ({
          key,
          value: String(value),
        }))
      );
    } else {
      // Reset for create mode
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 7);
      setNodeId(`node_${timestamp}_${randomSuffix}`);
      setLabel('');
      setType(''); // Start with empty string, user can type any value
      setProperties([]);
    }
  }, [initialData, open]);

  const handleAddProperty = () => {
    setProperties([...properties, { key: '', value: '' }]);
  };

  const handleRemoveProperty = (index: number) => {
    setProperties(properties.filter((_, i) => i !== index));
  };

  const handlePropertyChange = (index: number, field: 'key' | 'value', value: string) => {
    const newProperties = [...properties];
    newProperties[index][field] = value;
    setProperties(newProperties);
  };

  const handleSave = () => {
    if (!label.trim()) {
      alert('Label is required');
      return;
    }

    const nodeProperties: NodeProperties = {};
    properties.forEach((prop) => {
      if (prop.key.trim()) {
        // Try to parse as number or boolean, otherwise keep as string
        let value: string | number | boolean = prop.value;
        if (prop.value === 'true') value = true;
        else if (prop.value === 'false') value = false;
        else if (!isNaN(Number(prop.value)) && prop.value.trim() !== '') {
          value = Number(prop.value);
        }
        nodeProperties[prop.key] = value;
      }
    });

    onSave({
      id: nodeId,
      label: label.trim(),
      type,
      properties: nodeProperties,
    });

    onClose();
  };

  const handleDelete = () => {
    if (initialData && onDelete) {
      if (window.confirm(`Are you sure you want to delete "${initialData.label}"?`)) {
        onDelete(initialData.id);
        onClose();
      }
    }
  };

  const canDelete = mode === 'edit' && onDelete;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{mode === 'create' ? 'Create New Node' : 'Edit Node'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="ID"
            value={nodeId}
            onChange={(e) => setNodeId(e.target.value)}
            disabled={mode === 'edit'}
            fullWidth
            size="small"
          />

          <TextField
            label="Label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            fullWidth
            size="small"
            autoFocus
          />

          <TextField
            label="Type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            placeholder="Enter a type (e.g., Suspect, Organization, Location)"
            size="small"
            required
            fullWidth
            helperText="Enter any value for the node type"
          />

          <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="subtitle2">Properties</Typography>
              <Button
                startIcon={<AddIcon />}
                onClick={handleAddProperty}
                size="small"
                variant="outlined"
              >
                Add Property
              </Button>
            </Box>

            {properties.map((prop, index) => (
              <Box key={index} display="flex" gap={1} mb={1}>
                <TextField
                  label="Key"
                  value={prop.key}
                  onChange={(e) => handlePropertyChange(index, 'key', e.target.value)}
                  size="small"
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Value"
                  value={prop.value}
                  onChange={(e) => handlePropertyChange(index, 'value', e.target.value)}
                  size="small"
                  sx={{ flex: 1 }}
                />
                <IconButton onClick={() => handleRemoveProperty(index)} size="small" color="error">
                  <DeleteIcon />
                </IconButton>
              </Box>
            ))}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        {canDelete && (
          <Button onClick={handleDelete} color="error" sx={{ mr: 'auto' }}>
            Delete
          </Button>
        )}
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" color="primary">
          {mode === 'create' ? 'Create' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

/**
 * Form for creating/editing edges
 */
export const EdgeForm: React.FC<EdgeFormProps> = ({
  open,
  onClose,
  onSave,
  onDelete,
  initialData,
  sourceNodeId,
  targetNodeId,
  mode,
  availableNodes = [],
}) => {
  const [edgeId, setEdgeId] = useState('');
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [relationshipType, setRelationshipType] = useState<string>('');
  const [properties, setProperties] = useState<Array<{ key: string; value: string }>>([]);

  // Convert nodes to options for autocomplete
  const nodeOptions: NodeOption[] = availableNodes.map((node) => ({
    id: node.id,
    label: node.label,
    type: node.type,
  }));

  useEffect(() => {
    if (initialData) {
      setEdgeId(initialData.id);
      setSource(initialData.source);
      setTarget(initialData.target);
      setRelationshipType(initialData.relationshipType);
      setProperties(
        Object.entries(initialData.properties).map(([key, value]) => ({
          key,
          value: String(value),
        }))
      );
    } else {
      // Reset for create mode
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 7);
      setEdgeId(`edge_${timestamp}_${randomSuffix}`);
      setSource(sourceNodeId || '');
      setTarget(targetNodeId || '');
      setRelationshipType(''); // Start with empty string, user can type any value
      setProperties([]);
    }
  }, [initialData, sourceNodeId, targetNodeId, open]);

  const handleAddProperty = () => {
    setProperties([...properties, { key: '', value: '' }]);
  };

  const handleRemoveProperty = (index: number) => {
    setProperties(properties.filter((_, i) => i !== index));
  };

  const handlePropertyChange = (index: number, field: 'key' | 'value', value: string) => {
    const newProperties = [...properties];
    newProperties[index][field] = value;
    setProperties(newProperties);
  };

  const handleSave = () => {
    if (!source || !target) {
      alert('Source and target are required');
      return;
    }

    const edgeProperties: EdgeProperties = {};
    properties.forEach((prop) => {
      if (prop.key.trim()) {
        // Try to parse as number or boolean, otherwise keep as string
        let value: string | number | boolean = prop.value;
        if (prop.value === 'true') value = true;
        else if (prop.value === 'false') value = false;
        else if (!isNaN(Number(prop.value)) && prop.value.trim() !== '') {
          value = Number(prop.value);
        }
        edgeProperties[prop.key] = value;
      }
    });

    onSave({
      id: edgeId,
      source,
      target,
      relationshipType,
      properties: edgeProperties,
    });

    onClose();
  };

  const handleDelete = () => {
    if (initialData && onDelete) {
      if (
        window.confirm(
          `Are you sure you want to delete this ${initialData.relationshipType} relationship?`
        )
      ) {
        onDelete(initialData.id);
        onClose();
      }
    }
  };

  const canDelete = mode === 'edit' && onDelete;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {mode === 'create' ? 'Create New Relationship' : 'Edit Relationship'}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="ID"
            value={edgeId}
            onChange={(e) => setEdgeId(e.target.value)}
            disabled={mode === 'edit'}
            fullWidth
            size="small"
          />

          <Autocomplete
            options={nodeOptions}
            getOptionLabel={(option) => `${option.label} (${option.type})`}
            value={nodeOptions.find((n) => n.id === source) || null}
            onChange={(_event, newValue) => {
              setSource(newValue?.id || '');
            }}
            disabled={mode === 'edit' || !!sourceNodeId}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Source Node"
                required
                size="small"
                placeholder="Select a source node"
                helperText={
                  mode === 'edit'
                    ? 'Cannot change source for existing edges'
                    : 'Select the starting node'
                }
              />
            )}
            renderOption={(props, option) => (
              <li {...props} key={option.id}>
                <Box>
                  <Typography variant="body2">
                    <strong>{option.label}</strong>
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Type: {option.type} • ID: {option.id}
                  </Typography>
                </Box>
              </li>
            )}
          />

          <Autocomplete
            options={nodeOptions}
            getOptionLabel={(option) => `${option.label} (${option.type})`}
            value={nodeOptions.find((n) => n.id === target) || null}
            onChange={(_event, newValue) => {
              setTarget(newValue?.id || '');
            }}
            disabled={mode === 'edit' || !!targetNodeId}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Target Node"
                required
                size="small"
                placeholder="Select a target node"
                helperText={
                  mode === 'edit'
                    ? 'Cannot change target for existing edges'
                    : 'Select the ending node'
                }
              />
            )}
            renderOption={(props, option) => (
              <li {...props} key={option.id}>
                <Box>
                  <Typography variant="body2">
                    <strong>{option.label}</strong>
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Type: {option.type} • ID: {option.id}
                  </Typography>
                </Box>
              </li>
            )}
          />

          <TextField
            label="Relationship Type"
            value={relationshipType}
            onChange={(e) => setRelationshipType(e.target.value)}
            placeholder="Enter a relationship type (e.g., ASSOCIATES_WITH, MEMBER_OF)"
            size="small"
            required
            fullWidth
            helperText="Enter any value for the relationship type"
          />

          <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="subtitle2">Properties</Typography>
              <Button
                startIcon={<AddIcon />}
                onClick={handleAddProperty}
                size="small"
                variant="outlined"
              >
                Add Property
              </Button>
            </Box>

            {properties.map((prop, index) => (
              <Box key={index} display="flex" gap={1} mb={1}>
                <TextField
                  label="Key"
                  value={prop.key}
                  onChange={(e) => handlePropertyChange(index, 'key', e.target.value)}
                  size="small"
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Value"
                  value={prop.value}
                  onChange={(e) => handlePropertyChange(index, 'value', e.target.value)}
                  size="small"
                  sx={{ flex: 1 }}
                />
                <IconButton onClick={() => handleRemoveProperty(index)} size="small" color="error">
                  <DeleteIcon />
                </IconButton>
              </Box>
            ))}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        {canDelete && (
          <Button onClick={handleDelete} color="error" sx={{ mr: 'auto' }}>
            Delete
          </Button>
        )}
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" color="primary">
          {mode === 'create' ? 'Create' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
