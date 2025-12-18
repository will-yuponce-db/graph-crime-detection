"""
FBI Vault scraper - Downloads FBI investigation records
"""
from pathlib import Path
from typing import List, Dict
from .base_scraper import BaseScraper


class FBIVaultScraper(BaseScraper):
    """Scraper for FBI Vault (vault.fbi.gov)"""
    
    def __init__(self, output_dir: Path):
        super().__init__("fbi_vault", "https://vault.fbi.gov", output_dir)
        
        # Notable case URLs (pre-selected high-value cases)
        self.case_urls = {
            "la_cosa_nostra": "/search?SearchableText=la+cosa+nostra",
            "organized_crime": "/search?SearchableText=organized+crime",
            "gambino_family": "/Gambino%20Crime%20Family",
            "genovese_family": "/Genovese%20Crime%20Family",
            "ms13": "/MS-13",
            "el_chapo": "/search?SearchableText=el+chapo",
            "commission_case": "/search?SearchableText=commission+case",
        }
    
    def run(self, limit_per_category: int = 10):
        """
        Scrape FBI Vault documents
        
        Args:
            limit_per_category: Max documents per category
        """
        self.logger.info("Starting FBI Vault scraper...")
        
        for case_name, search_path in self.case_urls.items():
            self.logger.info(f"Processing category: {case_name}")
            
            try:
                # Get search results page
                url = f"{self.base_url}{search_path}"
                response = self.get(url)
                
                if not response:
                    continue
                
                soup = self.parse_html(response.text)
                
                # Find document links (FBI Vault uses specific structure)
                documents = self._extract_documents(soup, case_name)
                
                # Download documents (up to limit)
                for i, doc in enumerate(documents[:limit_per_category]):
                    self.download_file(
                        doc['url'],
                        f"{case_name}/{doc['filename']}",
                        metadata={
                            "case": case_name,
                            "title": doc['title'],
                        }
                    )
                
                self.logger.info(f"Completed {case_name}: {len(documents[:limit_per_category])} documents")
                
            except Exception as e:
                self.logger.error(f"Error processing {case_name}: {e}")
        
        self.save_metadata()
        self.logger.info(f"FBI Vault scraping complete. Stats: {self.stats}")
    
    def _extract_documents(self, soup, case_name: str) -> List[Dict]:
        """Extract document links from search results"""
        documents = []
        
        # FBI Vault specific selectors (adjust based on actual HTML structure)
        # This is a simplified version - actual implementation would need to inspect the site
        doc_links = soup.find_all('a', href=True)
        
        for link in doc_links:
            href = link.get('href', '')
            
            # Look for PDF links
            if '.pdf' in href.lower() or '/vault/' in href.lower():
                # Construct full URL
                if not href.startswith('http'):
                    href = f"{self.base_url}{href}"
                
                title = link.get_text(strip=True) or link.get('title', 'document')
                filename = self.sanitize_filename(f"{title}.pdf")
                
                documents.append({
                    'url': href,
                    'filename': filename,
                    'title': title,
                })
        
        return documents






