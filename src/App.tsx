import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { CircularProgress, Box } from '@mui/material';
import { ThemeContextProvider } from './contexts/ThemeContext';
import { store, persistor } from './store';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Cases from './pages/Cases';
import GraphVisualization from './pages/GraphVisualization';
// import ActivityMap from './pages/ActivityMap'; // Timeline and Map temporarily hidden
import Documents from './pages/Documents';
import CaseInitializer from './components/CaseInitializer';

const LoadingScreen = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
    <CircularProgress />
  </Box>
);

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <Provider store={store}>
        <PersistGate loading={<LoadingScreen />} persistor={persistor}>
          <ThemeContextProvider>
            <CaseInitializer />
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="cases" element={<Cases />} />
                <Route path="graph" element={<GraphVisualization />} />
                {/* Timeline and Map temporarily hidden */}
                {/* <Route path="timeline" element={<ActivityMap viewMode="timeline" />} /> */}
                {/* <Route path="map" element={<ActivityMap viewMode="map" />} /> */}
                <Route path="documents" element={<Documents />} />
              </Route>
            </Routes>
          </ThemeContextProvider>
        </PersistGate>
      </Provider>
    </ErrorBoundary>
  );
};

export default App;
