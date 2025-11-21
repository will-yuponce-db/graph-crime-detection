#!/usr/bin/env python3
"""
Quick scraper runner with customizable limits
Usage: python3 run_scraper.py --limit 10
"""
import argparse
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from scrapers.doj_multi_district_scraper import DOJMultiDistrictScraper
from config import SOURCES

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Run DOJ scraper with custom limits')
    parser.add_argument(
        '--limit',
        type=int,
        default=20,
        help='Number of documents per district (default: 20)'
    )
    parser.add_argument(
        '--total',
        type=int,
        help='Total documents to collect (overrides --limit)'
    )
    
    args = parser.parse_args()
    
    # Calculate docs per district if total is specified
    if args.total:
        docs_per_district = max(1, args.total // 10)  # 10 districts
        print(f"📊 Target: {args.total} total documents")
        print(f"   = {docs_per_district} docs per district × 10 districts")
    else:
        docs_per_district = args.limit
        print(f"📊 Target: {docs_per_district} documents per district")
        print(f"   = ~{docs_per_district * 10} total documents")
    
    print("\n" + "="*70)
    print("  DOJ CRIME DATA SCRAPER")
    print("="*70)
    print()
    
    try:
        scraper = DOJMultiDistrictScraper(SOURCES['doj_news']['output_dir'])
        scraper.run(docs_per_district=docs_per_district)
        
        print("\n" + "="*70)
        print("✅ SCRAPING COMPLETE!")
        print("="*70)
        print(f"Documents collected: {len(scraper.metadata)}")
        print(f"Data location: {SOURCES['doj_news']['output_dir']}")
        
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user. Progress saved.")
        sys.exit(0)




