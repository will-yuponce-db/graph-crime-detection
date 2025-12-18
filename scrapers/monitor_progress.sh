#!/bin/bash
# Monitor scraping progress in real-time

echo "======================================================================"
echo "  SCRAPER PROGRESS MONITOR"
echo "======================================================================"
echo ""

while true; do
    clear
    echo "======================================================================"
    echo "  📊 REAL-TIME SCRAPING PROGRESS"
    echo "======================================================================"
    echo ""
    
    # Count documents
    HTML_COUNT=$(find data/reports/doj -type f -name "*.html" 2>/dev/null | wc -l | tr -d ' ')
    PDF_COUNT=$(find data/reports/doj -type f -name "*.pdf" 2>/dev/null | wc -l | tr -d ' ')
    TOTAL_DOCS=$((HTML_COUNT + PDF_COUNT))
    
    # Data size
    DATA_SIZE=$(du -sh data/reports/doj 2>/dev/null | awk '{print $1}')
    
    # Districts processed
    DISTRICTS=$(find data/reports/doj -type d -mindepth 1 2>/dev/null | wc -l | tr -d ' ')
    
    echo "📄 Documents Downloaded:  $TOTAL_DOCS"
    echo "   └─ HTML files:         $HTML_COUNT"
    echo "   └─ PDF files:          $PDF_COUNT"
    echo ""
    echo "💾 Total Data Size:       $DATA_SIZE"
    echo "📍 Districts Processed:   $DISTRICTS / 10"
    echo ""
    
    # Show recent log entries
    echo "📋 Recent Activity:"
    echo "──────────────────────────────────────────────────────────────────"
    tail -5 logs/doj_multi_*.log 2>/dev/null | sed 's/^/   /'
    echo ""
    
    # Estimate completion
    if [ $DISTRICTS -gt 0 ]; then
        DOCS_PER_DISTRICT=$((TOTAL_DOCS / DISTRICTS))
        ESTIMATED_TOTAL=$((DOCS_PER_DISTRICT * 10))
        PERCENT=$((DISTRICTS * 10))
        echo "📈 Progress: $PERCENT% complete (≈$ESTIMATED_TOTAL docs total)"
    fi
    
    echo ""
    echo "Press Ctrl+C to stop monitoring (scraper will continue)"
    echo ""
    
    sleep 5
done






