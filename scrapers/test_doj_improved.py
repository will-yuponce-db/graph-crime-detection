#!/usr/bin/env python3
"""Test the improved DOJ scraper"""
from scrapers.doj_scraper_v2 import DOJScraperV2
from config import SOURCES

if __name__ == '__main__':
    print("\n🧪 Testing Improved DOJ Scraper\n")
    
    scraper = DOJScraperV2(SOURCES['doj_news']['output_dir'])
    scraper.run(limit_total=5)  # Test with just 5 articles
    
    print("\n" + "="*70)
    print("TEST RESULTS")
    print("="*70)
    print(f"Total requests: {scraper.stats['total_requests']}")
    print(f"Successful downloads: {scraper.stats['successful_downloads']}")
    print(f"Failed downloads: {scraper.stats['failed_downloads']}")
    print(f"Documents collected: {len(scraper.stats['documents'])}")
    print()
    
    if scraper.stats['documents']:
        print("\n📄 Sample Documents:")
        for doc in scraper.stats['documents'][:3]:
            print(f"  - {doc.get('title', 'Unknown')[:60]}...")
    print()






