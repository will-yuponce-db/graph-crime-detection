import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { ThemeContextProvider } from './contexts/ThemeContext';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';

// Demo Pages
import HeatmapDashboard from './pages/HeatmapDashboard';
import GraphExplorer from './pages/GraphExplorer';
import EvidenceCard from './pages/EvidenceCard';
import ESRIIntegration from './pages/ESRIIntegration';

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <ThemeContextProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<EvidenceCard />} />
            <Route path="heatmap" element={<HeatmapDashboard />} />
            <Route path="graph-explorer" element={<GraphExplorer />} />
            <Route path="evidence-card" element={<EvidenceCard />} />
            <Route path="esri" element={<ESRIIntegration />} />
          </Route>
        </Routes>
      </ThemeContextProvider>
    </ErrorBoundary>
  );
};

export default App;
