import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Page } from 'react-pdf';
import { Box } from '@mui/material';

interface RedactionBox {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
}

interface PDFRedactionProps {
  pageNumber: number;
  scale: number;
  namesToRedact: string[];
  onTextLayerReady?: (textItems: any[]) => void;
}

/**
 * PDF Redaction Component
 * Detects and redacts names from PDF text layer
 */
const PDFRedaction: React.FC<PDFRedactionProps> = ({
  pageNumber,
  scale,
  namesToRedact,
  onTextLayerReady,
}) => {
  const [redactionBoxes, setRedactionBoxes] = useState<RedactionBox[]>([]);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const redactionEnabled = true; // Always enabled

  // Extract text items from PDF text layer
  const extractTextItems = useCallback(() => {
    if (!textLayerRef.current) return [];

    const textItems: any[] = [];
    const textLayerDivs = textLayerRef.current.querySelectorAll('.react-pdf__Page__textContent span');

    textLayerDivs.forEach((span) => {
      const element = span as HTMLElement;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const textLayerRect = textLayerRef.current!.getBoundingClientRect();

      // Get text content
      const text = element.textContent || '';
      
      // Calculate position relative to text layer
      const x = rect.left - textLayerRect.left;
      const y = rect.top - textLayerRect.top;
      const width = rect.width;
      const height = rect.height;

      if (text.trim()) {
        textItems.push({
          text: text.trim(),
          x,
          y,
          width,
          height,
          fontSize: parseFloat(style.fontSize) || 12,
        });
      }
    });

    return textItems;
  }, []);

  // Detect names in text and create redaction boxes
  const detectNames = useCallback(
    (textItems: any[]) => {
      if (!redactionEnabled || namesToRedact.length === 0) {
        setRedactionBoxes([]);
        return;
      }

      const boxes: RedactionBox[] = [];
      const normalizedNames = namesToRedact.map((name) => name.toLowerCase().trim());

      textItems.forEach((item) => {
        const itemText = item.text.toLowerCase();
        
        // Check if this text item matches any name (exact match or contains)
        normalizedNames.forEach((name) => {
          // Match full name or individual words if name has multiple parts
          const nameParts = name.split(/\s+/);
          
          if (nameParts.length > 1) {
            // For multi-word names, check if text contains the name
            if (itemText.includes(name)) {
              boxes.push({
                x: item.x,
                y: item.y,
                width: item.width,
                height: item.height,
                text: item.text,
              });
            }
          } else {
            // For single-word names, check exact match or word boundary
            const regex = new RegExp(`\\b${name}\\b`, 'i');
            if (regex.test(item.text)) {
              boxes.push({
                x: item.x,
                y: item.y,
                width: item.width,
                height: item.height,
                text: item.text,
              });
            }
          }
        });
      });

      setRedactionBoxes(boxes);
    },
    [redactionEnabled, namesToRedact]
  );

  // Monitor text layer and detect names
  useEffect(() => {
    if (!redactionEnabled) {
      setRedactionBoxes([]);
      return;
    }

    const checkTextLayer = () => {
      const textItems = extractTextItems();
      if (textItems.length > 0) {
        detectNames(textItems);
        if (onTextLayerReady) {
          onTextLayerReady(textItems);
        }
      }
    };

    // Check immediately
    checkTextLayer();

    // Set up observer to watch for text layer changes
    const observer = new MutationObserver(checkTextLayer);
    if (textLayerRef.current) {
      observer.observe(textLayerRef.current, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

    // Also check periodically (fallback)
    const interval = setInterval(checkTextLayer, 500);

    return () => {
      observer.disconnect();
      clearInterval(interval);
    };
  }, [redactionEnabled, pageNumber, extractTextItems, detectNames, onTextLayerReady]);

  // Draw redaction boxes on canvas overlay
  useEffect(() => {
    if (!canvasRef.current || !redactionEnabled || redactionBoxes.length === 0) {
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get canvas dimensions from text layer
    if (textLayerRef.current) {
      const rect = textLayerRef.current.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw black boxes over detected names
    ctx.fillStyle = '#000000';
    redactionBoxes.forEach((box) => {
      // Add padding for better coverage
      const padding = 2;
      ctx.fillRect(
        box.x - padding,
        box.y - padding,
        box.width + padding * 2,
        box.height + padding * 2
      );
    });
  }, [redactionBoxes, redactionEnabled]);

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Canvas overlay for redaction boxes */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: 'none',
          zIndex: 10,
        }}
      />

      {/* Text layer reference (hidden, used for position detection) */}
      <div
        ref={textLayerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          opacity: 0,
          zIndex: 1,
        }}
      />
    </Box>
  );
};

export default PDFRedaction;

