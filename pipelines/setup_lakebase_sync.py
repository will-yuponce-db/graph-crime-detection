# Databricks notebook source
# MAGIC %md
# MAGIC # Lakebase Synced Table Setup
# MAGIC
# MAGIC One-time setup notebook that creates synced tables from Unity Catalog
# MAGIC to the Lakebase PostgreSQL instance. Run this once after initial deployment,
# MAGIC or re-run if the table list changes.
# MAGIC
# MAGIC **Parameters:**
# MAGIC - `source_catalog`: Unity Catalog name (e.g. `pubsec_geo_law`)
# MAGIC - `source_schema`: Schema name (e.g. `demo`)
# MAGIC - `lakebase_catalog`: UC database catalog for Lakebase instance
# MAGIC - `lakebase_database`: Postgres database name in the Lakebase instance
# MAGIC - `lakebase_instance`: Lakebase database instance name

# COMMAND ----------

dbutils.widgets.text("source_catalog", "pubsec_geo_law")
dbutils.widgets.text("source_schema", "demo")
dbutils.widgets.text("lakebase_catalog", "investigative_analytics_pg")
dbutils.widgets.text("lakebase_database", "investigative_analytics")
dbutils.widgets.text("lakebase_instance", "investigative-analytics-pg")

source_catalog = dbutils.widgets.get("source_catalog")
source_schema = dbutils.widgets.get("source_schema")
lakebase_catalog = dbutils.widgets.get("lakebase_catalog")
lakebase_database = dbutils.widgets.get("lakebase_database")
lakebase_instance = dbutils.widgets.get("lakebase_instance")

print(f"Source: {source_catalog}.{source_schema}")
print(f"Lakebase catalog: {lakebase_catalog}")
print(f"Lakebase database: {lakebase_database}")
print(f"Lakebase instance: {lakebase_instance}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Table Definitions
# MAGIC
# MAGIC Each table needs a primary key for efficient synced table operation.
# MAGIC Composite keys are used where no single column is unique.

# COMMAND ----------

# All 12 app-facing tables with their primary keys
SYNCED_TABLES = [
    # Silver layer tables
    {"name": "cases_silver", "pk": ["case_id"]},
    {"name": "location_events_silver", "pk": ["event_id"]},
    {"name": "social_edges_silver", "pk": ["edge_id"]},
    {"name": "person_device_links_silver", "pk": ["link_id"]},
    {"name": "persons_silver", "pk": ["person_id"]},
    # Gold layer tables
    {"name": "suspect_rankings", "pk": ["entity_id"]},
    {"name": "co_presence_edges", "pk": ["edge_id"]},
    {"name": "entity_case_overlap", "pk": ["entity_id", "case_id"]},
    {"name": "cell_device_counts", "pk": ["h3_cell", "time_bucket"]},
    {"name": "evidence_card_data", "pk": ["device_id"]},
    {"name": "handoff_candidates", "pk": ["old_entity_id", "new_entity_id", "h3_cell"]},
    {"name": "case_summary_with_suspects", "pk": ["case_id"]},
]

print(f"Will create {len(SYNCED_TABLES)} synced tables")
for t in SYNCED_TABLES:
    print(f"  - {t['name']} (PK: {', '.join(t['pk'])})")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Create Synced Tables

# COMMAND ----------

from databricks.sdk import WorkspaceClient
from databricks.sdk.service.database import (
    SyncedDatabaseTable,
    SyncedTableSpec,
    NewPipelineSpec,
    SyncedTableSchedulingPolicy,
)

w = WorkspaceClient()

results = []

for table_def in SYNCED_TABLES:
    table_name = table_def["name"]
    pk_columns = table_def["pk"]

    source_fqn = f"{source_catalog}.{source_schema}.{table_name}"
    dest_fqn = f"{lakebase_catalog}.{source_schema}.{table_name}"

    print(f"\nCreating synced table: {dest_fqn}")
    print(f"  Source: {source_fqn}")
    print(f"  Primary key: {pk_columns}")
    print(f"  Sync mode: TRIGGERED")

    try:
        synced_table = w.database.create_synced_database_table(
            SyncedDatabaseTable(
                name=dest_fqn,
                spec=SyncedTableSpec(
                    source_table_full_name=source_fqn,
                    primary_key_columns=pk_columns,
                    scheduling_policy=SyncedTableSchedulingPolicy.TRIGGERED,
                    new_pipeline_spec=NewPipelineSpec(
                        storage_catalog=lakebase_catalog,
                        storage_schema=source_schema,
                    ),
                ),
            )
        )
        print(f"  SUCCESS: Created {synced_table.name}")
        results.append({"table": table_name, "status": "created", "error": None})
    except Exception as e:
        error_msg = str(e)
        # If table already exists, that's OK
        if "already exists" in error_msg.lower():
            print(f"  SKIPPED: {table_name} already exists")
            results.append({"table": table_name, "status": "exists", "error": None})
        else:
            print(f"  FAILED: {error_msg}")
            results.append({"table": table_name, "status": "failed", "error": error_msg})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Summary

# COMMAND ----------

import json

created = [r for r in results if r["status"] == "created"]
exists = [r for r in results if r["status"] == "exists"]
failed = [r for r in results if r["status"] == "failed"]

print(f"\n{'='*60}")
print(f"Synced Table Setup Summary")
print(f"{'='*60}")
print(f"  Created: {len(created)}")
print(f"  Already existed: {len(exists)}")
print(f"  Failed: {len(failed)}")

if failed:
    print(f"\nFailed tables:")
    for r in failed:
        print(f"  - {r['table']}: {r['error']}")
    raise Exception(f"{len(failed)} synced table(s) failed to create")
else:
    print(f"\nAll {len(SYNCED_TABLES)} synced tables are ready!")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Verify Synced Table Status

# COMMAND ----------

print(f"\nChecking synced table status...")
for table_def in SYNCED_TABLES:
    table_name = table_def["name"]
    dest_fqn = f"{lakebase_catalog}.{source_schema}.{table_name}"
    try:
        status = w.database.get_synced_database_table(name=dest_fqn)
        sync_state = (
            status.data_synchronization_status.detailed_state
            if status.data_synchronization_status
            else "UNKNOWN"
        )
        print(f"  {table_name}: {sync_state}")
    except Exception as e:
        print(f"  {table_name}: ERROR - {e}")
