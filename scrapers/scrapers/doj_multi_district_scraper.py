"""
Enhanced DOJ scraper that collects from multiple district offices
"""
from pathlib import Path
from typing import List, Dict
import re
from .base_scraper import BaseScraper


class DOJMultiDistrictScraper(BaseScraper):
    """Scraper for DOJ press releases from multiple districts"""
    
    def __init__(self, output_dir: Path):
        super().__init__("doj_multi", "https://www.justice.gov", output_dir)
        
        # Major DOJ district offices (handle most high-profile crime cases)
        self.districts = {
            "SDNY": "usao-sdny",  # Southern District of New York
            "EDNY": "usao-edny",  # Eastern District of New York
            "CDCA": "usao-cdca",  # Central District of California
            "SDCA": "usao-sdca",  # Southern District of California
            "NDIL": "usao-ndil",  # Northern District of Illinois
            "SDFL": "usao-sdfl",  # Southern District of Florida
            "DC": "usao-dc",      # District of Columbia
            "EDVA": "usao-edva",  # Eastern District of Virginia
            "NJ": "usao-nj",      # New Jersey
            "EDPA": "usao-edpa",  # Eastern District of Pennsylvania
        }
        
        self.session.headers.update({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
        })
    
    def run(self, docs_per_district: int = 20):
        """
        Scrape from multiple DOJ districts
        
        Args:
            docs_per_district: Documents to collect from each district
        """
        self.logger.info(f"Starting multi-district DOJ scraper ({len(self.districts)} districts)...")
        
        for district_name, district_code in self.districts.items():
            self.logger.info(f"\n{'='*60}")
            self.logger.info(f"Processing: {district_name} ({district_code})")
            self.logger.info(f"{'='*60}")
            
            try:
                articles = self._scrape_district(district_code, docs_per_district)
                self.logger.info(f"✓ {district_name}: Collected {len(articles)} articles")
                
            except Exception as e:
                self.logger.error(f"❌ Error scraping {district_name}: {e}")
        
        self.save_metadata()
        self.logger.info(f"\n{'='*60}")
        self.logger.info(f"Multi-district scraping complete!")
        self.logger.info(f"Total documents: {len(self.metadata)}")
        self.logger.info(f"{'='*60}")
    
    def _scrape_district(self, district_code: str, limit: int) -> List[Dict]:
        """Scrape press releases from a specific district"""
        articles = []
        
        # Try multiple pages
        for page in range(3):  # Get first 3 pages
            try:
                url = f"{self.base_url}/{district_code}/pr"
                params = {'page': page} if page > 0 else {}
                
                response = self.get(url, params=params)
                if not response:
                    break
                
                soup = self.parse_html(response.text)
                page_articles = self._extract_articles_from_page(soup, district_code)
                
                if not page_articles:
                    break  # No more articles
                
                for article in page_articles:
                    if len(articles) >= limit:
                        break
                    
                    if self._is_high_value_case(article):
                        self._download_article(article, district_code)
                        articles.append(article)
                
                if len(articles) >= limit:
                    break
                
            except Exception as e:
                self.logger.warning(f"Error on page {page} of {district_code}: {e}")
                break
        
        return articles
    
    def _extract_articles_from_page(self, soup, district_code: str) -> List[Dict]:
        """Extract article links from district press release page"""
        articles = []
        
        # Find article containers
        containers = (
            soup.find_all('article') or
            soup.find_all('div', class_=re.compile(r'.*teaser.*|.*views-row.*'))
        )
        
        for container in containers:
            link = container.find('a', href=True)
            if not link:
                continue
            
            href = link.get('href', '')
            if not href or href.startswith('#'):
                continue
            
            # Make absolute URL
            if not href.startswith('http'):
                href = f"{self.base_url}{href}"
            
            title = link.get_text(strip=True) or link.get('title', '')
            if not title:
                continue
            
            # Extract date
            date_elem = container.find('time') or container.find(class_=re.compile(r'.*date.*'))
            date = date_elem.get_text(strip=True) if date_elem else None
            
            articles.append({
                'url': href,
                'title': title,
                'date': date,
                'district': district_code,
            })
        
        return articles
    
    def _is_high_value_case(self, article: Dict) -> bool:
        """Determine if article is a high-value criminal case"""
        text = article['title'].lower()
        
        # High-value keywords (serious crimes, conspiracies, networks)
        high_value_keywords = [
            'indictment', 'indicted', 'convicted', 'sentenced', 'pleads guilty',
            'conspiracy', 'rico', 'organized crime', 'cartel', 'trafficking',
            'fraud', 'laundering', 'money laundering', 'gang', 'enterprise',
            'drug', 'narcotics', 'firearms', 'weapons', 'murder', 'homicide',
            'extortion', 'racketeering', 'corruption', 'bribery',
        ]
        
        return any(keyword in text for keyword in high_value_keywords)
    
    def _download_article(self, article: Dict, district_code: str):
        """Download article content"""
        try:
            response = self.get(article['url'])
            if not response:
                return
            
            # Create district subfolder
            district_folder = self.output_dir / district_code
            district_folder.mkdir(parents=True, exist_ok=True)
            
            # Save HTML
            safe_title = self.sanitize_filename(article['title'][:100])
            html_filename = f"{district_code}/{safe_title}.html"
            html_path = self.output_dir / html_filename
            
            with open(html_path, 'w', encoding='utf-8') as f:
                f.write(response.text)
            
            self.metadata.append({
                "filename": html_filename,
                "url": article['url'],
                "title": article['title'],
                "date": article.get('date'),
                "district": district_code,
                "type": "html",
            })
            self.stats["successful_downloads"] += 1
            
            # Look for PDF attachments
            soup = self.parse_html(response.text)
            pdf_links = soup.find_all('a', href=lambda x: x and '.pdf' in x.lower())
            
            for i, pdf_link in enumerate(pdf_links[:2]):  # Limit to 2 PDFs per article
                pdf_href = pdf_link.get('href', '')
                if not pdf_href.startswith('http'):
                    if pdf_href.startswith('/'):
                        pdf_href = f"{self.base_url}{pdf_href}"
                    else:
                        continue
                
                pdf_filename = f"{district_code}/{safe_title}_attachment_{i+1}.pdf"
                
                self.download_file(pdf_href, pdf_filename, metadata={
                    "article_title": article['title'],
                    "article_url": article['url'],
                    "district": district_code,
                    "type": "pdf",
                })
            
        except Exception as e:
            self.logger.error(f"Error downloading {article['url']}: {e}")
            self.stats["failed_downloads"] += 1




