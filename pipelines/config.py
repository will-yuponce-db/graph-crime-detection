"""
Configuration constants for the Cross-Jurisdictional Investigative Analytics demo.
All demo-specific values are defined here for deterministic, reproducible results.
"""

# =============================================================================
# RANDOM SEED - Ensures deterministic data generation
# =============================================================================
RANDOM_SEED = 42

# =============================================================================
# TIME CONFIGURATION
# =============================================================================
TIME_BUCKET_MINUTES = 15

# Base timestamps for the demo scenario (Unix timestamps)
# DC Incident: January 15, 2025, 2:30 PM EST
DC_INCIDENT_TIMESTAMP = "2025-01-15T14:30:00"
DC_INCIDENT_BUCKET = "2025-01-15T14:30"

# Nashville Incident: January 8, 2025, 3:15 PM CST (one week before DC)
NASHVILLE_INCIDENT_TIMESTAMP = "2025-01-08T15:15:00"
NASHVILLE_INCIDENT_BUCKET = "2025-01-08T15:15"

# Burner switch happens in the bucket immediately after DC incident
BURNER_SWITCH_BUCKET = "2025-01-15T14:45"

# =============================================================================
# GEOGRAPHIC CONFIGURATION (H3 Resolution 9 cells)
# =============================================================================
# DC Incident Location: Georgetown area
DC_INCIDENT_H3_CELL = "892a1008003ffff"
DC_INCIDENT_LAT = 38.9076
DC_INCIDENT_LON = -77.0723
DC_CITY = "Washington, DC"
DC_STATE = "DC"

# Nashville Incident Location: Belle Meade area
NASHVILLE_INCIDENT_H3_CELL = "8844c0a305fffff"
NASHVILLE_INCIDENT_LAT = 36.1027
NASHVILLE_INCIDENT_LON = -86.8569
NASHVILLE_CITY = "Nashville"
NASHVILLE_STATE = "TN"

# Baltimore Fence Location (for potential future expansion)
BALTIMORE_FENCE_H3_CELL = "882a100861fffff"
BALTIMORE_FENCE_LAT = 39.2904
BALTIMORE_FENCE_LON = -76.6122
BALTIMORE_CITY = "Baltimore"
BALTIMORE_STATE = "MD"

# =============================================================================
# ENTITY CONFIGURATION
# =============================================================================
# Primary suspects (the traveling burglary crew)
SUSPECT_1_ID = "E_0412"  # "Alpha" - Primary suspect
SUSPECT_2_ID = "E_1098"  # "Bravo" - Partner suspect

# Burner phone entity (replaces SUSPECT_1 after DC incident)
BURNER_ENTITY_ID = "E_7734"  # New device that appears after switch

# Known fence connection
FENCE_ENTITY_ID = "E_9901"  # Connected to the fencing operation

# Total entities to generate in DC incident cell (the "50 devices")
DC_INCIDENT_ENTITY_COUNT = 50

# Decoy entity for burner switch (fails one criterion)
DECOY_ENTITY_ID = "E_5555"

# =============================================================================
# CASE CONFIGURATION
# =============================================================================
DC_CASE_ID = "CASE_DC_001"
NASHVILLE_CASE_ID = "CASE_TN_007"

# Additional burglary cases where suspects appear (for pattern strength)
ADDITIONAL_CASES = [
    {"case_id": "CASE_DC_002", "city": "Washington, DC", "state": "DC", 
     "time_bucket": "2025-01-10T22:00", "h3_cell": "892a1008017ffff"},
    {"case_id": "CASE_VA_003", "city": "Arlington", "state": "VA",
     "time_bucket": "2025-01-12T03:30", "h3_cell": "892a1072a93ffff"},
]

# =============================================================================
# CASE NARRATIVES
# =============================================================================
DC_CASE_NARRATIVE = """
Residential burglary reported at 1423 Wisconsin Ave NW, Georgetown.
Method of Entry: Rear window smash using unknown tool, glass fragments 
indicate single impact point. Interior ransacked, primary target appears 
to be jewelry and small electronics. Homeowner reports missing: diamond 
engagement ring ($15,000 est.), gold watch collection (3 items, $8,000 est.), 
laptop computer, and approximately $500 cash. No fingerprints recovered. 
Neighbor reports seeing two male subjects fleeing eastbound on foot 
approximately 14:35. Security camera from adjacent property captured 
partial vehicle description: dark-colored sedan, possibly Honda or Toyota.
Time of incident estimated: 14:25-14:40.
"""

NASHVILLE_CASE_NARRATIVE = """
Residential burglary at 4501 Harding Pike, Belle Meade area.
Method of Entry: Rear window smash, single impact, clean break pattern 
consistent with professional tool. Property losses include: antique 
jewelry collection ($22,000 est.), two Rolex watches, MacBook Pro, 
and cash ($800). Interior showed organized search pattern - drawers 
opened but not dumped, suggesting experienced perpetrators. Partial 
boot print recovered near entry point. Witness observed two individuals 
in dark clothing departing in dark sedan approximately 15:20.
Similar M.O. flagged - cross-reference with regional burglary series.
Time of incident estimated: 15:10-15:25.
"""

ADDITIONAL_CASE_NARRATIVES = {
    "CASE_DC_002": """
    Commercial after-hours burglary at jewelry store, Connecticut Ave.
    Rear window entry, targeted display cases only. Loss: $45,000 in 
    merchandise. Two suspects on camera, faces obscured. Dark sedan 
    observed departing. Professional operation.
    """,
    "CASE_VA_003": """
    Residential burglary in Clarendon. Rear sliding door forced. 
    Jewelry and electronics taken. Two-person crew suspected based 
    on entry/exit timing. Vehicle: dark sedan. Method consistent 
    with regional series.
    """
}

# =============================================================================
# SOCIAL NETWORK CONFIGURATION
# =============================================================================
SOCIAL_EDGE_TYPES = ["known_associate", "co_arrested", "family", "fence_connection"]

# Pre-defined social connections for the demo
SOCIAL_EDGES = [
    {"entity_1": SUSPECT_1_ID, "entity_2": SUSPECT_2_ID, "type": "known_associate", "weight": 0.9},
    {"entity_1": SUSPECT_1_ID, "entity_2": FENCE_ENTITY_ID, "type": "fence_connection", "weight": 0.7},
    {"entity_1": SUSPECT_2_ID, "entity_2": FENCE_ENTITY_ID, "type": "fence_connection", "weight": 0.5},
    {"entity_1": BURNER_ENTITY_ID, "entity_2": SUSPECT_2_ID, "type": "known_associate", "weight": 0.85},
]

# =============================================================================
# SCORING WEIGHTS
# =============================================================================
COPRESENCE_WEIGHT = 0.4
CROSS_CASE_WEIGHT = 0.35
NETWORK_WEIGHT = 0.25

HANDOFF_SPATIAL_WEIGHT = 0.5
HANDOFF_TEMPORAL_WEIGHT = 0.3
HANDOFF_NEIGHBOR_WEIGHT = 0.2

# =============================================================================
# DATABASE CONFIGURATION
# =============================================================================
CATALOG = "investigative_analytics"
SCHEMA = "demo"

