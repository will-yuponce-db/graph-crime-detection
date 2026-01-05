"""
Lakeflow Spark Declarative Pipeline: Cross-Jurisdictional Investigative Analytics Demo Data

This pipeline generates synthetic data for the burglary crew story spanning
Washington D.C. and Nashville, including the "burner phone switch" plot twist.

Data Layers:
- Bronze: Raw synthetic location events, cases, social edges
- Silver: Cleaned and enriched data with time buckets and H3 cells
- Gold: Computed analytics tables (co-presence edges, handoff candidates)

Run with: Databricks Lakeflow Pipeline targeting this notebook
Reference: https://docs.databricks.com/aws/en/ldp/developer/python-ref
"""

from pyspark import pipelines as dp
from pyspark.sql import functions as F
from pyspark.sql.types import (
    StructType, StructField, StringType, DoubleType, 
    TimestampType, IntegerType, ArrayType, LongType
)
from datetime import datetime, timedelta
import random

# =============================================================================
# CONFIGURATION (inline for pipeline compatibility)
# =============================================================================

RANDOM_SEED = 42
TIME_BUCKET_MINUTES = 15

# Time buckets
DC_INCIDENT_BUCKET = "2025-01-15T14:30"
NASHVILLE_INCIDENT_BUCKET = "2025-01-08T15:15"
BURNER_SWITCH_BUCKET = "2025-01-15T14:45"

# H3 Cells (Resolution 9)
DC_INCIDENT_H3_CELL = "892a1008003ffff"
NASHVILLE_INCIDENT_H3_CELL = "8844c0a305fffff"

# Coordinates
DC_LAT, DC_LON = 38.9076, -77.0723
NASHVILLE_LAT, NASHVILLE_LON = 36.1027, -86.8569

# Entity IDs
SUSPECT_1_ID = "E_0412"
SUSPECT_2_ID = "E_1098"
BURNER_ENTITY_ID = "E_7734"
FENCE_ENTITY_ID = "E_9901"
DECOY_ENTITY_ID = "E_5555"
DC_INCIDENT_ENTITY_COUNT = 50

# Case IDs
DC_CASE_ID = "CASE_DC_001"
NASHVILLE_CASE_ID = "CASE_TN_007"


# =============================================================================
# BRONZE LAYER: Raw Synthetic Data Generation
# =============================================================================

@dp.materialized_view(
    name="location_events_bronze",
    comment="Raw synthetic location events for demo scenario"
)
def location_events_bronze():
    """
    Generate synthetic location events with the following pattern:
    - 50 entities in DC incident cell/bucket (including 2 suspects)
    - 2 suspects also appear in Nashville incident
    - 2 suspects appear in additional burglary windows
    - Burner switch: Suspect 1 disappears, new entity appears at T+1
    - Background noise: random entities in various cells/buckets
    """
    random.seed(RANDOM_SEED)
    
    events = []
    event_id = 1000
    
    # Helper to add jitter to coordinates
    def jitter_coord(base, variance=0.001):
        return base + random.uniform(-variance, variance)
    
    # Helper to create timestamp from bucket string
    def bucket_to_ts(bucket_str, offset_minutes=0):
        dt = datetime.fromisoformat(bucket_str)
        dt = dt + timedelta(minutes=offset_minutes + random.randint(0, 14))
        return dt.isoformat()
    
    # Generate entity IDs for the 50 devices in DC cell
    # First two are our suspects, rest are random
    dc_entities = [SUSPECT_1_ID, SUSPECT_2_ID]
    for i in range(DC_INCIDENT_ENTITY_COUNT - 2):
        dc_entities.append(f"E_{random.randint(1000, 9999):04d}")
    
    # =================================================================
    # DC INCIDENT WINDOW: 50 entities in the target cell
    # =================================================================
    for entity_id in dc_entities:
        events.append({
            "event_id": f"EVT_{event_id:06d}",
            "entity_id": entity_id,
            "timestamp": bucket_to_ts(DC_INCIDENT_BUCKET),
            "time_bucket": DC_INCIDENT_BUCKET,
            "latitude": jitter_coord(DC_LAT),
            "longitude": jitter_coord(DC_LON),
            "h3_cell": DC_INCIDENT_H3_CELL,
            "city": "Washington, DC",
            "state": "DC",
            "event_type": "location_ping",
            "source_system": "carrier_data"
        })
        event_id += 1
    
    # =================================================================
    # NASHVILLE INCIDENT WINDOW: Suspects present (week before DC)
    # =================================================================
    for entity_id in [SUSPECT_1_ID, SUSPECT_2_ID]:
        events.append({
            "event_id": f"EVT_{event_id:06d}",
            "entity_id": entity_id,
            "timestamp": bucket_to_ts(NASHVILLE_INCIDENT_BUCKET),
            "time_bucket": NASHVILLE_INCIDENT_BUCKET,
            "latitude": jitter_coord(NASHVILLE_LAT),
            "longitude": jitter_coord(NASHVILLE_LON),
            "h3_cell": NASHVILLE_INCIDENT_H3_CELL,
            "city": "Nashville",
            "state": "TN",
            "event_type": "location_ping",
            "source_system": "carrier_data"
        })
        event_id += 1
    
    # Add some noise entities in Nashville (not suspects)
    for i in range(15):
        events.append({
            "event_id": f"EVT_{event_id:06d}",
            "entity_id": f"E_TN_{random.randint(1000, 9999):04d}",
            "timestamp": bucket_to_ts(NASHVILLE_INCIDENT_BUCKET),
            "time_bucket": NASHVILLE_INCIDENT_BUCKET,
            "latitude": jitter_coord(NASHVILLE_LAT),
            "longitude": jitter_coord(NASHVILLE_LON),
            "h3_cell": NASHVILLE_INCIDENT_H3_CELL,
            "city": "Nashville",
            "state": "TN",
            "event_type": "location_ping",
            "source_system": "carrier_data"
        })
        event_id += 1
    
    # =================================================================
    # ADDITIONAL BURGLARY WINDOWS: Suspects present
    # =================================================================
    additional_incidents = [
        {"bucket": "2025-01-10T22:00", "h3": "892a1008017ffff", "city": "Washington, DC", "state": "DC", "lat": 38.9156, "lon": -77.0368},
        {"bucket": "2025-01-12T03:30", "h3": "892a1072a93ffff", "city": "Arlington", "state": "VA", "lat": 38.8816, "lon": -77.0910},
    ]
    
    for incident in additional_incidents:
        # Both suspects present
        for entity_id in [SUSPECT_1_ID, SUSPECT_2_ID]:
            events.append({
                "event_id": f"EVT_{event_id:06d}",
                "entity_id": entity_id,
                "timestamp": bucket_to_ts(incident["bucket"]),
                "time_bucket": incident["bucket"],
                "latitude": jitter_coord(incident["lat"]),
                "longitude": jitter_coord(incident["lon"]),
                "h3_cell": incident["h3"],
                "city": incident["city"],
                "state": incident["state"],
                "event_type": "location_ping",
                "source_system": "carrier_data"
            })
            event_id += 1
        
        # Add noise entities
        for i in range(random.randint(20, 35)):
            events.append({
                "event_id": f"EVT_{event_id:06d}",
                "entity_id": f"E_{random.randint(1000, 9999):04d}",
                "timestamp": bucket_to_ts(incident["bucket"]),
                "time_bucket": incident["bucket"],
                "latitude": jitter_coord(incident["lat"]),
                "longitude": jitter_coord(incident["lon"]),
                "h3_cell": incident["h3"],
                "city": incident["city"],
                "state": incident["state"],
                "event_type": "location_ping",
                "source_system": "carrier_data"
            })
            event_id += 1
    
    # =================================================================
    # BURNER PHONE SWITCH: T+1 after DC incident
    # =================================================================
    # Suspect 1 DISAPPEARS (no event in this bucket)
    # Suspect 2 continues
    events.append({
        "event_id": f"EVT_{event_id:06d}",
        "entity_id": SUSPECT_2_ID,
        "timestamp": bucket_to_ts(BURNER_SWITCH_BUCKET),
        "time_bucket": BURNER_SWITCH_BUCKET,
        "latitude": jitter_coord(DC_LAT),
        "longitude": jitter_coord(DC_LON),
        "h3_cell": DC_INCIDENT_H3_CELL,
        "city": "Washington, DC",
        "state": "DC",
        "event_type": "location_ping",
        "source_system": "carrier_data"
    })
    event_id += 1
    
    # NEW BURNER ENTITY appears in same cell
    events.append({
        "event_id": f"EVT_{event_id:06d}",
        "entity_id": BURNER_ENTITY_ID,
        "timestamp": bucket_to_ts(BURNER_SWITCH_BUCKET),
        "time_bucket": BURNER_SWITCH_BUCKET,
        "latitude": jitter_coord(DC_LAT),
        "longitude": jitter_coord(DC_LON),
        "h3_cell": DC_INCIDENT_H3_CELL,
        "city": "Washington, DC",
        "state": "DC",
        "event_type": "location_ping",
        "source_system": "carrier_data"
    })
    event_id += 1
    
    # Add DECOY entity (appears in same cell but NOT with Suspect 2)
    events.append({
        "event_id": f"EVT_{event_id:06d}",
        "entity_id": DECOY_ENTITY_ID,
        "timestamp": bucket_to_ts(BURNER_SWITCH_BUCKET),
        "time_bucket": BURNER_SWITCH_BUCKET,
        "latitude": jitter_coord(DC_LAT, 0.01),  # Slightly different location
        "longitude": jitter_coord(DC_LON, 0.01),
        "h3_cell": "892a1008007ffff",  # Adjacent cell, NOT same cell
        "city": "Washington, DC",
        "state": "DC",
        "event_type": "location_ping",
        "source_system": "carrier_data"
    })
    event_id += 1
    
    # =================================================================
    # CONTINUED PATTERN: Burner + Suspect 2 continue together
    # =================================================================
    continuation_buckets = [
        "2025-01-15T15:00", "2025-01-15T15:15", "2025-01-15T15:30"
    ]
    continuation_cells = [
        "892a100800bffff", "892a100801fffff", "892a100802fffff"
    ]
    
    for bucket, h3_cell in zip(continuation_buckets, continuation_cells):
        # Burner and Suspect 2 move together
        for entity_id in [BURNER_ENTITY_ID, SUSPECT_2_ID]:
            events.append({
                "event_id": f"EVT_{event_id:06d}",
                "entity_id": entity_id,
                "timestamp": bucket_to_ts(bucket),
                "time_bucket": bucket,
                "latitude": jitter_coord(DC_LAT + 0.01),
                "longitude": jitter_coord(DC_LON + 0.01),
                "h3_cell": h3_cell,
                "city": "Washington, DC",
                "state": "DC",
                "event_type": "location_ping",
                "source_system": "carrier_data"
            })
            event_id += 1
    
    # =================================================================
    # BACKGROUND NOISE: Random entities in various places/times
    # =================================================================
    noise_cells = [
        ("892a1008003ffff", DC_LAT, DC_LON, "Washington, DC", "DC"),
        ("892a1008017ffff", 38.9156, -77.0368, "Washington, DC", "DC"),
        ("8844c0a305fffff", NASHVILLE_LAT, NASHVILLE_LON, "Nashville", "TN"),
    ]
    noise_buckets = [
        "2025-01-14T10:00", "2025-01-14T14:30", "2025-01-15T09:00",
        "2025-01-15T10:15", "2025-01-16T08:00", "2025-01-16T12:30"
    ]
    
    for _ in range(200):
        cell_data = random.choice(noise_cells)
        events.append({
            "event_id": f"EVT_{event_id:06d}",
            "entity_id": f"E_NOISE_{random.randint(10000, 99999)}",
            "timestamp": bucket_to_ts(random.choice(noise_buckets)),
            "time_bucket": random.choice(noise_buckets),
            "latitude": jitter_coord(cell_data[1]),
            "longitude": jitter_coord(cell_data[2]),
            "h3_cell": cell_data[0],
            "city": cell_data[3],
            "state": cell_data[4],
            "event_type": "location_ping",
            "source_system": "carrier_data"
        })
        event_id += 1
    
    # Create DataFrame
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
    """Generate case records for the burglary series."""
    
    cases = [
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
Time of incident estimated: 14:25-14:40.""",
            "method_of_entry": "rear_window_smash",
            "target_items": "jewelry,electronics,cash",
            "estimated_loss": 24000
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
            "priority": "medium",
            "narrative": """Commercial after-hours burglary at jewelry store, Connecticut Ave.
Rear window entry, targeted display cases only. Loss: $45,000 in 
merchandise. Two suspects on camera, faces obscured. Dark sedan 
observed departing. Professional operation.""",
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
    name="social_edges_bronze",
    comment="Raw social network edges for entity relationships"
)
def social_edges_bronze():
    """Generate social network edges connecting entities."""
    
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
@dp.expect("valid_entity_id", "entity_id IS NOT NULL AND LENGTH(entity_id) > 0", action="drop")
@dp.expect("valid_coordinates", "latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180", action="drop")
@dp.expect("valid_h3_cell", "h3_cell IS NOT NULL AND LENGTH(h3_cell) = 15", action="drop")
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
@dp.expect("valid_case_id", "case_id IS NOT NULL", action="drop")
@dp.expect("valid_case_type", "case_type IS NOT NULL", action="drop")
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
    comment="Cleaned social network edges"
)
@dp.expect("valid_entities", "entity_id_1 IS NOT NULL AND entity_id_2 IS NOT NULL", action="drop")
@dp.expect("valid_weight", "weight BETWEEN 0 AND 1", action="drop")
def social_edges_silver():
    """Clean social edges."""
    return (
        dp.read("social_edges_bronze")
        .withColumn("is_high_confidence", F.col("confidence") >= 0.75)
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
        .agg(F.sum("weight").alias("copresence_weight_1"))
    ).union(
        copresence
        .groupBy(F.col("entity_id_2").alias("entity_id"))
        .agg(F.sum("weight").alias("copresence_weight_2"))
    ).groupBy("entity_id").agg(
        F.sum(F.coalesce(F.col("copresence_weight_1"), F.lit(0)) + 
              F.coalesce(F.col("copresence_weight_2"), F.lit(0))).alias("total_copresence_weight")
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
            F.Window.orderBy(F.desc("total_score"))))
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
            F.Window.orderBy(F.desc("handoff_score"))))
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
    name="evidence_card_data",
    comment="Pre-computed evidence data for the Agentic Investigation feature"
)
def evidence_card_data():
    """
    Pre-compute evidence for the top suspects, combining:
    - Geospatial evidence (co-presence at crime scenes)
    - Narrative evidence (case similarities)
    - Social evidence (network connections)
    """
    rankings = dp.read("suspect_rankings")
    entity_case = dp.read("entity_case_overlap")
    cases = dp.read("cases_silver")
    social = dp.read("social_edges_silver")
    copresence = dp.read("co_presence_edges")
    
    # Get top 5 suspects
    top_suspects = rankings.filter(F.col("rank") <= 5)
    
    # Geospatial evidence: which cases are entities linked to
    geo_evidence = (
        entity_case
        .join(top_suspects.select("entity_id"), "entity_id")
        .join(cases.select("case_id", "case_type", "city", "address", "method_of_entry"), 
              "case_id")
        .groupBy("entity_id")
        .agg(
            F.collect_list(
                F.struct(
                    F.col("case_id"),
                    F.col("city"),
                    F.col("address"),
                    F.col("h3_cell"),
                    F.col("time_bucket")
                )
            ).alias("geo_evidence")
        )
    )
    
    # Social evidence: network connections
    social_evidence = (
        social
        .join(top_suspects.select("entity_id"), 
              (social.entity_id_1 == top_suspects.entity_id) | 
              (social.entity_id_2 == top_suspects.entity_id))
        .select(
            F.when(F.col("entity_id_1").isin([c.entity_id for c in top_suspects.collect()]), 
                   F.col("entity_id_1"))
             .otherwise(F.col("entity_id_2")).alias("entity_id"),
            F.when(F.col("entity_id_1").isin([c.entity_id for c in top_suspects.collect()]),
                   F.col("entity_id_2"))
             .otherwise(F.col("entity_id_1")).alias("connected_entity"),
            "relationship_type",
            "weight",
            "confidence"
        )
        .groupBy("entity_id")
        .agg(
            F.collect_list(
                F.struct(
                    F.col("connected_entity"),
                    F.col("relationship_type"),
                    F.col("weight"),
                    F.col("confidence")
                )
            ).alias("social_evidence")
        )
    )
    
    # Combine all evidence
    evidence = (
        top_suspects
        .join(geo_evidence, "entity_id", "left")
        .join(social_evidence, "entity_id", "left")
        .select(
            "entity_id",
            "rank",
            "total_score",
            "linked_cases",
            "linked_cities",
            "states_count",
            "geo_evidence",
            "social_evidence"
        )
    )
    
    return evidence
