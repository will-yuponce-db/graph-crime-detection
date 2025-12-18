#!/usr/bin/env python3
"""
Enhanced large-scale scraper with multi-district support
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from scrapers.doj_multi_district_scraper import DOJMultiDistrictScraper
from config import SOURCES

if __name__ == '__main__':
    print("="*80)
    print("  ENHANCED LARGE-SCALE CRIME DATA SCRAPER")
    print("="*80)
    print("\n🎯 Target: 10 major DOJ districts × 20 documents each = 200+ documents")
    print("⏱️  Estimated time: 15-20 minutes")
    print("💾 Expected size: ~100-150 MB")
    print("\n📍 Districts:")
    print("   • SDNY (Southern District of New York) - Wall Street, organized crime")
    print("   • EDNY (Eastern District of New York) - Mafia, international crime")
    print("   • CDCA (Central District of California) - Entertainment fraud, cartels")
    print("   • SDFL (Southern District of Florida) - Drug trafficking, fraud")
    print("   • And 6 more major districts...")
    print("\nPress Ctrl+C to stop at any time (progress will be saved)\n")
    print("="*80)
    
    try:
        scraper = DOJMultiDistrictScraper(SOURCES['doj_news']['output_dir'])
        scraper.run(docs_per_district=20)
        
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
            
            # District breakdown
            from collections import Counter
            districts = Counter(d.get('district') for d in scraper.metadata if d.get('district'))
            print(f"\n📍 DOCUMENTS BY DISTRICT:")
            for district, count in districts.most_common():
                print(f"   {district:8s}: {count:3d} documents")
            
            # Sample cases
            print(f"\n📋 SAMPLE CASES (first 15):")
            for i, doc in enumerate(scraper.metadata[:15], 1):
                title = doc.get('title', 'Unknown')[:65]
                district = doc.get('district', 'N/A')
                print(f"   {i:2d}. [{district}] {title}...")
        
        print(f"\n💾 Data saved to:")
        print(f"   Reports:   {SOURCES['doj_news']['output_dir']}")
        print(f"   Metadata:  data/metadata/")
        print(f"   Logs:      logs/")
        
        print("\n" + "="*80)
        print("🎉 SUCCESS! You now have substantial crime data for analysis!")
        print("="*80)
        
    except KeyboardInterrupt:
        print("\n\n⚠️  Scraping interrupted by user")
        print("✓ Progress has been saved")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)






