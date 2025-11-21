#!/usr/bin/env python3
"""
Large-scale scraper for collecting substantial crime investigation data
"""
from scrapers.doj_scraper_v2 import DOJScraperV2
from config import SOURCES
import sys

if __name__ == '__main__':
    print("="*80)
    print("  LARGE-SCALE CRIME DATA SCRAPER")
    print("="*80)
    print("\n🎯 Target: 200 DOJ documents")
    print("⏱️  Estimated time: 10-15 minutes")
    print("💾 Expected size: ~50-100 MB")
    print("\nPress Ctrl+C to stop at any time (progress will be saved)\n")
    print("="*80)
    
    try:
        # DOJ Scraper
        print("\n📁 Starting DOJ large-scale scrape...")
        print("   Collecting recent criminal press releases...")
        
        scraper = DOJScraperV2(SOURCES['doj_news']['output_dir'])
        scraper.run(limit_total=200)
        
        print("\n" + "="*80)
        print("✓ SCRAPING COMPLETE!")
        print("="*80)
        print(f"\n📊 FINAL STATISTICS:")
        print(f"   Total requests:        {scraper.stats['total_requests']}")
        print(f"   Successful downloads:  {scraper.stats['successful_downloads']}")
        print(f"   Failed downloads:      {scraper.stats['failed_downloads']}")
        print(f"   Documents collected:   {len(scraper.metadata)}")
        
        if scraper.metadata:
            # Calculate total size
            from pathlib import Path
            total_size = 0
            for doc in scraper.metadata:
                file_path = Path(f"data/reports/doj/{doc['filename']}")
                if file_path.exists():
                    total_size += file_path.stat().st_size
            
            print(f"   Total data size:       {total_size / (1024*1024):.2f} MB")
            
            # Document type breakdown
            html_count = sum(1 for d in scraper.metadata if d.get('type') == 'html')
            pdf_count = sum(1 for d in scraper.metadata if d.get('type') == 'pdf')
            
            print(f"\n📄 DOCUMENT TYPES:")
            print(f"   HTML documents:  {html_count}")
            print(f"   PDF documents:   {pdf_count}")
            
            # Sample categories
            print(f"\n📋 SAMPLE CASES:")
            for doc in scraper.metadata[:10]:
                title = doc.get('title', 'Unknown')[:70]
                print(f"   • {title}...")
        
        print(f"\n💾 Data saved to:")
        print(f"   Reports:   {SOURCES['doj_news']['output_dir']}")
        print(f"   Metadata:  data/metadata/")
        print(f"   Logs:      logs/")
        
        print("\n" + "="*80)
        
    except KeyboardInterrupt:
        print("\n\n⚠️  Scraping interrupted by user")
        print("✓ Progress has been saved")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)



