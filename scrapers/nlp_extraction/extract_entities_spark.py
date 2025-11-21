"""
PySpark-based entity and relationship extraction from scraped DOJ documents
Outputs in Crime Graph app format
"""
import json
import re
from pathlib import Path
from typing import List, Dict, Tuple
from datetime import datetime
import uuid

from pyspark.sql import SparkSession
from pyspark.sql.functions import udf, col, explode, collect_list
from pyspark.sql.types import StringType, ArrayType, StructType, StructField
from bs4 import BeautifulSoup
import spacy

from config import (
    INPUT_DIR, OUTPUT_DIR, NODES_OUTPUT, EDGES_OUTPUT, GRAPH_DATA_OUTPUT,
    NODE_TYPES, RELATIONSHIP_TYPES, CHANGE_STATUS, RELATIONSHIP_PATTERNS,
    CRIME_KEYWORDS, ORGANIZATION_INDICATORS
)


class CrimeGraphNLPExtractor:
    """Extract entities and relationships from criminal investigation documents"""
    
    def __init__(self, spark_session=None):
        # Initialize Spark
        if spark_session:
            self.spark = spark_session
        else:
            self.spark = SparkSession.builder \
                .appName("CrimeGraphNLPExtraction") \
                .config("spark.driver.memory", "4g") \
                .config("spark.sql.shuffle.partitions", "8") \
                .getOrCreate()
        
        # Load spaCy model
        print("Loading spaCy model...")
        try:
            self.nlp = spacy.load("en_core_web_lg")
        except:
            print("Large model not found, trying medium...")
            try:
                self.nlp = spacy.load("en_core_web_md")
            except:
                print("⚠️  No spaCy model found. Install with:")
                print("   python -m spacy download en_core_web_lg")
                raise
        
        print("✓ SpaCy model loaded")
        
        # Entity and edge storage
        self.entities = {}  # entity_text -> entity_dict
        self.relationships = []
    
    def extract_text_from_html(self, html_content: str) -> str:
        """Extract clean text from HTML"""
        soup = BeautifulSoup(html_content, 'lxml')
        
        # Find main content
        main_content = (
            soup.find('main') or 
            soup.find('article') or 
            soup.find(id='main-content') or
            soup.find(class_='main-content')
        )
        
        if main_content:
            text = main_content.get_text(separator=' ', strip=True)
        else:
            text = soup.get_text(separator=' ', strip=True)
        
        # Clean text
        text = re.sub(r'\s+', ' ', text)
        return text
    
    def extract_entities_spacy(self, text: str, doc_id: str) -> List[Dict]:
        """Extract entities using spaCy NER"""
        doc = self.nlp(text[:1000000])  # Limit text size
        entities = []
        
        for ent in doc.ents:
            # Map spaCy entity types to Crime Graph types
            entity_type = None
            if ent.label_ == 'PERSON':
                entity_type = NODE_TYPES['PERSON']
            elif ent.label_ in ['ORG', 'NORP']:
                entity_type = NODE_TYPES['ORGANIZATION']
            elif ent.label_ in ['GPE', 'LOC', 'FAC']:
                entity_type = NODE_TYPES['LOCATION']
            elif ent.label_ == 'EVENT':
                entity_type = NODE_TYPES['EVENT']
            
            if entity_type:
                entities.append({
                    'text': ent.text,
                    'type': entity_type,
                    'start': ent.start_char,
                    'end': ent.end_char,
                    'label': ent.label_,
                    'doc_id': doc_id,
                })
        
        return entities
    
    def extract_crime_entities(self, text: str, doc_id: str) -> List[Dict]:
        """Extract crime-specific entities"""
        crimes = []
        text_lower = text.lower()
        
        for crime_keyword in CRIME_KEYWORDS:
            # Find occurrences
            pattern = r'\b' + re.escape(crime_keyword) + r'\b'
            matches = re.finditer(pattern, text_lower, re.IGNORECASE)
            
            for match in matches:
                crimes.append({
                    'text': match.group(),
                    'type': NODE_TYPES['CRIME'],
                    'start': match.start(),
                    'end': match.end(),
                    'label': 'CRIME',
                    'doc_id': doc_id,
                })
        
        return crimes
    
    def identify_organizations(self, entities: List[Dict]) -> List[Dict]:
        """Enhance organization detection"""
        for entity in entities:
            if entity['type'] == NODE_TYPES['ORGANIZATION']:
                continue
            
            text_lower = entity['text'].lower()
            
            # Check if it's actually an organization
            if any(indicator in text_lower for indicator in ORGANIZATION_INDICATORS):
                entity['type'] = NODE_TYPES['ORGANIZATION']
        
        return entities
    
    def extract_relationships_pattern(self, text: str, entities: List[Dict]) -> List[Dict]:
        """Extract relationships using pattern matching"""
        relationships = []
        
        for pattern, rel_type in RELATIONSHIP_PATTERNS:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            
            for match in matches:
                if len(match.groups()) >= 2:
                    source = match.group(1).strip()
                    target = match.group(2).strip()
                    
                    relationships.append({
                        'source': source,
                        'target': target,
                        'type': rel_type,
                        'context': match.group(0),
                    })
        
        return relationships
    
    def create_graph_node(self, entity: Dict) -> Dict:
        """Create node in Crime Graph app format"""
        entity_id = f"{entity['type']}_{uuid.uuid4().hex[:8]}"
        
        return {
            'id': entity_id,
            'label': entity['text'],
            'type': entity['type'],
            'status': CHANGE_STATUS['NEW'],
            'properties': {
                'source_document': entity.get('doc_id', 'unknown'),
                'entity_label': entity.get('label', ''),
                'extraction_confidence': 0.8,
                'first_seen': datetime.now().isoformat(),
            }
        }
    
    def create_graph_edge(self, relationship: Dict, source_id: str, target_id: str) -> Dict:
        """Create edge in Crime Graph app format"""
        edge_id = f"edge_{uuid.uuid4().hex[:8]}"
        
        return {
            'id': edge_id,
            'source': source_id,
            'target': target_id,
            'relationshipType': relationship['type'],
            'status': CHANGE_STATUS['NEW'],
            'properties': {
                'context': relationship.get('context', ''),
                'extraction_confidence': 0.7,
                'first_seen': datetime.now().isoformat(),
            }
        }
    
    def process_documents_spark(self, limit: int = None):
        """Process documents using PySpark"""
        print("="*70)
        print("  ENTITY & RELATIONSHIP EXTRACTION")
        print("="*70)
        print()
        
        # Find all HTML files
        html_files = list(INPUT_DIR.rglob("*.html"))
        if limit:
            html_files = html_files[:limit]
        
        print(f"📄 Found {len(html_files)} documents")
        print()
        
        # Create DataFrame of file paths
        file_data = [(str(f), f.name) for f in html_files]
        df = self.spark.createDataFrame(file_data, ["path", "filename"])
        
        # UDF for text extraction
        extract_text_udf = udf(self.extract_text_from_html_udf, StringType())
        
        # Extract text
        print("📖 Extracting text from HTML...")
        df = df.withColumn("content", extract_text_udf(col("path")))
        
        # Collect to process with spaCy (spaCy doesn't parallelize well in Spark)
        documents = df.select("path", "filename", "content").collect()
        
        print(f"🔍 Processing {len(documents)} documents with NLP...")
        print()
        
        all_entities = []
        all_relationships = []
        
        for i, doc in enumerate(documents, 1):
            print(f"   [{i}/{len(documents)}] {doc.filename[:60]}...")
            
            doc_id = doc.filename
            text = doc.content
            
            if not text or len(text) < 100:
                continue
            
            # Extract entities
            entities = self.extract_entities_spacy(text, doc_id)
            crimes = self.extract_crime_entities(text, doc_id)
            entities.extend(crimes)
            entities = self.identify_organizations(entities)
            
            # Extract relationships
            relationships = self.extract_relationships_pattern(text, entities)
            
            all_entities.extend(entities)
            all_relationships.extend(relationships)
        
        print()
        print(f"✓ Extracted {len(all_entities)} entities")
        print(f"✓ Extracted {len(all_relationships)} relationships")
        print()
        
        return all_entities, all_relationships
    
    @staticmethod
    def extract_text_from_html_udf(file_path: str) -> str:
        """UDF-compatible version of text extraction"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                html_content = f.read()
            
            soup = BeautifulSoup(html_content, 'lxml')
            main_content = (
                soup.find('main') or 
                soup.find('article') or 
                soup.find(id='main-content')
            )
            
            if main_content:
                text = main_content.get_text(separator=' ', strip=True)
            else:
                text = soup.get_text(separator=' ', strip=True)
            
            text = re.sub(r'\s+', ' ', text)
            return text
        except Exception as e:
            return ""
    
    def build_graph_data(self, entities: List[Dict], relationships: List[Dict]) -> Dict:
        """Build final graph data structure for Crime Graph app"""
        print("🏗️  Building graph data structure...")
        
        # Deduplicate entities
        unique_entities = {}
        for entity in entities:
            key = (entity['text'].lower(), entity['type'])
            if key not in unique_entities:
                unique_entities[key] = entity
        
        # Create nodes
        entity_to_id = {}
        nodes = []
        
        for (text, type_), entity in unique_entities.items():
            node = self.create_graph_node(entity)
            nodes.append(node)
            entity_to_id[(text, type_)] = node['id']
        
        # Create edges
        edges = []
        for rel in relationships:
            source_key = (rel['source'].lower(), None)  # Type unknown from pattern
            target_key = (rel['target'].lower(), None)
            
            # Find matching entity IDs
            source_id = None
            target_id = None
            
            for (text, type_), eid in entity_to_id.items():
                if text == source_key[0]:
                    source_id = eid
                if text == target_key[0]:
                    target_id = eid
            
            if source_id and target_id:
                edge = self.create_graph_edge(rel, source_id, target_id)
                edges.append(edge)
        
        graph_data = {
            'nodes': nodes,
            'edges': edges,
            'metadata': {
                'extraction_date': datetime.now().isoformat(),
                'total_documents_processed': len(set(e['doc_id'] for e in entities)),
                'total_nodes': len(nodes),
                'total_edges': len(edges),
            }
        }
        
        print(f"✓ Created {len(nodes)} nodes")
        print(f"✓ Created {len(edges)} edges")
        print()
        
        return graph_data
    
    def save_output(self, graph_data: Dict):
        """Save output in Crime Graph app format"""
        print("💾 Saving graph data...")
        
        # Save nodes
        with open(NODES_OUTPUT, 'w') as f:
            json.dump(graph_data['nodes'], f, indent=2)
        print(f"   ✓ Nodes: {NODES_OUTPUT}")
        
        # Save edges
        with open(EDGES_OUTPUT, 'w') as f:
            json.dump(graph_data['edges'], f, indent=2)
        print(f"   ✓ Edges: {EDGES_OUTPUT}")
        
        # Save complete graph data
        with open(GRAPH_DATA_OUTPUT, 'w') as f:
            json.dump(graph_data, f, indent=2)
        print(f"   ✓ Complete graph: {GRAPH_DATA_OUTPUT}")
        print()


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Extract entities and relationships from scraped documents')
    parser.add_argument('--limit', type=int, help='Limit number of documents to process')
    parser.add_argument('--output-dir', type=str, help='Output directory')
    
    args = parser.parse_args()
    
    # Create extractor
    extractor = CrimeGraphNLPExtractor()
    
    try:
        # Process documents
        entities, relationships = extractor.process_documents_spark(limit=args.limit)
        
        # Build graph
        graph_data = extractor.build_graph_data(entities, relationships)
        
        # Save output
        extractor.save_output(graph_data)
        
        print("="*70)
        print("✅ EXTRACTION COMPLETE!")
        print("="*70)
        print()
        print("📊 Summary:")
        print(f"   Documents processed: {graph_data['metadata']['total_documents_processed']}")
        print(f"   Nodes extracted: {graph_data['metadata']['total_nodes']}")
        print(f"   Edges extracted: {graph_data['metadata']['total_edges']}")
        print()
        print("📂 Output files:")
        print(f"   {GRAPH_DATA_OUTPUT}")
        print()
        print("🔄 Next step: Import graph_data.json into your Crime Graph app!")
        
    finally:
        extractor.spark.stop()


if __name__ == '__main__':
    main()




