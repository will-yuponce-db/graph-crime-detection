import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { CircularProgress, Box } from '@mui/material';
import { ThemeContextProvider } from './contexts/ThemeContext';
import { store, persistor } from './store';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';

// Demo Pages
import HeatmapDashboard from './pages/HeatmapDashboard';
import GraphExplorer from './pages/GraphExplorer';
import EvidenceCard from './pages/EvidenceCard';

const LoadingScreen = () => (
  <Box
    sx={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      bgcolor: '#0a0a0a',
    }}
  >
    <CircularProgress sx={{ color: '#ff9800' }} />
  </Box>
);

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <Provider store={store}>
        <PersistGate loading={<LoadingScreen />} persistor={persistor}>
          <ThemeContextProvider>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<HeatmapDashboard />} />
                <Route path="heatmap" element={<HeatmapDashboard />} />
                <Route path="graph-explorer" element={<GraphExplorer />} />
                <Route path="evidence-card" element={<EvidenceCard />} />
              </Route>
            </Routes>
          </ThemeContextProvider>
        </PersistGate>
      </Provider>
    </ErrorBoundary>
  );
};

export default App;
