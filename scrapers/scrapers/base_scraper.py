"""
Base scraper class with common functionality
"""
import time
import logging
import json
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional
import requests
from bs4 import BeautifulSoup
from tqdm import tqdm

from config import USER_AGENT, REQUEST_TIMEOUT, RATE_LIMIT_DELAY, MAX_RETRIES, METADATA_DIR, LOGS_DIR


class BaseScraper:
    """Base class for all scrapers"""
    
    def __init__(self, name: str, base_url: str, output_dir: Path):
        self.name = name
        self.base_url = base_url
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Setup logging
        log_file = LOGS_DIR / f"{name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler(log_file),
                logging.StreamHandler()
            ]
        )
        self.logger = logging.getLogger(name)
        
        # Session setup
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        })
        
        # Metadata tracking
        self.metadata: List[Dict] = []
        self.stats = {
            "started_at": datetime.now().isoformat(),
            "total_requests": 0,
            "successful_downloads": 0,
            "failed_downloads": 0,
            "documents": [],
        }
    
    def get(self, url: str, **kwargs) -> Optional[requests.Response]:
        """Make GET request with retry logic and rate limiting"""
        self.stats["total_requests"] += 1
        
        for attempt in range(MAX_RETRIES):
            try:
                time.sleep(RATE_LIMIT_DELAY)  # Rate limiting
                response = self.session.get(
                    url,
                    timeout=kwargs.get('timeout', REQUEST_TIMEOUT),
                    **{k: v for k, v in kwargs.items() if k != 'timeout'}
                )
                response.raise_for_status()
                return response
            except requests.RequestException as e:
                self.logger.warning(f"Attempt {attempt + 1}/{MAX_RETRIES} failed for {url}: {e}")
                if attempt == MAX_RETRIES - 1:
                    self.logger.error(f"All attempts failed for {url}")
                    self.stats["failed_downloads"] += 1
                    return None
                time.sleep(RATE_LIMIT_DELAY * (attempt + 1))  # Exponential backoff
        
        return None
    
    def download_file(self, url: str, filename: str, metadata: Optional[Dict] = None) -> bool:
        """Download a file and save it locally"""
        try:
            self.logger.info(f"Downloading: {filename}")
            response = self.get(url, stream=True)
            
            if not response:
                return False
            
            file_path = self.output_dir / filename
            file_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Download with progress bar
            total_size = int(response.headers.get('content-length', 0))
            with open(file_path, 'wb') as f, tqdm(
                total=total_size,
                unit='B',
                unit_scale=True,
                desc=filename[:50]
            ) as pbar:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        pbar.update(len(chunk))
            
            # Save metadata
            doc_metadata = {
                "filename": filename,
                "url": url,
                "downloaded_at": datetime.now().isoformat(),
                "size_bytes": file_path.stat().st_size,
                "source": self.name,
            }
            if metadata:
                doc_metadata.update(metadata)
            
            self.metadata.append(doc_metadata)
            self.stats["successful_downloads"] += 1
            self.stats["documents"].append(doc_metadata)
            
            self.logger.info(f"✓ Downloaded: {filename}")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to download {filename}: {e}")
            self.stats["failed_downloads"] += 1
            return False
    
    def save_metadata(self):
        """Save metadata to JSON file"""
        self.stats["completed_at"] = datetime.now().isoformat()
        
        metadata_file = METADATA_DIR / f"{self.name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(metadata_file, 'w') as f:
            json.dump({
                "stats": self.stats,
                "documents": self.metadata,
            }, f, indent=2)
        
        self.logger.info(f"Metadata saved to {metadata_file}")
    
    def run(self):
        """Main scraping logic - to be implemented by subclasses"""
        raise NotImplementedError("Subclasses must implement run()")
    
    def parse_html(self, html: str) -> BeautifulSoup:
        """Parse HTML content"""
        return BeautifulSoup(html, 'lxml')
    
    def sanitize_filename(self, filename: str) -> str:
        """Sanitize filename for safe file system storage"""
        invalid_chars = '<>:"/\\|?*'
        for char in invalid_chars:
            filename = filename.replace(char, '_')
        return filename[:200]  # Limit length






