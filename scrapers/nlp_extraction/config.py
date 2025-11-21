"""
Configuration for NLP entity/relationship extraction
"""
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).parent.parent
INPUT_DIR = BASE_DIR / "data" / "reports" / "doj"
OUTPUT_DIR = BASE_DIR / "data" / "extracted"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Output files (Crime Graph app format)
NODES_OUTPUT = OUTPUT_DIR / "nodes.json"
EDGES_OUTPUT = OUTPUT_DIR / "edges.json"
GRAPH_DATA_OUTPUT = OUTPUT_DIR / "graph_data.json"

# Node types (matching your app's NodeType enum)
NODE_TYPES = {
    'PERSON': 'PERSON',
    'ORGANIZATION': 'ORGANIZATION',
    'LOCATION': 'LOCATION',
    'EVENT': 'EVENT',
    'CRIME': 'CRIME',
}

# Relationship types (matching your app's RelationshipType enum)
RELATIONSHIP_TYPES = {
    'ASSOCIATED_WITH': 'ASSOCIATED_WITH',
    'MEMBER_OF': 'MEMBER_OF',
    'WORKS_FOR': 'WORKS_FOR',
    'LOCATED_IN': 'LOCATED_IN',
    'PARTICIPATED_IN': 'PARTICIPATED_IN',
    'CHARGED_WITH': 'CHARGED_WITH',
    'CONSPIRED_WITH': 'CONSPIRED_WITH',
    'EMPLOYED_BY': 'EMPLOYED_BY',
}

# Change status
CHANGE_STATUS = {
    'NEW': 'NEW',
    'MODIFIED': 'MODIFIED',
    'EXISTING': 'EXISTING',
}

# Relationship extraction patterns
RELATIONSHIP_PATTERNS = [
    # Direct conspiracies
    (r'(\w+(?:\s+\w+)*?)\s+(?:and|,)\s+(\w+(?:\s+\w+)*?)\s+conspired', 'CONSPIRED_WITH'),
    (r'(\w+(?:\s+\w+)*?)\s+(?:and|,)\s+(\w+(?:\s+\w+)*?)\s+(?:were|was)\s+charged', 'ASSOCIATED_WITH'),
    
    # Member relationships
    (r'(\w+(?:\s+\w+)*?),?\s+(?:a|an)\s+member\s+of\s+(?:the\s+)?(\w+(?:\s+\w+)*)', 'MEMBER_OF'),
    (r'(\w+(?:\s+\w+)*?),?\s+(?:a|an)\s+associate\s+of\s+(?:the\s+)?(\w+(?:\s+\w+)*)', 'ASSOCIATED_WITH'),
    
    # Employment
    (r'(\w+(?:\s+\w+)*?),?\s+(?:employed by|works for|worked for)\s+(\w+(?:\s+\w+)*)', 'MEMBER_OF'),
    
    # Criminal charges
    (r'(\w+(?:\s+\w+)*?)\s+(?:was|were)\s+charged\s+with\s+(\w+(?:\s+\w+)*)', 'CHARGED_WITH'),
    (r'(\w+(?:\s+\w+)*?)\s+(?:pleaded|pled)\s+guilty\s+to\s+(\w+(?:\s+\w+)*)', 'CHARGED_WITH'),
    
    # Arrest relationships
    (r'(\w+(?:\s+\w+)*?)\s+(?:was|were)\s+arrested\s+by\s+(?:the\s+)?(\w+(?:\s+\w+)*)', 'ARRESTED_BY'),
    
    # Investigation relationships
    (r'(?:investigated by|investigation by)\s+(?:the\s+)?(\w+(?:\s+\w+)*)', 'INVESTIGATED_BY'),
    
    # Prosecution relationships
    (r'prosecuted by\s+(\w+(?:\s+\w+)*)', 'PROSECUTED_BY'),
    
    # Sentencing relationships
    (r'(\w+(?:\s+\w+)*?)\s+(?:was|were)\s+sentenced\s+by\s+(?:the\s+)?(\w+(?:\s+\w+)*)', 'SENTENCED_BY'),
    
    # Location relationships
    (r'(\w+(?:\s+\w+)*?)\s+(?:in|at|of)\s+(\w+,\s+\w+)', 'LOCATED_AT'),
]

# Common entity normalizations (for disambiguation)
ENTITY_NORMALIZATIONS = {
    # United States variations
    'united states': 'United States',
    'u.s.': 'United States',
    'us': 'United States',
    'usa': 'United States',
    'u.s.a.': 'United States',
    'the united states': 'United States',
    
    # Federal agencies
    'fbi': 'FBI',
    'federal bureau of investigation': 'FBI',
    'dea': 'DEA',
    'drug enforcement administration': 'DEA',
    'atf': 'ATF',
    'irs': 'IRS',
    'dhs': 'DHS',
    'department of homeland security': 'DHS',
    'doj': 'Department of Justice',
    'department of justice': 'Department of Justice',
    'justice department': 'Department of Justice',
    
    # Common locations
    'new york': 'New York',
    'ny': 'New York',
    'n.y.': 'New York',
    'nyc': 'New York City',
    'new york city': 'New York City',
    'los angeles': 'Los Angeles',
    'la': 'Los Angeles',
    'l.a.': 'Los Angeles',
}

# Crime-related keywords for identifying CRIME entities
CRIME_KEYWORDS = [
    'murder', 'homicide', 'fraud', 'conspiracy', 'trafficking', 'laundering',
    'racketeering', 'extortion', 'bribery', 'robbery', 'assault', 'kidnapping',
    'embezzlement', 'forgery', 'rico', 'drug distribution', 'sex trafficking',
    'money laundering', 'wire fraud', 'bank fraud', 'tax evasion', 'identity theft',
    'cybercrime', 'securities fraud', 'smuggling', 'corruption', 'obstruction',
]

# Weapon keywords
WEAPON_KEYWORDS = [
    'firearm', 'gun', 'pistol', 'rifle', 'weapon', 'ammunition', 'explosive',
    'handgun', 'shotgun', 'assault rifle', 'machine gun', 'ak-47', 'ar-15',
]

# Drug keywords
DRUG_KEYWORDS = [
    'cocaine', 'heroin', 'fentanyl', 'methamphetamine', 'marijuana', 'opioid',
    'narcotics', 'controlled substance', 'drugs', 'carfentanil', 'mdma',
]

# Vehicle keywords  
VEHICLE_KEYWORDS = [
    'vehicle', 'car', 'truck', 'van', 'suv', 'boat', 'aircraft', 'yacht',
    'mercedes', 'bmw', 'ferrari', 'lamborghini', 'jet',
]

# Organization indicators
ORGANIZATION_INDICATORS = [
    'family', 'gang', 'cartel', 'enterprise', 'organization', 'group',
    'crime family', 'syndicate', 'network', 'association', 'company',
    'corporation', 'llc', 'inc', 'ltd',
]

