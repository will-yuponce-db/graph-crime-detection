import React, { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Box, IconButton, Typography, Paper, CircularProgress, Alert } from '@mui/material';
import {
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  NavigateBefore as PrevIcon,
  NavigateNext as NextIcon,
} from '@mui/icons-material';
import PDFRedaction from './PDFRedaction';
import { fetchGraphData } from '../services/graphApi';
import type { GraphNode } from '../types/graph';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Set up PDF.js worker - use local copy from public directory
// IMPORTANT: The worker version must match pdfjs.version used by react-pdf
// The worker file should be copied from: node_modules/react-pdf/node_modules/pdfjs-dist/build/pdf.worker.min.mjs
// This avoids CDN issues and works offline
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

interface PDFViewerProps {
  file: string | File | ArrayBuffer;
  fileName?: string;
}

const PDFViewer: React.FC<PDFViewerProps> = ({ file, fileName }) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [error, setError] = useState<string | null>(null);
  const [personNames, setPersonNames] = useState<string[]>([]);

  // Reset state when file changes
  useEffect(() => {
    setError(null);
    setPageNumber(1);
    setNumPages(0);
  }, [file]);

  // Fetch person names from graph data for redaction
  useEffect(() => {
    const loadPersonNames = async () => {
      try {
        const graphData = await fetchGraphData();
        // Extract person names from nodes with type "PERSON" or "SUSPECT"
        const names = graphData.nodes
          .filter((node: GraphNode) => 
            node.type === 'PERSON' || 
            node.type === 'SUSPECT' ||
            node.type?.toLowerCase().includes('person')
          )
          .map((node: GraphNode) => node.label || node.properties?.name as string)
          .filter((name): name is string => Boolean(name && typeof name === 'string'));
        
        // Also check properties.name for additional names
        graphData.nodes.forEach((node: GraphNode) => {
          if (node.properties?.name && typeof node.properties.name === 'string') {
            const name = node.properties.name as string;
            if (!names.includes(name)) {
              names.push(name);
            }
          }
        });

        setPersonNames([...new Set(names)]); // Remove duplicates
      } catch (err) {
        // Silently fail - redaction will just have no names to redact
        console.warn('Failed to load person names for redaction (this is OK if backend is not running):', err);
        setPersonNames([]);
      }
    };

    loadPersonNames();
  }, []);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setError(null);
  };

  const onDocumentLoadError = (error: Error) => {
    setError(`Failed to load PDF: ${error.message}`);
  };

  const goToPrevPage = () => {
    setPageNumber((prev) => Math.max(1, prev - 1));
  };

  const goToNextPage = () => {
    setPageNumber((prev) => Math.min(numPages, prev + 1));
  };

  const zoomIn = () => {
    setScale((prev) => Math.min(3.0, prev + 0.2));
  };

  const zoomOut = () => {
    setScale((prev) => Math.max(0.5, prev - 0.2));
  };

  const resetZoom = () => {
    setScale(1.0);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      {/* Toolbar */}
      <Paper
        elevation={2}
        sx={{
          p: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexWrap: 'wrap',
          bgcolor: 'background.paper',
        }}
      >
        <IconButton onClick={goToPrevPage} disabled={pageNumber <= 1} size="small">
          <PrevIcon />
        </IconButton>
        <Typography variant="body2" sx={{ minWidth: '100px', textAlign: 'center' }}>
          Page {pageNumber} of {numPages || '--'}
        </Typography>
        <IconButton onClick={goToNextPage} disabled={pageNumber >= numPages} size="small">
          <NextIcon />
        </IconButton>

        <Box sx={{ flexGrow: 1 }} />

        <IconButton onClick={zoomOut} disabled={scale <= 0.5} size="small">
          <ZoomOutIcon />
        </IconButton>
        <Typography variant="body2" sx={{ minWidth: '60px', textAlign: 'center' }}>
          {Math.round(scale * 100)}%
        </Typography>
        <IconButton onClick={zoomIn} disabled={scale >= 3.0} size="small">
          <ZoomInIcon />
        </IconButton>
        <IconButton onClick={resetZoom} size="small" title="Reset Zoom">
          <Typography variant="caption">1:1</Typography>
        </IconButton>
      </Paper>

      {/* PDF Display Area */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          bgcolor: 'grey.100',
          p: 2,
        }}
      >
        {error ? (
          <Alert severity="error" sx={{ mt: 2, maxWidth: 600 }}>
            {error}
          </Alert>
        ) : (
          <Box sx={{ position: 'relative' }}>
            <Document
              key={typeof file === 'string' ? file : fileName || 'pdf-document'}
              file={file}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, mt: 4 }}>
                  <CircularProgress />
                  <Typography variant="body2" color="text.secondary">
                    Loading PDF...
                  </Typography>
                </Box>
              }
            >
              {numPages > 0 && (
                <Box sx={{ position: 'relative', display: 'inline-block' }}>
                  <Page
                    pageNumber={pageNumber}
                    scale={scale}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                  />
                  <PDFRedaction
                    pageNumber={pageNumber}
                    scale={scale}
                    namesToRedact={personNames}
                  />
                </Box>
              )}
            </Document>
          </Box>
        )}
      </Box>

      {/* File Name */}
      {fileName && (
        <Paper elevation={1} sx={{ p: 1, bgcolor: 'background.paper' }}>
          <Typography variant="caption" color="text.secondary" noWrap>
            {fileName}
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

export default PDFViewer;

