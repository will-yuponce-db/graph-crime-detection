# Entity & Relationship Extraction for Crime Graph

Extracts entities and relationships from scraped DOJ documents using PySpark and NLP, outputting in your Crime Graph app format.

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd /Users/will.yuponce/Documents/Projects/crime-graph/scrapers/nlp_extraction

# Install Python packages
pip install -r requirements.txt

# Download spaCy model (choose one)
python -m spacy download en_core_web_lg  # Large (best quality, ~800MB)
# OR
python -m spacy download en_core_web_md  # Medium (good quality, ~40MB)
```

### 2. Run Extraction

```bash
# Process all scraped documents
python extract_entities_spark.py

# Or limit to first N documents (for testing)
python extract_entities_spark.py --limit 10
```

### 3. Output

Files will be created in `../data/extracted/`:
- `nodes.json` - All extracted entities
- `edges.json` - All extracted relationships
- `graph_data.json` - Complete graph (nodes + edges + metadata)

## 📊 What Gets Extracted

### Entities (Nodes)

| Type | Examples | Source |
|------|----------|--------|
| **PERSON** | "John Smith", "Maria Garcia" | spaCy NER |
| **ORGANIZATION** | "Gambino Crime Family", "FBI" | spaCy NER + patterns |
| **LOCATION** | "Brooklyn", "Manhattan", "New York" | spaCy NER |
| **EVENT** | Court hearings, arrests | spaCy NER |
| **CRIME** | "murder", "fraud", "trafficking" | Keyword matching |

### Relationships (Edges)

| Type | Pattern Example |
|------|-----------------|
| **CONSPIRED_WITH** | "Smith and Garcia conspired to..." |
| **MEMBER_OF** | "Smith, a member of the Gambino family..." |
| **ASSOCIATED_WITH** | "Smith, an associate of Garcia..." |
| **CHARGED_WITH** | "Smith was charged with fraud..." |
| **EMPLOYED_BY** | "Smith, employed by Acme Corp..." |
| **LOCATED_IN** | "Smith in Brooklyn, New York" |

## 📋 Output Format

### Nodes Example
```json
{
  "id": "PERSON_a3f2b1c4",
  "label": "John Smith",
  "type": "PERSON",
  "status": "NEW",
  "properties": {
    "source_document": "organized_crime_case.html",
    "entity_label": "PERSON",
    "extraction_confidence": 0.8,
    "first_seen": "2025-11-17T18:00:00"
  }
}
```

### Edges Example
```json
{
  "id": "edge_x7y8z9w0",
  "source": "PERSON_a3f2b1c4",
  "target": "ORGANIZATION_b4c5d6e7",
  "relationshipType": "MEMBER_OF",
  "status": "NEW",
  "properties": {
    "context": "John Smith, a member of the Gambino family",
    "extraction_confidence": 0.7,
    "first_seen": "2025-11-17T18:00:00"
  }
}
```

This matches your Crime Graph app's `GraphData`, `GraphNode`, and `GraphEdge` types exactly!

## ⚙️ Configuration

Edit `config.py` to customize:

```python
# Add more relationship patterns
RELATIONSHIP_PATTERNS = [
    (r'pattern_here', 'RELATIONSHIP_TYPE'),
]

# Add more crime keywords
CRIME_KEYWORDS = [
    'your', 'crime', 'types',
]

# Change node/edge types (must match your app)
NODE_TYPES = {...}
RELATIONSHIP_TYPES = {...}
```

## 🔧 Advanced Usage

### Run on Databricks

```python
# In Databricks notebook
from nlp_extraction.extract_entities_spark import CrimeGraphNLPExtractor

# Use existing Spark session
extractor = CrimeGraphNLPExtractor(spark_session=spark)

# Process documents
entities, relationships = extractor.process_documents_spark()

# Build and save graph
graph_data = extractor.build_graph_data(entities, relationships)
extractor.save_output(graph_data)
```

### Parallel Processing

PySpark automatically parallelizes:
- HTML reading
- Text extraction
- Pattern matching

spaCy NER is run sequentially (spaCy doesn't parallelize well in Spark).

### Custom Entity Types

Add your own entity extractors:

```python
def extract_custom_entities(self, text, doc_id):
    # Your custom logic here
    return entities

# In process_documents_spark():
custom_entities = self.extract_custom_entities(text, doc_id)
entities.extend(custom_entities)
```

## 📈 Performance

| Documents | Time | Memory |
|-----------|------|--------|
| 10 | ~30 sec | 2 GB |
| 50 | ~2 min | 3 GB |
| 100 | ~5 min | 4 GB |
| 500 | ~20 min | 6 GB |

## 🔍 Quality Tips

1. **Review first 10-20 documents** to tune patterns
2. **Check `extraction_confidence` scores** in output
3. **Add domain-specific patterns** for better recall
4. **Use larger spaCy model** for better accuracy

## 🐛 Troubleshooting

### "No spaCy model found"
```bash
python -m spacy download en_core_web_lg
```

### "Out of memory"
```bash
# Process fewer documents at a time
python extract_entities_spark.py --limit 50
```

### "No entities extracted"
- Check if HTML files exist in `../data/reports/doj/`
- Verify text extraction is working
- Try running on a single file first

## 🔄 Import to Crime Graph App

1. Copy `graph_data.json` to your app's data directory:
```bash
cp ../data/extracted/graph_data.json ../../src/data/extracted_crime_data.json
```

2. Import in your app:
```typescript
import extractedData from './data/extracted_crime_data.json';

// Use directly or merge with existing data
const graphData: GraphData = {
  nodes: extractedData.nodes,
  edges: extractedData.edges,
};
```

3. Or load via API:
```typescript
const response = await fetch('/api/extracted-data');
const graphData = await response.json();
```

## 📊 Next Steps

After extraction, you can:
1. **Visualize** in your Crime Graph app
2. **Run community detection** to find criminal networks
3. **Filter by entity type** or relationship type
4. **Export to Neo4j** or other graph databases
5. **Enhance with additional data sources**

Happy extracting! 🎯



