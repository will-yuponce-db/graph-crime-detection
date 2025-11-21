#!/usr/bin/env python3
"""
Local entity and relationship extraction (no PySpark/Java required)
Outputs in Crime Graph app format
"""
import json
import re
from pathlib import Path
from typing import List, Dict
from datetime import datetime
import uuid
from bs4 import BeautifulSoup
import spacy
from tqdm import tqdm

from config import (
    INPUT_DIR, OUTPUT_DIR, NODES_OUTPUT, EDGES_OUTPUT, GRAPH_DATA_OUTPUT,
    NODE_TYPES, RELATIONSHIP_TYPES, CHANGE_STATUS, RELATIONSHIP_PATTERNS,
    CRIME_KEYWORDS, ORGANIZATION_INDICATORS, ENTITY_NORMALIZATIONS,
    WEAPON_KEYWORDS, DRUG_KEYWORDS, VEHICLE_KEYWORDS
)


class CrimeGraphNLPExtractor:
    """Extract entities and relationships from criminal investigation documents"""
    
    def __init__(self):
        # Load spaCy model
        print("Loading spaCy model...")
        try:
            self.nlp = spacy.load("en_core_web_md")
            print("✓ SpaCy model loaded (medium)")
        except:
            try:
                self.nlp = spacy.load("en_core_web_sm")
                print("✓ SpaCy model loaded (small)")
            except:
                print("⚠️  No spaCy model found. Install with:")
                print("   python -m spacy download en_core_web_md")
                raise
    
    def extract_text_from_html(self, html_path: Path) -> str:
        """Extract ONLY actual article content, skip all navigation/boilerplate"""
        try:
            with open(html_path, 'r', encoding='utf-8') as f:
                html_content = f.read()
            
            soup = BeautifulSoup(html_content, 'lxml')
            
            # FIRST: Remove all garbage elements
            for tag in soup.find_all(['script', 'style', 'nav', 'header', 'footer', 'aside', 'iframe']):
                tag.decompose()
            
            # Remove navigation/boilerplate by class
            for elem in soup.find_all(class_=lambda x: x and any(
                term in str(x).lower() for term in ['breadcrumb', 'nav', 'menu', 'sidebar', 'footer', 'header', 'social']
            )):
                elem.decompose()
            
            # Find main content
            main_content = (
                soup.find('main') or 
                soup.find('article') or 
                soup.find(id='main-content') or
                soup.find(class_='main-content') or
                soup.find(class_='article-content') or
                soup.find(class_='press-release')
            )
            
            if main_content:
                # Get paragraphs only
                paragraphs = main_content.find_all('p')
                if paragraphs:
                    text = '\n'.join(p.get_text(strip=True) for p in paragraphs if len(p.get_text(strip=True)) > 50)
                else:
                    text = main_content.get_text(separator='\n', strip=True)
            else:
                return ""
            
            # Filter out boilerplate sentences
            sentences = []
            skip_terms = ['justice.gov', 'breadcrumb', 'contact', 'subscribe', 'facebook', 'twitter', 'share']
            for line in text.split('\n'):
                line = line.strip()
                if len(line) < 30:  # Skip short lines
                    continue
                if any(term in line.lower() for term in skip_terms):
                    continue
                sentences.append(line)
            
            return '\n'.join(sentences)
        except Exception as e:
            print(f"   ⚠️  Error extracting text: {e}")
            return ""
    
    def extract_entities_spacy(self, text: str, doc_id: str) -> List[Dict]:
        """Extract entities using spaCy NER"""
        # Limit text size for processing
        text = text[:100000]
        doc = self.nlp(text)
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
                break  # Only add each crime type once per document
        
        return crimes
    
    def extract_additional_entities(self, text: str, doc_id: str) -> List[Dict]:
        """Extract weapons, drugs, vehicles, and other entities"""
        entities = []
        text_lower = text.lower()
        
        # Extract weapons
        for weapon in WEAPON_KEYWORDS:
            pattern = r'\b' + re.escape(weapon) + r'\b'
            if re.search(pattern, text_lower):
                entities.append({
                    'text': weapon.title(),
                    'type': 'WEAPON',
                    'label': 'WEAPON',
                    'doc_id': doc_id
                })
                break  # Only add once per document
        
        # Extract drugs
        for drug in DRUG_KEYWORDS:
            pattern = r'\b' + re.escape(drug) + r'\b'
            if re.search(pattern, text_lower):
                entities.append({
                    'text': drug.title(),
                    'type': 'DRUG',
                    'label': 'DRUG',
                    'doc_id': doc_id
                })
                break  # Only add once per document
        
        # Extract vehicles
        for vehicle in VEHICLE_KEYWORDS:
            pattern = r'\b' + re.escape(vehicle) + r'\b'
            if re.search(pattern, text_lower):
                entities.append({
                    'text': vehicle.title(),
                    'type': 'VEHICLE',
                    'label': 'VEHICLE',
                    'doc_id': doc_id
                })
                break  # Only add once per document
        
        return entities
    
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
        text = text[:50000]  # Limit for pattern matching
        
        for pattern, rel_type in RELATIONSHIP_PATTERNS:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            
            for match in matches:
                if len(match.groups()) >= 2:
                    source = match.group(1).strip()
                    target = match.group(2).strip()
                    
                    # Clean up entity names
                    source = re.sub(r'\s+', ' ', source)
                    target = re.sub(r'\s+', ' ', target)
                    
                    if len(source) > 3 and len(target) > 3:  # Filter out very short matches
                        relationships.append({
                            'source': source,
                            'target': target,
                            'type': rel_type,
                            'context': match.group(0)[:200],  # Limit context length
                        })
        
        return relationships
    
    def extract_relationships_proximity(self, text: str, entities: List[Dict]) -> List[Dict]:
        """Extract relationships using dependency parsing and strict rules"""
        relationships = []
        
        # Build entity lookup by text (case-insensitive)
        entity_by_text = {}
        for ent in entities:
            key = ent['text'].lower().strip()
            entity_by_text[key] = ent
        
        # Process text with spaCy
        doc = self.nlp(text[:100000])  # Limit for performance
        
        # Go through each sentence
        for sent in doc.sents:
            sent_text = sent.text
            sent_lower = sent_text.lower()
            
            # Skip sentences that are too short or look like boilerplate
            if len(sent_text) < 30:
                continue
            if any(word in sent_lower for word in ['breadcrumb', 'justice.gov', 'contact', 'subscribe']):
                continue
            
            # Find all entities mentioned in this sentence
            entities_in_sent = []
            for ent_key, ent_data in entity_by_text.items():
                if ent_key in sent_lower and len(ent_key) > 3:  # Avoid short spurious matches
                    entities_in_sent.append(ent_data)
            
            # Only create relationships if there's a connecting verb/preposition
            if len(entities_in_sent) >= 2:
                # Check for relationship indicators
                has_relationship_verb = any(token.pos_ in ['VERB', 'AUX'] for token in sent)
                
                if not has_relationship_verb:
                    continue  # Skip if no verb to connect entities
                
                # Limit pairs to avoid combinatorial explosion
                if len(entities_in_sent) > 5:
                    continue
                
                for i in range(len(entities_in_sent)):
                    for j in range(i + 1, len(entities_in_sent)):
                        source = entities_in_sent[i]
                        target = entities_in_sent[j]
                        
                        # Infer relationship type (stricter rules)
                        rel_type = self._infer_relationship_type(
                            sent_text, source, target
                        )
                        
                        # Only add if we have a specific relationship type (not generic association)
                        if rel_type and rel_type != 'ASSOCIATED_WITH':
                            relationships.append({
                                'source': source['text'],
                                'target': target['text'],
                                'type': rel_type,
                                'context': sent_text[:200]
                            })
        
        return relationships
    
    def _infer_relationship_type(self, sentence: str, source: Dict, target: Dict) -> str:
        """Infer relationship type based on entity types and sentence context - STRICT"""
        sent_lower = sentence.lower()
        source_type = source['type']
        target_type = target['type']
        
        # Charge/conviction relationships (STRONGEST SIGNAL)
        charge_words = ['charged', 'indicted', 'convicted', 'pleaded guilty', 'pled guilty', 'sentenced', 'prosecution']
        if any(word in sent_lower for word in charge_words):
            if (source_type == 'PERSON' and target_type == 'CRIME'):
                return 'CHARGED_WITH'
            if (source_type == 'CRIME' and target_type == 'PERSON'):
                return 'CHARGED_WITH'
        
        # Conspiracy relationships (REQUIRES EXPLICIT CONSPIRACY LANGUAGE)
        conspiracy_words = ['conspired with', 'conspiracy', 'conspiring', 'plotted with', 'scheme with']
        if any(word in sent_lower for word in conspiracy_words):
            if source_type == 'PERSON' and target_type == 'PERSON':
                return 'CONSPIRED_WITH'
            if (source_type == 'PERSON' and target_type == 'ORGANIZATION') or (source_type == 'ORGANIZATION' and target_type == 'PERSON'):
                return 'CONSPIRED_WITH'
        
        # Membership relationships (REQUIRES EXPLICIT MEMBERSHIP LANGUAGE)
        member_words = ['member of', 'associate of', 'affiliated with', 'works for', 'employed by', 'leader of', 'part of the']
        if any(word in sent_lower for word in member_words):
            if (source_type == 'PERSON' and target_type == 'ORGANIZATION'):
                return 'MEMBER_OF'
            if (source_type == 'ORGANIZATION' and target_type == 'PERSON'):
                return 'MEMBER_OF'
        
        # Arrest relationships
        arrest_words = ['arrested by', 'arrest by', 'detained by', 'apprehended by']
        if any(word in sent_lower for word in arrest_words):
            if (source_type == 'PERSON' and target_type == 'ORGANIZATION'):
                return 'ARRESTED_BY'
        
        # Investigation relationships
        investigation_words = ['investigated by', 'investigation by', 'led by']
        if any(word in sent_lower for word in investigation_words):
            if target_type == 'ORGANIZATION':
                return 'INVESTIGATED_BY'
        
        # Prosecution relationships
        prosecution_words = ['prosecuted by', 'prosecution by']
        if any(word in sent_lower for word in prosecution_words):
            if (source_type == 'PERSON' and target_type == 'ORGANIZATION'):
                return 'PROSECUTED_BY'
        
        # Location relationships (VERY STRICT - pattern must be between entities)
        source_pos = sent_lower.find(source['text'].lower())
        target_pos = sent_lower.find(target['text'].lower())
        
        if source_pos != -1 and target_pos != -1:
            # One must be a location
            if not (target_type == 'LOCATION' or source_type == 'LOCATION'):
                return None
            
            # Get the text between the two entities
            min_pos = min(source_pos, target_pos)
            max_pos = max(source_pos, target_pos)
            between_text = sent_lower[min_pos:max_pos]
            
            # Pattern must be IN the text between entities (not just anywhere in sentence)
            location_patterns = [' in ', ' at ', ' from ', 'located in', 'operated in', 'based in', 'resides in', 'arrested in', 'sentenced in']
            
            # Distance must be short (< 50 chars) AND pattern must be between entities
            distance = abs(source_pos - target_pos)
            if distance < 50 and any(pattern in between_text for pattern in location_patterns):
                return 'LOCATED_AT'
        
        # DON'T return generic associations - only return specific relationships
        return None
    
    def create_graph_node(self, entity: Dict) -> Dict:
        """Create node in Crime Graph app format"""
        entity_id = f"{entity['type']}_{uuid.uuid4().hex[:8]}"
        
        return {
            'id': entity_id,
            'label': entity['text'][:100],  # Limit label length
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
                'context': relationship.get('context', '')[:200],
                'extraction_confidence': 0.7,
                'first_seen': datetime.now().isoformat(),
            }
        }
    
    def process_documents(self, limit: int = None):
        """Process all documents"""
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
        
        all_entities = []
        all_relationships = []
        
        print("🔍 Processing documents with NLP...")
        
        for html_file in tqdm(html_files, desc="Processing"):
            doc_id = html_file.name
            text = self.extract_text_from_html(html_file)
            
            if not text or len(text) < 100:
                continue
            
            # Extract entities
            entities = self.extract_entities_spacy(text, doc_id)
            crimes = self.extract_crime_entities(text, doc_id)
            additional = self.extract_additional_entities(text, doc_id)
            entities.extend(crimes)
            entities.extend(additional)
            entities = self.identify_organizations(entities)
            
            # Extract relationships using BOTH methods
            relationships_pattern = self.extract_relationships_pattern(text, entities)
            relationships_proximity = self.extract_relationships_proximity(text, entities)
            
            # Combine and deduplicate relationships
            relationships = relationships_pattern + relationships_proximity
            
            all_entities.extend(entities)
            all_relationships.extend(relationships)
        
        print()
        print(f"✓ Extracted {len(all_entities)} entities")
        print(f"✓ Extracted {len(all_relationships)} relationships")
        print()
        
        return all_entities, all_relationships
    
    def build_graph_data(self, entities: List[Dict], relationships: List[Dict]) -> Dict:
        """Build final graph data structure for Crime Graph app"""
        print("🏗️  Building graph data structure...")
        
        # Deduplicate entities
        unique_entities = {}
        for entity in entities:
            # Use lowercase for deduplication
            key = (entity['text'].lower().strip(), entity['type'])
            if key not in unique_entities:
                unique_entities[key] = entity
            else:
                # Keep the one from the most recent document
                existing = unique_entities[key]
                if entity.get('doc_id', '') > existing.get('doc_id', ''):
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
        edge_set = set()  # Prevent duplicate edges
        
        for rel in relationships:
            source_key = rel['source'].lower().strip()
            target_key = rel['target'].lower().strip()
            
            # Find matching entity IDs
            source_id = None
            target_id = None
            
            for (text, type_), eid in entity_to_id.items():
                if text == source_key:
                    source_id = eid
                if text == target_key:
                    target_id = eid
            
            if source_id and target_id:
                # Prevent duplicate edges
                edge_key = (source_id, target_id, rel['type'])
                if edge_key not in edge_set:
                    edge_set.add(edge_key)
                    edge = self.create_graph_edge(rel, source_id, target_id)
                    edges.append(edge)
        
        # Count unique source documents
        unique_docs = set(e['doc_id'] for e in entities)
        
        graph_data = {
            'nodes': nodes,
            'edges': edges,
            'metadata': {
                'extraction_date': datetime.now().isoformat(),
                'total_documents_processed': len(unique_docs),
                'total_nodes': len(nodes),
                'total_edges': len(edges),
                'node_types': {},
                'edge_types': {},
            }
        }
        
        # Calculate type statistics
        for node in nodes:
            node_type = node['type']
            graph_data['metadata']['node_types'][node_type] = graph_data['metadata']['node_types'].get(node_type, 0) + 1
        
        for edge in edges:
            edge_type = edge['relationshipType']
            graph_data['metadata']['edge_types'][edge_type] = graph_data['metadata']['edge_types'].get(edge_type, 0) + 1
        
        print(f"✓ Created {len(nodes)} unique nodes")
        print(f"✓ Created {len(edges)} unique edges")
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
    
    args = parser.parse_args()
    
    # Create extractor
    extractor = CrimeGraphNLPExtractor()
    
    # Process documents
    entities, relationships = extractor.process_documents(limit=args.limit)
    
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
    print("📋 Node Types:")
    for node_type, count in sorted(graph_data['metadata']['node_types'].items(), key=lambda x: -x[1]):
        print(f"   {node_type:20s}: {count:4d}")
    print()
    print("📋 Edge Types:")
    for edge_type, count in sorted(graph_data['metadata']['edge_types'].items(), key=lambda x: -x[1]):
        print(f"   {edge_type:20s}: {count:4d}")
    print()
    print("📂 Output files:")
    print(f"   {GRAPH_DATA_OUTPUT}")
    print()
    print("🔄 Next: Import graph_data.json into your Crime Graph app!")


if __name__ == '__main__':
    main()

