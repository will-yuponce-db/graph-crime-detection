import React, { useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Chip,
  Stack,
  Divider,
  List,
  ListItem,
  ListItemText,
  Paper,
  IconButton,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  AlertTitle,
} from '@mui/material';
import {
  Close as CloseIcon,
  Check as ApproveIcon,
  Clear as DeclineIcon,
  Psychology as AIIcon,
  Description as DocumentIcon,
  AccountTree as GraphIcon,
  Info as InfoIcon,
  Person as PersonIcon,
} from '@mui/icons-material';
import type { Case } from '../types/case';
import type { GraphData } from '../types/graph';
import { useAppSelector } from '../store/hooks';
import { getColorForType } from '../types/graph';
import { useTheme } from '@mui/material/styles';

interface CaseReviewDialogProps {
  open: boolean;
  caseToReview: Case | null;
  onClose: () => void;
  onApprove: (caseId: string) => void;
  onDecline: (caseId: string) => void;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`review-tabpanel-${index}`}
      aria-labelledby={`review-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

const CaseReviewDialog: React.FC<CaseReviewDialogProps> = ({
  open,
  caseToReview,
  onClose,
  onApprove,
  onDecline,
}) => {
  const theme = useTheme();
  const [tabValue, setTabValue] = React.useState(0);
  
  // Get graph data from the editor
  const graphData = useAppSelector(() => {
    // Try to get from the graph editor state if available
    // For now, we'll use mock data - in production this would come from the actual graph
    return { nodes: [], edges: [] } as GraphData;
  });

  // Filter graph to show only entities in this case
  const caseGraphData = useMemo(() => {
    if (!caseToReview || !graphData) {
      return { nodes: [], edges: [] };
    }

    const caseEntityIds = new Set(caseToReview.entityIds);
    const filteredNodes = graphData.nodes?.filter(node => caseEntityIds.has(node.id)) || [];
    const filteredEdges = graphData.edges?.filter(
      edge => caseEntityIds.has(edge.source) && caseEntityIds.has(edge.target)
    ) || [];

    return { nodes: filteredNodes, edges: filteredEdges };
  }, [caseToReview, graphData]);

  // Network statistics
  const networkStats = useMemo(() => {
    const nodeTypeCount = new Map<string, number>();
    caseGraphData.nodes.forEach(node => {
      nodeTypeCount.set(node.type, (nodeTypeCount.get(node.type) || 0) + 1);
    });
    
    return {
      totalNodes: caseGraphData.nodes.length,
      totalEdges: caseGraphData.edges.length,
      nodesByType: Array.from(nodeTypeCount.entries()).map(([type, count]) => ({ type, count })),
    };
  }, [caseGraphData]);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleApprove = () => {
    if (caseToReview) {
      onApprove(caseToReview.id);
      onClose();
    }
  };

  const handleDecline = () => {
    if (caseToReview) {
      onDecline(caseToReview.id);
      onClose();
    }
  };

  if (!caseToReview) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          height: '90vh',
          maxHeight: '90vh',
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: theme.palette.mode === 'dark' ? 'rgba(237, 108, 2, 0.1)' : 'rgba(237, 108, 2, 0.05)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <AIIcon color="warning" sx={{ fontSize: 32 }} />
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Review AI-Detected Case
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Analyze all evidence before approving this case
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Alert severity="warning" sx={{ m: 2, mb: 0 }}>
          <AlertTitle>Pending Approval</AlertTitle>
          This case was automatically detected and is not yet saved to the database. Review all tabs and approve to create the case.
        </Alert>

        {/* Case Header */}
        <Box sx={{ p: 3, pb: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2 }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>
                {caseToReview.name}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {caseToReview.description}
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Chip
                  label={caseToReview.priority}
                  color={
                    caseToReview.priority === 'Critical'
                      ? 'error'
                      : caseToReview.priority === 'High'
                      ? 'warning'
                      : 'default'
                  }
                />
                <Chip label={caseToReview.classification} variant="outlined" />
                <Chip
                  icon={<PersonIcon />}
                  label={`${caseToReview.entityIds.length} entities`}
                  variant="outlined"
                />
                <Chip
                  icon={<DocumentIcon />}
                  label={`${caseToReview.documents?.length || 0} documents`}
                  variant="outlined"
                />
              </Stack>
            </Box>
          </Box>
        </Box>

        <Divider />

        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
          <Tabs value={tabValue} onChange={handleTabChange}>
            <Tab icon={<InfoIcon />} label="Overview" iconPosition="start" />
            <Tab icon={<GraphIcon />} label="Community Graph" iconPosition="start" />
            <Tab icon={<DocumentIcon />} label={`Documents (${caseToReview.documents?.length || 0})`} iconPosition="start" />
            <Tab icon={<PersonIcon />} label={`Entities (${caseToReview.entityIds.length})`} iconPosition="start" />
          </Tabs>
        </Box>

        {/* Tab Panels */}
        <Box sx={{ flex: 1, overflow: 'auto', px: 3 }}>
          {/* Overview Tab */}
          <TabPanel value={tabValue} index={0}>
            <Stack spacing={3}>
              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Case Number
                </Typography>
                <Typography variant="body1">{caseToReview.caseNumber}</Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Priority & Classification
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Chip label={caseToReview.priority} color="warning" />
                  <Chip label={caseToReview.classification} />
                </Stack>
              </Box>

              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Detection Details
                </Typography>
                <Typography variant="body2">
                  Detected: {new Date(caseToReview.createdDate).toLocaleString()}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  This case was automatically identified by AI through community detection analysis.
                </Typography>
              </Box>

              {caseToReview.tags && caseToReview.tags.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Tags
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    {caseToReview.tags.map((tag) => (
                      <Chip key={tag} label={tag} size="small" variant="outlined" />
                    ))}
                  </Stack>
                </Box>
              )}

              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Summary Statistics
                </Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableBody>
                      <TableRow>
                        <TableCell>Total Entities</TableCell>
                        <TableCell align="right">{caseToReview.entityIds.length}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Documents</TableCell>
                        <TableCell align="right">{caseToReview.documents?.length || 0}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Tags</TableCell>
                        <TableCell align="right">{caseToReview.tags?.length || 0}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            </Stack>
          </TabPanel>

          {/* Community Graph Tab */}
          <TabPanel value={tabValue} index={1}>
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Network statistics and structure of the detected community
              </Typography>
              
              <Stack spacing={2} sx={{ mt: 2 }}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
                    Network Statistics
                  </Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableBody>
                        <TableRow>
                          <TableCell>Total Nodes</TableCell>
                          <TableCell align="right">
                            <Chip label={networkStats.totalNodes} size="small" color="primary" />
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Total Connections</TableCell>
                          <TableCell align="right">
                            <Chip label={networkStats.totalEdges} size="small" color="secondary" />
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>

                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
                    Node Distribution by Type
                  </Typography>
                  <Stack spacing={1} sx={{ mt: 1 }}>
                    {networkStats.nodesByType.map(({ type, count }) => (
                      <Box
                        key={type}
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          p: 1,
                          borderRadius: 1,
                          bgcolor: 'action.hover',
                        }}
                      >
                        <Chip
                          label={type}
                          size="small"
                          sx={{
                            bgcolor: getColorForType(type, theme.palette.mode === 'dark'),
                            color: '#fff',
                          }}
                        />
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {count} {count === 1 ? 'node' : 'nodes'}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </Paper>

                <Alert severity="info">
                  <AlertTitle>Full Graph Visualization</AlertTitle>
                  The complete network graph will be available in the main Graph Visualization page after approval.
                </Alert>
              </Stack>
            </Box>
          </TabPanel>

          {/* Documents Tab */}
          <TabPanel value={tabValue} index={2}>
            {caseToReview.documents && caseToReview.documents.length > 0 ? (
              <List>
                {caseToReview.documents.map((doc) => {
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
                    <ListItem
                      key={doc.id}
                      component={RouterLink}
                      to={`/documents?id=${doc.id}`}
                      sx={{
                        border: 1,
                        borderColor: 'divider',
                        borderRadius: 1,
                        mb: 1,
                        cursor: 'pointer',
                        textDecoration: 'none',
                        color: 'inherit',
                        '&:hover': { 
                          bgcolor: 'action.hover',
                          borderColor: 'primary.main',
                        },
                      }}
                    >
                      <DocumentIcon sx={{ mr: 2, color: 'primary.main' }} />
                      <ListItemText
                        primary={
                          <Box>
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
                              <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                                📎 {filename}
                              </Typography>
                            )}
                          </Box>
                        }
                        secondary={
                          <Box>
                            <Typography variant="caption" display="block">
                              Type: {doc.type.toUpperCase()}
                              {doc.date && ` • Date: ${new Date(doc.date).toLocaleDateString()}`}
                            </Typography>
                            {doc.summary && (
                              <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
                                {doc.summary}
                              </Typography>
                            )}
                            {doc.tags && doc.tags.length > 0 && (
                              <Box sx={{ mt: 0.5 }}>
                                {doc.tags.map((tag) => (
                                  <Chip
                                    key={tag}
                                    label={tag}
                                    size="small"
                                    sx={{ mr: 0.5, height: 16, fontSize: '0.65rem' }}
                                  />
                                ))}
                              </Box>
                            )}
                          </Box>
                        }
                      />
                    </ListItem>
                  );
                })}
              </List>
            ) : (
              <Alert severity="info">
                No documents are associated with this case.
              </Alert>
            )}
          </TabPanel>

          {/* Entities Tab */}
          <TabPanel value={tabValue} index={3}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              All entities that are part of this detected community
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Entity ID</TableCell>
                    <TableCell>Type</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {caseToReview.entityIds.map((entityId) => {
                    const node = caseGraphData.nodes.find(n => n.id === entityId);
                    return (
                      <TableRow key={entityId}>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                            {node?.label || entityId}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {node?.type && (
                            <Chip
                              label={node.type}
                              size="small"
                              sx={{
                                bgcolor: getColorForType(node.type, theme.palette.mode === 'dark'),
                                color: '#fff',
                              }}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </TabPanel>
        </Box>
      </DialogContent>

      <DialogActions
        sx={{
          borderTop: 1,
          borderColor: 'divider',
          p: 2,
          gap: 1,
          bgcolor: 'background.default',
        }}
      >
        <Button onClick={onClose} color="inherit">
          Close
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="outlined"
          color="error"
          startIcon={<DeclineIcon />}
          onClick={handleDecline}
          size="large"
        >
          Decline Case
        </Button>
        <Button
          variant="contained"
          color="success"
          startIcon={<ApproveIcon />}
          onClick={handleApprove}
          size="large"
        >
          Approve & Create Case
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CaseReviewDialog;

