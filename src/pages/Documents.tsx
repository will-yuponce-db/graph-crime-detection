import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  TextField,
  InputAdornment,
  Divider,
  Chip,
  CircularProgress,
  Alert,
  Breadcrumbs,
  Link,
  Pagination,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import {
  Search as SearchIcon,
  Description as DocumentIcon,
} from '@mui/icons-material';
import PDFViewer from '../components/PDFViewer';
import HTMLViewer from '../components/HTMLViewer';
import { fetchGraphData } from '../services/graphApi';
import { useAppSelector } from '../store/hooks';
import type { GraphNode } from '../types/graph';
import type { CaseDocument } from '../types/case';

interface DocumentFile {
  name: string;
  path: string;
  source: string;
  type?: 'pdf' | 'html';
  size?: number;
  date?: string;
}

const Documents: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const allCases = useAppSelector(state => state.cases?.cases || []);
  
  const [pdfFiles, setPdfFiles] = useState<DocumentFile[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<DocumentFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<DocumentFile | null>(null);
  const [selectedCaseDoc, setSelectedCaseDoc] = useState<CaseDocument | null>(null);
  const [resolvedDocPath, setResolvedDocPath] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [personNames, setPersonNames] = useState<string[]>([]);
  const [page, setPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(20);

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
        console.warn('Failed to load person names for redaction:', err);
        setPersonNames([]);
      }
    };

    loadPersonNames();
  }, []);

  useEffect(() => {
    fetchPDFList();
  }, []);

  // Helper function to resolve document path
  // If doc.path is just a filename, search through available files to find the full path
  const resolveDocumentPath = useCallback((doc: CaseDocument): string | null => {
    if (!doc.path) return null;
    
    // If path contains a directory separator, assume it's already a full path
    if (doc.path.includes('/') || doc.path.includes('\\')) {
      return doc.path;
    }
    
    console.log('🔍 Resolving document path for:', doc.path, '| Available files:', pdfFiles.length);
    
    // Otherwise, it's just a filename - search for it in the file list
    const matchingFile = pdfFiles.find(f => {
      const matches = f.name === doc.path || f.path.endsWith(`/${doc.path}`) || f.path === doc.path;
      if (matches) {
        console.log('✅ Found match:', { searchFor: doc.path, foundFile: f.name, fullPath: f.path });
      }
      return matches;
    });
    
    if (matchingFile) {
      console.log('📁 Resolved document path:', { filename: doc.path, fullPath: matchingFile.path });
      return matchingFile.path;
    }
    
    console.warn('⚠️ Could not resolve document path for:', doc.path, '| Files available:', pdfFiles.map(f => f.name).slice(0, 5));
    return null; // Return null to show loading state instead of making a bad request
  }, [pdfFiles]);

  // Handle document ID or path from URL query parameter
  useEffect(() => {
    const docId = searchParams.get('id');
    const docPath = searchParams.get('path');
    
    console.log('📄 Documents URL params:', { docId, docPath, casesLoaded: allCases.length, filesLoaded: pdfFiles.length });
    
    // Handle case documents (by ID)
    if (docId) {
      // Search through all cases to find the document
      let foundDoc: CaseDocument | null = null;
      
      for (const caseItem of allCases) {
        if (caseItem.documents) {
          const doc = caseItem.documents.find((d: CaseDocument) => d.id === docId);
          if (doc) {
            foundDoc = doc;
            break;
          }
        }
      }
      
      if (foundDoc) {
        console.log('✅ Loading document from case:', foundDoc.title, '| Files loaded:', pdfFiles.length);
        setSelectedCaseDoc(foundDoc);
        setSelectedFile(null); // Clear file list selection
        
        // Resolve the full path if needed (only if files are loaded)
        if (foundDoc.path) {
          if (pdfFiles.length > 0) {
            const resolved = resolveDocumentPath(foundDoc);
            setResolvedDocPath(resolved);
          } else {
            // Wait for files to load
            console.log('⏳ Waiting for files to load before resolving path...');
            setResolvedDocPath(null);
          }
        } else {
          setResolvedDocPath(null);
        }
      } else if (allCases.length > 0) {
        // Only show warning if cases are loaded but document not found
        console.warn('⚠️ Document not found with ID:', docId, 'in', allCases.length, 'cases');
      }
    } 
    // Handle sidebar documents (by path)
    else if (docPath) {
      const foundFile = pdfFiles.find(f => f.path === docPath);
      if (foundFile) {
        console.log('✅ Loading document from sidebar:', foundFile.name);
        setSelectedFile(foundFile);
        setSelectedCaseDoc(null); // Clear case document selection
        setResolvedDocPath(null);
      } else if (pdfFiles.length > 0) {
        // Only show warning if files are loaded but document not found
        console.warn('⚠️ Document not found with path:', docPath, 'in', pdfFiles.length, 'files');
      }
    } 
    // Clear selection if no parameters
    else if (!docId && !docPath) {
      setSelectedCaseDoc(null);
      setSelectedFile(null);
      setResolvedDocPath(null);
    }
  }, [searchParams, allCases, pdfFiles, resolveDocumentPath]);

  // Re-resolve document path when files finish loading
  useEffect(() => {
    if (selectedCaseDoc && selectedCaseDoc.path && !resolvedDocPath && pdfFiles.length > 0) {
      console.log('🔄 Re-resolving document path after files loaded...');
      const resolved = resolveDocumentPath(selectedCaseDoc);
      setResolvedDocPath(resolved);
    }
  }, [selectedCaseDoc, pdfFiles, resolvedDocPath, resolveDocumentPath]);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredFiles(pdfFiles);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredFiles(
        pdfFiles.filter(
          (file) =>
            file.name.toLowerCase().includes(query) ||
            file.source.toLowerCase().includes(query) ||
            file.path.toLowerCase().includes(query)
        )
      );
    }
  }, [searchQuery, pdfFiles]);

  const fetchPDFList = async () => {
    try {
      setLoading(true);
      // Use the same API base URL logic as graphApi.ts
      const apiBaseUrl = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:3000/api');
      const response = await fetch(`${apiBaseUrl}/documents`);
      
      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        if (text.trim().startsWith('<!')) {
          throw new Error('Backend server not running. Please start it with: npm run dev');
        }
        throw new Error(`Expected JSON but got ${contentType}`);
      }
      
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF list: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      setPdfFiles(data.files || []);
      setFilteredFiles(data.files || []);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load documents';
      setError(errorMessage);
      setPdfFiles([]);
      setFilteredFiles([]);
      console.error('Error fetching PDF list:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (file: DocumentFile) => {
    setSelectedFile(file);
    setSelectedCaseDoc(null);
    // Update URL with the file path
    setSearchParams({ path: file.path });
  };

  const getFileSourceColor = (source: string): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' => {
    const sourceLower = source.toLowerCase();
    if (sourceLower.includes('fbi')) return 'error';
    if (sourceLower.includes('doj')) return 'primary';
    if (sourceLower.includes('dea')) return 'warning';
    return 'default';
  };

  const groupFilesBySource = (files: DocumentFile[]) => {
    const grouped: Record<string, DocumentFile[]> = {};
    files.forEach((file) => {
      if (!grouped[file.source]) {
        grouped[file.source] = [];
      }
      grouped[file.source].push(file);
    });
    return grouped;
  };

  // Calculate pagination
  const totalPages = Math.ceil(filteredFiles.length / itemsPerPage);
  const paginatedFiles = useMemo(() => {
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredFiles.slice(startIndex, endIndex);
  }, [filteredFiles, page, itemsPerPage]);

  const groupedFiles = useMemo(() => groupFilesBySource(paginatedFiles), [paginatedFiles]);

  // Reset to page 1 when search changes
  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Sidebar - File List */}
      <Paper
        elevation={2}
        sx={{
          width: 400,
          minWidth: 300,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: 0,
        }}
      >
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h6" gutterBottom>
            Documents
          </Typography>
          <TextField
            fullWidth
            size="small"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {filteredFiles.length} document{filteredFiles.length !== 1 ? 's' : ''} found
            </Typography>
            <FormControl size="small" sx={{ minWidth: 80 }}>
              <InputLabel>Per page</InputLabel>
              <Select
                value={itemsPerPage}
                label="Per page"
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setPage(1);
                }}
              >
                <MenuItem value={10}>10</MenuItem>
                <MenuItem value={20}>20</MenuItem>
                <MenuItem value={50}>50</MenuItem>
                <MenuItem value={100}>100</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </Box>

        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {error && (
            <Alert severity="error" sx={{ m: 2 }}>
              {error}
            </Alert>
          )}

          {paginatedFiles.length === 0 && !error && (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <DocumentIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                {filteredFiles.length === 0 
                  ? 'No documents found'
                  : `No documents on page ${page}`
                }
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                {filteredFiles.length === 0 
                  ? 'Run the scraper to collect documents'
                  : 'Try a different page'
                }
              </Typography>
            </Box>
          )}

          {Object.entries(groupedFiles).map(([source, files]) => (
            <Box key={source}>
              <Box sx={{ px: 2, py: 1, bgcolor: 'background.default' }}>
                <Typography variant="subtitle2" color="text.secondary">
                  {source.toUpperCase()}
                </Typography>
              </Box>
              <List dense>
                {files.map((file, index) => (
                  <ListItem key={`${file.path}-${index}`} disablePadding>
                    <ListItemButton
                      selected={selectedFile?.path === file.path}
                      onClick={() => handleFileSelect(file)}
                    >
                      <DocumentIcon sx={{ mr: 1, color: 'text.secondary' }} />
                      <ListItemText
                        primary={file.name}
                        secondary={
                          <Box sx={{ display: 'flex', gap: 1, mt: 0.5, alignItems: 'center' }}>
                            <Chip
                              label={file.source}
                              size="small"
                              color={getFileSourceColor(file.source)}
                              sx={{ height: 18, fontSize: '0.65rem' }}
                            />
                            {file.type && (
                              <Chip
                                label={file.type.toUpperCase()}
                                size="small"
                                variant="outlined"
                                sx={{ height: 18, fontSize: '0.65rem' }}
                              />
                            )}
                            {file.size && (
                              <Typography variant="caption" color="text.secondary">
                                {(file.size / 1024).toFixed(1)} KB
                              </Typography>
                            )}
                          </Box>
                        }
                        primaryTypographyProps={{
                          noWrap: true,
                          sx: { fontSize: '0.875rem' },
                        }}
                        secondaryTypographyProps={{
                          component: 'div',
                        }}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
              <Divider />
            </Box>
          ))}
        </Box>

        {/* Pagination Controls */}
        {filteredFiles.length > 0 && (
          <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Page {page} of {totalPages}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Showing {paginatedFiles.length} of {filteredFiles.length}
              </Typography>
            </Box>
            <Pagination
              count={totalPages}
              page={page}
              onChange={(_, value) => setPage(value)}
              size="small"
              color="primary"
              showFirstButton
              showLastButton
              sx={{ display: 'flex', justifyContent: 'center' }}
            />
          </Box>
        )}
      </Paper>

      {/* Main Content - PDF Viewer */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selectedCaseDoc ? (
          // Render case document (from URL parameter)
          <>
            <Paper
              elevation={1}
              sx={{
                p: 1.5,
                borderBottom: 1,
                borderColor: 'divider',
                bgcolor: 'background.paper',
              }}
            >
              <Breadcrumbs separator="›" sx={{ fontSize: '0.875rem' }}>
                <Link
                  color="inherit"
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setSelectedCaseDoc(null);
                    // Clear URL parameters
                    navigate('/documents', { replace: true });
                  }}
                  sx={{ textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                >
                  Documents
                </Link>
                <Typography color="text.primary" sx={{ fontSize: '0.875rem' }}>
                  {selectedCaseDoc.title}
                </Typography>
              </Breadcrumbs>
              {selectedCaseDoc.summary && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  {selectedCaseDoc.summary}
                </Typography>
              )}
            </Paper>
            <Box sx={{ flex: 1, overflow: 'hidden' }}>
              {(() => {
                // Helper function to detect document type from file extension
                const getDocumentType = () => {
                  if (selectedCaseDoc.type && selectedCaseDoc.type !== 'other') {
                    return selectedCaseDoc.type.toLowerCase();
                  }
                  // Auto-detect from path or URL
                  const path = selectedCaseDoc.path || selectedCaseDoc.url || '';
                  if (path.toLowerCase().endsWith('.pdf')) return 'pdf';
                  if (path.toLowerCase().endsWith('.html') || path.toLowerCase().endsWith('.htm')) return 'html';
                  return selectedCaseDoc.type?.toLowerCase() || 'other';
                };

                const docType = getDocumentType();

                // Handle URL-based documents
                if (selectedCaseDoc.url) {
                  if (docType === 'pdf') {
                    return (
                      <PDFViewer 
                        file={selectedCaseDoc.url}
                        fileName={selectedCaseDoc.title}
                      />
                    );
                  } else if (docType === 'url' || docType === 'html') {
                    return (
                      <Box sx={{ width: '100%', height: '100%', overflow: 'hidden' }}>
                        <iframe
                          src={selectedCaseDoc.url}
                          style={{ width: '100%', height: '100%', border: 'none' }}
                          title={selectedCaseDoc.title}
                        />
                      </Box>
                    );
                  } else {
                    return (
                      <Box sx={{ p: 2 }}>
                        <Alert severity="info" sx={{ mb: 2 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                            Document Reference
                          </Typography>
                          <Typography variant="body2" sx={{ mb: 1 }}>
                            {selectedCaseDoc.title}
                          </Typography>
                          <Typography variant="caption" display="block" color="text.secondary">
                            Type: {docType.toUpperCase()}
                          </Typography>
                          <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
                            URL: <a href={selectedCaseDoc.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>{selectedCaseDoc.url}</a>
                          </Typography>
                          {selectedCaseDoc.summary && (
                            <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                              {selectedCaseDoc.summary}
                            </Typography>
                          )}
                        </Alert>
                      </Box>
                    );
                  }
                }
                
                // Handle path-based documents
                if (selectedCaseDoc.path && resolvedDocPath) {
                  const apiUrl = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:3000/api');
                  const fileUrl = `${apiUrl}/documents/${encodeURIComponent(resolvedDocPath)}`;
                  
                  if (docType === 'pdf') {
                    return (
                      <PDFViewer 
                        file={fileUrl}
                        fileName={selectedCaseDoc.title}
                      />
                    );
                  } else if (docType === 'html') {
                    return (
                      <HTMLViewer
                        file={fileUrl}
                        fileName={selectedCaseDoc.title}
                        namesToRedact={personNames}
                      />
                    );
                  } else {
                    return (
                      <Box sx={{ p: 2 }}>
                        <Alert severity="info" sx={{ mb: 2 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                            Document Reference
                          </Typography>
                          <Typography variant="body2" sx={{ mb: 1 }}>
                            {selectedCaseDoc.title}
                          </Typography>
                          <Typography variant="caption" display="block" color="text.secondary">
                            Type: {docType.toUpperCase()}
                          </Typography>
                          <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
                            Path: {resolvedDocPath}
                          </Typography>
                          {selectedCaseDoc.summary && (
                            <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                              {selectedCaseDoc.summary}
                            </Typography>
                          )}
                        </Alert>
                        <Alert severity="warning">
                          This document file may not be available on the server. Supported types: PDF, HTML
                        </Alert>
                      </Box>
                    );
                  }
                } else if (selectedCaseDoc.path && !resolvedDocPath) {
                  // Still loading/resolving the path OR could not resolve
                  return (
                    <Box sx={{ p: 2 }}>
                      {pdfFiles.length === 0 ? (
                        <Alert severity="info">
                          Loading document list...
                        </Alert>
                      ) : (
                        <>
                          <Alert severity="warning" sx={{ mb: 2 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                              Document Not Found
                            </Typography>
                            <Typography variant="caption" display="block" color="text.secondary">
                              Could not locate document file: {selectedCaseDoc.path}
                            </Typography>
                            <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
                              The document may need to be scraped or the file path may be incorrect.
                            </Typography>
                          </Alert>
                          <Alert severity="info">
                            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                              Document Information
                            </Typography>
                            <Typography variant="body2" sx={{ mb: 1 }}>
                              {selectedCaseDoc.title}
                            </Typography>
                            {selectedCaseDoc.summary && (
                              <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                                {selectedCaseDoc.summary}
                              </Typography>
                            )}
                          </Alert>
                        </>
                      )}
                    </Box>
                  );
                }
                
                // No URL or path
                return (
                  <Alert severity="warning" sx={{ m: 2 }}>
                    Document has no URL or path specified.
                  </Alert>
                );
              })()}
            </Box>
          </>
        ) : selectedFile ? (
          // Render file from document list
          <>
            <Paper
              elevation={1}
              sx={{
                p: 1.5,
                borderBottom: 1,
                borderColor: 'divider',
                bgcolor: 'background.paper',
              }}
            >
              <Breadcrumbs separator="›" sx={{ fontSize: '0.875rem' }}>
                <Link
                  color="inherit"
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setSelectedFile(null);
                    // Clear URL parameters
                    navigate('/documents', { replace: true });
                  }}
                  sx={{ textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                >
                  Documents
                </Link>
                <Typography color="text.primary" sx={{ fontSize: '0.875rem' }}>
                  {selectedFile.name}
                </Typography>
              </Breadcrumbs>
            </Paper>
            <Box sx={{ flex: 1, overflow: 'hidden' }}>
              {selectedFile.type === 'html' ? (
                <HTMLViewer
                  file={`${import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:3000/api')}/documents/${encodeURIComponent(selectedFile.path)}`}
                  fileName={selectedFile.name}
                  namesToRedact={personNames}
                />
              ) : (
                <PDFViewer 
                  file={`${import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:3000/api')}/documents/${encodeURIComponent(selectedFile.path)}`} 
                  fileName={selectedFile.name} 
                />
              )}
            </Box>
          </>
        ) : (
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              bgcolor: 'background.default',
              gap: 2,
            }}
          >
            <DocumentIcon sx={{ fontSize: 64, color: 'text.secondary' }} />
            <Typography variant="h6" color="text.secondary">
              Select a document to view
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Choose a PDF from the sidebar or navigate from a case
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default Documents;

