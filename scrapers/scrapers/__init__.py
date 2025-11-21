"""
Scrapers for criminal investigation data
"""
from .base_scraper import BaseScraper
from .fbi_vault_scraper import FBIVaultScraper
from .doj_scraper import DOJScraper

__all__ = ['BaseScraper', 'FBIVaultScraper', 'DOJScraper']



