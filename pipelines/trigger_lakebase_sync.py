# Databricks notebook source
# MAGIC %md
# MAGIC # Trigger Lakebase Sync Refresh
# MAGIC
# MAGIC Triggers a refresh of all synced table pipelines so that the latest
# MAGIC DLT output is propagated to the Lakebase PostgreSQL instance.
# MAGIC
# MAGIC This notebook is designed to run as a task in the pipeline job,
# MAGIC immediately after `validate_data` completes.
# MAGIC
# MAGIC **Parameters:**
# MAGIC - `lakebase_catalog`: UC database catalog for the Lakebase instance
# MAGIC - `source_schema`: Schema name (e.g. `demo`)

# COMMAND ----------

# MAGIC %pip install --upgrade databricks-sdk

# COMMAND ----------

dbutils.library.restartPython()

# COMMAND ----------

dbutils.widgets.text("lakebase_catalog", "investigative_analytics_pg")
dbutils.widgets.text("source_schema", "demo")

lakebase_catalog = dbutils.widgets.get("lakebase_catalog")
source_schema = dbutils.widgets.get("source_schema")

print(f"Lakebase catalog: {lakebase_catalog}")
print(f"Source schema: {source_schema}")

# COMMAND ----------

# All 12 app-facing synced tables
SYNCED_TABLE_NAMES = [
    "cases_silver",
    "location_events_silver",
    "social_edges_silver",
    "person_device_links_silver",
    "persons_silver",
    "suspect_rankings",
    "co_presence_edges",
    "entity_case_overlap",
    "cell_device_counts",
    "evidence_card_data",
    "handoff_candidates",
    "case_summary_with_suspects",
]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Trigger Refresh for All Synced Tables

# COMMAND ----------

from databricks.sdk import WorkspaceClient
import time

w = WorkspaceClient()

results = []

for table_name in SYNCED_TABLE_NAMES:
    fqn = f"{lakebase_catalog}.{source_schema}.{table_name}"
    print(f"Triggering refresh for: {fqn}")

    try:
        # Get the synced table to find its underlying pipeline
        synced_table = w.database.get_synced_database_table(name=fqn)

        if not synced_table.spec or not synced_table.spec.pipeline_id:
            print(f"  WARNING: No pipeline_id found for {table_name}, skipping")
            results.append({"table": table_name, "status": "skipped", "error": "no pipeline_id"})
            continue

        pipeline_id = synced_table.spec.pipeline_id

        # Trigger a pipeline update (refresh)
        update = w.pipelines.start_update(
            pipeline_id=pipeline_id,
            refresh_selection=[fqn],
        )
        print(f"  Triggered pipeline {pipeline_id}, update_id: {update.update_id}")
        results.append({
            "table": table_name,
            "status": "triggered",
            "pipeline_id": pipeline_id,
            "update_id": update.update_id,
            "error": None,
        })

    except Exception as e:
        error_msg = str(e)
        print(f"  FAILED: {error_msg}")
        results.append({"table": table_name, "status": "failed", "error": error_msg})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Wait for Syncs to Complete

# COMMAND ----------

MAX_WAIT_SECONDS = 600  # 10 minutes max
POLL_INTERVAL = 15  # Check every 15 seconds

triggered = [r for r in results if r["status"] == "triggered"]
if not triggered:
    print("No syncs were triggered, nothing to wait for.")
else:
    print(f"\nWaiting for {len(triggered)} synced tables to complete...")
    start_time = time.time()

    pending = {r["table"]: r for r in triggered}
    completed = {}

    while pending and (time.time() - start_time) < MAX_WAIT_SECONDS:
        time.sleep(POLL_INTERVAL)
        elapsed = int(time.time() - start_time)

        for table_name in list(pending.keys()):
            fqn = f"{lakebase_catalog}.{source_schema}.{table_name}"
            try:
                status = w.database.get_synced_database_table(name=fqn)
                state = (
                    status.data_synchronization_status.detailed_state
                    if status.data_synchronization_status
                    else "UNKNOWN"
                )

                if state in ("ONLINE", "ACTIVE"):
                    print(f"  [{elapsed}s] {table_name}: {state} (complete)")
                    completed[table_name] = pending.pop(table_name)
                elif state in ("FAILED", "ERROR"):
                    msg = (
                        status.data_synchronization_status.message
                        if status.data_synchronization_status
                        else "unknown error"
                    )
                    print(f"  [{elapsed}s] {table_name}: {state} - {msg}")
                    pending[table_name]["status"] = "failed"
                    pending[table_name]["error"] = msg
                    completed[table_name] = pending.pop(table_name)
                else:
                    print(f"  [{elapsed}s] {table_name}: {state} (in progress)")
            except Exception as e:
                print(f"  [{elapsed}s] {table_name}: ERROR checking status - {e}")

    if pending:
        print(f"\nWARNING: {len(pending)} table(s) did not complete within {MAX_WAIT_SECONDS}s:")
        for t in pending:
            print(f"  - {t}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Summary

# COMMAND ----------

triggered_count = len([r for r in results if r["status"] == "triggered"])
failed_count = len([r for r in results if r["status"] == "failed"])
skipped_count = len([r for r in results if r["status"] == "skipped"])

print(f"\n{'='*60}")
print(f"Lakebase Sync Trigger Summary")
print(f"{'='*60}")
print(f"  Triggered: {triggered_count}")
print(f"  Skipped:   {skipped_count}")
print(f"  Failed:    {failed_count}")
print(f"  Total:     {len(results)}")

if failed_count > 0:
    error_details = "; ".join([f"{r['table']}: {r['error']}" for r in results if r["status"] == "failed"])
    print(f"\nFailed tables:")
    for r in results:
        if r["status"] == "failed":
            print(f"  - {r['table']}: {r['error']}")
    dbutils.notebook.exit(f"FAILED: {error_details}")
    raise Exception(f"{failed_count} synced table refresh(es) failed: {error_details}")
else:
    print(f"\nAll synced table refreshes completed successfully!")
    dbutils.notebook.exit(f"SUCCESS: {triggered_count} triggered, {skipped_count} skipped")
