import React, { useState } from 'react';
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Button,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Drawer,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Folder as CasesIcon,
  AccountTree as GraphIcon,
  // Timeline as TimelineIcon, // Timeline and Map temporarily hidden
  // Map as MapIcon, // Timeline and Map temporarily hidden
  Description as DocumentsIcon,
  Menu as MenuIcon,
} from '@mui/icons-material';
import CaseSidebar from './CaseSidebar';
import ThemeToggle from './ThemeToggle';
import { useAppDispatch } from '../store/hooks';
import { createCase } from '../store/casesSlice';
import { CasePriority } from '../types/case';

const Layout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const dispatch = useAppDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isTablet = useMediaQuery(theme.breakpoints.down('lg'));
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [newCaseName, setNewCaseName] = useState('');
  const [newCaseDescription, setNewCaseDescription] = useState('');
  const [newCasePriority, setNewCasePriority] = useState<CasePriority>(CasePriority.MEDIUM);
  const [newCaseLeadAgent, setNewCaseLeadAgent] = useState('');

  // Determine if we should show the sidebar based on current route
  // Timeline and Map temporarily hidden
  const showSidebar = ['/graph'].some((path) => 
    location.pathname === path
  );

  // Determine active tab based on current path
  const getCurrentTab = () => {
    const path = location.pathname;
    if (path === '/') return 'dashboard';
    if (path === '/cases') return 'cases';
    if (path === '/graph') return 'graph';
    if (path === '/timeline') return 'timeline';
    if (path === '/map') return 'map';
    if (path === '/documents') return 'documents';
    return 'dashboard';
  };

  const currentTab = getCurrentTab();

  const handleNavigation = (path: string) => {
    // Preserve case query param when navigating
    const caseId = searchParams.get('case');
    // Timeline and Map temporarily hidden
    if (caseId && ['/graph'].some(p => p === path)) {
      navigate(`${path}?case=${caseId}`);
    } else {
      navigate(path);
    }
  };

  const handleCreateCase = () => {
    if (newCaseName && newCaseDescription) {
      dispatch(createCase({
        name: newCaseName,
        description: newCaseDescription,
        priority: newCasePriority,
        leadAgent: newCaseLeadAgent || undefined,
        classification: 'CONFIDENTIAL',
        tags: [],
      }));

      // Reset form
      setNewCaseName('');
      setNewCaseDescription('');
      setNewCasePriority(CasePriority.MEDIUM);
      setNewCaseLeadAgent('');
      setCreateDialogOpen(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Navigation Bar */}
      <AppBar position="static" elevation={2}>
        <Toolbar sx={{ gap: { xs: 1, md: 2 }, px: { xs: 1, sm: 2, md: 3 } }}>
          {/* Mobile Menu Button */}
          {isMobile && (
            <IconButton
              color="inherit"
              edge="start"
              onClick={() => setMobileMenuOpen(true)}
              sx={{ mr: 1 }}
            >
              <MenuIcon />
            </IconButton>
          )}

          <Typography 
            variant={isMobile ? "body1" : "h6"} 
            sx={{ 
              fontWeight: 600, 
              whiteSpace: 'nowrap',
              display: { xs: 'none', sm: 'block' }
            }}
          >
            {isMobile ? 'CNA' : 'Crime Network Analysis'}
          </Typography>
          
          {/* Desktop Navigation */}
          {!isMobile && (
            <Stack direction="row" spacing={1} sx={{ flexGrow: 1 }}>
              <Button
                variant={currentTab === 'dashboard' ? 'contained' : 'text'}
                color={currentTab === 'dashboard' ? 'secondary' : 'inherit'}
                startIcon={<DashboardIcon />}
                onClick={() => handleNavigation('/')}
                sx={{ 
                  color: currentTab === 'dashboard' ? undefined : 'white',
                  minWidth: isTablet ? 'auto' : undefined,
                }}
              >
                {!isTablet && 'Dashboard'}
              </Button>
              <Button
                variant={currentTab === 'cases' ? 'contained' : 'text'}
                color={currentTab === 'cases' ? 'secondary' : 'inherit'}
                startIcon={<CasesIcon />}
                onClick={() => handleNavigation('/cases')}
                sx={{ 
                  color: currentTab === 'cases' ? undefined : 'white',
                  minWidth: isTablet ? 'auto' : undefined,
                }}
              >
                {!isTablet && 'Cases'}
              </Button>
              <Button
                variant={currentTab === 'graph' ? 'contained' : 'text'}
                color={currentTab === 'graph' ? 'secondary' : 'inherit'}
                startIcon={<GraphIcon />}
                onClick={() => handleNavigation('/graph')}
                sx={{ 
                  color: currentTab === 'graph' ? undefined : 'white',
                  minWidth: isTablet ? 'auto' : undefined,
                }}
              >
                {!isTablet && 'Graph'}
              </Button>
              {/* Timeline and Map temporarily hidden */}
              {/* <Button
                variant={currentTab === 'timeline' ? 'contained' : 'text'}
                color={currentTab === 'timeline' ? 'secondary' : 'inherit'}
                startIcon={<TimelineIcon />}
                onClick={() => handleNavigation('/timeline')}
                sx={{ 
                  color: currentTab === 'timeline' ? undefined : 'white',
                  minWidth: isTablet ? 'auto' : undefined,
                }}
              >
                {!isTablet && 'Timeline'}
              </Button> */}
              {/* <Button
                variant={currentTab === 'map' ? 'contained' : 'text'}
                color={currentTab === 'map' ? 'secondary' : 'inherit'}
                startIcon={<MapIcon />}
                onClick={() => handleNavigation('/map')}
                sx={{ 
                  color: currentTab === 'map' ? undefined : 'white',
                  minWidth: isTablet ? 'auto' : undefined,
                }}
              >
                {!isTablet && 'Map'}
              </Button> */}
              <Button
                variant={currentTab === 'documents' ? 'contained' : 'text'}
                color={currentTab === 'documents' ? 'secondary' : 'inherit'}
                startIcon={<DocumentsIcon />}
                onClick={() => handleNavigation('/documents')}
                sx={{ 
                  color: currentTab === 'documents' ? undefined : 'white',
                  minWidth: isTablet ? 'auto' : undefined,
                }}
              >
                {!isTablet && 'Documents'}
              </Button>
            </Stack>
          )}

          <Box sx={{ flexGrow: 1 }} />
          
          
          <ThemeToggle />
        </Toolbar>
      </AppBar>

      {/* Mobile Navigation Drawer */}
      <Drawer
        anchor="left"
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      >
        <Box sx={{ width: 250, pt: 2 }}>
          <Typography variant="h6" sx={{ px: 2, mb: 2, fontWeight: 600 }}>
            Navigation
          </Typography>
          <Stack spacing={1} sx={{ px: 1 }}>
            <Button
              fullWidth
              variant={currentTab === 'dashboard' ? 'contained' : 'text'}
              startIcon={<DashboardIcon />}
              onClick={() => {
                handleNavigation('/');
                setMobileMenuOpen(false);
              }}
              sx={{ justifyContent: 'flex-start', px: 2 }}
            >
              Dashboard
            </Button>
            <Button
              fullWidth
              variant={currentTab === 'cases' ? 'contained' : 'text'}
              startIcon={<CasesIcon />}
              onClick={() => {
                handleNavigation('/cases');
                setMobileMenuOpen(false);
              }}
              sx={{ justifyContent: 'flex-start', px: 2 }}
            >
              Cases
            </Button>
            <Button
              fullWidth
              variant={currentTab === 'graph' ? 'contained' : 'text'}
              startIcon={<GraphIcon />}
              onClick={() => {
                handleNavigation('/graph');
                setMobileMenuOpen(false);
              }}
              sx={{ justifyContent: 'flex-start', px: 2 }}
            >
              Graph
            </Button>
            {/* Timeline and Map temporarily hidden */}
            {/* <Button
              fullWidth
              variant={currentTab === 'timeline' ? 'contained' : 'text'}
              startIcon={<TimelineIcon />}
              onClick={() => {
                handleNavigation('/timeline');
                setMobileMenuOpen(false);
              }}
              sx={{ justifyContent: 'flex-start', px: 2 }}
            >
              Timeline
            </Button> */}
            {/* <Button
              fullWidth
              variant={currentTab === 'map' ? 'contained' : 'text'}
              startIcon={<MapIcon />}
              onClick={() => {
                handleNavigation('/map');
                setMobileMenuOpen(false);
              }}
              sx={{ justifyContent: 'flex-start', px: 2 }}
            >
              Map
            </Button> */}
            <Button
              fullWidth
              variant={currentTab === 'documents' ? 'contained' : 'text'}
              startIcon={<DocumentsIcon />}
              onClick={() => {
                handleNavigation('/documents');
                setMobileMenuOpen(false);
              }}
              sx={{ justifyContent: 'flex-start', px: 2 }}
            >
              Documents
            </Button>
          </Stack>
        </Box>
      </Drawer>

      {/* Main Content Area with Optional Sidebar */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Conditionally show Case Sidebar - Hide on mobile */}
        {showSidebar && !isMobile && <CaseSidebar onCreateCase={() => setCreateDialogOpen(true)} />}

        {/* Main View Area */}
        <Box sx={{ flex: 1, overflow: 'auto', width: '100%' }}>
          <Outlet />
        </Box>
      </Box>

      {/* Create Case Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Case</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField
              label="Case Name"
              fullWidth
              required
              value={newCaseName}
              onChange={(e) => setNewCaseName(e.target.value)}
            />
            <TextField
              label="Description"
              fullWidth
              multiline
              rows={3}
              required
              value={newCaseDescription}
              onChange={(e) => setNewCaseDescription(e.target.value)}
            />
            <FormControl fullWidth>
              <InputLabel>Priority</InputLabel>
              <Select
                value={newCasePriority}
                onChange={(e) => setNewCasePriority(e.target.value as CasePriority)}
                label="Priority"
              >
                <MenuItem value={CasePriority.CRITICAL}>Critical</MenuItem>
                <MenuItem value={CasePriority.HIGH}>High</MenuItem>
                <MenuItem value={CasePriority.MEDIUM}>Medium</MenuItem>
                <MenuItem value={CasePriority.LOW}>Low</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Lead Agent"
              fullWidth
              value={newCaseLeadAgent}
              onChange={(e) => setNewCaseLeadAgent(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateCase} disabled={!newCaseName || !newCaseDescription}>
            Create Case
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Layout;

