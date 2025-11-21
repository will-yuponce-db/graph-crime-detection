"""
Improved DOJ News scraper with better HTML parsing
"""
from pathlib import Path
from typing import List, Dict
import re
from .base_scraper import BaseScraper
from config import SEARCH_KEYWORDS


class DOJScraperV2(BaseScraper):
    """Improved scraper for DOJ news and press releases"""
    
    def __init__(self, output_dir: Path):
        super().__init__("doj_v2", "https://www.justice.gov", output_dir)
        
        # Update headers for better compatibility
        self.session.headers.update({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        })
    
    def run(self, limit_total: int = 50):
        """
        Scrape recent DOJ press releases
        
        Args:
            limit_total: Total documents to download
        """
        self.logger.info("Starting improved DOJ scraper...")
        
        try:
            # Get main news page
            url = f"{self.base_url}/news"
            response = self.get(url)
            
            if not response:
                self.logger.error("Failed to access DOJ news page")
                return
            
            soup = self.parse_html(response.text)
            
            # Extract all press releases from the page
            articles = self._extract_press_releases(soup)
            self.logger.info(f"Found {len(articles)} articles on page")
            
            # Filter for crime-related
            crime_articles = [a for a in articles if self._is_crime_related(a)]
            self.logger.info(f"Found {len(crime_articles)} crime-related articles")
            
            # Download articles
            for i, article in enumerate(crime_articles[:limit_total]):
                self.logger.info(f"Processing article {i+1}/{min(len(crime_articles), limit_total)}")
                self._download_article_content(article)
            
        except Exception as e:
            self.logger.error(f"Error in DOJ scraper: {e}")
        
        self.save_metadata()
        self.logger.info(f"DOJ scraping complete. Stats: {self.stats}")
    
    def _extract_press_releases(self, soup) -> List[Dict]:
        """Extract press release links from main page"""
        articles = []
        
        # DOJ uses specific article structure
        # Look for common patterns
        article_containers = (
            soup.find_all('article') or 
            soup.find_all('div', class_=re.compile(r'.*teaser.*|.*item.*|.*news.*')) or
            soup.find_all('div', class_='views-row')
        )
        
        for container in article_containers:
            # Find link
            link = container.find('a', href=True)
            if not link:
                continue
            
            href = link.get('href', '')
            if not href or href.startswith('#'):
                continue
            
            # Make absolute URL
            if not href.startswith('http'):
                href = f"{self.base_url}{href}"
            
            # Extract title
            title = link.get_text(strip=True) or link.get('title', '')
            
            # Extract date if available
            date_elem = container.find('time') or container.find(class_=re.compile(r'.*date.*'))
            date = date_elem.get_text(strip=True) if date_elem else None
            
            # Extract type/category
            category_elem = container.find(class_=re.compile(r'.*category.*|.*type.*|.*topic.*'))
            category = category_elem.get_text(strip=True) if category_elem else None
            
            articles.append({
                'url': href,
                'title': title,
                'date': date,
                'category': category,
            })
        
        return articles
    
    def _is_crime_related(self, article: Dict) -> bool:
        """Check if article is crime-related based on keywords"""
        text = f"{article['title']} {article.get('category', '')}".lower()
        
        crime_keywords = [
            'indictment', 'convicted', 'sentenced', 'arrest', 'charged',
            'conspiracy', 'rico', 'organized crime', 'cartel', 'trafficking',
            'fraud', 'laundering', 'gang', 'criminal', 'drug',
        ]
        
        return any(keyword in text for keyword in crime_keywords)
    
    def _download_article_content(self, article: Dict):
        """Download article HTML and extract PDF attachments"""
        try:
            response = self.get(article['url'])
            if not response:
                return
            
            # Save HTML
            safe_title = self.sanitize_filename(article['title'][:100])
            html_filename = f"{safe_title}.html"
            html_path = self.output_dir / html_filename
            
            with open(html_path, 'w', encoding='utf-8') as f:
                f.write(response.text)
            
            self.metadata.append({
                "filename": html_filename,
                "url": article['url'],
                "title": article['title'],
                "date": article.get('date'),
                "category": article.get('category'),
                "type": "html",
            })
            self.stats["successful_downloads"] += 1
            
            # Look for PDF attachments
            soup = self.parse_html(response.text)
            pdf_links = soup.find_all('a', href=lambda x: x and '.pdf' in x.lower())
            
            for pdf_link in pdf_links[:3]:  # Limit to 3 PDFs per article
                pdf_href = pdf_link.get('href', '')
                if not pdf_href.startswith('http'):
                    pdf_href = f"{self.base_url}{pdf_href}"
                
                pdf_title = pdf_link.get_text(strip=True) or 'attachment'
                pdf_filename = f"{safe_title}_{self.sanitize_filename(pdf_title)}.pdf"
                
                self.download_file(pdf_href, pdf_filename, metadata={
                    "article_title": article['title'],
                    "article_url": article['url'],
                    "type": "pdf",
                })
            
        except Exception as e:
            self.logger.error(f"Error downloading article {article['url']}: {e}")





