import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Paper,
  Typography,
  Button,
  Card,
  CardContent,
  Stack,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  Alert,
  useTheme,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  Folder as CasesIcon,
  AccountTree as GraphIcon,
  TrendingUp as TrendingUpIcon,
  Psychology as AIIcon,
  Assessment as AssessmentIcon,
  Timeline as TimelineIcon,
  Map as MapIcon,
  ArrowForward as ArrowForwardIcon,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { detectCommunitiesAndCreateCases } from '../store/casesSlice';
import { CaseStatus } from '../types/case';
import { fetchGraphData } from '../services/graphApi';
import type { GraphNode, GraphEdge } from '../types/graph';
import { ChangeStatus } from '../types/graph';

const Dashboard: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const allCases = useAppSelector(state => state.cases?.cases || []);
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({
    nodes: [],
    edges: [],
  });

  // Load graph data for stats
  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await fetchGraphData();
        setGraphData(data);
      } catch (error) {
        console.error('Failed to load graph data:', error);
      }
    };
    loadData();
  }, []);

  // Calculate stats
  const stats = useMemo(() => {
    const totalCases = allCases.length;
    const activeCases = allCases.filter(
      (c) =>
        c.status === CaseStatus.ACTIVE_INVESTIGATION || c.status === CaseStatus.PROSECUTION
    ).length;
    const totalEntities = graphData.nodes.length;
    const newEntities = graphData.nodes.filter((n) => n.status === ChangeStatus.NEW).length;
    const totalConnections = graphData.edges.length;
    const criticalCases = allCases.filter((c) => c.priority === 'Critical').length;

    return {
      totalCases,
      activeCases,
      totalEntities,
      newEntities,
      totalConnections,
      criticalCases,
    };
  }, [allCases, graphData]);

  // Get recent cases (last 5 updated)
  const recentCases = useMemo(() => {
    return [...allCases]
      .sort((a, b) => b.updatedDate.getTime() - a.updatedDate.getTime())
      .slice(0, 5);
  }, [allCases]);

  // Get priority cases
  const priorityCases = useMemo(() => {
    return allCases
      .filter((c) => c.priority === 'Critical' || c.priority === 'High')
      .slice(0, 5);
  }, [allCases]);

  const handleCaseClick = (caseId: string) => {
    navigate(`/graph?case=${caseId}`);
  };

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

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      <Container maxWidth={false} sx={{ py: { xs: 2, sm: 3 }, px: { xs: 2, sm: 3, md: 4 } }}>
        <Box sx={{ mb: { xs: 2, sm: 4 } }}>
          <Typography variant="h4" gutterBottom sx={{ fontWeight: 600, fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
            Intelligence Dashboard
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
            Welcome to the Crime Network Analysis Platform
          </Typography>
        </Box>

        {/* Overview Stats */}
        <Grid container spacing={{ xs: 2, sm: 3 }} sx={{ mb: { xs: 2, sm: 4 } }}>
          <Grid item xs={6} sm={6} md={4} lg={2}>
          <Card elevation={2}>
            <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                    Cases
                  </Typography>
                  <Typography variant="h3" sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', sm: '2rem', md: '3rem' } }}>
                    {stats.totalCases}
                  </Typography>
                </Box>
                <CasesIcon sx={{ fontSize: { xs: 32, sm: 40, md: 48 }, color: theme.palette.primary.main, opacity: 0.3, display: { xs: 'none', sm: 'block' } }} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={6} md={4} lg={2}>
          <Card elevation={2}>
            <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                    Active
                  </Typography>
                  <Typography variant="h3" sx={{ fontWeight: 700, color: theme.palette.info.main, fontSize: { xs: '1.5rem', sm: '2rem', md: '3rem' } }}>
                    {stats.activeCases}
                  </Typography>
                </Box>
                <AssessmentIcon sx={{ fontSize: { xs: 32, sm: 40, md: 48 }, color: theme.palette.info.main, opacity: 0.3, display: { xs: 'none', sm: 'block' } }} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={6} md={4} lg={2}>
          <Card elevation={2}>
            <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                    Entities
                  </Typography>
                  <Typography variant="h3" sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', sm: '2rem', md: '3rem' } }}>
                    {stats.totalEntities}
                  </Typography>
                </Box>
                <GraphIcon sx={{ fontSize: { xs: 32, sm: 40, md: 48 }, color: theme.palette.secondary.main, opacity: 0.3, display: { xs: 'none', sm: 'block' } }} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={6} md={4} lg={2}>
          <Card elevation={2}>
            <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                    New
                  </Typography>
                  <Typography variant="h3" sx={{ fontWeight: 700, color: theme.palette.success.main, fontSize: { xs: '1.5rem', sm: '2rem', md: '3rem' } }}>
                    {stats.newEntities}
                  </Typography>
                </Box>
                <TrendingUpIcon sx={{ fontSize: { xs: 32, sm: 40, md: 48 }, color: theme.palette.success.main, opacity: 0.3, display: { xs: 'none', sm: 'block' } }} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={6} md={4} lg={2}>
          <Card elevation={2}>
            <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                    Links
                  </Typography>
                  <Typography variant="h3" sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', sm: '2rem', md: '3rem' } }}>
                    {stats.totalConnections}
                  </Typography>
                </Box>
                <TimelineIcon sx={{ fontSize: { xs: 32, sm: 40, md: 48 }, color: theme.palette.warning.main, opacity: 0.3, display: { xs: 'none', sm: 'block' } }} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={6} md={4} lg={2}>
          <Card elevation={2}>
            <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                    Critical
                  </Typography>
                  <Typography variant="h3" sx={{ fontWeight: 700, color: theme.palette.error.main, fontSize: { xs: '1.5rem', sm: '2rem', md: '3rem' } }}>
                    {stats.criticalCases}
                  </Typography>
                </Box>
                <AssessmentIcon sx={{ fontSize: { xs: 32, sm: 40, md: 48 }, color: theme.palette.error.main, opacity: 0.3, display: { xs: 'none', sm: 'block' } }} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Quick Actions */}
      <Grid container spacing={{ xs: 2, sm: 3 }} sx={{ mb: { xs: 2, sm: 4 } }}>
        <Grid item xs={12}>
          <Paper elevation={2} sx={{ p: { xs: 2, sm: 3 } }}>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, fontSize: { xs: '1rem', sm: '1.25rem' } }}>
              Quick Actions
            </Typography>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={6} sm={6} md={3}>
                <Button
                  fullWidth
                  variant="contained"
                  size="large"
                  startIcon={<CasesIcon />}
                  onClick={() => navigate('/cases')}
                  sx={{ py: { xs: 1.5, sm: 2 }, fontSize: { xs: '0.875rem', sm: '1rem' } }}
                >
                  {theme.breakpoints.values.sm > window.innerWidth ? 'Cases' : 'View All Cases'}
                </Button>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Button
                  fullWidth
                  variant="contained"
                  size="large"
                  startIcon={<GraphIcon />}
                  onClick={() => navigate('/graph')}
                  sx={{ py: 2 }}
                >
                  Network Graph
                </Button>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Button
                  fullWidth
                  variant="contained"
                  size="large"
                  startIcon={<AIIcon />}
                  onClick={() => dispatch(detectCommunitiesAndCreateCases())}
                  color="secondary"
                  sx={{ py: 2 }}
                >
                  Detect Communities
                </Button>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Button
                  fullWidth
                  variant="contained"
                  size="large"
                  startIcon={<MapIcon />}
                  onClick={() => navigate('/map')}
                  sx={{ py: 2 }}
                >
                  Geographic Map
                </Button>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      </Grid>

      {/* Priority Cases and Recent Activity */}
      <Grid container spacing={{ xs: 2, sm: 3 }}>
        {/* Priority Cases */}
        <Grid item xs={12} md={6}>
          <Paper elevation={2} sx={{ p: { xs: 2, sm: 3 }, height: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Priority Cases
              </Typography>
              <Button
                size="small"
                endIcon={<ArrowForwardIcon />}
                onClick={() => navigate('/cases')}
              >
                View All
              </Button>
            </Box>
            <Divider sx={{ mb: 2 }} />
            {priorityCases.length === 0 ? (
              <Alert severity="info">No priority cases at the moment</Alert>
            ) : (
              <List dense>
                {priorityCases.map((caseItem) => (
                  <ListItem key={caseItem.id} disablePadding>
                    <ListItemButton onClick={() => handleCaseClick(caseItem.id)}>
                      <ListItemText
                        primary={
                          <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body1" sx={{ fontWeight: 500 }} component="span">
                              {caseItem.name}
                            </Typography>
                            <Chip
                              label={caseItem.priority}
                              size="small"
                              color={caseItem.priority === 'Critical' ? 'error' : 'warning'}
                              sx={{ height: 20 }}
                            />
                          </Box>
                        }
                        secondary={
                          <Box component="span" sx={{ mt: 0.5, display: 'block' }}>
                            <Chip
                              label={caseItem.status}
                              size="small"
                              sx={{
                                bgcolor: getStatusColor(caseItem.status),
                                color: 'white',
                                height: 18,
                                fontSize: '0.7rem',
                                mr: 0.5,
                              }}
                            />
                            <Typography variant="caption" color="text.secondary" component="span">
                              {caseItem.entityIds.length} entities • {caseItem.caseNumber}
                            </Typography>
                          </Box>
                        }
                        secondaryTypographyProps={{ component: 'span' }}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            )}
          </Paper>
        </Grid>

        {/* Recent Cases */}
        <Grid item xs={12} md={6}>
          <Paper elevation={2} sx={{ p: { xs: 2, sm: 3 }, height: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Recently Updated
              </Typography>
              <Button
                size="small"
                endIcon={<ArrowForwardIcon />}
                onClick={() => navigate('/cases')}
              >
                View All
              </Button>
            </Box>
            <Divider sx={{ mb: 2 }} />
            {recentCases.length === 0 ? (
              <Alert severity="info">No cases yet. Create your first case to get started!</Alert>
            ) : (
              <List dense>
                {recentCases.map((caseItem) => (
                  <ListItem key={caseItem.id} disablePadding>
                    <ListItemButton onClick={() => handleCaseClick(caseItem.id)}>
                      <ListItemText
                        primary={
                          <Typography variant="body1" sx={{ fontWeight: 500 }} component="span">
                            {caseItem.name}
                          </Typography>
                        }
                        secondary={
                          <Box component="span" sx={{ mt: 0.5, display: 'block' }}>
                            <Chip
                              label={caseItem.status}
                              size="small"
                              sx={{
                                bgcolor: getStatusColor(caseItem.status),
                                color: 'white',
                                height: 18,
                                fontSize: '0.7rem',
                                mr: 0.5,
                              }}
                            />
                            <Typography variant="caption" color="text.secondary" component="span">
                              Updated {caseItem.updatedDate.toLocaleDateString()} • {caseItem.caseNumber}
                            </Typography>
                          </Box>
                        }
                        secondaryTypographyProps={{ component: 'span' }}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Getting Started Guide (only show if no cases) */}
      {allCases.length === 0 && (
        <Grid container spacing={{ xs: 2, sm: 3 }} sx={{ mt: 2 }}>
          <Grid item xs={12}>
            <Paper elevation={2} sx={{ p: { xs: 2, sm: 3 }, bgcolor: theme.palette.mode === 'dark' ? 'background.paper' : 'primary.50' }}>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                Getting Started
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Welcome to the Crime Network Analysis Platform! Here's how to get started:
              </Typography>
              <Stack spacing={2}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <Chip label="1" color="primary" />
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      View the Network Graph
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Explore existing entities and relationships in the graph visualization
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <Chip label="2" color="primary" />
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Detect Communities
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Use AI to automatically identify criminal networks and create cases
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <Chip label="3" color="primary" />
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Create and Manage Cases
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Organize your investigations by creating cases and assigning entities
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <Chip label="4" color="primary" />
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Analyze and Track
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Use timeline and map views to track activities and geographic patterns
                    </Typography>
                  </Box>
                </Box>
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      )}
      </Container>
    </Box>
  );
};

export default Dashboard;

