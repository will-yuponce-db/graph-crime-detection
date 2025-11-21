#!/usr/bin/env python3
"""
Test connectivity and HTML structure of target sites
"""
import requests
from bs4 import BeautifulSoup
from config import USER_AGENT

def test_site(name, url):
    print(f"\n{'='*70}")
    print(f"Testing: {name}")
    print(f"URL: {url}")
    print('='*70)
    
    try:
        headers = {'User-Agent': USER_AGENT}
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        print(f"✓ Status: {response.status_code}")
        print(f"✓ Content-Type: {response.headers.get('content-type', 'unknown')}")
        print(f"✓ Content Length: {len(response.content)} bytes")
        
        soup = BeautifulSoup(response.text, 'lxml')
        print(f"\n📄 Page Title: {soup.title.string if soup.title else 'No title'}")
        
        # Find links
        links = soup.find_all('a', href=True)
        pdf_links = [link for link in links if '.pdf' in link.get('href', '').lower()]
        print(f"📎 Total links: {len(links)}")
        print(f"📎 PDF links: {len(pdf_links)}")
        
        if pdf_links:
            print("\nSample PDF links:")
            for link in pdf_links[:3]:
                print(f"  - {link.get('href')[:80]}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == '__main__':
    print("\n🔍 Testing Crime Data Source Connectivity\n")
    
    tests = [
        ("FBI Vault - La Cosa Nostra", "https://vault.fbi.gov/search?SearchableText=la+cosa+nostra"),
        ("DOJ News - RICO", "https://www.justice.gov/news?f%5B0%5D=field_pr_topic%3A3936"),
        ("DOJ Press Releases", "https://www.justice.gov/news"),
        ("DEA Publications", "https://www.dea.gov/documents"),
    ]
    
    results = {}
    for name, url in tests:
        results[name] = test_site(name, url)
    
    print("\n" + "="*70)
    print("SUMMARY")
    print("="*70)
    for name, success in results.items():
        status = "✓" if success else "❌"
        print(f"{status} {name}")
    print()



