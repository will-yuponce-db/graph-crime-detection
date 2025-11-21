import React, { useState, useEffect, useRef } from 'react';
import { Box, Paper, Alert, Typography } from '@mui/material';

interface HTMLViewerProps {
  file: string;
  fileName?: string;
  namesToRedact: string[];
}

/**
 * HTML Viewer Component with Name Redaction
 * Displays HTML content and redacts names from the graph data
 */
const HTMLViewer: React.FC<HTMLViewerProps> = ({ file, fileName, namesToRedact }) => {
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const redactionEnabled = true; // Always enabled

  // Load HTML content
  useEffect(() => {
    const loadHTML = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(file);
        
        if (!response.ok) {
          throw new Error(`Failed to load HTML: ${response.status} ${response.statusText}`);
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('text/html')) {
          const text = await response.text();
          if (text.trim().startsWith('<!')) {
            // It's HTML even if content-type is wrong
            setHtmlContent(text);
          } else {
            throw new Error(`Expected HTML but got ${contentType}`);
          }
        } else {
          const text = await response.text();
          setHtmlContent(text);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load HTML document');
        console.error('Error loading HTML:', err);
      } finally {
        setLoading(false);
      }
    };

    loadHTML();
  }, [file]);

  // Apply redaction to HTML content
  const getRedactedHTML = (html: string, names: string[]): string => {
    if (!redactionEnabled || names.length === 0) {
      return html;
    }

    let redacted = html;
    
    // Create a copy of names for case-insensitive matching
    const normalizedNames = names.map(name => ({
      original: name,
      lower: name.toLowerCase(),
      parts: name.toLowerCase().split(/\s+/),
    }));

    // Redact full names (multi-word)
    normalizedNames.forEach(({ original, lower }) => {
      if (original.split(/\s+/).length > 1) {
        // Use word boundaries and case-insensitive matching
        const regex = new RegExp(`\\b${original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        redacted = redacted.replace(regex, (match) => {
          return '<span style="background-color: #000000; color: #000000; padding: 2px 4px; border-radius: 2px;">' + 
                 '█'.repeat(match.length) + 
                 '</span>';
        });
      }
    });

    // Redact individual name parts (single words that are part of names)
    normalizedNames.forEach(({ original, parts }) => {
      if (parts.length === 1) {
        // Only redact if it's a standalone word (not part of another word)
        const regex = new RegExp(`\\b${parts[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        redacted = redacted.replace(regex, (match) => {
          // Check if this word is part of a longer name that was already redacted
          const beforeMatch = redacted.substring(0, redacted.indexOf(match));
          const afterMatch = redacted.substring(redacted.indexOf(match) + match.length);
          const context = beforeMatch.slice(-20) + match + afterMatch.slice(0, 20);
          
          // If it's already in a redaction span, skip
          if (context.includes('<span style="background-color: #000000')) {
            return match;
          }
          
          return '<span style="background-color: #000000; color: #000000; padding: 2px 4px; border-radius: 2px;">' + 
                 '█'.repeat(match.length) + 
                 '</span>';
        });
      }
    });

    return redacted;
  };

  // Update iframe content when HTML or redaction changes
  useEffect(() => {
    if (iframeRef.current && htmlContent) {
      const redactedHTML = getRedactedHTML(htmlContent, namesToRedact);
      const iframe = iframeRef.current;
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      
      if (doc) {
        doc.open();
        doc.write(redactedHTML);
        doc.close();
      }
    }
  }, [htmlContent, redactionEnabled, namesToRedact]);


  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      {/* Content Area */}
      <Box sx={{ flex: 1, overflow: 'hidden', position: 'relative', bgcolor: 'grey.100' }}>
        {loading && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, mt: 4 }}>
            <Typography variant="body2" color="text.secondary">
              Loading HTML document...
            </Typography>
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ m: 2, maxWidth: 600 }}>
            {error}
          </Alert>
        )}

        {!loading && !error && (
          <iframe
            ref={iframeRef}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              backgroundColor: 'white',
            }}
            title={fileName || 'HTML Document'}
            sandbox="allow-same-origin"
          />
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

export default HTMLViewer;

