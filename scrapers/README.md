# Crime Investigation Data Scrapers

Automated scrapers for collecting publicly available criminal investigation reports and documents.

## 📦 Installation

```bash
cd scrapers
pip install -r requirements.txt
```

## 🚀 Quick Start

### Scrape everything (10 docs per category):
```bash
python main.py
```

### Scrape specific sources:
```bash
# FBI Vault only
python main.py --sources fbi --limit 20

# DOJ only
python main.py --sources doj --limit 15

# Both
python main.py --sources fbi doj --limit 25
```

### Dry run (test without downloading):
```bash
python main.py --dry-run
```

## 📂 Output Structure

```
scrapers/
├── data/
│   ├── reports/
│   │   ├── fbi_vault/
│   │   │   ├── organized_crime/
│   │   │   │   ├── gambino_family_report.pdf
│   │   │   │   └── commission_case.pdf
│   │   │   └── ms13/
│   │   │       └── gang_structure.pdf
│   │   └── doj/
│   │       ├── rico/
│   │       │   ├── indictment_2023.html
│   │       │   └── indictment_2023_attachment.pdf
│   │       └── cartel/
│   │           └── sinaloa_case.html
│   └── metadata/
│       ├── fbi_vault_20241117_143022.json
│       └── doj_20241117_143522.json
└── logs/
    ├── fbi_vault_20241117_143022.log
    └── doj_20241117_143522.log
```

## 🎯 Data Sources

### FBI Vault (`fbi`)
- **URL**: https://vault.fbi.gov/
- **Content**: Declassified FBI investigation files
- **Categories**:
  - La Cosa Nostra (Mafia)
  - Organized Crime
  - Gambino Crime Family
  - Genovese Crime Family
  - MS-13 Gang
  - El Chapo / Drug Cartels
  - Commission Case (Mafia Commission)

### DOJ News (`doj`)
- **URL**: https://www.justice.gov/news
- **Content**: Press releases, indictments, case documents
- **Keywords**:
  - Organized crime
  - RICO
  - Conspiracy
  - Cartel
  - Drug trafficking
  - Money laundering
  - Criminal enterprise
  - Mafia
  - Gang

## 📊 Metadata

Each scraping session generates a JSON metadata file containing:

```json
{
  "stats": {
    "started_at": "2024-11-17T14:30:22",
    "completed_at": "2024-11-17T14:45:10",
    "total_requests": 150,
    "successful_downloads": 45,
    "failed_downloads": 2
  },
  "documents": [
    {
      "filename": "organized_crime/gambino_family.pdf",
      "url": "https://vault.fbi.gov/...",
      "downloaded_at": "2024-11-17T14:32:15",
      "size_bytes": 1250000,
      "source": "fbi_vault",
      "case": "organized_crime",
      "title": "Gambino Crime Family Investigation"
    }
  ]
}
```

## ⚙️ Configuration

Edit `config.py` to customize:

```python
# Rate limiting (be respectful!)
RATE_LIMIT_DELAY = 2  # seconds between requests

# Search keywords (add more as needed)
SEARCH_KEYWORDS = [
    "organized crime",
    "RICO",
    # ... add more
]

# Enable/disable sources
SOURCES = {
    "fbi_vault": {"enabled": True},
    "doj_news": {"enabled": True},
}
```

## 🔧 Advanced Usage

### Add a New Scraper

1. Create `scrapers/my_scraper.py`:

```python
from .base_scraper import BaseScraper

class MyScraper(BaseScraper):
    def __init__(self, output_dir):
        super().__init__("my_source", "https://example.gov", output_dir)
    
    def run(self):
        # Your scraping logic
        pass
```

2. Register in `config.py`:

```python
SOURCES = {
    "my_source": {
        "base_url": "https://example.gov",
        "enabled": True,
        "output_dir": REPORTS_DIR / "my_source",
    },
}
```

3. Add to `main.py`

## ⚖️ Legal & Ethical Guidelines

✅ **This scraper only accesses publicly available government data**

- All sources are official .gov websites
- Documents are public domain
- Rate limiting is built-in (2 seconds between requests)
- Respects robots.txt
- Uses proper User-Agent identification

🚨 **Please use responsibly:**

- Don't overwhelm servers (use `--limit`)
- Run during off-peak hours for large scrapes
- Data is for research/educational purposes
- Properly cite sources in any publications

## 🐛 Troubleshooting

### "Failed to download"
- Check internet connection
- Some documents may be temporarily unavailable
- Check logs in `logs/` directory

### "Rate limit exceeded"
- Increase `RATE_LIMIT_DELAY` in `config.py`
- Reduce `--limit` parameter

### Missing dependencies
```bash
pip install -r requirements.txt --upgrade
```

## 📈 Next Steps

After scraping, you can:

1. **Extract relationships** using NLP
2. **Build graph data** for visualization
3. **Import to Neo4j** or other graph database
4. **Analyze with your Crime Graph app**

Example: Convert PDFs to text for NLP processing:
```bash
pip install pdfplumber
python scripts/extract_text.py
```

## 🤝 Contributing

To add support for new sources:
1. Extend `BaseScraper` class
2. Implement source-specific parsing
3. Add configuration to `config.py`
4. Update documentation

## 📝 License

This scraper tool is MIT licensed. Downloaded government documents are public domain.



