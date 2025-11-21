"""
DOJ News scraper - Downloads Department of Justice press releases and documents
"""
from pathlib import Path
from typing import List, Dict
from .base_scraper import BaseScraper
from config import SEARCH_KEYWORDS


class DOJScraper(BaseScraper):
    """Scraper for DOJ news and press releases"""
    
    def __init__(self, output_dir: Path):
        super().__init__("doj", "https://www.justice.gov", output_dir)
    
    def run(self, limit_per_keyword: int = 20):
        """
        Scrape DOJ press releases
        
        Args:
            limit_per_keyword: Max documents per search keyword
        """
        self.logger.info("Starting DOJ scraper...")
        
        for keyword in SEARCH_KEYWORDS:
            self.logger.info(f"Searching for: {keyword}")
            
            try:
                # DOJ news search
                search_url = f"{self.base_url}/news"
                params = {
                    'keys': keyword,
                    'items_per_page': limit_per_keyword,
                }
                
                response = self.get(search_url, params=params)
                
                if not response:
                    continue
                
                soup = self.parse_html(response.text)
                
                # Extract press releases
                articles = self._extract_articles(soup, keyword)
                
                # Download article content and any attachments
                for article in articles[:limit_per_keyword]:
                    self._download_article(article, keyword)
                
                self.logger.info(f"Completed {keyword}: {len(articles[:limit_per_keyword])} articles")
                
            except Exception as e:
                self.logger.error(f"Error searching for '{keyword}': {e}")
        
        self.save_metadata()
        self.logger.info(f"DOJ scraping complete. Stats: {self.stats}")
    
    def _extract_articles(self, soup, keyword: str) -> List[Dict]:
        """Extract article links from search results"""
        articles = []
        
        # DOJ-specific selectors
        article_items = soup.find_all('article') or soup.find_all('div', class_='views-row')
        
        for item in article_items:
            link = item.find('a', href=True)
            if not link:
                continue
            
            href = link.get('href', '')
            if not href.startswith('http'):
                href = f"{self.base_url}{href}"
            
            title = link.get_text(strip=True)
            
            # Extract date if available
            date_elem = item.find('time') or item.find(class_='date')
            date = date_elem.get_text(strip=True) if date_elem else 'unknown'
            
            articles.append({
                'url': href,
                'title': title,
                'date': date,
                'keyword': keyword,
            })
        
        return articles
    
    def _download_article(self, article: Dict, keyword: str):
        """Download article content and attachments"""
        try:
            response = self.get(article['url'])
            if not response:
                return
            
            soup = self.parse_html(response.text)
            
            # Save HTML content
            html_filename = f"{keyword}/{self.sanitize_filename(article['title'])}.html"
            html_path = self.output_dir / html_filename
            html_path.parent.mkdir(parents=True, exist_ok=True)
            
            with open(html_path, 'w', encoding='utf-8') as f:
                f.write(response.text)
            
            self.metadata.append({
                "filename": html_filename,
                "url": article['url'],
                "title": article['title'],
                "date": article['date'],
                "keyword": keyword,
                "type": "html",
            })
            
            # Look for PDF attachments
            pdf_links = soup.find_all('a', href=lambda x: x and '.pdf' in x.lower())
            
            for pdf_link in pdf_links[:5]:  # Limit PDFs per article
                pdf_href = pdf_link.get('href', '')
                if not pdf_href.startswith('http'):
                    pdf_href = f"{self.base_url}{pdf_href}"
                
                pdf_title = pdf_link.get_text(strip=True) or 'attachment'
                pdf_filename = f"{keyword}/{self.sanitize_filename(article['title'])}_{pdf_title}.pdf"
                
                self.download_file(pdf_href, pdf_filename, metadata={
                    "article_title": article['title'],
                    "keyword": keyword,
                    "type": "pdf",
                })
            
            self.stats["successful_downloads"] += 1
            
        except Exception as e:
            self.logger.error(f"Error downloading article {article['url']}: {e}")



