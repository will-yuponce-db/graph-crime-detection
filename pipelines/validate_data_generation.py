# Databricks notebook source
# MAGIC %md
# MAGIC # Data Generation Validation
# MAGIC 
# MAGIC This notebook validates that the Lakeflow Spark Declarative Pipeline generated data correctly for the demo scenario.
# MAGIC 
# MAGIC Reference: [Databricks Python language reference](https://docs.databricks.com/aws/en/ldp/developer/python-ref)
# MAGIC 
# MAGIC ## Acceptance Criteria:
# MAGIC 1. In the DC incident bucket: `count(distinct entity_id) == 50` in target cell
# MAGIC 2. Suspect pair appears in ≥ 3 burglary windows
# MAGIC 3. Nashville case window shares the suspect pair
# MAGIC 4. Burner: old entity disappears after T; new entity appears at T+1 in same cell
# MAGIC 5. Query returns the 2 suspects on every run (deterministic seed)
# MAGIC 6. Handoff detection returns the correct old→new pair in top-1

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

CATALOG = "pubsec_geo_law"
SCHEMA = "demo"

# Expected values from config
DC_INCIDENT_BUCKET = "2025-01-15T14:30"
DC_INCIDENT_H3_CELL = "892a1008003ffff"
NASHVILLE_INCIDENT_BUCKET = "2025-01-08T15:15"
NASHVILLE_INCIDENT_H3_CELL = "8844c0a305fffff"
BURNER_SWITCH_BUCKET = "2025-01-15T14:45"

SUSPECT_1_ID = "E_0412"
SUSPECT_2_ID = "E_1098"
BURNER_ENTITY_ID = "E_7734"

DC_INCIDENT_ENTITY_COUNT = 50

# COMMAND ----------

# MAGIC %md
# MAGIC ## Helper Functions

# COMMAND ----------

from pyspark.sql import functions as F

def check_assertion(name: str, condition: bool, message: str = ""):
    """Print validation result and return status."""
    status = "✅ PASS" if condition else "❌ FAIL"
    print(f"{status}: {name}")
    if not condition and message:
        print(f"   → {message}")
    return condition

def run_all_validations():
    """Run all validation checks and return summary."""
    results = []
    
    # Set catalog/schema
    spark.sql(f"USE CATALOG {CATALOG}")
    spark.sql(f"USE SCHEMA {SCHEMA}")
    
    print("=" * 60)
    print("DATA GENERATION VALIDATION REPORT")
    print("=" * 60)
    print()
    
    # =========================================================================
    # CHECK 1: DC Incident Cell has 50 devices
    # =========================================================================
    print("📍 CHECK 1: DC Incident Cell Device Count")
    print("-" * 40)
    
    dc_count = spark.sql(f"""
        SELECT COUNT(DISTINCT entity_id) as device_count
        FROM location_events_silver
        WHERE h3_cell = '{DC_INCIDENT_H3_CELL}'
          AND time_bucket = '{DC_INCIDENT_BUCKET}'
    """).collect()[0]["device_count"]
    
    results.append(check_assertion(
        "DC incident cell has exactly 50 devices",
        dc_count == DC_INCIDENT_ENTITY_COUNT,
        f"Expected {DC_INCIDENT_ENTITY_COUNT}, got {dc_count}"
    ))
    print()
    
    # =========================================================================
    # CHECK 2: Both suspects present in DC cell
    # =========================================================================
    print("👥 CHECK 2: Suspects Present in DC Incident")
    print("-" * 40)
    
    dc_suspects = spark.sql(f"""
        SELECT entity_id
        FROM location_events_silver
        WHERE h3_cell = '{DC_INCIDENT_H3_CELL}'
          AND time_bucket = '{DC_INCIDENT_BUCKET}'
          AND entity_id IN ('{SUSPECT_1_ID}', '{SUSPECT_2_ID}')
    """).collect()
    
    dc_suspect_ids = [r["entity_id"] for r in dc_suspects]
    results.append(check_assertion(
        f"Suspect 1 ({SUSPECT_1_ID}) present in DC incident",
        SUSPECT_1_ID in dc_suspect_ids
    ))
    results.append(check_assertion(
        f"Suspect 2 ({SUSPECT_2_ID}) present in DC incident",
        SUSPECT_2_ID in dc_suspect_ids
    ))
    print()
    
    # =========================================================================
    # CHECK 3: Suspects appear in Nashville
    # =========================================================================
    print("🎸 CHECK 3: Suspects Present in Nashville Incident")
    print("-" * 40)
    
    nash_suspects = spark.sql(f"""
        SELECT entity_id
        FROM location_events_silver
        WHERE h3_cell = '{NASHVILLE_INCIDENT_H3_CELL}'
          AND time_bucket = '{NASHVILLE_INCIDENT_BUCKET}'
          AND entity_id IN ('{SUSPECT_1_ID}', '{SUSPECT_2_ID}')
    """).collect()
    
    nash_suspect_ids = [r["entity_id"] for r in nash_suspects]
    results.append(check_assertion(
        f"Suspect 1 ({SUSPECT_1_ID}) present in Nashville",
        SUSPECT_1_ID in nash_suspect_ids
    ))
    results.append(check_assertion(
        f"Suspect 2 ({SUSPECT_2_ID}) present in Nashville",
        SUSPECT_2_ID in nash_suspect_ids
    ))
    print()
    
    # =========================================================================
    # CHECK 4: Suspect pair appears in ≥ 3 burglary windows
    # =========================================================================
    print("🔄 CHECK 4: Suspects Appear in Multiple Burglary Windows")
    print("-" * 40)
    
    suspect_case_overlap = spark.sql(f"""
        SELECT entity_id, COUNT(DISTINCT case_id) as case_count
        FROM entity_case_overlap
        WHERE entity_id IN ('{SUSPECT_1_ID}', '{SUSPECT_2_ID}')
        GROUP BY entity_id
    """).collect()
    
    for row in suspect_case_overlap:
        results.append(check_assertion(
            f"Entity {row['entity_id']} linked to ≥ 3 cases",
            row["case_count"] >= 3,
            f"Found {row['case_count']} cases"
        ))
    print()
    
    # =========================================================================
    # CHECK 5: Burner Phone Switch Detection
    # =========================================================================
    print("📱 CHECK 5: Burner Phone Switch")
    print("-" * 40)
    
    # Check Suspect 1 NOT present after incident
    suspect1_after = spark.sql(f"""
        SELECT COUNT(*) as count
        FROM location_events_silver
        WHERE entity_id = '{SUSPECT_1_ID}'
          AND time_bucket >= '{BURNER_SWITCH_BUCKET}'
    """).collect()[0]["count"]
    
    results.append(check_assertion(
        f"Suspect 1 ({SUSPECT_1_ID}) disappears after DC incident",
        suspect1_after == 0,
        f"Found {suspect1_after} events after switch"
    ))
    
    # Check Burner appears at T+1
    burner_first = spark.sql(f"""
        SELECT MIN(time_bucket) as first_bucket, h3_cell
        FROM location_events_silver
        WHERE entity_id = '{BURNER_ENTITY_ID}'
        GROUP BY h3_cell
        ORDER BY first_bucket
        LIMIT 1
    """).collect()[0]
    
    results.append(check_assertion(
        f"Burner ({BURNER_ENTITY_ID}) appears at T+1 bucket",
        burner_first["first_bucket"] == BURNER_SWITCH_BUCKET,
        f"First appeared at {burner_first['first_bucket']}"
    ))
    
    results.append(check_assertion(
        f"Burner appears in same cell as DC incident",
        burner_first["h3_cell"] == DC_INCIDENT_H3_CELL
    ))
    
    # Check Burner continues with Suspect 2
    burner_with_suspect2 = spark.sql(f"""
        SELECT COUNT(DISTINCT cp.time_buckets) as shared_windows
        FROM co_presence_edges cp
        WHERE (entity_id_1 = '{BURNER_ENTITY_ID}' AND entity_id_2 = '{SUSPECT_2_ID}')
           OR (entity_id_1 = '{SUSPECT_2_ID}' AND entity_id_2 = '{BURNER_ENTITY_ID}')
    """).collect()[0]["shared_windows"]
    
    results.append(check_assertion(
        f"Burner and Suspect 2 have co-presence",
        burner_with_suspect2 > 0,
        f"Found {burner_with_suspect2} shared time windows"
    ))
    print()
    
    # =========================================================================
    # CHECK 6: Handoff Detection Returns Correct Pair
    # =========================================================================
    print("🔍 CHECK 6: Handoff Detection Accuracy")
    print("-" * 40)
    
    top_handoff = spark.sql("""
        SELECT old_entity_id, new_entity_id, handoff_score, rank
        FROM handoff_candidates
        WHERE rank = 1
    """).collect()
    
    if top_handoff:
        handoff = top_handoff[0]
        results.append(check_assertion(
            f"Top handoff candidate: {handoff['old_entity_id']} → {handoff['new_entity_id']}",
            handoff["old_entity_id"] == SUSPECT_1_ID and 
            handoff["new_entity_id"] == BURNER_ENTITY_ID,
            f"Expected {SUSPECT_1_ID} → {BURNER_ENTITY_ID}"
        ))
        print(f"   Handoff score: {handoff['handoff_score']:.3f}")
    else:
        results.append(check_assertion(
            "Handoff detection found candidates",
            False,
            "No handoff candidates found"
        ))
    print()
    
    # =========================================================================
    # CHECK 7: Suspect Rankings Return Top 2 Correctly
    # =========================================================================
    print("🏆 CHECK 7: Suspect Rankings Accuracy")
    print("-" * 40)
    
    top_suspects = spark.sql("""
        SELECT entity_id, rank, total_score, states_count, unique_cases
        FROM suspect_rankings
        WHERE rank <= 2
        ORDER BY rank
    """).collect()
    
    top_2_ids = [r["entity_id"] for r in top_suspects]
    results.append(check_assertion(
        f"Top 2 ranked suspects are {SUSPECT_1_ID} and {SUSPECT_2_ID}",
        set(top_2_ids) == {SUSPECT_1_ID, SUSPECT_2_ID},
        f"Got: {top_2_ids}"
    ))
    
    for suspect in top_suspects:
        print(f"   Rank {suspect['rank']}: {suspect['entity_id']} "
              f"(score={suspect['total_score']:.3f}, "
              f"cases={suspect['unique_cases']}, "
              f"states={suspect['states_count']})")
    print()
    
    # =========================================================================
    # CHECK 8: Cross-Jurisdiction Link Exists
    # =========================================================================
    print("🌐 CHECK 8: Cross-Jurisdiction Connection")
    print("-" * 40)
    
    cross_jurisdiction = spark.sql(f"""
        SELECT sr.entity_id, sr.states_count, sr.linked_cities
        FROM suspect_rankings sr
        WHERE sr.entity_id IN ('{SUSPECT_1_ID}', '{SUSPECT_2_ID}')
          AND sr.states_count > 1
    """).collect()
    
    results.append(check_assertion(
        "Both suspects have cross-jurisdiction presence",
        len(cross_jurisdiction) == 2,
        f"Found {len(cross_jurisdiction)} with multi-state presence"
    ))
    print()
    
    # =========================================================================
    # SUMMARY
    # =========================================================================
    print("=" * 60)
    print("VALIDATION SUMMARY")
    print("=" * 60)
    
    passed = sum(results)
    total = len(results)
    success_rate = (passed / total) * 100 if total > 0 else 0
    
    print(f"\nPassed: {passed}/{total} ({success_rate:.1f}%)")
    
    if passed == total:
        print("\n🎉 ALL VALIDATIONS PASSED - Data is ready for demo!")
    else:
        print(f"\n⚠️  {total - passed} validation(s) failed - Review data generation")
    
    return passed == total

# COMMAND ----------

# MAGIC %md
# MAGIC ## Run Validations

# COMMAND ----------

all_passed = run_all_validations()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Data Preview Queries
# MAGIC 
# MAGIC These queries help visualize the generated data for debugging.

# COMMAND ----------

# MAGIC %sql
# MAGIC -- Preview: DC Incident Cell Entities
# MAGIC SELECT entity_id, time_bucket, h3_cell, city
# MAGIC FROM pubsec_geo_law.demo.location_events_silver
# MAGIC WHERE h3_cell = '892a1008003ffff'
# MAGIC   AND time_bucket = '2025-01-15T14:30'
# MAGIC ORDER BY entity_id
# MAGIC LIMIT 55

# COMMAND ----------

# MAGIC %sql
# MAGIC -- Preview: Suspect Movement Timeline
# MAGIC SELECT entity_id, time_bucket, h3_cell, city, state
# MAGIC FROM pubsec_geo_law.demo.location_events_silver
# MAGIC WHERE entity_id IN ('E_0412', 'E_1098', 'E_7734')
# MAGIC ORDER BY time_bucket, entity_id

# COMMAND ----------

# MAGIC %sql
# MAGIC -- Preview: Cases
# MAGIC SELECT case_id, case_type, city, state, incident_time_bucket, method_of_entry, estimated_loss
# MAGIC FROM pubsec_geo_law.demo.cases_silver
# MAGIC ORDER BY incident_time_bucket

# COMMAND ----------

# MAGIC %sql
# MAGIC -- Preview: Top Handoff Candidates
# MAGIC SELECT old_entity_id, new_entity_id, h3_cell, old_last_bucket, new_first_bucket,
# MAGIC        time_diff_minutes, shared_partner_count, handoff_score, rank
# MAGIC FROM pubsec_geo_law.demo.handoff_candidates
# MAGIC ORDER BY rank
# MAGIC LIMIT 10

# COMMAND ----------

# MAGIC %sql
# MAGIC -- Preview: Top Suspect Rankings
# MAGIC SELECT entity_id, rank, total_score, unique_cases, states_count, 
# MAGIC        linked_cases, linked_cities
# MAGIC FROM pubsec_geo_law.demo.suspect_rankings
# MAGIC ORDER BY rank
# MAGIC LIMIT 10

# COMMAND ----------

# MAGIC %sql
# MAGIC -- Preview: Co-Presence Edges for Suspects
# MAGIC SELECT entity_id_1, entity_id_2, h3_cell, city, state, 
# MAGIC        co_occurrence_count, weight, time_buckets
# MAGIC FROM pubsec_geo_law.demo.co_presence_edges
# MAGIC WHERE entity_id_1 IN ('E_0412', 'E_1098', 'E_7734')
# MAGIC    OR entity_id_2 IN ('E_0412', 'E_1098', 'E_7734')
# MAGIC ORDER BY weight DESC

# COMMAND ----------

# MAGIC %sql
# MAGIC -- Preview: Cell Device Counts (for Heatmap)
# MAGIC SELECT h3_cell, time_bucket, city, device_count, activity_category,
# MAGIC        center_lat, center_lon
# MAGIC FROM pubsec_geo_law.demo.cell_device_counts
# MAGIC WHERE device_count >= 10
# MAGIC ORDER BY device_count DESC
# MAGIC LIMIT 20

