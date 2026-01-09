"""
Lakeflow Spark Declarative Pipeline: Cross-Jurisdictional Investigative Analytics Demo Data

This pipeline generates synthetic data for the burglary crew story spanning
Washington D.C. and Nashville, including the "burner phone switch" plot twist.

OPTION D: Population Simulation
- 10,000 devices with home/work cells and daily routines
- 14 days of simulated data
- ~1M+ location events
- Suspects blend into realistic population patterns

Data Layers:
- Bronze: Raw synthetic location events, cases, social edges
- Silver: Cleaned and enriched data with time buckets and H3 cells
- Gold: Computed analytics tables (co-presence edges, handoff candidates)

Run with: Databricks Lakeflow Pipeline targeting this notebook
Reference: https://docs.databricks.com/aws/en/ldp/developer/python-ref
"""

from pyspark import pipelines as dp
from pyspark.sql import functions as F
from pyspark.sql.window import Window
from pyspark.sql.types import (
    StructType, StructField, StringType, DoubleType, 
    TimestampType, IntegerType, ArrayType, LongType, BooleanType
)
from datetime import datetime, timedelta
import random
import math

# =============================================================================
# CONFIGURATION
# =============================================================================

RANDOM_SEED = 42

# Population Simulation Parameters
POPULATION_SIZE = 10_000          # Number of devices to simulate
SIMULATION_DAYS = 14              # Days of data to generate
PINGS_PER_DEVICE_PER_DAY = 8      # Average pings per device per day
# Expected records: 10,000 * 14 * 8 = 1,120,000

TIME_BUCKET_MINUTES = 15

# Simulation date range
SIMULATION_START = datetime(2025, 1, 5)  # Start date
SIMULATION_END = datetime(2025, 1, 18)   # End date (inclusive of crime dates)

# Crime Timeline (within simulation window)
DC_INCIDENT_BUCKET = "2025-01-15T14:30"
NASHVILLE_INCIDENT_BUCKET = "2025-01-08T15:15"
BURNER_SWITCH_BUCKET = "2025-01-15T14:45"

# =============================================================================
# PERSONS - Human-readable suspects and persons of interest
# =============================================================================

PERSONS = {
    "P_001": {
        "person_id": "P_001",
        "first_name": "Marcus",
        "last_name": "Williams",
        "alias": "Ghost",
        "dob": "1987-03-15",
        "ssn_last4": "4412",
        "known_addresses": "1842 Rhode Island Ave NE, Washington DC",
        "criminal_history": "Prior arrests: B&E (2019), Possession stolen property (2021)",
        "notes": "Primary suspect in regional burglary series. Known to use burner phones.",
        "role": "primary_suspect"
    },
    "P_002": {
        "person_id": "P_002",
        "first_name": "Devon",
        "last_name": "Carter",
        "alias": "D-Money",
        "dob": "1991-08-22",
        "ssn_last4": "1098",
        "known_addresses": "3421 Martin Luther King Jr Ave SE, Washington DC",
        "criminal_history": "Prior arrests: Grand theft auto (2018), B&E (2020)",
        "notes": "Known associate of Marcus Williams. Suspected getaway driver.",
        "role": "primary_suspect"
    },
    "P_003": {
        "person_id": "P_003",
        "first_name": "Raymond",
        "last_name": "Okonkwo",
        "alias": "Ray-O",
        "dob": "1975-11-03",
        "ssn_last4": "9901",
        "known_addresses": "1500 Russell St, Baltimore MD",
        "criminal_history": "Prior convictions: Fencing stolen goods (2015, 2018)",
        "notes": "Known fence operating out of Baltimore industrial district. Multiple informant tips.",
        "role": "fence"
    },
    "P_004": {
        "person_id": "P_004",
        "first_name": "Unknown",
        "last_name": "Unknown",
        "alias": "Burner User",
        "dob": None,
        "ssn_last4": None,
        "known_addresses": None,
        "criminal_history": None,
        "notes": "Device E_7734 appeared after E_0412 went dark. Suspected device switch by P_001.",
        "role": "suspected_alias"
    }
}

# Device to Person mappings
DEVICE_PERSON_LINKS = [
    {"device_id": "E_0412", "person_id": "P_001", "relationship": "owner", 
     "confidence": 0.95, "valid_from": "2024-01-01", "valid_to": "2025-01-15T14:30"},
    {"device_id": "E_1098", "person_id": "P_002", "relationship": "owner",
     "confidence": 0.95, "valid_from": "2024-01-01", "valid_to": None},
    {"device_id": "E_9901", "person_id": "P_003", "relationship": "owner",
     "confidence": 0.90, "valid_from": "2024-01-01", "valid_to": None},
    {"device_id": "E_7734", "person_id": "P_001", "relationship": "suspected_owner",
     "confidence": 0.85, "valid_from": "2025-01-15T14:45", "valid_to": None},
    {"device_id": "E_7734", "person_id": "P_004", "relationship": "unknown",
     "confidence": 0.50, "valid_from": "2025-01-15T14:45", "valid_to": None},
]

# Key Device IDs (for backwards compatibility)
SUSPECT_1_ID = "E_0412"           # Marcus "Ghost" Williams
SUSPECT_2_ID = "E_1098"           # Devon "D-Money" Carter  
BURNER_ENTITY_ID = "E_7734"       # Burner phone (suspected Marcus Williams)
FENCE_ENTITY_ID = "E_9901"        # Raymond "Ray-O" Okonkwo
DECOY_ENTITY_ID = "E_5555"        # Decoy for handoff detection

# Case IDs
DC_CASE_ID = "CASE_DC_001"
NASHVILLE_CASE_ID = "CASE_TN_007"

# Case-Person assignments (who is suspected in which case)
CASE_PERSONS = [
    # Nashville cases
    {"case_id": "CASE_TN_005", "person_id": "P_001", "role": "suspect", "confidence": 0.75},
    {"case_id": "CASE_TN_005", "person_id": "P_002", "role": "suspect", "confidence": 0.75},
    {"case_id": "CASE_TN_007", "person_id": "P_001", "role": "suspect", "confidence": 0.80},
    {"case_id": "CASE_TN_007", "person_id": "P_002", "role": "suspect", "confidence": 0.80},
    # DC Metro cases
    {"case_id": "CASE_DC_002", "person_id": "P_001", "role": "suspect", "confidence": 0.85},
    {"case_id": "CASE_DC_002", "person_id": "P_002", "role": "suspect", "confidence": 0.85},
    {"case_id": "CASE_VA_003", "person_id": "P_001", "role": "suspect", "confidence": 0.80},
    {"case_id": "CASE_VA_003", "person_id": "P_002", "role": "suspect", "confidence": 0.80},
    {"case_id": "CASE_DC_004", "person_id": "P_001", "role": "suspect", "confidence": 0.85},
    {"case_id": "CASE_DC_004", "person_id": "P_002", "role": "suspect", "confidence": 0.85},
    {"case_id": "CASE_DC_001", "person_id": "P_001", "role": "suspect", "confidence": 0.90},
    {"case_id": "CASE_DC_001", "person_id": "P_002", "role": "suspect", "confidence": 0.90},
    # Baltimore fence meetings
    {"case_id": "CASE_MD_001", "person_id": "P_001", "role": "suspect", "confidence": 0.70},
    {"case_id": "CASE_MD_001", "person_id": "P_003", "role": "person_of_interest", "confidence": 0.95},
    {"case_id": "CASE_MD_002", "person_id": "P_002", "role": "suspect", "confidence": 0.70},
    {"case_id": "CASE_MD_002", "person_id": "P_003", "role": "person_of_interest", "confidence": 0.95},
]

# Person-to-Person social network (replaces device-only edges)
PERSON_SOCIAL_EDGES = [
    {"person_id_1": "P_001", "person_id_2": "P_002", "relationship_type": "known_associate",
     "weight": 0.95, "source": "prior_arrest_record", "notes": "Co-arrested in 2020 B&E case"},
    {"person_id_1": "P_001", "person_id_2": "P_003", "relationship_type": "criminal_associate",
     "weight": 0.75, "source": "surveillance", "notes": "Observed meeting at fence location"},
    {"person_id_1": "P_002", "person_id_2": "P_003", "relationship_type": "criminal_associate",
     "weight": 0.65, "source": "surveillance", "notes": "Observed meeting at fence location"},
]

# How many of the 50 in DC cell should also appear at other crime scenes
DC_CELL_RECURRING_ENTITIES = 5

# =============================================================================
# GEOGRAPHIC GRID - Cities and H3 Cells
# =============================================================================

# Define metro areas with multiple H3 cells each
METRO_AREAS = {
    "dc": {
        "name": "Washington, DC",
        "state": "DC",
        "center_lat": 38.9072,
        "center_lon": -77.0369,
        "cells": [
            {"h3": "892a1008003ffff", "lat": 38.9076, "lon": -77.0723, "type": "residential"},  # Georgetown (crime scene)
            {"h3": "892a1008017ffff", "lat": 38.9156, "lon": -77.0368, "type": "commercial"},   # Connecticut Ave
            {"h3": "892a1008007ffff", "lat": 38.9050, "lon": -77.0650, "type": "residential"},  # Adjacent
            {"h3": "892a100800bffff", "lat": 38.9100, "lon": -77.0400, "type": "commercial"},   # Downtown
            {"h3": "892a100801fffff", "lat": 38.9200, "lon": -77.0500, "type": "residential"},
            {"h3": "892a100802fffff", "lat": 38.8950, "lon": -77.0300, "type": "commercial"},
            {"h3": "892a100803fffff", "lat": 38.9000, "lon": -77.0550, "type": "residential"},
            {"h3": "892a100804fffff", "lat": 38.9150, "lon": -77.0450, "type": "commercial"},
        ],
        "population_weight": 0.40  # 40% of population lives here
    },
    "arlington": {
        "name": "Arlington",
        "state": "VA",
        "center_lat": 38.8816,
        "center_lon": -77.0910,
        "cells": [
            {"h3": "892a1072a93ffff", "lat": 38.8816, "lon": -77.0910, "type": "residential"},  # Clarendon (crime scene)
            {"h3": "892a1072a97ffff", "lat": 38.8800, "lon": -77.0850, "type": "commercial"},
            {"h3": "892a1072a9bffff", "lat": 38.8750, "lon": -77.0950, "type": "residential"},
            {"h3": "892a1072a9fffff", "lat": 38.8850, "lon": -77.0800, "type": "commercial"},
        ],
        "population_weight": 0.25  # 25% of population
    },
    "nashville": {
        "name": "Nashville",
        "state": "TN",
        "center_lat": 36.1627,
        "center_lon": -86.7816,
        "cells": [
            {"h3": "8844c0a305fffff", "lat": 36.1027, "lon": -86.8569, "type": "residential"},  # Belle Meade (crime scene)
            {"h3": "8844c0a307fffff", "lat": 36.1100, "lon": -86.8500, "type": "commercial"},
            {"h3": "8844c0a30bffff", "lat": 36.1200, "lon": -86.8400, "type": "residential"},
            {"h3": "8844c0a30fffff", "lat": 36.0950, "lon": -86.8650, "type": "commercial"},
            {"h3": "8844c0a313ffff", "lat": 36.1300, "lon": -86.8300, "type": "residential"},
        ],
        "population_weight": 0.25  # 25% of population
    },
    "baltimore": {
        "name": "Baltimore",
        "state": "MD",
        "center_lat": 39.2904,
        "center_lon": -76.6122,
        "cells": [
            {"h3": "882a100861fffff", "lat": 39.2904, "lon": -76.6122, "type": "commercial"},  # Potential fence location
            {"h3": "882a100863fffff", "lat": 39.2850, "lon": -76.6200, "type": "residential"},
            {"h3": "882a100865fffff", "lat": 39.2950, "lon": -76.6050, "type": "residential"},
        ],
        "population_weight": 0.10  # 10% of population
    }
}

# Crime scenes for the story - suspects present at ALL of these
CRIME_SCENES = [
    # Nashville - Week 1 (Jan 6-8)
    {
        "case_id": "CASE_TN_005",
        "h3_cell": "8844c0a307fffff",
        "time_bucket": "2025-01-06T02:15",
        "city": "Nashville",
        "state": "TN",
        "lat": 36.1100,
        "lon": -86.8500,
        "suspects": ["E_0412", "E_1098"]
    },
    {
        "case_id": "CASE_TN_007",
        "h3_cell": "8844c0a305fffff",
        "time_bucket": "2025-01-08T15:15",
        "city": "Nashville",
        "state": "TN",
        "lat": 36.1027,
        "lon": -86.8569,
        "suspects": ["E_0412", "E_1098"]
    },
    # DC Metro - Week 2 (Jan 10-15)
    {
        "case_id": "CASE_DC_002",
        "h3_cell": "892a1008017ffff",
        "time_bucket": "2025-01-10T22:00",
        "city": "Washington, DC",
        "state": "DC",
        "lat": 38.9156,
        "lon": -77.0368,
        "suspects": ["E_0412", "E_1098"]
    },
    {
        "case_id": "CASE_VA_003",
        "h3_cell": "892a1072a93ffff",
        "time_bucket": "2025-01-12T03:30",
        "city": "Arlington",
        "state": "VA",
        "lat": 38.8816,
        "lon": -77.0910,
        "suspects": ["E_0412", "E_1098"]
    },
    {
        "case_id": "CASE_DC_004",
        "h3_cell": "892a100800bffff",
        "time_bucket": "2025-01-13T23:45",
        "city": "Washington, DC",
        "state": "DC",
        "lat": 38.9100,
        "lon": -77.0400,
        "suspects": ["E_0412", "E_1098"]
    },
    {
        "case_id": "CASE_DC_001",
        "h3_cell": "892a1008003ffff",
        "time_bucket": "2025-01-15T14:30",
        "city": "Washington, DC",
        "state": "DC",
        "lat": 38.9076,
        "lon": -77.0723,
        "suspects": ["E_0412", "E_1098"]  # This is the main incident
    },
    # Baltimore - Fence meetings
    {
        "case_id": "CASE_MD_001",
        "h3_cell": "882a100861fffff",
        "time_bucket": "2025-01-09T11:00",
        "city": "Baltimore",
        "state": "MD",
        "lat": 39.2904,
        "lon": -76.6122,
        "suspects": ["E_0412", "E_9901"]  # Suspect 1 meets fence
    },
    {
        "case_id": "CASE_MD_002",
        "h3_cell": "882a100861fffff",
        "time_bucket": "2025-01-14T14:00",
        "city": "Baltimore",
        "state": "MD",
        "lat": 39.2904,
        "lon": -76.6122,
        "suspects": ["E_1098", "E_9901"]  # Suspect 2 meets fence
    }
]


# =============================================================================
# BRONZE LAYER: Population-Based Synthetic Data Generation
# =============================================================================

@dp.materialized_view(
    name="location_events_bronze",
    comment="Raw synthetic location events - 1M+ records from population simulation"
)
def location_events_bronze():
    """
    Generate 1M+ synthetic location events using population simulation:
    
    1. Create population of 10K devices with home/work locations
    2. Simulate 14 days of daily routines (home → work → activities → home)
    3. Inject crime story: suspects at crime scenes, burner switch
    4. Add 48 additional devices at DC crime scene (total 50)
    
    This creates realistic "needle in haystack" patterns where the 2 suspects
    must be found among thousands of normal devices.
    """
    random.seed(RANDOM_SEED)
    
    events = []
    event_id = 1000000
    
    # =========================================================================
    # HELPER FUNCTIONS
    # =========================================================================
    
    def jitter_coord(base, variance=0.0005):
        """Add small random variance to coordinates."""
        return base + random.uniform(-variance, variance)
    
    def get_time_bucket(dt):
        """Convert datetime to 15-minute bucket string."""
        minute_bucket = (dt.minute // TIME_BUCKET_MINUTES) * TIME_BUCKET_MINUTES
        return dt.replace(minute=minute_bucket, second=0, microsecond=0).strftime("%Y-%m-%dT%H:%M")
    
    def create_event(eid, entity_id, dt, cell_info, city, state):
        """Create a location event record."""
        return {
            "event_id": f"EVT_{eid:08d}",
            "entity_id": entity_id,
            "timestamp": dt.isoformat(),
            "time_bucket": get_time_bucket(dt),
            "latitude": jitter_coord(cell_info["lat"]),
            "longitude": jitter_coord(cell_info["lon"]),
            "h3_cell": cell_info["h3"],
            "city": city,
            "state": state,
            "event_type": "location_ping",
            "source_system": "carrier_data"
        }
    
    def get_random_cell(metro_key):
        """Get a random cell from a metro area."""
        metro = METRO_AREAS[metro_key]
        return random.choice(metro["cells"])
    
    def should_ping(hour, is_weekend):
        """Probability of a ping based on time of day."""
        if is_weekend:
            # Weekend: more active midday, less early morning
            if 0 <= hour < 8:
                return random.random() < 0.1
            elif 8 <= hour < 22:
                return random.random() < 0.4
            else:
                return random.random() < 0.2
        else:
            # Weekday: commute peaks, work hours, evening
            if 0 <= hour < 6:
                return random.random() < 0.05
            elif 6 <= hour < 9:  # Morning commute
                return random.random() < 0.5
            elif 9 <= hour < 17:  # Work hours
                return random.random() < 0.3
            elif 17 <= hour < 20:  # Evening commute
                return random.random() < 0.5
            else:
                return random.random() < 0.25
    
    # =========================================================================
    # CREATE POPULATION
    # =========================================================================
    
    population = []
    metro_keys = list(METRO_AREAS.keys())
    
    # Reserve spots for special entities
    special_entity_ids = {SUSPECT_1_ID, SUSPECT_2_ID, BURNER_ENTITY_ID, 
                          FENCE_ENTITY_ID, DECOY_ENTITY_ID}
    
    for i in range(POPULATION_SIZE):
        entity_id = f"E_{10000 + i:05d}"
        
        # Skip if this ID conflicts with special entities
        if entity_id in special_entity_ids:
            entity_id = f"E_{90000 + i:05d}"
        
        # Assign home metro based on population weights
        r = random.random()
        cumulative = 0
        home_metro = "dc"  # default
        for metro_key, metro_info in METRO_AREAS.items():
            cumulative += metro_info["population_weight"]
            if r < cumulative:
                home_metro = metro_key
                break
        
        # Pick home and work cells
        home_cell = get_random_cell(home_metro)
        
        # 70% work in same metro, 30% commute to adjacent metro
        if random.random() < 0.7:
            work_metro = home_metro
        else:
            work_metro = random.choice([k for k in metro_keys if k != home_metro])
        work_cell = get_random_cell(work_metro)
        
        population.append({
            "entity_id": entity_id,
            "home_metro": home_metro,
            "home_cell": home_cell,
            "work_metro": work_metro,
            "work_cell": work_cell,
            "is_traveler": random.random() < 0.05  # 5% travel occasionally
        })
    
    print(f"Created population of {len(population)} devices")
    
    # =========================================================================
    # GENERATE DAILY ROUTINES FOR POPULATION
    # =========================================================================
    
    current_date = SIMULATION_START
    day_count = 0
    
    while current_date <= SIMULATION_END:
        day_count += 1
        is_weekend = current_date.weekday() >= 5
        
        for person in population:
            entity_id = person["entity_id"]
            home_metro = person["home_metro"]
            home_cell = person["home_cell"]
            work_metro = person["work_metro"]
            work_cell = person["work_cell"]
            
            # Generate pings throughout the day
            for hour in range(24):
                if not should_ping(hour, is_weekend):
                    continue
                
                # Determine location based on time
                if is_weekend:
                    # Weekend: mostly home, some random activities
                    if random.random() < 0.7:
                        cell = home_cell
                        metro = home_metro
                    else:
                        metro = home_metro
                        cell = get_random_cell(metro)
                else:
                    # Weekday routine
                    if hour < 7 or hour >= 20:
                        # Home
                        cell = home_cell
                        metro = home_metro
                    elif 9 <= hour < 17:
                        # Work
                        cell = work_cell
                        metro = work_metro
                    else:
                        # Commute - could be either
                        if random.random() < 0.5:
                            cell = home_cell
                            metro = home_metro
                        else:
                            cell = work_cell
                            metro = work_metro
                
                # Create the ping
                minute = random.randint(0, 59)
                dt = current_date.replace(hour=hour, minute=minute, second=random.randint(0, 59))
                
                metro_info = METRO_AREAS[metro]
                events.append(create_event(
                    event_id, entity_id, dt,
                    cell, metro_info["name"], metro_info["state"]
                ))
                event_id += 1
        
        current_date += timedelta(days=1)
        
        if day_count % 7 == 0:
            print(f"Generated {day_count} days, {len(events)} events so far")
    
    print(f"Population simulation complete: {len(events)} events")
    
    # =========================================================================
    # INJECT CRIME STORY: SUSPECTS AT CRIME SCENES
    # =========================================================================
    
    def add_story_event(entity_id, bucket_str, h3_cell, lat, lon, city, state):
        nonlocal event_id
        dt = datetime.fromisoformat(bucket_str) + timedelta(minutes=random.randint(0, 14))
        events.append({
            "event_id": f"EVT_{event_id:08d}",
            "entity_id": entity_id,
            "timestamp": dt.isoformat(),
            "time_bucket": bucket_str,
            "latitude": jitter_coord(lat),
            "longitude": jitter_coord(lon),
            "h3_cell": h3_cell,
            "city": city,
            "state": state,
            "event_type": "location_ping",
            "source_system": "carrier_data"
        })
        event_id += 1
    
    # Add suspects to crime scenes based on the "suspects" field
    suspect_scene_count = 0
    for scene in CRIME_SCENES:
        for suspect_id in scene.get("suspects", []):
            add_story_event(suspect_id, scene["time_bucket"], scene["h3_cell"],
                            scene["lat"], scene["lon"], scene["city"], scene["state"])
            suspect_scene_count += 1
    
    print(f"Added {suspect_scene_count} suspect appearances at {len(CRIME_SCENES)} crime scenes")
    
    # =========================================================================
    # DC INCIDENT: ADD 48 MORE ENTITIES (total 50 in cell)
    # =========================================================================
    
    dc_scene = CRIME_SCENES[0]  # CASE_DC_001
    dc_cell_entities = []
    
    # Add 48 random entities from population who happen to be in DC cell
    dc_population = [p for p in population if p["home_metro"] == "dc"]
    selected_dc_entities = random.sample(dc_population, min(48, len(dc_population)))
    
    for person in selected_dc_entities:
        add_story_event(person["entity_id"], dc_scene["time_bucket"], dc_scene["h3_cell"],
                        dc_scene["lat"], dc_scene["lon"], dc_scene["city"], dc_scene["state"])
        dc_cell_entities.append(person["entity_id"])
    
    # Make a few of these entities appear at other crime scenes too (realistic noise)
    noise_entities = random.sample(dc_cell_entities, min(DC_CELL_RECURRING_ENTITIES, len(dc_cell_entities)))
    for entity_id in noise_entities:
        # Pick 1-2 other crime scenes
        other_scenes = [s for s in CRIME_SCENES if s["case_id"] != "CASE_DC_001"]
        for scene in random.sample(other_scenes, random.randint(1, 2)):
            add_story_event(entity_id, scene["time_bucket"], scene["h3_cell"],
                           scene["lat"], scene["lon"], scene["city"], scene["state"])
    
    print(f"Added 48 entities to DC crime scene cell (total 50)")
    
    # =========================================================================
    # BURNER PHONE SWITCH
    # =========================================================================
    
    # Suspect 1 disappears after DC incident (no more events)
    # Burner entity appears at T+1 in same cell and continues with Suspect 2
    
    switch_scene = {
        "h3_cell": "892a1008003ffff",
        "lat": 38.9076,
        "lon": -77.0723,
        "city": "Washington, DC",
        "state": "DC"
    }
    
    # Suspect 2 continues
    add_story_event(SUSPECT_2_ID, BURNER_SWITCH_BUCKET, switch_scene["h3_cell"],
                    switch_scene["lat"], switch_scene["lon"], 
                    switch_scene["city"], switch_scene["state"])
    
    # Burner appears
    add_story_event(BURNER_ENTITY_ID, BURNER_SWITCH_BUCKET, switch_scene["h3_cell"],
                    switch_scene["lat"], switch_scene["lon"],
                    switch_scene["city"], switch_scene["state"])
    
    # Decoy entity (in adjacent cell - should fail handoff detection)
    add_story_event(DECOY_ENTITY_ID, BURNER_SWITCH_BUCKET, "892a1008007ffff",
                    38.9050, -77.0650, "Washington, DC", "DC")
    
    # Burner and Suspect 2 continue together for next few hours
    continuation_times = [
        "2025-01-15T15:00", "2025-01-15T15:15", "2025-01-15T15:30",
        "2025-01-15T16:00", "2025-01-15T17:00"
    ]
    continuation_cells = [
        {"h3": "892a100800bffff", "lat": 38.9100, "lon": -77.0400},
        {"h3": "892a100801fffff", "lat": 38.9200, "lon": -77.0500},
        {"h3": "892a100802fffff", "lat": 38.8950, "lon": -77.0300},
        {"h3": "892a100803fffff", "lat": 38.9000, "lon": -77.0550},
        {"h3": "892a100804fffff", "lat": 38.9150, "lon": -77.0450},
    ]
    
    for time_bucket, cell in zip(continuation_times, continuation_cells):
        add_story_event(BURNER_ENTITY_ID, time_bucket, cell["h3"],
                        cell["lat"], cell["lon"], "Washington, DC", "DC")
        add_story_event(SUSPECT_2_ID, time_bucket, cell["h3"],
                        cell["lat"], cell["lon"], "Washington, DC", "DC")
    
    print(f"Added burner phone switch events")
    
    # =========================================================================
    # FENCE - Additional presence at fence location
    # =========================================================================
    
    # Fence is present at the location multiple times (already added via CRIME_SCENES for meetings)
    fence_cell = METRO_AREAS["baltimore"]["cells"][0]
    
    # Add fence's regular presence at his location (beyond just meeting times)
    fence_routine_times = ["2025-01-07T10:00", "2025-01-11T15:00", "2025-01-16T10:00"]
    for time_bucket in fence_routine_times:
        add_story_event(FENCE_ENTITY_ID, time_bucket, fence_cell["h3"],
                        fence_cell["lat"], fence_cell["lon"], "Baltimore", "MD")
    
    print(f"Added fence routine presence events")
    
    # =========================================================================
    # CREATE DATAFRAME
    # =========================================================================
    
    print(f"TOTAL EVENTS: {len(events)}")
    
    schema = StructType([
        StructField("event_id", StringType(), False),
        StructField("entity_id", StringType(), False),
        StructField("timestamp", StringType(), False),
        StructField("time_bucket", StringType(), False),
        StructField("latitude", DoubleType(), False),
        StructField("longitude", DoubleType(), False),
        StructField("h3_cell", StringType(), False),
        StructField("city", StringType(), False),
        StructField("state", StringType(), False),
        StructField("event_type", StringType(), False),
        StructField("source_system", StringType(), False),
    ])
    
    return spark.createDataFrame(events, schema)


@dp.materialized_view(
    name="cases_bronze",
    comment="Raw case/incident data for demo scenario"
)
def cases_bronze():
    """Generate case records for the burglary series - 8 cases across 4 jurisdictions."""
    
    cases = [
        # Nashville Cases - Week 1
        {
            "case_id": "CASE_TN_005",
            "case_type": "burglary",
            "city": "Nashville",
            "state": "TN",
            "address": "2200 West End Ave, Midtown",
            "incident_time_bucket": "2025-01-06T02:15",
            "incident_start": "2025-01-06T02:10:00",
            "incident_end": "2025-01-06T02:30:00",
            "h3_cell": "8844c0a307fffff",
            "latitude": 36.1100,
            "longitude": -86.8500,
            "status": "open",
            "priority": "high",
            "narrative": """Commercial burglary at upscale boutique, West End Ave.
Method of Entry: Rear window smash, clean single impact. Targeted 
jewelry display cases. Loss: $38,000 in merchandise. Two suspects 
observed on neighboring business camera, dark clothing, faces obscured.
Dark sedan departing westbound. Professional MO noted.""",
            "method_of_entry": "rear_window_smash",
            "target_items": "jewelry",
            "estimated_loss": 38000
        },
        {
            "case_id": "CASE_TN_007",
            "case_type": "burglary",
            "city": "Nashville",
            "state": "TN",
            "address": "4501 Harding Pike, Belle Meade",
            "incident_time_bucket": "2025-01-08T15:15",
            "incident_start": "2025-01-08T15:10:00",
            "incident_end": "2025-01-08T15:25:00",
            "h3_cell": "8844c0a305fffff",
            "latitude": 36.1027,
            "longitude": -86.8569,
            "status": "open",
            "priority": "high",
            "narrative": """Residential burglary at 4501 Harding Pike, Belle Meade area.
Method of Entry: Rear window smash, single impact, clean break pattern 
consistent with professional tool. Property losses include: antique 
jewelry collection ($22,000 est.), two Rolex watches, MacBook Pro, 
and cash ($800). Interior showed organized search pattern - drawers 
opened but not dumped, suggesting experienced perpetrators. Partial 
boot print recovered near entry point. Witness observed two individuals 
in dark clothing departing in dark sedan approximately 15:20.
Similar M.O. flagged - cross-reference with regional burglary series.
Time of incident estimated: 15:10-15:25.""",
            "method_of_entry": "rear_window_smash",
            "target_items": "jewelry,watches,electronics,cash",
            "estimated_loss": 30800
        },
        # DC Metro Cases - Week 2
        {
            "case_id": "CASE_DC_002",
            "case_type": "burglary",
            "city": "Washington, DC",
            "state": "DC",
            "address": "2100 Connecticut Ave NW",
            "incident_time_bucket": "2025-01-10T22:00",
            "incident_start": "2025-01-10T21:55:00",
            "incident_end": "2025-01-10T22:15:00",
            "h3_cell": "892a1008017ffff",
            "latitude": 38.9156,
            "longitude": -77.0368,
            "status": "open",
            "priority": "high",
            "narrative": """Commercial after-hours burglary at jewelry store, Connecticut Ave.
Rear window entry, targeted display cases only. Loss: $45,000 in 
merchandise. Two suspects on camera, faces obscured. Dark sedan 
observed departing. Professional operation. M.O. consistent with 
Nashville series - flagged for cross-jurisdiction review.""",
            "method_of_entry": "rear_window_smash",
            "target_items": "jewelry",
            "estimated_loss": 45000
        },
        {
            "case_id": "CASE_VA_003",
            "case_type": "burglary",
            "city": "Arlington",
            "state": "VA",
            "address": "1200 N Highland St, Clarendon",
            "incident_time_bucket": "2025-01-12T03:30",
            "incident_start": "2025-01-12T03:20:00",
            "incident_end": "2025-01-12T03:45:00",
            "h3_cell": "892a1072a93ffff",
            "latitude": 38.8816,
            "longitude": -77.0910,
            "status": "open",
            "priority": "medium",
            "narrative": """Residential burglary in Clarendon. Rear sliding door forced. 
Jewelry and electronics taken. Two-person crew suspected based 
on entry/exit timing. Vehicle: dark sedan. Method consistent 
with regional series.""",
            "method_of_entry": "door_forced",
            "target_items": "jewelry,electronics",
            "estimated_loss": 18000
        },
        {
            "case_id": "CASE_DC_004",
            "case_type": "burglary",
            "city": "Washington, DC",
            "state": "DC",
            "address": "1800 K Street NW, Downtown",
            "incident_time_bucket": "2025-01-13T23:45",
            "incident_start": "2025-01-13T23:40:00",
            "incident_end": "2025-01-14T00:05:00",
            "h3_cell": "892a100800bffff",
            "latitude": 38.9100,
            "longitude": -77.0400,
            "status": "open",
            "priority": "high",
            "narrative": """Commercial burglary at high-end watch retailer, K Street.
After-hours entry via rear window. Display cases targeted - 
$62,000 in luxury watches taken. Two suspects, professional 
operation. Getaway vehicle: dark sedan. Strong M.O. match 
to Connecticut Ave case and Nashville series.""",
            "method_of_entry": "rear_window_smash",
            "target_items": "watches,jewelry",
            "estimated_loss": 62000
        },
        {
            "case_id": "CASE_DC_001",
            "case_type": "burglary",
            "city": "Washington, DC",
            "state": "DC",
            "address": "1423 Wisconsin Ave NW, Georgetown",
            "incident_time_bucket": "2025-01-15T14:30",
            "incident_start": "2025-01-15T14:25:00",
            "incident_end": "2025-01-15T14:40:00",
            "h3_cell": "892a1008003ffff",
            "latitude": 38.9076,
            "longitude": -77.0723,
            "status": "open",
            "priority": "high",
            "narrative": """Residential burglary reported at 1423 Wisconsin Ave NW, Georgetown.
Method of Entry: Rear window smash using unknown tool, glass fragments 
indicate single impact point. Interior ransacked, primary target appears 
to be jewelry and small electronics. Homeowner reports missing: diamond 
engagement ring ($15,000 est.), gold watch collection (3 items, $8,000 est.), 
laptop computer, and approximately $500 cash. No fingerprints recovered. 
Neighbor reports seeing two male subjects fleeing eastbound on foot 
approximately 14:35. Security camera from adjacent property captured 
partial vehicle description: dark-colored sedan, possibly Honda or Toyota.
Time of incident estimated: 14:25-14:40. CRITICAL: Part of multi-state 
burglary series spanning Nashville and DC metro area.""",
            "method_of_entry": "rear_window_smash",
            "target_items": "jewelry,electronics,cash",
            "estimated_loss": 24000
        },
        # Baltimore - Suspected Fencing Operations
        {
            "case_id": "CASE_MD_001",
            "case_type": "suspected_fencing",
            "city": "Baltimore",
            "state": "MD",
            "address": "1500 Russell St, Industrial District",
            "incident_time_bucket": "2025-01-09T11:00",
            "incident_start": "2025-01-09T10:45:00",
            "incident_end": "2025-01-09T11:30:00",
            "h3_cell": "882a100861fffff",
            "latitude": 39.2904,
            "longitude": -76.6122,
            "status": "under_investigation",
            "priority": "medium",
            "narrative": """Surveillance log: Known fencing operation location.
Subject E_9901 (known fence) observed meeting with unknown male.
Meeting lasted approximately 45 minutes. Subject departed in 
dark sedan. Cross-reference with Nashville/DC burglary series 
ongoing. Possible stolen goods exchange.""",
            "method_of_entry": "n/a",
            "target_items": "n/a",
            "estimated_loss": 0
        },
        {
            "case_id": "CASE_MD_002",
            "case_type": "suspected_fencing",
            "city": "Baltimore",
            "state": "MD",
            "address": "1500 Russell St, Industrial District",
            "incident_time_bucket": "2025-01-14T14:00",
            "incident_start": "2025-01-14T13:45:00",
            "incident_end": "2025-01-14T14:30:00",
            "h3_cell": "882a100861fffff",
            "latitude": 39.2904,
            "longitude": -76.6122,
            "status": "under_investigation",
            "priority": "medium",
            "narrative": """Surveillance log: Known fencing operation location.
Subject E_9901 (known fence) observed meeting with second unknown male.
Different individual from Jan 9 meeting. Meeting lasted approximately 
45 minutes. Dark sedan observed. Possible second member of burglary 
crew establishing fence connection. Escalating priority.""",
            "method_of_entry": "n/a",
            "target_items": "n/a",
            "estimated_loss": 0
        }
    ]
    
    schema = StructType([
        StructField("case_id", StringType(), False),
        StructField("case_type", StringType(), False),
        StructField("city", StringType(), False),
        StructField("state", StringType(), False),
        StructField("address", StringType(), False),
        StructField("incident_time_bucket", StringType(), False),
        StructField("incident_start", StringType(), False),
        StructField("incident_end", StringType(), False),
        StructField("h3_cell", StringType(), False),
        StructField("latitude", DoubleType(), False),
        StructField("longitude", DoubleType(), False),
        StructField("status", StringType(), False),
        StructField("priority", StringType(), False),
        StructField("narrative", StringType(), False),
        StructField("method_of_entry", StringType(), False),
        StructField("target_items", StringType(), False),
        StructField("estimated_loss", IntegerType(), False),
    ])
    
    return spark.createDataFrame(cases, schema)


@dp.materialized_view(
    name="persons_bronze",
    comment="Human identities - persons of interest in investigations"
)
def persons_bronze():
    """Generate person records with human-readable details."""
    
    persons = [
        {
            "person_id": "P_001",
            "first_name": "Marcus",
            "last_name": "Williams",
            "alias": "Ghost",
            "full_name": "Marcus Williams",
            "display_name": "Marcus 'Ghost' Williams",
            "dob": "1987-03-15",
            "age": 37,
            "ssn_last4": "4412",
            "known_addresses": "1842 Rhode Island Ave NE, Washington DC",
            "criminal_history": "Prior arrests: B&E (2019), Possession stolen property (2021). Convicted: B&E (2021) - 18 months, released early.",
            "notes": "Primary suspect in regional burglary series. Known to use burner phones. Travels between DC and Nashville.",
            "role": "primary_suspect",
            "risk_level": "high",
            "status": "active",
            # Probation/Parole info
            "supervision_status": "probation",
            "supervision_type": "felony_probation",
            "supervision_start": "2023-06-15",
            "supervision_end": "2026-06-15",
            "probation_officer": "Officer James Martinez",
            "probation_officer_phone": "202-555-0147",
            "supervision_conditions": "No contact with known felons, No travel outside DC/MD/VA without permission, Weekly check-ins, Employment required",
            "last_checkin": "2025-01-10",
            "compliance_status": "violation_suspected",
            "violation_notes": "Failed to report out-of-state travel to Nashville (Jan 6-8). Possible association with known felon P_002."
        },
        {
            "person_id": "P_002",
            "first_name": "Devon",
            "last_name": "Carter",
            "alias": "D-Money",
            "full_name": "Devon Carter",
            "display_name": "Devon 'D-Money' Carter",
            "dob": "1991-08-22",
            "age": 33,
            "ssn_last4": "1098",
            "known_addresses": "3421 Martin Luther King Jr Ave SE, Washington DC",
            "criminal_history": "Prior arrests: Grand theft auto (2018), B&E (2020, with P_001). Convicted: GTA (2018) - 2 years served.",
            "notes": "Known associate of Marcus Williams. Suspected getaway driver. Co-arrested with Williams in 2020.",
            "role": "primary_suspect",
            "risk_level": "high",
            "status": "active",
            # Parole info
            "supervision_status": "parole",
            "supervision_type": "state_parole",
            "supervision_start": "2022-03-01",
            "supervision_end": "2025-03-01",
            "probation_officer": "Officer Linda Chen",
            "probation_officer_phone": "202-555-0198",
            "supervision_conditions": "No contact with P_001 (co-defendant), Curfew 10PM-6AM, GPS monitoring required, No vehicle operation without permission",
            "last_checkin": "2025-01-08",
            "compliance_status": "violation_confirmed",
            "violation_notes": "GPS shows contact with P_001 on multiple occasions. Curfew violations Jan 6, 8, 10, 12, 13, 15. Vehicle operation detected."
        },
        {
            "person_id": "P_003",
            "first_name": "Raymond",
            "last_name": "Okonkwo",
            "alias": "Ray-O",
            "full_name": "Raymond Okonkwo",
            "display_name": "Raymond 'Ray-O' Okonkwo",
            "dob": "1975-11-03",
            "age": 49,
            "ssn_last4": "9901",
            "known_addresses": "1500 Russell St, Baltimore MD; 422 N Charles St, Baltimore MD",
            "criminal_history": "Prior convictions: Fencing stolen goods (2015) - 2 years, Fencing (2018) - 3 years. Released 2021.",
            "notes": "Known fence operating out of Baltimore industrial district. Multiple informant tips. Suspected connection to broader fencing network.",
            "role": "fence",
            "risk_level": "medium",
            "status": "active",
            # Parole info
            "supervision_status": "parole",
            "supervision_type": "federal_supervised_release",
            "supervision_start": "2021-09-01",
            "supervision_end": "2026-09-01",
            "probation_officer": "Officer Michael Brown",
            "probation_officer_phone": "410-555-0234",
            "supervision_conditions": "No possession of stolen property, Submit to searches, Employment verification required, No contact with known fences",
            "last_checkin": "2025-01-05",
            "compliance_status": "compliant",
            "violation_notes": None
        },
        {
            "person_id": "P_004",
            "first_name": "Unknown",
            "last_name": "Unknown",
            "alias": "Burner User",
            "full_name": "Unknown Person",
            "display_name": "Unknown (Burner Device User)",
            "dob": None,
            "age": None,
            "ssn_last4": None,
            "known_addresses": None,
            "criminal_history": None,
            "notes": "Device E_7734 appeared after E_0412 went dark on Jan 15. Suspected device switch by Marcus Williams (P_001).",
            "role": "suspected_alias",
            "risk_level": "high",
            "status": "unidentified",
            "supervision_status": None,
            "supervision_type": None,
            "supervision_start": None,
            "supervision_end": None,
            "probation_officer": None,
            "probation_officer_phone": None,
            "supervision_conditions": None,
            "last_checkin": None,
            "compliance_status": None,
            "violation_notes": None
        },
        # ===== ADDITIONAL SUSPECTS / CREW MEMBERS =====
        {
            "person_id": "P_005",
            "first_name": "Terrence",
            "last_name": "Jackson",
            "alias": "T-Bone",
            "full_name": "Terrence Jackson",
            "display_name": "Terrence 'T-Bone' Jackson",
            "dob": "1989-06-12",
            "age": 35,
            "ssn_last4": "7823",
            "known_addresses": "2215 Benning Rd NE, Washington DC",
            "criminal_history": "Prior arrests: Burglary (2017) - dismissed, Assault (2019) - 6 months served",
            "notes": "Suspected lookout for the crew. Device shows occasional presence near crime scenes but not inside.",
            "role": "suspected_lookout",
            "risk_level": "medium",
            "status": "active",
            # Probation info
            "supervision_status": "probation",
            "supervision_type": "misdemeanor_probation",
            "supervision_start": "2024-01-15",
            "supervision_end": "2025-07-15",
            "probation_officer": "Officer Sarah Williams",
            "probation_officer_phone": "202-555-0156",
            "supervision_conditions": "No weapons, Anger management classes, Monthly check-ins",
            "last_checkin": "2025-01-02",
            "compliance_status": "compliant",
            "violation_notes": None
        },
        {
            "person_id": "P_006",
            "first_name": "Jamal",
            "last_name": "Thompson",
            "alias": "Slim",
            "full_name": "Jamal Thompson",
            "display_name": "Jamal 'Slim' Thompson",
            "dob": "1994-02-28",
            "age": 30,
            "ssn_last4": "3341",
            "known_addresses": "1901 Good Hope Rd SE, Washington DC",
            "criminal_history": "Prior arrests: Receiving stolen property (2020) - Convicted, 1 year suspended",
            "notes": "Suspected secondary fence or middleman. May broker deals between crew and Ray-O.",
            "role": "suspected_middleman",
            "risk_level": "medium",
            "status": "active",
            # Probation info  
            "supervision_status": "probation",
            "supervision_type": "felony_probation",
            "supervision_start": "2021-06-01",
            "supervision_end": "2025-06-01",
            "probation_officer": "Officer David Kim",
            "probation_officer_phone": "202-555-0178",
            "supervision_conditions": "No contact with stolen property, Employment required, Bi-weekly check-ins",
            "last_checkin": "2025-01-12",
            "compliance_status": "violation_suspected",
            "violation_notes": "Observed at known fence location (P_003 residence) on Jan 9 and Jan 14."
        },
        # ===== VICTIMS (no supervision) =====
        {
            "person_id": "V_001",
            "first_name": "Eleanor",
            "last_name": "Harrington",
            "alias": None,
            "full_name": "Eleanor Harrington",
            "display_name": "Eleanor Harrington",
            "dob": "1965-09-18",
            "age": 59,
            "ssn_last4": None,
            "known_addresses": "4521 Foxhall Rd NW, Washington DC",
            "criminal_history": None,
            "notes": "Victim - CASE_DC_001. High net worth individual. Reported $450,000 in jewelry stolen.",
            "role": "victim",
            "risk_level": None,
            "status": "victim",
            "supervision_status": None, "supervision_type": None, "supervision_start": None, "supervision_end": None,
            "probation_officer": None, "probation_officer_phone": None, "supervision_conditions": None,
            "last_checkin": None, "compliance_status": None, "violation_notes": None
        },
        {
            "person_id": "V_002",
            "first_name": "Robert",
            "last_name": "Ashford III",
            "alias": None,
            "full_name": "Robert Ashford III",
            "display_name": "Robert Ashford III",
            "dob": "1958-03-22",
            "age": 66,
            "ssn_last4": None,
            "known_addresses": "3847 Belle Meade Blvd, Nashville TN",
            "criminal_history": None,
            "notes": "Victim - CASE_TN_007. Art collector. Reported $320,000 in antiques stolen.",
            "role": "victim",
            "risk_level": None,
            "status": "victim",
            "supervision_status": None, "supervision_type": None, "supervision_start": None, "supervision_end": None,
            "probation_officer": None, "probation_officer_phone": None, "supervision_conditions": None,
            "last_checkin": None, "compliance_status": None, "violation_notes": None
        },
        {
            "person_id": "V_003",
            "first_name": "Patricia",
            "last_name": "Chen-Morrison",
            "alias": None,
            "full_name": "Patricia Chen-Morrison",
            "display_name": "Patricia Chen-Morrison",
            "dob": "1972-11-05",
            "age": 52,
            "ssn_last4": None,
            "known_addresses": "2100 N Clarendon Blvd, Arlington VA",
            "criminal_history": None,
            "notes": "Victim - CASE_VA_003. Investment banker. Reported $180,000 in valuables stolen.",
            "role": "victim",
            "risk_level": None,
            "status": "victim",
            "supervision_status": None, "supervision_type": None, "supervision_start": None, "supervision_end": None,
            "probation_officer": None, "probation_officer_phone": None, "supervision_conditions": None,
            "last_checkin": None, "compliance_status": None, "violation_notes": None
        },
        # ===== WITNESSES (no supervision) =====
        {
            "person_id": "W_001",
            "first_name": "Maria",
            "last_name": "Santos",
            "alias": None,
            "full_name": "Maria Santos",
            "display_name": "Maria Santos",
            "dob": "1985-07-14",
            "age": 39,
            "ssn_last4": None,
            "known_addresses": "4519 Foxhall Rd NW, Washington DC",
            "criminal_history": None,
            "notes": "Witness - CASE_DC_001. Neighbor who reported seeing suspicious vehicle (dark SUV) at 2:15 AM.",
            "role": "witness",
            "risk_level": None,
            "status": "cooperating",
            "supervision_status": None, "supervision_type": None, "supervision_start": None, "supervision_end": None,
            "probation_officer": None, "probation_officer_phone": None, "supervision_conditions": None,
            "last_checkin": None, "compliance_status": None, "violation_notes": None
        },
        {
            "person_id": "W_002",
            "first_name": "James",
            "last_name": "Mitchell",
            "alias": None,
            "full_name": "James Mitchell",
            "display_name": "James Mitchell",
            "dob": "1978-12-03",
            "age": 46,
            "ssn_last4": None,
            "known_addresses": "3201 Connecticut Ave NW, Washington DC",
            "criminal_history": None,
            "notes": "Witness - CASE_DC_002. Security guard who observed two males leaving property at 10:15 PM.",
            "role": "witness",
            "risk_level": None,
            "status": "cooperating",
            "supervision_status": None, "supervision_type": None, "supervision_start": None, "supervision_end": None,
            "probation_officer": None, "probation_officer_phone": None, "supervision_conditions": None,
            "last_checkin": None, "compliance_status": None, "violation_notes": None
        },
        # ===== CLEARED INDIVIDUALS (no supervision) =====
        {
            "person_id": "C_001",
            "first_name": "David",
            "last_name": "Park",
            "alias": None,
            "full_name": "David Park",
            "display_name": "David Park",
            "dob": "1990-04-22",
            "age": 34,
            "ssn_last4": "5567",
            "known_addresses": "1650 Harvard St NW, Washington DC",
            "criminal_history": None,
            "notes": "Initially flagged due to device proximity. CLEARED - verified employment alibi at Georgetown Hospital during incidents.",
            "role": "cleared",
            "risk_level": None,
            "status": "cleared",
            "supervision_status": None, "supervision_type": None, "supervision_start": None, "supervision_end": None,
            "probation_officer": None, "probation_officer_phone": None, "supervision_conditions": None,
            "last_checkin": None, "compliance_status": None, "violation_notes": None
        },
        {
            "person_id": "C_002",
            "first_name": "Sarah",
            "last_name": "Johnson",
            "alias": None,
            "full_name": "Sarah Johnson",
            "display_name": "Sarah Johnson",
            "dob": "1988-08-15",
            "age": 36,
            "ssn_last4": "9912",
            "known_addresses": "2847 Wisconsin Ave NW, Washington DC",
            "criminal_history": None,
            "notes": "Initially flagged due to repeated presence in Georgetown area. CLEARED - resident of the neighborhood, established pattern.",
            "role": "cleared",
            "risk_level": None,
            "status": "cleared",
            "supervision_status": None, "supervision_type": None, "supervision_start": None, "supervision_end": None,
            "probation_officer": None, "probation_officer_phone": None, "supervision_conditions": None,
            "last_checkin": None, "compliance_status": None, "violation_notes": None
        }
    ]
    
    schema = StructType([
        StructField("person_id", StringType(), False),
        StructField("first_name", StringType(), True),
        StructField("last_name", StringType(), True),
        StructField("alias", StringType(), True),
        StructField("full_name", StringType(), True),
        StructField("display_name", StringType(), True),
        StructField("dob", StringType(), True),
        StructField("age", IntegerType(), True),
        StructField("ssn_last4", StringType(), True),
        StructField("known_addresses", StringType(), True),
        StructField("criminal_history", StringType(), True),
        StructField("notes", StringType(), True),
        StructField("role", StringType(), True),
        StructField("risk_level", StringType(), True),
        StructField("status", StringType(), True),
        # Supervision/Probation fields
        StructField("supervision_status", StringType(), True),
        StructField("supervision_type", StringType(), True),
        StructField("supervision_start", StringType(), True),
        StructField("supervision_end", StringType(), True),
        StructField("probation_officer", StringType(), True),
        StructField("probation_officer_phone", StringType(), True),
        StructField("supervision_conditions", StringType(), True),
        StructField("last_checkin", StringType(), True),
        StructField("compliance_status", StringType(), True),
        StructField("violation_notes", StringType(), True),
    ])
    
    return spark.createDataFrame(persons, schema)


@dp.materialized_view(
    name="person_device_links_bronze",
    comment="Links between persons and their devices"
)
def person_device_links_bronze():
    """Generate device-to-person mappings."""
    
    links = [
        {"link_id": "PDL_001", "device_id": "E_0412", "person_id": "P_001", 
         "relationship": "owner", "confidence": 0.95, 
         "valid_from": "2024-01-01", "valid_to": "2025-01-15",
         "notes": "Primary device, confirmed through carrier records"},
        {"link_id": "PDL_002", "device_id": "E_1098", "person_id": "P_002",
         "relationship": "owner", "confidence": 0.95,
         "valid_from": "2024-01-01", "valid_to": None,
         "notes": "Primary device, confirmed through carrier records"},
        {"link_id": "PDL_003", "device_id": "E_9901", "person_id": "P_003",
         "relationship": "owner", "confidence": 0.90,
         "valid_from": "2024-01-01", "valid_to": None,
         "notes": "Business phone registered to front company"},
        {"link_id": "PDL_004", "device_id": "E_7734", "person_id": "P_001",
         "relationship": "suspected_owner", "confidence": 0.85,
         "valid_from": "2025-01-15", "valid_to": None,
         "notes": "Burner device. Appeared same location/time as E_0412 went dark. Co-travels with E_1098."},
        {"link_id": "PDL_005", "device_id": "E_7734", "person_id": "P_004",
         "relationship": "owner", "confidence": 0.50,
         "valid_from": "2025-01-15", "valid_to": None,
         "notes": "Placeholder for unidentified user. May be same as P_001."},
        # Additional crew members
        {"link_id": "PDL_006", "device_id": "E_7823", "person_id": "P_005",
         "relationship": "owner", "confidence": 0.85,
         "valid_from": "2024-01-01", "valid_to": None,
         "notes": "Suspected lookout. Device shows perimeter presence during incidents."},
        {"link_id": "PDL_007", "device_id": "E_3341", "person_id": "P_006",
         "relationship": "owner", "confidence": 0.80,
         "valid_from": "2024-01-01", "valid_to": None,
         "notes": "Suspected middleman. Device shows meetings with fence location."},
        # Cleared individuals (important for showing false positive handling)
        {"link_id": "PDL_008", "device_id": "E_5567", "person_id": "C_001",
         "relationship": "owner", "confidence": 0.95,
         "valid_from": "2024-01-01", "valid_to": None,
         "notes": "Georgetown Hospital employee. CLEARED."},
        {"link_id": "PDL_009", "device_id": "E_9912", "person_id": "C_002",
         "relationship": "owner", "confidence": 0.95,
         "valid_from": "2024-01-01", "valid_to": None,
         "notes": "Georgetown resident. CLEARED."},
    ]
    
    schema = StructType([
        StructField("link_id", StringType(), False),
        StructField("device_id", StringType(), False),
        StructField("person_id", StringType(), False),
        StructField("relationship", StringType(), False),
        StructField("confidence", DoubleType(), False),
        StructField("valid_from", StringType(), True),
        StructField("valid_to", StringType(), True),
        StructField("notes", StringType(), True),
    ])
    
    return spark.createDataFrame(links, schema)


@dp.materialized_view(
    name="case_persons_bronze",
    comment="Links between cases and suspected persons"
)
def case_persons_bronze():
    """Generate case-to-person suspect assignments."""
    
    case_persons = [
        # Nashville cases - Week 1
        {"case_id": "CASE_TN_005", "person_id": "P_001", "role": "suspect", 
         "confidence": 0.75, "assigned_date": "2025-01-07", 
         "notes": "Device E_0412 detected at scene. M.O. matches prior cases."},
        {"case_id": "CASE_TN_005", "person_id": "P_002", "role": "suspect",
         "confidence": 0.75, "assigned_date": "2025-01-07",
         "notes": "Device E_1098 detected at scene with E_0412. Known associate."},
        {"case_id": "CASE_TN_007", "person_id": "P_001", "role": "suspect",
         "confidence": 0.80, "assigned_date": "2025-01-09",
         "notes": "Device E_0412 detected. Same M.O. as CASE_TN_005."},
        {"case_id": "CASE_TN_007", "person_id": "P_002", "role": "suspect",
         "confidence": 0.80, "assigned_date": "2025-01-09",
         "notes": "Device E_1098 co-located with E_0412."},
        
        # DC Metro cases - Week 2
        {"case_id": "CASE_DC_002", "person_id": "P_001", "role": "suspect",
         "confidence": 0.85, "assigned_date": "2025-01-11",
         "notes": "Cross-jurisdiction link established. Nashville M.O. match."},
        {"case_id": "CASE_DC_002", "person_id": "P_002", "role": "suspect",
         "confidence": 0.85, "assigned_date": "2025-01-11",
         "notes": "Co-present with P_001 device."},
        {"case_id": "CASE_VA_003", "person_id": "P_001", "role": "suspect",
         "confidence": 0.80, "assigned_date": "2025-01-13",
         "notes": "Third DC-area incident. Pattern confirmed."},
        {"case_id": "CASE_VA_003", "person_id": "P_002", "role": "suspect",
         "confidence": 0.80, "assigned_date": "2025-01-13",
         "notes": "Continued co-presence with P_001."},
        {"case_id": "CASE_DC_004", "person_id": "P_001", "role": "suspect",
         "confidence": 0.85, "assigned_date": "2025-01-14",
         "notes": "High-value target. Professional operation."},
        {"case_id": "CASE_DC_004", "person_id": "P_002", "role": "suspect",
         "confidence": 0.85, "assigned_date": "2025-01-14",
         "notes": "Consistent pattern with P_001."},
        {"case_id": "CASE_DC_001", "person_id": "P_001", "role": "suspect",
         "confidence": 0.90, "assigned_date": "2025-01-15",
         "notes": "PRIMARY INCIDENT. Device last seen before switch."},
        {"case_id": "CASE_DC_001", "person_id": "P_002", "role": "suspect",
         "confidence": 0.90, "assigned_date": "2025-01-15",
         "notes": "Co-present at primary incident. Continued after P_001 device went dark."},
        
        # Baltimore fence meetings
        {"case_id": "CASE_MD_001", "person_id": "P_001", "role": "suspect",
         "confidence": 0.70, "assigned_date": "2025-01-10",
         "notes": "Observed meeting with known fence P_003."},
        {"case_id": "CASE_MD_001", "person_id": "P_003", "role": "person_of_interest",
         "confidence": 0.95, "assigned_date": "2025-01-10",
         "notes": "Known fence. Receiving stolen goods suspected."},
        {"case_id": "CASE_MD_002", "person_id": "P_002", "role": "suspect",
         "confidence": 0.70, "assigned_date": "2025-01-15",
         "notes": "Second meeting with fence. Different suspect."},
        {"case_id": "CASE_MD_002", "person_id": "P_003", "role": "person_of_interest",
         "confidence": 0.95, "assigned_date": "2025-01-15",
         "notes": "Known fence. Multiple crew members making contact."},
        
        # ===== LOOKOUT (P_005) =====
        {"case_id": "CASE_DC_001", "person_id": "P_005", "role": "suspect",
         "confidence": 0.60, "assigned_date": "2025-01-16",
         "notes": "Device E_7823 detected in perimeter during incident. Possible lookout."},
        {"case_id": "CASE_DC_004", "person_id": "P_005", "role": "suspect",
         "confidence": 0.55, "assigned_date": "2025-01-15",
         "notes": "Device detected nearby during incident window."},
         
        # ===== MIDDLEMAN (P_006) =====
        {"case_id": "CASE_MD_001", "person_id": "P_006", "role": "person_of_interest",
         "confidence": 0.65, "assigned_date": "2025-01-11",
         "notes": "Device E_3341 present during fence meeting. May be intermediary."},
        {"case_id": "CASE_MD_002", "person_id": "P_006", "role": "person_of_interest",
         "confidence": 0.70, "assigned_date": "2025-01-16",
         "notes": "Second appearance at fence location. Role in network unclear."},
        
        # ===== VICTIMS =====
        {"case_id": "CASE_DC_001", "person_id": "V_001", "role": "victim",
         "confidence": 1.0, "assigned_date": "2025-01-15",
         "notes": "Property owner. $450,000 in jewelry reported stolen."},
        {"case_id": "CASE_TN_007", "person_id": "V_002", "role": "victim",
         "confidence": 1.0, "assigned_date": "2025-01-08",
         "notes": "Property owner. $320,000 in antiques reported stolen."},
        {"case_id": "CASE_VA_003", "person_id": "V_003", "role": "victim",
         "confidence": 1.0, "assigned_date": "2025-01-12",
         "notes": "Property owner. $180,000 in valuables reported stolen."},
         
        # ===== WITNESSES =====
        {"case_id": "CASE_DC_001", "person_id": "W_001", "role": "witness",
         "confidence": 1.0, "assigned_date": "2025-01-15",
         "notes": "Neighbor. Reported dark SUV at 2:15 AM. Partial plate obtained."},
        {"case_id": "CASE_DC_002", "person_id": "W_002", "role": "witness",
         "confidence": 1.0, "assigned_date": "2025-01-10",
         "notes": "Security guard. Observed two males leaving at 10:15 PM."},
         
        # ===== CLEARED INDIVIDUALS (False Positives - Important for Demo) =====
        {"case_id": "CASE_DC_001", "person_id": "C_001", "role": "cleared",
         "confidence": 0.0, "assigned_date": "2025-01-17",
         "notes": "CLEARED. Device E_5567 flagged but alibi verified - on shift at Georgetown Hospital."},
        {"case_id": "CASE_DC_002", "person_id": "C_002", "role": "cleared",
         "confidence": 0.0, "assigned_date": "2025-01-12",
         "notes": "CLEARED. Device E_9912 flagged - is local resident with established daily pattern."},
    ]
    
    schema = StructType([
        StructField("case_id", StringType(), False),
        StructField("person_id", StringType(), False),
        StructField("role", StringType(), False),
        StructField("confidence", DoubleType(), False),
        StructField("assigned_date", StringType(), True),
        StructField("notes", StringType(), True),
    ])
    
    return spark.createDataFrame(case_persons, schema)


# =============================================================================
# WARRANTS - Warrant requests and tracking
# =============================================================================

@dp.materialized_view(
    name="warrants_bronze",
    comment="Warrant requests linked to cases and suspects"
)
def warrants_bronze():
    """Generate warrant records for the investigation."""
    
    warrants = [
        # Arrest warrants for main suspects
        {
            "warrant_id": "WR_001",
            "warrant_type": "arrest",
            "case_id": "CASE_DC_001",
            "target_person_id": "P_001",
            "target_address": "1842 Rhode Island Ave NE, Washington DC",
            "requesting_agency": "DC Metropolitan Police",
            "requesting_officer": "Det. Sarah Mitchell",
            "badge_number": "MPD-4521",
            "submitted_date": "2025-01-16",
            "approved_date": "2025-01-17",
            "approving_judge": "Hon. Michael Chen",
            "court": "DC Superior Court",
            "expiration_date": "2025-02-17",
            "status": "approved",
            "priority": "high",
            "probable_cause_summary": """Marcus Williams (DOB: 1987-03-15) is wanted for Burglary in the First Degree. 
Device E_0412 registered to subject was detected at crime scene (CASE_DC_001) at 4521 Foxhall Rd NW 
during the burglary incident on 2025-01-15 at approximately 14:30. Same device detected at 5 prior 
burglary scenes across DC/Nashville. Subject has prior convictions for B&E (2021) and is currently 
on felony probation with travel restrictions violated. Subject believed to have switched to burner 
device E_7734 after incident to avoid detection.""",
            "charges": "Burglary First Degree, Probation Violation, Interstate Flight",
            "bail_recommendation": "No bail - flight risk",
            "armed_dangerous": True,
            "notes": "Subject known to use burner phones. May be armed. Last known location: Georgetown area."
        },
        {
            "warrant_id": "WR_002",
            "warrant_type": "arrest",
            "case_id": "CASE_DC_001",
            "target_person_id": "P_002",
            "target_address": "3421 Martin Luther King Jr Ave SE, Washington DC",
            "requesting_agency": "DC Metropolitan Police",
            "requesting_officer": "Det. Sarah Mitchell",
            "badge_number": "MPD-4521",
            "submitted_date": "2025-01-16",
            "approved_date": "2025-01-17",
            "approving_judge": "Hon. Michael Chen",
            "court": "DC Superior Court",
            "expiration_date": "2025-02-17",
            "status": "approved",
            "priority": "high",
            "probable_cause_summary": """Devon Carter (DOB: 1991-08-22) is wanted for Burglary in the First Degree.
Device E_1098 registered to subject was detected at crime scene (CASE_DC_001) co-located with 
known associate Marcus Williams. GPS monitoring (condition of parole) confirms multiple curfew 
violations and contact with co-defendant Williams in violation of parole conditions. Same device 
detected at 6 burglary scenes across DC/Nashville area.""",
            "charges": "Burglary First Degree, Parole Violation, Conspiracy",
            "bail_recommendation": "No bail - multiple parole violations",
            "armed_dangerous": False,
            "notes": "GPS ankle monitor may still be active. Known to drive dark-colored SUV."
        },
        # Search warrant for fence location
        {
            "warrant_id": "WR_003",
            "warrant_type": "search",
            "case_id": "CASE_MD_001",
            "target_person_id": "P_003",
            "target_address": "1500 Russell St, Baltimore MD",
            "requesting_agency": "Baltimore Police Department",
            "requesting_officer": "Det. James Rodriguez",
            "badge_number": "BPD-7892",
            "submitted_date": "2025-01-17",
            "approved_date": None,
            "approving_judge": None,
            "court": "Baltimore City Circuit Court",
            "expiration_date": None,
            "status": "pending",
            "priority": "medium",
            "probable_cause_summary": """Raymond Okonkwo (DOB: 1975-11-03) operates a suspected fencing operation 
at 1500 Russell St, Baltimore MD. Surveillance confirmed meetings with suspects P_001 and P_002 
on Jan 9 and Jan 14 respectively. Subject has prior convictions for fencing (2015, 2018) and is 
on federal supervised release. Items sought: stolen jewelry matching description from DC/Nashville 
burglary series, financial records, communication devices.""",
            "charges": "Receiving Stolen Property, Fencing",
            "bail_recommendation": None,
            "armed_dangerous": False,
            "notes": "Coordinate with DC Metro and Nashville PD. May require multi-jurisdiction task force."
        },
        # Geofence warrant for crime scene analysis
        {
            "warrant_id": "WR_004",
            "warrant_type": "geofence",
            "case_id": "CASE_DC_001",
            "target_person_id": None,
            "target_address": "4521 Foxhall Rd NW, Washington DC (H3: 892a1008003ffff)",
            "requesting_agency": "DC Metropolitan Police",
            "requesting_officer": "Det. Sarah Mitchell",
            "badge_number": "MPD-4521",
            "submitted_date": "2025-01-15",
            "approved_date": "2025-01-15",
            "approving_judge": "Hon. Lisa Park",
            "court": "DC Superior Court",
            "expiration_date": "2025-01-22",
            "status": "executed",
            "priority": "high",
            "probable_cause_summary": """Request for geofence data from Google/Apple for H3 cell 892a1008003ffff 
(Georgetown area) during time window 2025-01-15 14:00 to 15:00. Burglary reported at 4521 Foxhall Rd NW 
with estimated incident time 14:30. Seeking all device identifiers present in geofence to identify 
potential suspects and witnesses.""",
            "charges": "Investigative - Burglary First Degree",
            "bail_recommendation": None,
            "armed_dangerous": False,
            "notes": "Data received 2025-01-16. 50 devices identified in cell during window. Analysis complete."
        },
        # Tower dump warrant
        {
            "warrant_id": "WR_005",
            "warrant_type": "tower_dump",
            "case_id": "CASE_TN_007",
            "target_person_id": None,
            "target_address": "Cell Tower ID: TN-NASH-4412, Belle Meade area",
            "requesting_agency": "Nashville Metro Police",
            "requesting_officer": "Det. Robert Thompson",
            "badge_number": "MNPD-2234",
            "submitted_date": "2025-01-09",
            "approved_date": "2025-01-09",
            "approving_judge": "Hon. William Davis",
            "court": "Davidson County Criminal Court",
            "expiration_date": "2025-01-16",
            "status": "executed",
            "priority": "high",
            "probable_cause_summary": """Request for cell tower records from Verizon/AT&T/T-Mobile for tower 
TN-NASH-4412 covering Belle Meade residential area during burglary incident 2025-01-08 15:00-16:00. 
Seeking device connection records to identify suspects in residential burglary at 4501 Harding Pike.""",
            "charges": "Investigative - Burglary",
            "bail_recommendation": None,
            "armed_dangerous": False,
            "notes": "Cross-reference with DC geofence data revealed matching devices E_0412 and E_1098."
        },
        # Probation violation warrant
        {
            "warrant_id": "WR_006",
            "warrant_type": "probation_violation",
            "case_id": None,
            "target_person_id": "P_001",
            "target_address": "1842 Rhode Island Ave NE, Washington DC",
            "requesting_agency": "DC Pretrial Services Agency",
            "requesting_officer": "Officer James Martinez",
            "badge_number": "PSA-1147",
            "submitted_date": "2025-01-17",
            "approved_date": "2025-01-17",
            "approving_judge": "Hon. Michael Chen",
            "court": "DC Superior Court",
            "expiration_date": None,
            "status": "approved",
            "priority": "high",
            "probable_cause_summary": """Marcus Williams violated conditions of felony probation:
1. Failed to report out-of-state travel to Nashville, TN (Jan 6-8, 2025)
2. Association with known felon Devon Carter (P_002) - multiple documented contacts
3. Failed to maintain employment as required
4. Missed scheduled check-in on Jan 15, 2025
Recommend immediate revocation of probation and remand to custody.""",
            "charges": "Probation Violation",
            "bail_recommendation": "Remand - probation revocation",
            "armed_dangerous": True,
            "notes": "Coordinate with arrest warrant WR_001."
        },
        # Arrest warrant for lookout
        {
            "warrant_id": "WR_007",
            "warrant_type": "arrest",
            "case_id": "CASE_DC_001",
            "target_person_id": "P_005",
            "target_address": "2215 Benning Rd NE, Washington DC",
            "requesting_agency": "DC Metropolitan Police",
            "requesting_officer": "Det. Sarah Mitchell",
            "badge_number": "MPD-4521",
            "submitted_date": "2025-01-18",
            "approved_date": None,
            "approving_judge": None,
            "court": "DC Superior Court",
            "expiration_date": None,
            "status": "draft",
            "priority": "medium",
            "probable_cause_summary": """Terrence Jackson (DOB: 1989-06-12) suspected of acting as lookout 
for burglary crew. Device E_7823 detected in perimeter of crime scenes during CASE_DC_001 and 
CASE_DC_004. Not detected inside properties but consistent presence suggests coordination. 
Subject currently on misdemeanor probation for assault.""",
            "charges": "Conspiracy to Commit Burglary",
            "bail_recommendation": "$25,000",
            "armed_dangerous": False,
            "notes": "Lower priority - gather additional evidence before submission."
        }
    ]
    
    schema = StructType([
        StructField("warrant_id", StringType(), False),
        StructField("warrant_type", StringType(), False),
        StructField("case_id", StringType(), True),
        StructField("target_person_id", StringType(), True),
        StructField("target_address", StringType(), True),
        StructField("requesting_agency", StringType(), False),
        StructField("requesting_officer", StringType(), False),
        StructField("badge_number", StringType(), True),
        StructField("submitted_date", StringType(), True),
        StructField("approved_date", StringType(), True),
        StructField("approving_judge", StringType(), True),
        StructField("court", StringType(), True),
        StructField("expiration_date", StringType(), True),
        StructField("status", StringType(), False),
        StructField("priority", StringType(), True),
        StructField("probable_cause_summary", StringType(), True),
        StructField("charges", StringType(), True),
        StructField("bail_recommendation", StringType(), True),
        StructField("armed_dangerous", BooleanType(), True),
        StructField("notes", StringType(), True),
    ])
    
    return spark.createDataFrame(warrants, schema)


@dp.materialized_view(
    name="warrant_evidence_bronze",
    comment="Evidence items supporting warrant applications"
)
def warrant_evidence_bronze():
    """Generate evidence records linked to warrants."""
    
    evidence = [
        # Evidence for WR_001 (Arrest warrant for P_001)
        {"evidence_id": "EV_001", "warrant_id": "WR_001", "evidence_type": "device_location",
         "description": "Device E_0412 detected at CASE_DC_001 crime scene (H3: 892a1008003ffff) on 2025-01-15 14:30",
         "source_table": "location_events_silver", "confidence": 0.95, "weight": 0.30},
        {"evidence_id": "EV_002", "warrant_id": "WR_001", "evidence_type": "cross_jurisdiction",
         "description": "Same device E_0412 detected at 5 additional burglary scenes in DC and Nashville",
         "source_table": "entity_case_overlap", "confidence": 0.92, "weight": 0.25},
        {"evidence_id": "EV_003", "warrant_id": "WR_001", "evidence_type": "co_presence",
         "description": "Device E_0412 consistently co-located with E_1098 (known associate Devon Carter)",
         "source_table": "co_presence_edges", "confidence": 0.95, "weight": 0.15},
        {"evidence_id": "EV_004", "warrant_id": "WR_001", "evidence_type": "probation_violation",
         "description": "Subject on felony probation violated travel restrictions (Nashville Jan 6-8)",
         "source_table": "persons_silver", "confidence": 1.0, "weight": 0.20},
        {"evidence_id": "EV_005", "warrant_id": "WR_001", "evidence_type": "device_handoff",
         "description": "Device E_0412 went dark at 14:45, burner E_7734 appeared same location - suspected switch",
         "source_table": "handoff_candidates", "confidence": 0.85, "weight": 0.10},
        
        # Evidence for WR_002 (Arrest warrant for P_002)
        {"evidence_id": "EV_006", "warrant_id": "WR_002", "evidence_type": "device_location",
         "description": "Device E_1098 detected at CASE_DC_001 crime scene co-located with E_0412",
         "source_table": "location_events_silver", "confidence": 0.95, "weight": 0.30},
        {"evidence_id": "EV_007", "warrant_id": "WR_002", "evidence_type": "cross_jurisdiction",
         "description": "Device E_1098 detected at 6 burglary scenes across DC and Nashville",
         "source_table": "entity_case_overlap", "confidence": 0.92, "weight": 0.25},
        {"evidence_id": "EV_008", "warrant_id": "WR_002", "evidence_type": "parole_violation",
         "description": "GPS monitoring shows curfew violations on Jan 6, 8, 10, 12, 13, 15",
         "source_table": "persons_silver", "confidence": 1.0, "weight": 0.25},
        {"evidence_id": "EV_009", "warrant_id": "WR_002", "evidence_type": "parole_violation",
         "description": "Contact with co-defendant P_001 in violation of parole conditions",
         "source_table": "co_presence_edges", "confidence": 0.98, "weight": 0.20},
        
        # Evidence for WR_003 (Search warrant for fence)
        {"evidence_id": "EV_010", "warrant_id": "WR_003", "evidence_type": "surveillance",
         "description": "Subject P_003 observed meeting with P_001 at 1500 Russell St on Jan 9",
         "source_table": "person_social_edges_silver", "confidence": 0.85, "weight": 0.35},
        {"evidence_id": "EV_011", "warrant_id": "WR_003", "evidence_type": "surveillance",
         "description": "Subject P_003 observed meeting with P_002 at 1500 Russell St on Jan 14",
         "source_table": "person_social_edges_silver", "confidence": 0.80, "weight": 0.30},
        {"evidence_id": "EV_012", "warrant_id": "WR_003", "evidence_type": "prior_convictions",
         "description": "Subject has 2 prior convictions for fencing stolen goods (2015, 2018)",
         "source_table": "persons_silver", "confidence": 1.0, "weight": 0.20},
        {"evidence_id": "EV_013", "warrant_id": "WR_003", "evidence_type": "informant_tip",
         "description": "Confidential informant reports subject actively buying stolen jewelry",
         "source_table": None, "confidence": 0.70, "weight": 0.15},
        
        # Evidence for WR_006 (Probation violation)
        {"evidence_id": "EV_014", "warrant_id": "WR_006", "evidence_type": "travel_violation",
         "description": "Device E_0412 detected in Nashville Jan 6-8 without travel permission",
         "source_table": "location_events_silver", "confidence": 0.98, "weight": 0.40},
        {"evidence_id": "EV_015", "warrant_id": "WR_006", "evidence_type": "association_violation",
         "description": "Multiple documented contacts with known felon P_002 (Carter)",
         "source_table": "co_presence_edges", "confidence": 0.95, "weight": 0.35},
        {"evidence_id": "EV_016", "warrant_id": "WR_006", "evidence_type": "missed_checkin",
         "description": "Failed to appear for scheduled check-in on 2025-01-15",
         "source_table": "persons_silver", "confidence": 1.0, "weight": 0.25},
    ]
    
    schema = StructType([
        StructField("evidence_id", StringType(), False),
        StructField("warrant_id", StringType(), False),
        StructField("evidence_type", StringType(), False),
        StructField("description", StringType(), False),
        StructField("source_table", StringType(), True),
        StructField("confidence", DoubleType(), False),
        StructField("weight", DoubleType(), False),
    ])
    
    return spark.createDataFrame(evidence, schema)


@dp.materialized_view(
    name="person_social_edges_bronze",
    comment="Person-to-person social network relationships"
)
def person_social_edges_bronze():
    """Generate person-to-person social network edges."""
    
    edges = [
        {"edge_id": "PSE_001", "person_id_1": "P_001", "person_id_2": "P_002",
         "relationship_type": "known_associate", "weight": 0.95,
         "source": "prior_arrest_record", "confidence": 0.98,
         "notes": "Co-arrested in 2020 B&E case. Childhood friends per informant."},
        {"edge_id": "PSE_002", "person_id_1": "P_001", "person_id_2": "P_003",
         "relationship_type": "criminal_associate", "weight": 0.75,
         "source": "surveillance", "confidence": 0.85,
         "notes": "Observed meeting at fence location Jan 9. Suspected goods exchange."},
        {"edge_id": "PSE_003", "person_id_1": "P_002", "person_id_2": "P_003",
         "relationship_type": "criminal_associate", "weight": 0.65,
         "source": "surveillance", "confidence": 0.80,
         "notes": "Observed meeting at fence location Jan 14. Establishing own contact."},
        {"edge_id": "PSE_004", "person_id_1": "P_001", "person_id_2": "P_004",
         "relationship_type": "suspected_same_person", "weight": 0.90,
         "source": "device_analysis", "confidence": 0.85,
         "notes": "P_004 is placeholder for burner user. High likelihood same as P_001."},
        # Lookout connections
        {"edge_id": "PSE_005", "person_id_1": "P_001", "person_id_2": "P_005",
         "relationship_type": "known_associate", "weight": 0.70,
         "source": "surveillance", "confidence": 0.75,
         "notes": "T-Bone observed near crime scenes during incidents. Suspected lookout role."},
        {"edge_id": "PSE_006", "person_id_1": "P_002", "person_id_2": "P_005",
         "relationship_type": "known_associate", "weight": 0.65,
         "source": "social_media", "confidence": 0.70,
         "notes": "Social media connections. Same neighborhood in SE DC."},
        # Middleman connections
        {"edge_id": "PSE_007", "person_id_1": "P_003", "person_id_2": "P_006",
         "relationship_type": "business_associate", "weight": 0.80,
         "source": "surveillance", "confidence": 0.85,
         "notes": "Slim frequently seen at Ray-O's location. May facilitate introductions."},
        {"edge_id": "PSE_008", "person_id_1": "P_001", "person_id_2": "P_006",
         "relationship_type": "criminal_associate", "weight": 0.55,
         "source": "informant", "confidence": 0.60,
         "notes": "Informant indicates Slim introduced Ghost to Ray-O."},
    ]
    
    schema = StructType([
        StructField("edge_id", StringType(), False),
        StructField("person_id_1", StringType(), False),
        StructField("person_id_2", StringType(), False),
        StructField("relationship_type", StringType(), False),
        StructField("weight", DoubleType(), False),
        StructField("source", StringType(), False),
        StructField("confidence", DoubleType(), False),
        StructField("notes", StringType(), True),
    ])
    
    return spark.createDataFrame(edges, schema)


@dp.materialized_view(
    name="social_edges_bronze",
    comment="Device-level social network edges (for backwards compatibility)"
)
def social_edges_bronze():
    """Generate device-level social network edges."""
    
    edges = [
        # Primary suspect relationship
        {"edge_id": "SOC_001", "entity_id_1": "E_0412", "entity_id_2": "E_1098", 
         "relationship_type": "known_associate", "weight": 0.9, 
         "source": "prior_arrest_record", "confidence": 0.95},
        
        # Fence connections
        {"edge_id": "SOC_002", "entity_id_1": "E_0412", "entity_id_2": "E_9901",
         "relationship_type": "fence_connection", "weight": 0.7,
         "source": "surveillance_intel", "confidence": 0.80},
        {"edge_id": "SOC_003", "entity_id_1": "E_1098", "entity_id_2": "E_9901",
         "relationship_type": "fence_connection", "weight": 0.5,
         "source": "informant_tip", "confidence": 0.65},
        
        # Burner phone connection (established after switch is detected)
        {"edge_id": "SOC_004", "entity_id_1": "E_7734", "entity_id_2": "E_1098",
         "relationship_type": "known_associate", "weight": 0.85,
         "source": "copresence_analysis", "confidence": 0.90},
        
        # Implied: Burner is same person as Suspect 1
        {"edge_id": "SOC_005", "entity_id_1": "E_7734", "entity_id_2": "E_0412",
         "relationship_type": "device_succession", "weight": 0.95,
         "source": "handoff_detection", "confidence": 0.92},
        
        # Some noise edges
        {"edge_id": "SOC_006", "entity_id_1": "E_9901", "entity_id_2": "E_8822",
         "relationship_type": "known_associate", "weight": 0.4,
         "source": "phone_records", "confidence": 0.55},
    ]
    
    schema = StructType([
        StructField("edge_id", StringType(), False),
        StructField("entity_id_1", StringType(), False),
        StructField("entity_id_2", StringType(), False),
        StructField("relationship_type", StringType(), False),
        StructField("weight", DoubleType(), False),
        StructField("source", StringType(), False),
        StructField("confidence", DoubleType(), False),
    ])
    
    return spark.createDataFrame(edges, schema)


# =============================================================================
# SILVER LAYER: Cleaned and Enriched Data
# =============================================================================

@dp.materialized_view(
    name="location_events_silver",
    comment="Cleaned location events with proper timestamps and enrichment"
)
@dp.expect_or_drop("valid_entity_id", "entity_id IS NOT NULL AND LENGTH(entity_id) > 0")
@dp.expect_or_drop("valid_coordinates", "latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180")
@dp.expect_or_drop("valid_h3_cell", "h3_cell IS NOT NULL AND LENGTH(h3_cell) = 15")
def location_events_silver():
    """Clean and enrich location events."""
    return (
        dp.read("location_events_bronze")
        .withColumn("event_timestamp", F.to_timestamp("timestamp"))
        .withColumn("time_bucket_ts", F.to_timestamp("time_bucket"))
        .withColumn("bucket_date", F.to_date("time_bucket"))
        .withColumn("bucket_hour", F.hour("time_bucket_ts"))
        .withColumn("bucket_minute", F.minute("time_bucket_ts"))
        .withColumn("day_of_week", F.dayofweek("time_bucket_ts"))
        .withColumn("is_night", 
                    (F.hour("time_bucket_ts") < 6) | (F.hour("time_bucket_ts") >= 22))
        .withColumn("ingestion_timestamp", F.current_timestamp())
        .drop("timestamp")
    )


@dp.materialized_view(
    name="cases_silver",
    comment="Cleaned case data with time windows"
)
@dp.expect_or_drop("valid_case_id", "case_id IS NOT NULL")
@dp.expect_or_drop("valid_case_type", "case_type IS NOT NULL")
def cases_silver():
    """Clean and enrich case data."""
    return (
        dp.read("cases_bronze")
        .withColumn("incident_start_ts", F.to_timestamp("incident_start"))
        .withColumn("incident_end_ts", F.to_timestamp("incident_end"))
        .withColumn("incident_bucket_ts", F.to_timestamp("incident_time_bucket"))
        .withColumn("target_items_array", F.split("target_items", ","))
        .withColumn("moe_category", 
                    F.when(F.col("method_of_entry").contains("window"), "window_entry")
                     .when(F.col("method_of_entry").contains("door"), "door_entry")
                     .otherwise("other"))
        .withColumn("ingestion_timestamp", F.current_timestamp())
    )


@dp.materialized_view(
    name="social_edges_silver",
    comment="Cleaned device-level social network edges"
)
@dp.expect_or_drop("valid_entities", "entity_id_1 IS NOT NULL AND entity_id_2 IS NOT NULL")
@dp.expect_or_drop("valid_weight", "weight BETWEEN 0 AND 1")
def social_edges_silver():
    """Clean device-level social edges."""
    return (
        dp.read("social_edges_bronze")
        .withColumn("is_high_confidence", F.col("confidence") >= 0.75)
        .withColumn("ingestion_timestamp", F.current_timestamp())
    )


@dp.materialized_view(
    name="persons_silver",
    comment="Cleaned and enriched person records"
)
def persons_silver():
    """Clean and enrich person data."""
    return (
        dp.read("persons_bronze")
        .withColumn("dob_date", F.to_date("dob"))
        .withColumn("is_high_risk", F.col("risk_level") == "high")
        .withColumn("is_suspect", F.col("role").isin(["primary_suspect", "suspect"]))
        .withColumn("ingestion_timestamp", F.current_timestamp())
    )


@dp.materialized_view(
    name="person_device_links_silver",
    comment="Cleaned person-device relationships"
)
def person_device_links_silver():
    """Clean and enrich person-device links."""
    return (
        dp.read("person_device_links_bronze")
        .withColumn("valid_from_ts", F.to_timestamp("valid_from"))
        .withColumn("valid_to_ts", F.to_timestamp("valid_to"))
        .withColumn("is_current", F.col("valid_to").isNull())
        .withColumn("is_confirmed", F.col("confidence") >= 0.85)
        .withColumn("ingestion_timestamp", F.current_timestamp())
    )


@dp.materialized_view(
    name="case_persons_silver",
    comment="Cleaned case-person suspect assignments"
)
def case_persons_silver():
    """Clean and enrich case-person links."""
    return (
        dp.read("case_persons_bronze")
        .withColumn("assigned_date_ts", F.to_date("assigned_date"))
        .withColumn("is_primary_suspect", 
                    (F.col("role") == "suspect") & (F.col("confidence") >= 0.80))
        .withColumn("ingestion_timestamp", F.current_timestamp())
    )


@dp.materialized_view(
    name="person_social_edges_silver",
    comment="Cleaned person-to-person social network"
)
def person_social_edges_silver():
    """Clean person-level social edges."""
    return (
        dp.read("person_social_edges_bronze")
        .withColumn("is_high_confidence", F.col("confidence") >= 0.75)
        .withColumn("is_criminal_link", 
                    F.col("relationship_type").isin(["criminal_associate", "fence_connection"]))
        .withColumn("ingestion_timestamp", F.current_timestamp())
    )


# =============================================================================
# GOLD LAYER: Computed Analytics Tables
# =============================================================================

@dp.materialized_view(
    name="co_presence_edges",
    comment="Entity co-presence edges computed from location events"
)
def co_presence_edges():
    """
    Compute co-presence edges: entities that appear in the same H3 cell 
    during the same time bucket.
    
    Weighted by frequency of co-occurrence.
    """
    events = dp.read("location_events_silver")
    
    # Self-join to find co-present entities
    e1 = events.alias("e1")
    e2 = events.alias("e2")
    
    copresence = (
        e1.join(
            e2,
            (F.col("e1.h3_cell") == F.col("e2.h3_cell")) &
            (F.col("e1.time_bucket") == F.col("e2.time_bucket")) &
            (F.col("e1.entity_id") < F.col("e2.entity_id")),  # Avoid duplicates
            "inner"
        )
        .groupBy(
            F.col("e1.entity_id").alias("entity_id_1"),
            F.col("e2.entity_id").alias("entity_id_2"),
            F.col("e1.h3_cell").alias("h3_cell"),
            F.col("e1.city").alias("city"),
            F.col("e1.state").alias("state")
        )
        .agg(
            F.count("*").alias("co_occurrence_count"),
            F.collect_set("e1.time_bucket").alias("time_buckets"),
            F.min("e1.time_bucket_ts").alias("first_seen_together"),
            F.max("e1.time_bucket_ts").alias("last_seen_together")
        )
        .withColumn("time_bucket_count", F.size("time_buckets"))
        .withColumn("weight", 
                    F.least(F.lit(1.0), F.col("co_occurrence_count") / F.lit(5.0)))
        .withColumn("edge_id", 
                    F.concat_ws("_", F.lit("COP"), 
                               F.col("entity_id_1"), F.col("entity_id_2")))
    )
    
    return copresence


@dp.materialized_view(
    name="entity_case_overlap",
    comment="Entities linked to case time/location windows"
)
def entity_case_overlap():
    """
    Link entities to cases where they were present during the incident window.
    """
    events = dp.read("location_events_silver")
    cases = dp.read("cases_silver")
    
    # Join events to cases on h3_cell and time_bucket
    overlap = (
        events.join(
            cases,
            (events.h3_cell == cases.h3_cell) &
            (events.time_bucket == cases.incident_time_bucket),
            "inner"
        )
        .select(
            events.entity_id,
            cases.case_id,
            cases.case_type,
            cases.city,
            cases.state,
            events.h3_cell,
            events.time_bucket,
            events.event_timestamp,
            cases.incident_start_ts,
            cases.incident_end_ts
        )
        .withColumn("overlap_score", F.lit(1.0))
        .withColumn("in_exact_window",
                    (F.col("event_timestamp") >= F.col("incident_start_ts")) &
                    (F.col("event_timestamp") <= F.col("incident_end_ts")))
    )
    
    return overlap


@dp.materialized_view(
    name="suspect_rankings",
    comment="Ranked list of suspects per case based on multi-factor scoring"
)
def suspect_rankings():
    """
    Rank entities as suspects based on:
    - Recurrence across burglary windows
    - Co-presence edge weight with other high-scorers
    - Cross-jurisdiction appearance
    """
    entity_case = dp.read("entity_case_overlap")
    copresence = dp.read("co_presence_edges")
    social = dp.read("social_edges_silver")
    
    # Count cases per entity
    entity_case_counts = (
        entity_case
        .filter(F.col("case_type") == "burglary")
        .groupBy("entity_id")
        .agg(
            F.count("case_id").alias("case_count"),
            F.countDistinct("case_id").alias("unique_cases"),
            F.countDistinct("state").alias("states_count"),
            F.collect_set("case_id").alias("linked_cases"),
            F.collect_set("city").alias("linked_cities")
        )
    )
    
    # Sum co-presence weights per entity
    copresence_scores = (
        copresence
        .groupBy(F.col("entity_id_1").alias("entity_id"))
        .agg(F.sum("weight").alias("copresence_weight"))
    ).union(
        copresence
        .groupBy(F.col("entity_id_2").alias("entity_id"))
        .agg(F.sum("weight").alias("copresence_weight"))
    ).groupBy("entity_id").agg(
        F.sum("copresence_weight").alias("total_copresence_weight")
    )
    
    # Sum social edge weights per entity
    social_scores = (
        social
        .groupBy(F.col("entity_id_1").alias("entity_id"))
        .agg(F.sum("weight").alias("social_weight"))
    ).union(
        social
        .groupBy(F.col("entity_id_2").alias("entity_id"))
        .agg(F.sum("weight").alias("social_weight"))
    ).groupBy("entity_id").agg(F.sum("social_weight").alias("total_social_weight"))
    
    # Combine scores
    rankings = (
        entity_case_counts
        .join(copresence_scores, "entity_id", "left")
        .join(social_scores, "entity_id", "left")
        .fillna(0, subset=["total_copresence_weight", "total_social_weight"])
        .withColumn("recurrence_score", 
                    F.col("unique_cases") * 0.4)
        .withColumn("cross_jurisdiction_score",
                    F.when(F.col("states_count") > 1, 0.35).otherwise(0.0))
        .withColumn("network_score",
                    F.least(F.lit(0.25), F.col("total_copresence_weight") * 0.1 + 
                           F.col("total_social_weight") * 0.15))
        .withColumn("total_score",
                    F.col("recurrence_score") + 
                    F.col("cross_jurisdiction_score") + 
                    F.col("network_score"))
        .withColumn("rank", F.dense_rank().over(
            Window.orderBy(F.desc("total_score"))))
    )
    
    return rankings


@dp.materialized_view(
    name="handoff_candidates",
    comment="Potential burner phone switches based on entity disappearance/appearance patterns"
)
def handoff_candidates():
    """
    Detect potential device handoffs:
    - Old entity disappears after time bucket T
    - New entity appears at time bucket T+1 in the same cell
    - New entity continues pattern with original partner
    
    Scoring based on:
    - Spatial proximity (same H3 cell)
    - Temporal adjacency (consecutive 15-min buckets)
    - Shared neighbors (continues with same partner)
    """
    events = dp.read("location_events_silver")
    copresence = dp.read("co_presence_edges")
    
    # Get last seen time per entity per cell
    last_seen = (
        events
        .groupBy("entity_id", "h3_cell")
        .agg(
            F.max("time_bucket").alias("last_bucket"),
            F.max("time_bucket_ts").alias("last_seen_ts")
        )
    )
    
    # Get first seen time per entity per cell
    first_seen = (
        events
        .groupBy("entity_id", "h3_cell")
        .agg(
            F.min("time_bucket").alias("first_bucket"),
            F.min("time_bucket_ts").alias("first_seen_ts")
        )
    )
    
    # Find pairs where:
    # - Entity A's last seen is immediately before Entity B's first seen
    # - Same H3 cell
    handoffs = (
        last_seen.alias("old")
        .join(
            first_seen.alias("new"),
            (F.col("old.h3_cell") == F.col("new.h3_cell")) &
            (F.col("old.entity_id") != F.col("new.entity_id")),
            "inner"
        )
        # Check temporal adjacency (within 1 bucket = 15 minutes)
        .withColumn("time_diff_minutes",
                    (F.unix_timestamp("new.first_seen_ts") - 
                     F.unix_timestamp("old.last_seen_ts")) / 60)
        .filter(
            (F.col("time_diff_minutes") > 0) & 
            (F.col("time_diff_minutes") <= 30)  # Allow up to 2 buckets gap
        )
        .select(
            F.col("old.entity_id").alias("old_entity_id"),
            F.col("new.entity_id").alias("new_entity_id"),
            F.col("old.h3_cell").alias("h3_cell"),
            F.col("old.last_bucket").alias("old_last_bucket"),
            F.col("new.first_bucket").alias("new_first_bucket"),
            F.col("time_diff_minutes")
        )
    )
    
    # Get partners of old entities (from co-presence)
    old_partners = (
        copresence
        .select(
            F.col("entity_id_1").alias("entity_id"),
            F.col("entity_id_2").alias("partner_id"),
            F.col("weight").alias("partner_weight")
        )
    ).union(
        copresence
        .select(
            F.col("entity_id_2").alias("entity_id"),
            F.col("entity_id_1").alias("partner_id"),
            F.col("weight").alias("partner_weight")
        )
    )
    
    # Get partners of new entities
    new_partners = old_partners.alias("new_partners")
    
    # Find handoffs where new entity continues with old entity's partner
    handoffs_with_partners = (
        handoffs.alias("h")
        .join(
            old_partners.alias("op"),
            F.col("h.old_entity_id") == F.col("op.entity_id"),
            "left"
        )
        .join(
            new_partners.alias("np"),
            (F.col("h.new_entity_id") == F.col("np.entity_id")) &
            (F.col("op.partner_id") == F.col("np.partner_id")),
            "left"
        )
        .groupBy(
            "h.old_entity_id", "h.new_entity_id", "h.h3_cell",
            "h.old_last_bucket", "h.new_first_bucket", "h.time_diff_minutes"
        )
        .agg(
            F.count("np.partner_id").alias("shared_partner_count"),
            F.collect_set("np.partner_id").alias("shared_partners"),
            F.avg("np.partner_weight").alias("avg_partner_weight")
        )
    )
    
    # Calculate handoff score
    handoff_scored = (
        handoffs_with_partners
        .withColumn("spatial_score", F.lit(0.5))  # Same cell = full spatial score
        .withColumn("temporal_score",
                    F.when(F.col("time_diff_minutes") <= 15, 0.3)  # Immediate switch
                     .when(F.col("time_diff_minutes") <= 30, 0.2)   # 1-bucket gap
                     .otherwise(0.1))
        .withColumn("partner_score",
                    F.when(F.col("shared_partner_count") > 0, 0.2)
                     .otherwise(0.0))
        .withColumn("handoff_score",
                    F.col("spatial_score") + 
                    F.col("temporal_score") + 
                    F.col("partner_score"))
        .withColumn("rank", F.dense_rank().over(
            Window.orderBy(F.desc("handoff_score"))))
        .withColumnRenamed("h.old_entity_id", "old_entity_id")
        .withColumnRenamed("h.new_entity_id", "new_entity_id")
        .withColumnRenamed("h.h3_cell", "h3_cell")
        .withColumnRenamed("h.old_last_bucket", "old_last_bucket")
        .withColumnRenamed("h.new_first_bucket", "new_first_bucket")
        .withColumnRenamed("h.time_diff_minutes", "time_diff_minutes")
    )
    
    return handoff_scored


@dp.materialized_view(
    name="cell_device_counts",
    comment="Aggregated device counts per H3 cell and time bucket for heatmap"
)
def cell_device_counts():
    """
    Aggregate device counts per H3 cell and time bucket.
    Used by the Heatmap Dashboard for the "noise fades" visualization.
    """
    events = dp.read("location_events_silver")
    
    return (
        events
        .groupBy("h3_cell", "time_bucket", "city", "state")
        .agg(
            F.countDistinct("entity_id").alias("device_count"),
            F.collect_set("entity_id").alias("entity_ids"),
            F.avg("latitude").alias("center_lat"),
            F.avg("longitude").alias("center_lon"),
            F.min("event_timestamp").alias("first_event"),
            F.max("event_timestamp").alias("last_event")
        )
        .withColumn("is_high_activity", F.col("device_count") >= 20)
        .withColumn("activity_category",
                    F.when(F.col("device_count") >= 40, "very_high")
                     .when(F.col("device_count") >= 20, "high")
                     .when(F.col("device_count") >= 10, "medium")
                     .otherwise("low"))
    )


@dp.materialized_view(
    name="suspect_persons",
    comment="Enriched suspect rankings with human-readable person details"
)
def suspect_persons():
    """
    Join device-based suspect rankings with person information
    to create human-readable suspect profiles.
    """
    rankings = dp.read("suspect_rankings")
    device_links = dp.read("person_device_links_silver").alias("dl")
    persons = dp.read("persons_silver").alias("p")
    
    # Join rankings to persons via device links
    suspect_profiles = (
        rankings.alias("r")
        .join(device_links, F.col("r.entity_id") == F.col("dl.device_id"), "left")
        .join(persons, F.col("dl.person_id") == F.col("p.person_id"), "left")
        .select(
            F.col("r.entity_id").alias("device_id"),
            F.col("p.person_id"),
            F.col("p.display_name"),
            F.col("p.first_name"),
            F.col("p.last_name"),
            F.col("p.alias"),
            F.col("p.criminal_history"),
            F.col("p.notes").alias("person_notes"),
            F.col("p.risk_level"),
            F.col("r.rank").alias("device_rank"),
            F.col("r.total_score"),
            F.col("r.unique_cases"),
            F.col("r.states_count"),
            F.col("r.linked_cases"),
            F.col("r.linked_cities"),
            F.col("dl.relationship").alias("device_relationship"),
            F.col("dl.confidence").alias("device_confidence")
        )
    )
    
    return suspect_profiles


@dp.materialized_view(
    name="case_suspect_summary",
    comment="Cases with linked suspects and their person details"
)
def case_suspect_summary():
    """
    Create a summary of each case with its linked suspects,
    including human-readable names and evidence.
    """
    cases = dp.read("cases_silver").alias("c")
    case_persons = dp.read("case_persons_silver").alias("cp")
    persons = dp.read("persons_silver").alias("p")
    
    # Join cases to persons via case_persons
    case_summary = (
        cases
        .join(case_persons, F.col("c.case_id") == F.col("cp.case_id"), "left")
        .join(persons, F.col("cp.person_id") == F.col("p.person_id"), "left")
        .select(
            F.col("c.case_id"),
            F.col("c.case_type"),
            F.col("c.city"),
            F.col("c.state"),
            F.col("c.incident_time_bucket"),
            F.col("c.estimated_loss"),
            F.col("c.method_of_entry"),
            F.col("cp.person_id"),
            F.col("p.display_name"),
            F.col("p.alias"),
            F.col("cp.role").alias("suspect_role"),
            F.col("cp.confidence").alias("suspect_confidence"),
            F.col("cp.notes").alias("assignment_notes")
        )
    )
    
    return case_summary


@dp.materialized_view(
    name="evidence_card_data",
    comment="Pre-computed evidence data for the Agentic Investigation feature"
)
def evidence_card_data():
    """
    Pre-compute evidence for the top suspects, combining:
    - Person details (human-readable names)
    - Geospatial evidence (co-presence at crime scenes)
    - Social evidence (network connections)
    """
    rankings = dp.read("suspect_rankings")
    entity_case = dp.read("entity_case_overlap")
    cases = dp.read("cases_silver")
    device_links = dp.read("person_device_links_silver").alias("dl")
    persons = dp.read("persons_silver").alias("p")
    
    # Get top 10 suspects
    top_suspects = rankings.filter(F.col("rank") <= 10).alias("ts")
    
    # Add person information
    suspects_with_persons = (
        top_suspects
        .join(device_links, F.col("ts.entity_id") == F.col("dl.device_id"), "left")
        .join(persons, F.col("dl.person_id") == F.col("p.person_id"), "left")
        .select(
            F.col("ts.entity_id"),
            F.col("p.person_id"),
            F.col("p.display_name"),
            F.col("p.alias"),
            F.col("p.criminal_history"),
            F.col("p.risk_level"),
            F.col("ts.rank"),
            F.col("ts.total_score"),
            F.col("ts.linked_cases"),
            F.col("ts.linked_cities"),
            F.col("ts.states_count")
        )
    ).alias("swp")
    
    # Geospatial evidence: which cases are entities linked to
    geo_evidence = (
        entity_case
        .join(rankings.filter(F.col("rank") <= 10).select("entity_id"), "entity_id")
        .join(cases.select("case_id", "case_type", F.col("city").alias("case_city"), 
                          "address", "method_of_entry"), "case_id")
        .groupBy("entity_id")
        .agg(
            F.collect_list(
                F.struct(
                    F.col("case_id"),
                    F.col("case_city"),
                    F.col("address"),
                    F.col("h3_cell"),
                    F.col("time_bucket")
                )
            ).alias("geo_evidence")
        )
    ).alias("ge")
    
    # Combine all evidence
    evidence = (
        suspects_with_persons
        .join(geo_evidence, F.col("swp.entity_id") == F.col("ge.entity_id"), "left")
        .select(
            F.col("swp.entity_id").alias("device_id"),
            F.col("swp.person_id"),
            F.col("swp.display_name"),
            F.col("swp.alias"),
            F.col("swp.criminal_history"),
            F.col("swp.risk_level"),
            F.col("swp.rank"),
            F.col("swp.total_score"),
            F.col("swp.linked_cases"),
            F.col("swp.linked_cities"),
            F.col("swp.states_count"),
            F.col("ge.geo_evidence")
        )
    )
    
    return evidence


@dp.materialized_view(
    name="investigation_dashboard",
    comment="Comprehensive suspect data for app rendering with all linked information"
)
def investigation_dashboard():
    """
    Create the main investigation dashboard view that combines:
    - Person details (human-readable)
    - Device information
    - Case assignments
    - Social network connections
    - Evidence summary
    
    This is the primary table for rendering the investigation app UI.
    """
    persons = dp.read("persons_silver").alias("p")
    device_links = dp.read("person_device_links_silver").alias("dl")
    case_persons = dp.read("case_persons_silver").alias("cp")
    person_social = dp.read("person_social_edges_silver").alias("ps")
    cases = dp.read("cases_silver").alias("c")
    rankings = dp.read("suspect_rankings").alias("r")
    
    # Get all devices per person
    person_devices = (
        device_links
        .groupBy("person_id")
        .agg(
            F.collect_list(
                F.struct(
                    F.col("device_id"),
                    F.col("relationship"),
                    F.col("confidence"),
                    F.col("valid_from"),
                    F.col("valid_to"),
                    F.col("notes").alias("device_notes")
                )
            ).alias("devices")
        )
    ).alias("pd")
    
    # Get all case assignments per person with case details
    person_cases = (
        case_persons
        .join(cases.select(
            F.col("case_id"),
            F.col("case_type"),
            F.col("city").alias("case_city"),
            F.col("state").alias("case_state"),
            F.col("incident_time_bucket"),
            F.col("estimated_loss"),
            F.col("address").alias("case_address")
        ), "case_id")
        .groupBy(F.col("cp.person_id").alias("person_id"))
        .agg(
            F.collect_list(
                F.struct(
                    F.col("case_id"),
                    F.col("case_type"),
                    F.col("case_city"),
                    F.col("case_state"),
                    F.col("incident_time_bucket"),
                    F.col("estimated_loss"),
                    F.col("cp.role").alias("case_role"),
                    F.col("cp.confidence").alias("case_confidence"),
                    F.col("cp.notes").alias("case_notes")
                )
            ).alias("case_assignments"),
            F.countDistinct("case_id").alias("total_cases"),
            F.countDistinct("case_state").alias("jurisdictions_count"),
            F.sum("estimated_loss").alias("total_loss_linked")
        )
    ).alias("pc")
    
    # Get social connections per person
    social_connections_1 = (
        person_social
        .select(
            F.col("person_id_1").alias("person_id"),
            F.col("person_id_2").alias("connected_person_id"),
            F.col("relationship_type"),
            F.col("weight"),
            F.col("source"),
            F.col("notes").alias("connection_notes")
        )
    )
    social_connections_2 = (
        person_social
        .select(
            F.col("person_id_2").alias("person_id"),
            F.col("person_id_1").alias("connected_person_id"),
            F.col("relationship_type"),
            F.col("weight"),
            F.col("source"),
            F.col("notes").alias("connection_notes")
        )
    )
    social_connections = (
        social_connections_1.union(social_connections_2)
        .groupBy("person_id")
        .agg(
            F.collect_list(
                F.struct(
                    F.col("connected_person_id"),
                    F.col("relationship_type"),
                    F.col("weight"),
                    F.col("source"),
                    F.col("connection_notes")
                )
            ).alias("social_connections"),
            F.count("*").alias("connection_count")
        )
    ).alias("sc")
    
    # Get best device rank per person (from suspect_rankings)
    person_device_rankings = (
        device_links
        .join(rankings, F.col("dl.device_id") == F.col("r.entity_id"), "inner")
        .groupBy(F.col("dl.person_id").alias("person_id"))
        .agg(
            F.min("r.rank").alias("best_device_rank"),
            F.max("r.total_score").alias("highest_device_score")
        )
    ).alias("pdr")
    
    # Build the comprehensive dashboard
    dashboard = (
        persons
        .join(person_devices, F.col("p.person_id") == F.col("pd.person_id"), "left")
        .join(person_cases, F.col("p.person_id") == F.col("pc.person_id"), "left")
        .join(social_connections, F.col("p.person_id") == F.col("sc.person_id"), "left")
        .join(person_device_rankings, F.col("p.person_id") == F.col("pdr.person_id"), "left")
        .select(
            # Person identification
            F.col("p.person_id"),
            F.col("p.display_name"),
            F.col("p.first_name"),
            F.col("p.last_name"),
            F.col("p.alias"),
            F.col("p.dob"),
            F.col("p.age"),
            F.col("p.ssn_last4"),
            F.col("p.known_addresses"),
            F.col("p.criminal_history"),
            F.col("p.notes").alias("person_notes"),
            F.col("p.role").alias("person_role"),
            F.col("p.risk_level"),
            F.col("p.status"),
            # Device information
            F.col("pd.devices"),
            # Case information
            F.col("pc.case_assignments"),
            F.col("pc.total_cases"),
            F.col("pc.jurisdictions_count"),
            F.col("pc.total_loss_linked"),
            # Social network
            F.col("sc.social_connections"),
            F.col("sc.connection_count"),
            # Ranking information
            F.col("pdr.best_device_rank"),
            F.col("pdr.highest_device_score"),
            # Computed flags for UI
            F.when(F.col("p.role").isin("primary_suspect", "suspected_lookout", "suspected_middleman"), True)
             .otherwise(False).alias("is_suspect"),
            F.when(F.col("pc.jurisdictions_count") > 1, True)
             .otherwise(False).alias("is_cross_jurisdictional"),
            F.when(F.col("pdr.best_device_rank") <= 5, "critical")
             .when(F.col("pdr.best_device_rank") <= 10, "high")
             .when(F.col("pdr.best_device_rank") <= 20, "medium")
             .otherwise("low").alias("priority_level")
        )
    )
    
    return dashboard


@dp.materialized_view(
    name="ranked_device_persons",
    comment="Auto-generated person-of-interest records for ranked devices without explicit person links"
)
def ranked_device_persons():
    """
    Generate placeholder person records for devices in suspect_rankings
    that don't have explicit person links. This ensures all ranked devices
    have a person identity for display purposes.
    """
    rankings = dp.read("suspect_rankings").alias("r")
    device_links = dp.read("person_device_links_silver").alias("dl")
    
    # Find ranked devices WITHOUT existing person links
    unlinked_ranked = (
        rankings
        .join(device_links, F.col("r.entity_id") == F.col("dl.device_id"), "left_anti")
        .select(
            F.col("r.entity_id").alias("device_id"),
            F.col("r.rank"),
            F.col("r.total_score"),
            F.col("r.unique_cases"),
            F.col("r.states_count")
        )
    )
    
    # Generate synthetic person-of-interest records
    return (
        unlinked_ranked
        .withColumn("person_id", F.concat(F.lit("POI_"), F.col("device_id")))
        .withColumn("display_name", 
            F.when(F.col("rank") <= 10, F.concat(F.lit("Unknown Suspect #"), F.col("rank").cast("string")))
             .when(F.col("rank") <= 50, F.concat(F.lit("Person of Interest #"), F.col("rank").cast("string")))
             .otherwise(F.concat(F.lit("Flagged Device "), F.col("device_id")))
        )
        .withColumn("first_name", F.lit("Unknown"))
        .withColumn("last_name", F.lit("Unknown"))
        .withColumn("alias", 
            F.when(F.col("rank") <= 10, F.concat(F.lit("Suspect-"), F.col("rank").cast("string")))
             .otherwise(None)
        )
        .withColumn("role",
            F.when(F.col("rank") <= 10, F.lit("unidentified_suspect"))
             .when(F.col("rank") <= 50, F.lit("person_of_interest"))
             .otherwise(F.lit("flagged_device"))
        )
        .withColumn("risk_level",
            F.when(F.col("rank") <= 5, F.lit("critical"))
             .when(F.col("rank") <= 10, F.lit("high"))
             .when(F.col("rank") <= 25, F.lit("medium"))
             .otherwise(F.lit("low"))
        )
        .withColumn("criminal_history", F.lit(None).cast("string"))
        .withColumn("relationship", F.lit("auto_linked"))
        .withColumn("confidence", 
            F.when(F.col("rank") <= 10, F.lit(0.85))
             .when(F.col("rank") <= 50, F.lit(0.60))
             .otherwise(F.lit(0.40))
        )
    )


@dp.materialized_view(
    name="case_suspects_comprehensive",
    comment="All case-suspect links including auto-generated from entity overlap"
)
def case_suspects_comprehensive():
    """
    Comprehensive case-suspect linking that combines:
    1. Explicit case_persons assignments (known suspects)
    2. Auto-generated links from entity_case_overlap (devices at crime scenes)
    
    This ensures every case has suspects linked, and every device that
    appeared at a crime scene is linked to that case.
    """
    # Explicit case-person assignments
    explicit_case_persons = dp.read("case_persons_silver").alias("cp")
    persons = dp.read("persons_silver").alias("p")
    
    # Entity-case overlap (devices at crime scenes)
    entity_case = dp.read("entity_case_overlap").alias("ec")
    
    # Device-person links (known)
    device_links = dp.read("person_device_links_silver").alias("dl")
    
    # Auto-generated persons for ranked devices
    ranked_persons = dp.read("ranked_device_persons").alias("rp")
    
    # Cases for enrichment
    cases = dp.read("cases_silver").alias("c")
    
    # Part 1: Explicit assignments with person details
    explicit_suspects = (
        explicit_case_persons
        .join(persons, F.col("cp.person_id") == F.col("p.person_id"), "left")
        .join(cases, F.col("cp.case_id") == F.col("c.case_id"), "left")
        .select(
            F.col("cp.case_id"),
            F.col("c.case_type"),
            F.col("c.city").alias("case_city"),
            F.col("c.state").alias("case_state"),
            F.col("c.incident_time_bucket"),
            F.col("p.person_id"),
            F.col("p.display_name"),
            F.col("p.alias"),
            F.col("p.role").alias("person_role"),
            F.col("p.risk_level"),
            F.col("p.criminal_history"),
            F.col("cp.role").alias("case_role"),
            F.col("cp.confidence"),
            F.col("cp.notes"),
            F.lit(None).cast("string").alias("device_id"),
            F.lit("explicit_assignment").alias("link_source")
        )
    )
    
    # Part 2: Auto-generated from entity_case_overlap with KNOWN persons
    auto_known = (
        entity_case
        .join(device_links, F.col("ec.entity_id") == F.col("dl.device_id"), "inner")
        .join(persons, F.col("dl.person_id") == F.col("p.person_id"), "inner")
        .join(cases, F.col("ec.case_id") == F.col("c.case_id"), "left")
        .select(
            F.col("ec.case_id"),
            F.col("c.case_type"),
            F.col("ec.city").alias("case_city"),
            F.col("ec.state").alias("case_state"),
            F.col("ec.time_bucket").alias("incident_time_bucket"),
            F.col("p.person_id"),
            F.col("p.display_name"),
            F.col("p.alias"),
            F.col("p.role").alias("person_role"),
            F.col("p.risk_level"),
            F.col("p.criminal_history"),
            F.lit("suspect_at_scene").alias("case_role"),
            F.col("dl.confidence"),
            F.concat(F.lit("Device "), F.col("ec.entity_id"), 
                    F.lit(" detected at scene on "), F.col("ec.time_bucket")).alias("notes"),
            F.col("ec.entity_id").alias("device_id"),
            F.lit("device_at_scene_known").alias("link_source")
        )
    )
    
    # Part 3: Auto-generated from entity_case_overlap with AUTO-GENERATED persons
    auto_unknown = (
        entity_case
        .join(device_links, F.col("ec.entity_id") == F.col("dl.device_id"), "left_anti")  # Exclude known
        .join(ranked_persons, F.col("ec.entity_id") == F.col("rp.device_id"), "inner")
        .join(cases, F.col("ec.case_id") == F.col("c.case_id"), "left")
        .select(
            F.col("ec.case_id"),
            F.col("c.case_type"),
            F.col("ec.city").alias("case_city"),
            F.col("ec.state").alias("case_state"),
            F.col("ec.time_bucket").alias("incident_time_bucket"),
            F.col("rp.person_id"),
            F.col("rp.display_name"),
            F.col("rp.alias"),
            F.col("rp.role").alias("person_role"),
            F.col("rp.risk_level"),
            F.col("rp.criminal_history"),
            F.lit("unidentified_at_scene").alias("case_role"),
            F.col("rp.confidence"),
            F.concat(F.lit("Unidentified device "), F.col("ec.entity_id"), 
                    F.lit(" detected at scene on "), F.col("ec.time_bucket")).alias("notes"),
            F.col("ec.entity_id").alias("device_id"),
            F.lit("device_at_scene_unknown").alias("link_source")
        )
    )
    
    # Combine all three sources
    return (
        explicit_suspects
        .unionByName(auto_known)
        .unionByName(auto_unknown)
        .dropDuplicates(["case_id", "person_id"])  # Dedupe in case of overlap
    )


@dp.materialized_view(
    name="case_summary_with_suspects",
    comment="Case summary with all linked suspects for app display"
)
def case_summary_with_suspects():
    """
    Aggregate suspects per case for easy app rendering.
    Shows each case with its list of suspects and key stats.
    """
    case_suspects = dp.read("case_suspects_comprehensive")
    cases = dp.read("cases_silver").alias("c")
    
    # Aggregate suspects per case
    suspect_agg = (
        case_suspects
        .groupBy("case_id")
        .agg(
            F.count("*").alias("total_persons_linked"),
            F.sum(F.when(F.col("link_source") == "explicit_assignment", 1).otherwise(0)).alias("explicit_suspects"),
            F.sum(F.when(F.col("link_source").contains("device_at_scene"), 1).otherwise(0)).alias("detected_at_scene"),
            F.sum(F.when(F.col("person_role").isin("primary_suspect", "unidentified_suspect"), 1).otherwise(0)).alias("suspect_count"),
            F.sum(F.when(F.col("person_role") == "person_of_interest", 1).otherwise(0)).alias("poi_count"),
            F.sum(F.when(F.col("person_role") == "witness", 1).otherwise(0)).alias("witness_count"),
            F.sum(F.when(F.col("person_role") == "victim", 1).otherwise(0)).alias("victim_count"),
            F.collect_list(
                F.struct(
                    F.col("person_id"),
                    F.col("display_name"),
                    F.col("alias"),
                    F.col("person_role"),
                    F.col("case_role"),
                    F.col("confidence"),
                    F.col("device_id"),
                    F.col("link_source"),
                    F.col("notes")
                )
            ).alias("linked_persons")
        )
    ).alias("sa")
    
    # Join with case details
    return (
        cases
        .join(suspect_agg, F.col("c.case_id") == F.col("sa.case_id"), "left")
        .select(
            F.col("c.case_id"),
            F.col("c.case_type"),
            F.col("c.city"),
            F.col("c.state"),
            F.col("c.incident_time_bucket"),
            F.col("c.address"),
            F.col("c.h3_cell"),
            F.col("c.latitude"),
            F.col("c.longitude"),
            F.col("c.method_of_entry"),
            F.col("c.target_items"),
            F.col("c.estimated_loss"),
            F.col("c.status").alias("case_status"),
            F.col("c.priority"),
            F.col("c.narrative"),
            F.coalesce(F.col("sa.total_persons_linked"), F.lit(0)).alias("total_persons_linked"),
            F.coalesce(F.col("sa.explicit_suspects"), F.lit(0)).alias("explicit_suspects"),
            F.coalesce(F.col("sa.detected_at_scene"), F.lit(0)).alias("detected_at_scene"),
            F.coalesce(F.col("sa.suspect_count"), F.lit(0)).alias("suspect_count"),
            F.coalesce(F.col("sa.poi_count"), F.lit(0)).alias("poi_count"),
            F.coalesce(F.col("sa.witness_count"), F.lit(0)).alias("witness_count"),
            F.coalesce(F.col("sa.victim_count"), F.lit(0)).alias("victim_count"),
            F.col("sa.linked_persons")
        )
    )


@dp.materialized_view(
    name="device_locations_with_persons",
    comment="Location events enriched with person/suspect information for heatmap rendering"
)
def device_locations_with_persons():
    """
    Join location events with person information to enable:
    - Heatmap rendering with H3 cells
    - Device identification linked to human suspects
    - Filtering by suspect vs non-suspect devices
    
    Use this table for your heatmap + graph visualization.
    
    Person data comes from:
    1. Explicit person_device_links (known suspects)
    2. Auto-generated ranked_device_persons (unknown but ranked devices)
    """
    events = dp.read("location_events_silver").alias("le")
    device_links = dp.read("person_device_links_silver").alias("dl")
    persons = dp.read("persons_silver").alias("p")
    rankings = dp.read("suspect_rankings").alias("r")
    ranked_persons = dp.read("ranked_device_persons").alias("rp")
    
    return (
        events
        # First try explicit person links
        .join(device_links, F.col("le.entity_id") == F.col("dl.device_id"), "left")
        .join(persons, F.col("dl.person_id") == F.col("p.person_id"), "left")
        # Then try auto-generated ranked persons
        .join(ranked_persons, F.col("le.entity_id") == F.col("rp.device_id"), "left")
        # Get ranking info
        .join(rankings, F.col("le.entity_id") == F.col("r.entity_id"), "left")
        .select(
            # Device / Entity info
            F.col("le.entity_id").alias("device_id"),
            F.col("le.event_id"),
            
            # Location for heatmap
            F.col("le.h3_cell"),
            F.col("le.latitude"),
            F.col("le.longitude"),
            F.col("le.event_timestamp"),
            F.col("le.time_bucket"),
            F.col("le.time_bucket_ts"),
            F.col("le.city"),
            F.col("le.state"),
            
            # Person details - prefer explicit, fallback to auto-generated
            F.coalesce(F.col("p.person_id"), F.col("rp.person_id")).alias("person_id"),
            F.coalesce(F.col("p.display_name"), F.col("rp.display_name")).alias("display_name"),
            F.coalesce(F.col("p.first_name"), F.col("rp.first_name")).alias("first_name"),
            F.coalesce(F.col("p.last_name"), F.col("rp.last_name")).alias("last_name"),
            F.coalesce(F.col("p.alias"), F.col("rp.alias")).alias("alias"),
            F.coalesce(F.col("p.role"), F.col("rp.role")).alias("person_role"),
            F.coalesce(F.col("p.risk_level"), F.col("rp.risk_level")).alias("risk_level"),
            F.coalesce(F.col("p.criminal_history"), F.col("rp.criminal_history")).alias("criminal_history"),
            
            # Device-person link info
            F.coalesce(F.col("dl.relationship"), F.col("rp.relationship")).alias("device_relationship"),
            F.coalesce(F.col("dl.confidence"), F.col("rp.confidence")).alias("link_confidence"),
            
            # Suspect ranking info
            F.col("r.rank").alias("suspect_rank"),
            F.col("r.total_score").alias("suspect_score"),
            F.col("r.unique_cases"),
            F.col("r.states_count").alias("jurisdictions"),
            
            # Computed flags for filtering/styling
            F.when(F.coalesce(F.col("p.person_id"), F.col("rp.person_id")).isNotNull(), True)
             .otherwise(False).alias("has_known_person"),
            F.when(F.coalesce(F.col("p.role"), F.col("rp.role")).isin(
                "primary_suspect", "suspected_lookout", "suspected_middleman", "fence",
                "unidentified_suspect", "person_of_interest"
            ), True).otherwise(False).alias("is_suspect_device"),
            F.when(F.col("r.rank") <= 10, True)
             .otherwise(False).alias("is_top_suspect"),
            
            # Display label for graph nodes - now always populated for ranked devices
            F.coalesce(
                F.col("p.display_name"),
                F.col("rp.display_name"),
                F.col("le.entity_id")
            ).alias("display_label"),
            
            # Source of person data
            F.when(F.col("p.person_id").isNotNull(), F.lit("known_identity"))
             .when(F.col("rp.person_id").isNotNull(), F.lit("auto_generated"))
             .otherwise(F.lit("unidentified")).alias("identity_source")
        )
    )


@dp.materialized_view(
    name="co_presence_with_persons",
    comment="Co-presence edges enriched with person names for graph visualization"
)
def co_presence_with_persons():
    """
    Enrich co-presence edges with person information so graph edges
    can show human-readable names instead of just device IDs.
    """
    copresence = dp.read("co_presence_edges").alias("cp")
    device_links = dp.read("person_device_links_silver")
    persons = dp.read("persons_silver")
    
    # Get person info for entity 1
    dl1 = device_links.alias("dl1")
    p1 = persons.alias("p1")
    
    # Get person info for entity 2
    dl2 = device_links.alias("dl2")
    p2 = persons.alias("p2")
    
    return (
        copresence
        # Join person info for entity 1
        .join(dl1, F.col("cp.entity_id_1") == F.col("dl1.device_id"), "left")
        .join(p1, F.col("dl1.person_id") == F.col("p1.person_id"), "left")
        # Join person info for entity 2
        .join(dl2, F.col("cp.entity_id_2") == F.col("dl2.device_id"), "left")
        .join(p2, F.col("dl2.person_id") == F.col("p2.person_id"), "left")
        .select(
            # Edge identifiers
            F.col("cp.entity_id_1").alias("device_id_1"),
            F.col("cp.entity_id_2").alias("device_id_2"),
            
            # Person 1 info
            F.col("p1.person_id").alias("person_id_1"),
            F.col("p1.display_name").alias("person_name_1"),
            F.col("p1.alias").alias("alias_1"),
            F.col("p1.role").alias("role_1"),
            
            # Person 2 info
            F.col("p2.person_id").alias("person_id_2"),
            F.col("p2.display_name").alias("person_name_2"),
            F.col("p2.alias").alias("alias_2"),
            F.col("p2.role").alias("role_2"),
            
            # Co-presence details
            F.col("cp.h3_cell"),
            F.col("cp.time_buckets"),
            F.col("cp.time_bucket_count"),
            F.col("cp.weight").alias("co_location_count"),
            F.col("cp.city"),
            F.col("cp.state"),
            
            # Display labels for graph
            F.coalesce(F.col("p1.display_name"), F.col("cp.entity_id_1")).alias("label_1"),
            F.coalesce(F.col("p2.display_name"), F.col("cp.entity_id_2")).alias("label_2"),
            
            # Both are suspects?
            F.when(
                F.col("p1.role").isin("primary_suspect", "suspected_lookout", "suspected_middleman", "fence") &
                F.col("p2.role").isin("primary_suspect", "suspected_lookout", "suspected_middleman", "fence"),
                True
            ).otherwise(False).alias("both_suspects")
        )
    )


# =============================================================================
# WARRANT SILVER & GOLD TABLES
# =============================================================================

@dp.materialized_view(
    name="warrants_silver",
    comment="Cleaned warrant records with parsed dates"
)
def warrants_silver():
    """Clean and enrich warrant data."""
    return (
        dp.read("warrants_bronze")
        .withColumn("submitted_date_ts", F.to_date("submitted_date"))
        .withColumn("approved_date_ts", F.to_date("approved_date"))
        .withColumn("expiration_date_ts", F.to_date("expiration_date"))
        .withColumn("is_active", 
            F.when(
                (F.col("status") == "approved") & 
                (F.col("expiration_date_ts") >= F.current_date()),
                True
            ).otherwise(False)
        )
        .withColumn("days_until_expiration",
            F.when(F.col("expiration_date_ts").isNotNull(),
                F.datediff(F.col("expiration_date_ts"), F.current_date())
            ).otherwise(None)
        )
        .withColumn("ingestion_timestamp", F.current_timestamp())
    )


@dp.materialized_view(
    name="warrant_evidence_silver",
    comment="Cleaned warrant evidence records"
)
def warrant_evidence_silver():
    """Clean warrant evidence data."""
    return (
        dp.read("warrant_evidence_bronze")
        .withColumn("weighted_score", F.col("confidence") * F.col("weight"))
        .withColumn("ingestion_timestamp", F.current_timestamp())
    )


@dp.materialized_view(
    name="warrant_package_data",
    comment="Complete warrant packages with all linked data for PDF generation"
)
def warrant_package_data():
    """
    Combine warrant, person, case, and evidence data into a complete package
    ready for rendering warrant documents and the app UI.
    """
    warrants = dp.read("warrants_silver").alias("w")
    persons = dp.read("persons_silver").alias("p")
    cases = dp.read("cases_silver").alias("c")
    evidence = dp.read("warrant_evidence_silver").alias("e")
    
    # Aggregate evidence per warrant
    evidence_agg = (
        evidence
        .groupBy("warrant_id")
        .agg(
            F.count("*").alias("evidence_count"),
            F.sum("weighted_score").alias("total_evidence_score"),
            F.collect_list(
                F.struct(
                    F.col("evidence_id"),
                    F.col("evidence_type"),
                    F.col("description"),
                    F.col("source_table"),
                    F.col("confidence"),
                    F.col("weight"),
                    F.col("weighted_score")
                )
            ).alias("evidence_items")
        )
    ).alias("ea")
    
    # Build comprehensive warrant package
    return (
        warrants
        .join(persons, F.col("w.target_person_id") == F.col("p.person_id"), "left")
        .join(cases, F.col("w.case_id") == F.col("c.case_id"), "left")
        .join(evidence_agg, F.col("w.warrant_id") == F.col("ea.warrant_id"), "left")
        .select(
            # Warrant info
            F.col("w.warrant_id"),
            F.col("w.warrant_type"),
            F.col("w.status").alias("warrant_status"),
            F.col("w.priority"),
            F.col("w.submitted_date"),
            F.col("w.approved_date"),
            F.col("w.expiration_date"),
            F.col("w.is_active"),
            F.col("w.days_until_expiration"),
            F.col("w.requesting_agency"),
            F.col("w.requesting_officer"),
            F.col("w.badge_number"),
            F.col("w.approving_judge"),
            F.col("w.court"),
            F.col("w.target_address"),
            F.col("w.probable_cause_summary"),
            F.col("w.charges"),
            F.col("w.bail_recommendation"),
            F.col("w.armed_dangerous"),
            F.col("w.notes").alias("warrant_notes"),
            
            # Target person info
            F.col("p.person_id"),
            F.col("p.display_name"),
            F.col("p.first_name"),
            F.col("p.last_name"),
            F.col("p.alias"),
            F.col("p.dob"),
            F.col("p.age"),
            F.col("p.ssn_last4"),
            F.col("p.known_addresses"),
            F.col("p.criminal_history"),
            F.col("p.role").alias("person_role"),
            # Supervision info
            F.col("p.supervision_status"),
            F.col("p.supervision_type"),
            F.col("p.supervision_start"),
            F.col("p.supervision_end"),
            F.col("p.probation_officer"),
            F.col("p.probation_officer_phone"),
            F.col("p.supervision_conditions"),
            F.col("p.compliance_status"),
            F.col("p.violation_notes"),
            
            # Case info
            F.col("w.case_id"),
            F.col("c.case_type"),
            F.col("c.city").alias("case_city"),
            F.col("c.state").alias("case_state"),
            F.col("c.address").alias("case_address"),
            F.col("c.incident_time_bucket"),
            F.col("c.estimated_loss"),
            F.col("c.narrative").alias("case_narrative"),
            
            # Evidence summary
            F.coalesce(F.col("ea.evidence_count"), F.lit(0)).alias("evidence_count"),
            F.coalesce(F.col("ea.total_evidence_score"), F.lit(0.0)).alias("total_evidence_score"),
            F.col("ea.evidence_items")
        )
    )


@dp.materialized_view(
    name="suspects_on_supervision",
    comment="All persons currently on probation/parole for quick lookup"
)
def suspects_on_supervision():
    """
    Filter persons who are currently on probation or parole.
    Useful for identifying supervision violations.
    """
    persons = dp.read("persons_silver")
    
    return (
        persons
        .filter(F.col("supervision_status").isNotNull())
        .select(
            F.col("person_id"),
            F.col("display_name"),
            F.col("alias"),
            F.col("role"),
            F.col("known_addresses"),
            F.col("criminal_history"),
            F.col("supervision_status"),
            F.col("supervision_type"),
            F.col("supervision_start"),
            F.col("supervision_end"),
            F.col("probation_officer"),
            F.col("probation_officer_phone"),
            F.col("supervision_conditions"),
            F.col("last_checkin"),
            F.col("compliance_status"),
            F.col("violation_notes"),
            # Computed fields
            F.when(F.col("compliance_status").isin("violation_suspected", "violation_confirmed"), True)
             .otherwise(False).alias("has_violation"),
            F.when(F.to_date(F.col("supervision_end")) < F.current_date(), True)
             .otherwise(False).alias("supervision_expired")
        )
    )
