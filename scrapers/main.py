#!/usr/bin/env python3
"""
Main scraper orchestrator for crime investigation data
"""
import argparse
import sys
from pathlib import Path

from config import SOURCES
from scrapers import FBIVaultScraper, DOJScraper


def main():
    parser = argparse.ArgumentParser(
        description='Scrape criminal investigation reports from public sources'
    )
    parser.add_argument(
        '--sources',
        nargs='+',
        choices=['fbi', 'doj', 'all'],
        default=['all'],
        help='Data sources to scrape'
    )
    parser.add_argument(
        '--limit',
        type=int,
        default=10,
        help='Max documents per category/keyword (default: 10)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Run without downloading files'
    )
    
    args = parser.parse_args()
    
    # Determine which sources to run
    sources_to_run = []
    if 'all' in args.sources:
        sources_to_run = ['fbi', 'doj']
    else:
        sources_to_run = args.sources
    
    print("=" * 70)
    print("Crime Investigation Data Scraper")
    print("=" * 70)
    print(f"Sources: {', '.join(sources_to_run)}")
    print(f"Limit: {args.limit} documents per category")
    print(f"Dry run: {args.dry_run}")
    print("=" * 70)
    print()
    
    if args.dry_run:
        print("⚠️  DRY RUN MODE - No files will be downloaded")
        print()
        return
    
    # Run scrapers
    try:
        if 'fbi' in sources_to_run:
            print("\n📁 Starting FBI Vault scraper...")
            fbi_scraper = FBIVaultScraper(SOURCES['fbi_vault']['output_dir'])
            fbi_scraper.run(limit_per_category=args.limit)
            print(f"✓ FBI Vault complete: {fbi_scraper.stats['successful_downloads']} documents downloaded")
        
        if 'doj' in sources_to_run:
            print("\n📁 Starting DOJ scraper...")
            doj_scraper = DOJScraper(SOURCES['doj_news']['output_dir'])
            doj_scraper.run(limit_per_keyword=args.limit)
            print(f"✓ DOJ complete: {doj_scraper.stats['successful_downloads']} documents downloaded")
        
        print("\n" + "=" * 70)
        print("✓ All scrapers completed successfully!")
        print("=" * 70)
        print(f"\nData saved to: {SOURCES['fbi_vault']['output_dir'].parent}")
        print(f"Metadata saved to: {Path('scrapers/data/metadata')}")
        
    except KeyboardInterrupt:
        print("\n\n⚠️  Scraping interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()



