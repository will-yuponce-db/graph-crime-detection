#!/usr/bin/env python3
"""
Manual Download Helper for Sites with Bot Protection

For sites that block automated requests (FBI Vault, DEA), this script helps you:
1. Provides direct URLs to manually download
2. Organizes downloaded files
3. Generates metadata

Usage:
1. Run this script to get URLs
2. Manually download files from your browser
3. Place files in the suggested directories
4. Run the metadata generator
"""

import json
from pathlib import Path
from datetime import datetime

# Pre-selected high-value case URLs
FBI_VAULT_URLS = {
    "Organized Crime": [
        "https://vault.fbi.gov/Gambino%20Crime%20Family",
        "https://vault.fbi.gov/Genovese%20Crime%20Family",
        "https://vault.fbi.gov/Lucchese%20Crime%20Family",
        "https://vault.fbi.gov/La%20Cosa%20Nostra",
    ],
    "Gangs": [
        "https://vault.fbi.gov/MS-13",
        "https://vault.fbi.gov/search?SearchableText=gang",
    ],
    "Drug Cartels": [
        "https://vault.fbi.gov/search?SearchableText=cartel",
        "https://vault.fbi.gov/search?SearchableText=drug+trafficking",
    ],
}

DEA_URLS = {
    "Reports": [
        "https://www.dea.gov/documents?title=threat+assessment",
        "https://www.dea.gov/documents?title=cartel",
    ],
}

DOJ_HIGH_PROFILE = {
    "Recent Cases": [
        "https://www.justice.gov/usao-edny/pr",  # Eastern District NY (high-profile cases)
        "https://www.justice.gov/usao-sdny/pr",  # Southern District NY
        "https://www.justice.gov/usao-cdca/pr",  # Central District CA
    ],
}

def print_section(title, urls_dict):
    print(f"\n{'='*80}")
    print(f"  {title}")
    print('='*80)
    
    for category, urls in urls_dict.items():
        print(f"\n📂 {category}:")
        for i, url in enumerate(urls, 1):
            print(f"   {i}. {url}")

def generate_download_instructions():
    print("""
╔══════════════════════════════════════════════════════════════════════════════╗
║                     MANUAL DOWNLOAD HELPER                                   ║
║                                                                              ║
║  Some government sites block automated scrapers.                            ║
║  Use this guide to manually download high-value documents.                  ║
╚══════════════════════════════════════════════════════════════════════════════╝

📋 INSTRUCTIONS:
  1. Visit each URL below in your web browser
  2. Download PDFs and documents you find
  3. Save them to: scrapers/data/reports/manual/[category]/
  4. The scraper will automatically organize them

💡 TIP: Right-click PDFs → "Save Link As..." to download
""")
    
    print_section("🏛️  FBI VAULT (vault.fbi.gov)", FBI_VAULT_URLS)
    print_section("💊 DEA DOCUMENTS (dea.gov)", DEA_URLS)
    print_section("⚖️  DOJ HIGH-PROFILE CASES", DOJ_HIGH_PROFILE)
    
    print(f"\n{'='*80}")
    print("📁 SAVE LOCATIONS:")
    print('='*80)
    print(f"  FBI Vault:      scrapers/data/reports/manual/fbi_vault/")
    print(f"  DEA:            scrapers/data/reports/manual/dea/")
    print(f"  DOJ Cases:      scrapers/data/reports/manual/doj_cases/")
    
    print(f"\n{'='*80}")
    print("🚀 NEXT STEPS:")
    print('='*80)
    print("  After downloading files manually:")
    print("    python3 organize_manual_downloads.py")
    print()

def create_directory_structure():
    """Create directories for manual downloads"""
    base = Path("data/reports/manual")
    directories = [
        base / "fbi_vault" / "organized_crime",
        base / "fbi_vault" / "gangs",
        base / "fbi_vault" / "drug_cartels",
        base / "dea" / "reports",
        base / "doj_cases",
    ]
    
    for directory in directories:
        directory.mkdir(parents=True, exist_ok=True)
    
    print(f"✓ Created directory structure at: {base}")

if __name__ == '__main__':
    generate_download_instructions()
    
    print("\n📁 Creating directory structure...")
    create_directory_structure()
    
    print(f"\n{'='*80}")
    print("✓ Setup complete!")
    print('='*80)
    print("\n💡 QUICK START:")
    print("   1. Visit FBI Vault: https://vault.fbi.gov/")
    print("   2. Search for: 'Gambino Crime Family'")
    print("   3. Download PDFs → save to: data/reports/manual/fbi_vault/organized_crime/")
    print()





