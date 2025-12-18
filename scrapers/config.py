"""
Configuration for crime data scrapers
"""
import os
from pathlib import Path

# Base directories
BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
REPORTS_DIR = DATA_DIR / "reports"
METADATA_DIR = DATA_DIR / "metadata"
LOGS_DIR = BASE_DIR / "logs"

# Create directories if they don't exist
for directory in [DATA_DIR, REPORTS_DIR, METADATA_DIR, LOGS_DIR]:
    directory.mkdir(parents=True, exist_ok=True)

# Scraper settings
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
REQUEST_TIMEOUT = 30  # seconds
RATE_LIMIT_DELAY = 2  # seconds between requests
MAX_RETRIES = 3

# Source configurations
SOURCES = {
    "fbi_vault": {
        "base_url": "https://vault.fbi.gov",
        "enabled": True,
        "output_dir": REPORTS_DIR / "fbi_vault",
    },
    "doj_news": {
        "base_url": "https://www.justice.gov/news",
        "enabled": True,
        "output_dir": REPORTS_DIR / "doj",
    },
    "courtlistener": {
        "base_url": "https://www.courtlistener.com",
        "enabled": True,
        "output_dir": REPORTS_DIR / "courtlistener",
    },
    "dea_publications": {
        "base_url": "https://www.dea.gov",
        "enabled": True,
        "output_dir": REPORTS_DIR / "dea",
    },
}

# Search keywords
SEARCH_KEYWORDS = [
    "organized crime",
    "RICO",
    "conspiracy",
    "cartel",
    "drug trafficking",
    "money laundering",
    "criminal enterprise",
    "mafia",
    "gang",
]

# Document types to download
DOCUMENT_TYPES = [".pdf", ".doc", ".docx", ".txt"]






