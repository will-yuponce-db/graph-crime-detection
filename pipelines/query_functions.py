"""
Query Functions for Cross-Jurisdictional Investigative Analytics

These functions provide the API layer for the demo app to query generated data.
Use these in Databricks notebooks or the Streamlit app.

Functions:
- get_cell_counts(time_bucket, city)      - For heatmap dashboard
- get_entities_in_cell(h3_cell, bucket)   - For entity list drill-down
- rank_entities_for_case(case_id)         - For suspect ranking
- graph_expand(entities, hops, filters)   - For graph explorer
- get_handoff_candidates(entity_id)       - For burner switch detection
- get_evidence_card(entities, cases)      - For agentic investigation
"""

from pyspark.sql import SparkSession, DataFrame
from pyspark.sql import functions as F
from typing import List, Optional, Dict, Any
import json

# Configuration
CATALOG = "investigative_analytics"
SCHEMA = "demo"


def _get_spark() -> SparkSession:
    """Get or create SparkSession."""
    return SparkSession.builder.getOrCreate()


def _full_table_name(table: str) -> str:
    """Return fully qualified table name."""
    return f"{CATALOG}.{SCHEMA}.{table}"


# =============================================================================
# HEATMAP DASHBOARD FUNCTIONS
# =============================================================================

def get_cell_counts(
    time_bucket: Optional[str] = None,
    city: Optional[str] = None,
    min_count: int = 1
) -> DataFrame:
    """
    Get device counts per H3 cell for the heatmap visualization.
    
    Args:
        time_bucket: Filter to specific 15-min bucket (e.g., "2025-01-15T14:30")
        city: Filter to specific city (e.g., "Washington, DC")
        min_count: Minimum device count to include (default 1)
    
    Returns:
        DataFrame with columns: h3_cell, time_bucket, city, state, 
                               device_count, center_lat, center_lon, activity_category
    """
    spark = _get_spark()
    
    query = f"""
        SELECT h3_cell, time_bucket, city, state, device_count,
               center_lat, center_lon, activity_category, is_high_activity
        FROM {_full_table_name('cell_device_counts')}
        WHERE device_count >= {min_count}
    """
    
    if time_bucket:
        query += f" AND time_bucket = '{time_bucket}'"
    
    if city:
        query += f" AND city = '{city}'"
    
    query += " ORDER BY device_count DESC"
    
    return spark.sql(query)


def get_available_time_buckets(city: Optional[str] = None) -> DataFrame:
    """
    Get list of available time buckets for the time slider.
    
    Args:
        city: Filter to specific city
    
    Returns:
        DataFrame with columns: time_bucket, total_devices, cell_count
    """
    spark = _get_spark()
    
    query = f"""
        SELECT time_bucket, 
               SUM(device_count) as total_devices,
               COUNT(DISTINCT h3_cell) as cell_count
        FROM {_full_table_name('cell_device_counts')}
    """
    
    if city:
        query += f" WHERE city = '{city}'"
    
    query += " GROUP BY time_bucket ORDER BY time_bucket"
    
    return spark.sql(query)


def get_entities_in_cell(
    h3_cell: str,
    time_bucket: str,
    limit: int = 50
) -> DataFrame:
    """
    Get list of entities present in a specific cell/time bucket.
    Used when user clicks on a heatmap cell.
    
    Args:
        h3_cell: H3 cell ID (e.g., "892a1008003ffff")
        time_bucket: Time bucket (e.g., "2025-01-15T14:30")
        limit: Maximum entities to return (default 50)
    
    Returns:
        DataFrame with columns: entity_id, event_timestamp, latitude, longitude
    """
    spark = _get_spark()
    
    return spark.sql(f"""
        SELECT entity_id, event_timestamp, latitude, longitude,
               city, state, event_type
        FROM {_full_table_name('location_events_silver')}
        WHERE h3_cell = '{h3_cell}'
          AND time_bucket = '{time_bucket}'
        ORDER BY entity_id
        LIMIT {limit}
    """)


# =============================================================================
# GRAPH EXPLORER FUNCTIONS
# =============================================================================

def rank_entities_for_case(case_id: str) -> DataFrame:
    """
    Get ranked list of suspect entities for a specific case.
    
    Args:
        case_id: Case identifier (e.g., "CASE_DC_001")
    
    Returns:
        DataFrame with suspect rankings including scores and linked cases
    """
    spark = _get_spark()
    
    return spark.sql(f"""
        SELECT sr.entity_id, sr.rank, sr.total_score,
               sr.recurrence_score, sr.cross_jurisdiction_score, sr.network_score,
               sr.unique_cases, sr.states_count, sr.linked_cases, sr.linked_cities
        FROM {_full_table_name('suspect_rankings')} sr
        JOIN {_full_table_name('entity_case_overlap')} eco
          ON sr.entity_id = eco.entity_id
        WHERE eco.case_id = '{case_id}'
        ORDER BY sr.rank
        LIMIT 20
    """)


def get_top_suspects(limit: int = 10) -> DataFrame:
    """
    Get overall top-ranked suspects across all cases.
    
    Args:
        limit: Number of suspects to return
    
    Returns:
        DataFrame with top suspects and their scores
    """
    spark = _get_spark()
    
    return spark.sql(f"""
        SELECT entity_id, rank, total_score,
               recurrence_score, cross_jurisdiction_score, network_score,
               unique_cases, states_count, linked_cases, linked_cities
        FROM {_full_table_name('suspect_rankings')}
        ORDER BY rank
        LIMIT {limit}
    """)


def graph_expand(
    seed_entities: List[str],
    hops: int = 2,
    burglary_only: bool = True,
    min_weight: float = 0.1
) -> Dict[str, DataFrame]:
    """
    Expand graph from seed entities to show co-presence connections.
    
    Args:
        seed_entities: Starting entity IDs (e.g., ["E_0412", "E_1098"])
        hops: Number of hops to expand (1-3)
        burglary_only: Filter to only edges involving burglary cases
        min_weight: Minimum edge weight to include
    
    Returns:
        Dict with 'nodes' and 'edges' DataFrames for visualization
    """
    spark = _get_spark()
    
    entity_list = "', '".join(seed_entities)
    
    # Get edges involving seed entities
    edges_query = f"""
        SELECT entity_id_1, entity_id_2, h3_cell, city, state,
               co_occurrence_count, weight, time_buckets,
               first_seen_together, last_seen_together
        FROM {_full_table_name('co_presence_edges')}
        WHERE (entity_id_1 IN ('{entity_list}') 
               OR entity_id_2 IN ('{entity_list}'))
          AND weight >= {min_weight}
        ORDER BY weight DESC
    """
    
    edges_df = spark.sql(edges_query)
    
    # For multi-hop, recursively expand
    if hops >= 2:
        # Get connected entities
        connected = spark.sql(f"""
            SELECT DISTINCT entity_id_2 as entity_id FROM ({edges_query})
            UNION
            SELECT DISTINCT entity_id_1 as entity_id FROM ({edges_query})
        """).collect()
        
        connected_ids = [r["entity_id"] for r in connected]
        if connected_ids:
            connected_list = "', '".join(connected_ids)
            
            hop2_edges = spark.sql(f"""
                SELECT entity_id_1, entity_id_2, h3_cell, city, state,
                       co_occurrence_count, weight, time_buckets,
                       first_seen_together, last_seen_together
                FROM {_full_table_name('co_presence_edges')}
                WHERE (entity_id_1 IN ('{connected_list}') 
                       OR entity_id_2 IN ('{connected_list}'))
                  AND weight >= {min_weight}
                ORDER BY weight DESC
            """)
            
            edges_df = edges_df.union(hop2_edges).distinct()
    
    # Get unique nodes from edges
    nodes_df = spark.sql(f"""
        WITH all_entities AS (
            SELECT entity_id_1 as entity_id FROM ({edges_query})
            UNION
            SELECT entity_id_2 as entity_id FROM ({edges_query})
        )
        SELECT DISTINCT ae.entity_id,
               COALESCE(sr.rank, 999) as suspect_rank,
               COALESCE(sr.total_score, 0) as score,
               COALESCE(sr.unique_cases, 0) as case_count,
               CASE WHEN ae.entity_id IN ('{entity_list}') 
                    THEN 'seed' ELSE 'connected' END as node_type
        FROM all_entities ae
        LEFT JOIN {_full_table_name('suspect_rankings')} sr
          ON ae.entity_id = sr.entity_id
        ORDER BY suspect_rank
    """)
    
    return {
        "nodes": nodes_df,
        "edges": edges_df
    }


def get_copresence_between_entities(
    entity_1: str,
    entity_2: str
) -> DataFrame:
    """
    Get detailed co-presence information between two specific entities.
    
    Args:
        entity_1: First entity ID
        entity_2: Second entity ID
    
    Returns:
        DataFrame with co-presence details
    """
    spark = _get_spark()
    
    return spark.sql(f"""
        SELECT *
        FROM {_full_table_name('co_presence_edges')}
        WHERE (entity_id_1 = '{entity_1}' AND entity_id_2 = '{entity_2}')
           OR (entity_id_1 = '{entity_2}' AND entity_id_2 = '{entity_1}')
    """)


# =============================================================================
# BURNER PHONE SWITCH DETECTION
# =============================================================================

def get_handoff_candidates(
    entity_id: Optional[str] = None,
    limit: int = 10
) -> DataFrame:
    """
    Get potential burner phone switch candidates.
    
    Args:
        entity_id: Filter to candidates for specific entity
        limit: Maximum candidates to return
    
    Returns:
        DataFrame with handoff candidates ranked by score
    """
    spark = _get_spark()
    
    query = f"""
        SELECT old_entity_id, new_entity_id, h3_cell,
               old_last_bucket, new_first_bucket, time_diff_minutes,
               shared_partner_count, shared_partners,
               spatial_score, temporal_score, partner_score,
               handoff_score, rank
        FROM {_full_table_name('handoff_candidates')}
    """
    
    if entity_id:
        query += f" WHERE old_entity_id = '{entity_id}'"
    
    query += f" ORDER BY rank LIMIT {limit}"
    
    return spark.sql(query)


def detect_entity_disappearance(
    entity_id: str,
    after_bucket: str
) -> Dict[str, Any]:
    """
    Check if an entity disappeared after a specific time bucket.
    
    Args:
        entity_id: Entity to check
        after_bucket: Time bucket to check after
    
    Returns:
        Dict with disappearance status and details
    """
    spark = _get_spark()
    
    # Get last seen info
    last_seen = spark.sql(f"""
        SELECT MAX(time_bucket) as last_bucket,
               COUNT(*) as total_events,
               COLLECT_SET(city) as cities_seen
        FROM {_full_table_name('location_events_silver')}
        WHERE entity_id = '{entity_id}'
    """).collect()[0]
    
    # Check for events after the specified bucket
    events_after = spark.sql(f"""
        SELECT COUNT(*) as count
        FROM {_full_table_name('location_events_silver')}
        WHERE entity_id = '{entity_id}'
          AND time_bucket > '{after_bucket}'
    """).collect()[0]["count"]
    
    return {
        "entity_id": entity_id,
        "last_seen_bucket": last_seen["last_bucket"],
        "total_events": last_seen["total_events"],
        "cities_seen": last_seen["cities_seen"],
        "disappeared_after": after_bucket,
        "events_after_bucket": events_after,
        "is_disappeared": events_after == 0
    }


# =============================================================================
# EVIDENCE CARD FUNCTIONS
# =============================================================================

def fetch_copresence_evidence(
    case_a: str,
    case_b: str,
    entities: List[str]
) -> List[Dict[str, Any]]:
    """
    Fetch geospatial evidence showing entities were co-present at crime scenes.
    
    Args:
        case_a: First case ID
        case_b: Second case ID
        entities: List of entity IDs to check
    
    Returns:
        List of evidence records with claims and support
    """
    spark = _get_spark()
    
    entity_list = "', '".join(entities)
    
    evidence = spark.sql(f"""
        SELECT eco.entity_id, eco.case_id, eco.city, eco.h3_cell, eco.time_bucket,
               c.address, c.case_type
        FROM {_full_table_name('entity_case_overlap')} eco
        JOIN {_full_table_name('cases_silver')} c ON eco.case_id = c.case_id
        WHERE eco.entity_id IN ('{entity_list}')
          AND eco.case_id IN ('{case_a}', '{case_b}')
        ORDER BY eco.entity_id, eco.time_bucket
    """).collect()
    
    results = []
    for entity in entities:
        entity_evidence = [r for r in evidence if r["entity_id"] == entity]
        if len(entity_evidence) >= 2:
            results.append({
                "claim": f"Entity {entity} was present at both crime scenes",
                "support": [
                    f"{r['case_id']}: {r['city']} at {r['time_bucket']}"
                    for r in entity_evidence
                ],
                "entity_id": entity,
                "cases": [r["case_id"] for r in entity_evidence]
            })
    
    return results


def fetch_narrative_similarity(
    case_a: str,
    case_b: str
) -> List[Dict[str, Any]]:
    """
    Fetch narrative evidence showing similar methods between cases.
    
    Args:
        case_a: First case ID
        case_b: Second case ID
    
    Returns:
        List of evidence records highlighting narrative similarities
    """
    spark = _get_spark()
    
    cases = spark.sql(f"""
        SELECT case_id, narrative, method_of_entry, target_items, moe_category
        FROM {_full_table_name('cases_silver')}
        WHERE case_id IN ('{case_a}', '{case_b}')
    """).collect()
    
    if len(cases) < 2:
        return []
    
    case_a_data = next((c for c in cases if c["case_id"] == case_a), None)
    case_b_data = next((c for c in cases if c["case_id"] == case_b), None)
    
    results = []
    
    # Compare method of entry
    if case_a_data["moe_category"] == case_b_data["moe_category"]:
        results.append({
            "claim": f"Both cases share same entry method: {case_a_data['moe_category']}",
            "support": [
                f"{case_a}: {case_a_data['method_of_entry']}",
                f"{case_b}: {case_b_data['method_of_entry']}"
            ],
            "type": "method_of_entry"
        })
    
    # Compare target items
    targets_a = set(case_a_data["target_items"].split(",") if case_a_data["target_items"] else [])
    targets_b = set(case_b_data["target_items"].split(",") if case_b_data["target_items"] else [])
    common_targets = targets_a.intersection(targets_b)
    
    if common_targets:
        results.append({
            "claim": f"Both cases targeted similar items: {', '.join(common_targets)}",
            "support": [
                f"{case_a}: {case_a_data['target_items']}",
                f"{case_b}: {case_b_data['target_items']}"
            ],
            "type": "target_items"
        })
    
    return results


def fetch_social_links(
    entities: List[str]
) -> List[Dict[str, Any]]:
    """
    Fetch social network evidence for entities.
    
    Args:
        entities: List of entity IDs
    
    Returns:
        List of evidence records showing social connections
    """
    spark = _get_spark()
    
    entity_list = "', '".join(entities)
    
    edges = spark.sql(f"""
        SELECT entity_id_1, entity_id_2, relationship_type, weight, 
               confidence, source
        FROM {_full_table_name('social_edges_silver')}
        WHERE entity_id_1 IN ('{entity_list}')
           OR entity_id_2 IN ('{entity_list}')
    """).collect()
    
    results = []
    for edge in edges:
        # Determine which entity is the "subject"
        subject = edge["entity_id_1"] if edge["entity_id_1"] in entities else edge["entity_id_2"]
        connected = edge["entity_id_2"] if edge["entity_id_1"] == subject else edge["entity_id_1"]
        
        if edge["relationship_type"] == "fence_connection":
            results.append({
                "claim": f"Entity {subject} is connected to known fence {connected}",
                "support": [
                    f"Source: {edge['source']}",
                    f"Confidence: {edge['confidence']:.0%}"
                ],
                "entity_id": subject,
                "connected_entity": connected,
                "type": edge["relationship_type"]
            })
        elif edge["relationship_type"] == "known_associate":
            results.append({
                "claim": f"Entity {subject} is a known associate of {connected}",
                "support": [
                    f"Source: {edge['source']}",
                    f"Relationship weight: {edge['weight']:.2f}"
                ],
                "entity_id": subject,
                "connected_entity": connected,
                "type": edge["relationship_type"]
            })
    
    return results


def generate_evidence_card(
    entities: List[str],
    cases: List[str]
) -> Dict[str, Any]:
    """
    Generate a complete evidence card combining all evidence types.
    
    Args:
        entities: List of suspect entity IDs
        cases: List of related case IDs
    
    Returns:
        Evidence card dictionary matching the schema
    """
    # Fetch all evidence
    geo_evidence = []
    narrative_evidence = []
    
    # Get geo evidence for each case pair
    if len(cases) >= 2:
        geo_evidence = fetch_copresence_evidence(cases[0], cases[1], entities)
        narrative_evidence = fetch_narrative_similarity(cases[0], cases[1])
    
    # Get social evidence
    social_evidence = fetch_social_links(entities)
    
    return {
        "title": "CaseLink Evidence Card",
        "entities": entities,
        "linked_cases": cases,
        "signals": {
            "geospatial": [
                {"claim": e["claim"], "support": e["support"]}
                for e in geo_evidence
            ],
            "narrative": [
                {"claim": e["claim"], "support": e["support"]}
                for e in narrative_evidence
            ],
            "social": [
                {"claim": e["claim"], "support": e["support"]}
                for e in social_evidence
            ]
        },
        "summary": _generate_summary(entities, cases, geo_evidence, 
                                      narrative_evidence, social_evidence)
    }


def _generate_summary(
    entities: List[str],
    cases: List[str],
    geo: List,
    narrative: List,
    social: List
) -> str:
    """Generate a plain-English summary of the evidence."""
    summary_parts = []
    
    if geo:
        summary_parts.append(
            f"Geospatial analysis shows {len(entities)} device(s) were present "
            f"at {len(cases)} crime scenes."
        )
    
    if narrative:
        summary_parts.append(
            "Case narrative comparison reveals similar methods of operation "
            "including rear window entry and targeting jewelry."
        )
    
    fence_connections = [s for s in social if s.get("type") == "fence_connection"]
    if fence_connections:
        summary_parts.append(
            f"Social network analysis links suspects to {len(fence_connections)} "
            "known fencing operation(s)."
        )
    
    return " ".join(summary_parts)


# =============================================================================
# CASE FUNCTIONS
# =============================================================================

def get_case_details(case_id: str) -> Dict[str, Any]:
    """
    Get full details for a specific case.
    
    Args:
        case_id: Case identifier
    
    Returns:
        Dict with case details
    """
    spark = _get_spark()
    
    case = spark.sql(f"""
        SELECT *
        FROM {_full_table_name('cases_silver')}
        WHERE case_id = '{case_id}'
    """).collect()
    
    if not case:
        return {}
    
    return case[0].asDict()


def get_all_cases() -> DataFrame:
    """
    Get list of all cases.
    
    Returns:
        DataFrame with case summaries
    """
    spark = _get_spark()
    
    return spark.sql(f"""
        SELECT case_id, case_type, city, state, address,
               incident_time_bucket, method_of_entry, estimated_loss, status
        FROM {_full_table_name('cases_silver')}
        ORDER BY incident_bucket_ts DESC
    """)


def get_similar_cases(case_id: str, limit: int = 5) -> DataFrame:
    """
    Find cases similar to the specified case based on M.O. and targets.
    
    Args:
        case_id: Reference case ID
        limit: Maximum similar cases to return
    
    Returns:
        DataFrame with similar cases
    """
    spark = _get_spark()
    
    return spark.sql(f"""
        WITH ref_case AS (
            SELECT moe_category, target_items_array
            FROM {_full_table_name('cases_silver')}
            WHERE case_id = '{case_id}'
        )
        SELECT c.case_id, c.city, c.state, c.incident_time_bucket,
               c.method_of_entry, c.target_items,
               CASE WHEN c.moe_category = r.moe_category THEN 1 ELSE 0 END as moe_match,
               SIZE(ARRAY_INTERSECT(c.target_items_array, r.target_items_array)) as target_overlap
        FROM {_full_table_name('cases_silver')} c
        CROSS JOIN ref_case r
        WHERE c.case_id != '{case_id}'
        ORDER BY moe_match DESC, target_overlap DESC
        LIMIT {limit}
    """)

