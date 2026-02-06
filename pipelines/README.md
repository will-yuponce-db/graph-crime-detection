# Data Generation Pipeline

This directory contains the Lakeflow Spark Declarative Pipeline (SDP) for generating synthetic demo data for the Cross-Jurisdictional Investigative Analytics demo.

> **Note**: This pipeline uses the newer `pyspark.pipelines` module syntax (imported as `dp`) instead of the legacy `dlt` module. See the [Databricks Python language reference](https://docs.databricks.com/aws/en/ldp/developer/python-ref) for details.

## Overview

The pipeline generates a complete synthetic dataset representing:
- A traveling burglary crew (2 suspects) operating across Washington D.C., Nashville, and Arlington
- 50 device signals in the target incident cell (needle in the haystack)
- A "burner phone switch" plot twist where one suspect swaps devices
- Co-presence networks, case linkages, and social connections

## Files

| File | Purpose |
|------|---------|
| `databricks.yml` | Databricks Asset Bundle config (pipelines, jobs, Lakebase infra) |
| `data_generation_dlt.py` | Main DLT pipeline with all table definitions |
| `config.py` | Configuration constants (entity IDs, H3 cells, timestamps) |
| `dlt_pipeline_config.json` | Pipeline deployment configuration |
| `setup_catalog.sql` | Unity Catalog setup script |
| `validate_data_generation.py` | Validation notebook with acceptance criteria |
| `setup_lakebase_sync.py` | One-time notebook: creates 12 synced tables in Lakebase Postgres |
| `trigger_lakebase_sync.py` | Triggers sync refresh for all synced tables after DLT completes |

## Data Layers

### Bronze (Raw)
- `location_events_bronze` - Synthetic location pings
- `cases_bronze` - Crime incident records
- `social_edges_bronze` - Social network relationships

### Silver (Cleaned)
- `location_events_silver` - Enriched with timestamps, day/night flags
- `cases_silver` - Categorized by method of entry, target items
- `social_edges_silver` - Confidence-flagged relationships

### Gold (Analytics)
- `co_presence_edges` - Entity co-location graph edges
- `entity_case_overlap` - Links entities to crime scenes
- `suspect_rankings` - Multi-factor suspect scoring
- `handoff_candidates` - Burner phone switch detection
- `cell_device_counts` - Heatmap aggregations
- `evidence_card_data` - Pre-computed AI evidence
- `case_summary_with_suspects` - Case summaries with linked suspect details

## Lakebase Postgres Sync

The 12 app-facing tables (5 silver + 7 gold) are synced to a **Lakebase Postgres** instance for low-latency serving. This uses Databricks' built-in **synced tables** (Reverse ETL) feature.

### Architecture

```
DLT Pipeline (UC tables)  -->  Synced Tables  -->  Lakebase Postgres  -->  App Backend (pg)
     bronze/silver/gold         (managed by           (read-only            (node-postgres
                                 Lakeflow)             replicas)             queries)
```

### How it works

1. **`setup_lakebase_sync.py`** (one-time) creates a synced table for each UC table, with a primary key and `TRIGGERED` sync mode. Run via `databricks bundle run lakebase_setup_job -t dev`.

2. **`trigger_lakebase_sync.py`** runs as the final task in the pipeline job. It triggers a refresh of all 12 synced table pipelines and waits for them to complete.

3. Synced tables are **read-only** in Postgres. ARRAY and STRUCT columns are mapped to **JSONB**.

### DAB Resources

The `databricks.yml` bundle declares:
- `database_instances.lakebase_instance` — the Lakebase Postgres instance (CU_1)
- `database_catalogs.lakebase_catalog` — registers the instance in Unity Catalog
- `lakebase_setup_job` — one-time job to create synced tables
- `sync_to_lakebase` task — added to the main pipeline job after `validate_data`

### Grant App Permissions

After synced tables are created, the Databricks App's service principal needs read access to the synced schema. Connect to the Lakebase instance (e.g. via `psql` or a script using `node-postgres`) and run:

```sql
-- Replace <SP_CLIENT_ID> with the app's service principal client ID
-- (visible in the Databricks Apps → Authorization tab, or PGUSER env var)
GRANT USAGE ON SCHEMA demo TO "<SP_CLIENT_ID>";
GRANT SELECT ON ALL TABLES IN SCHEMA demo TO "<SP_CLIENT_ID>";
ALTER DEFAULT PRIVILEGES IN SCHEMA demo GRANT SELECT ON TABLES TO "<SP_CLIENT_ID>";
```

You can connect using your Databricks OAuth token as the password:

```bash
# Get your token
databricks auth token --host https://<WORKSPACE_HOST>

# Connect (use token as password when prompted)
PGPASSWORD="<token>" psql \
  -h <LAKEBASE_PGHOST> \
  -p 5432 \
  -U <your-email@databricks.com> \
  -d investigative_analytics
```

Or use the `pg` module from the backend directory:

```bash
cd app/backend && node -e "
const { Client } = require('pg');
(async () => {
  const token = JSON.parse(require('child_process').execSync(
    'databricks auth token --host https://<WORKSPACE_HOST>'
  ).toString()).access_token;
  const client = new Client({
    host: '<LAKEBASE_PGHOST>',
    port: 5432,
    database: 'investigative_analytics',
    user: '<your-email@databricks.com>',
    password: token,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const sp = '<SP_CLIENT_ID>';
  await client.query('GRANT USAGE ON SCHEMA demo TO \"' + sp + '\"');
  await client.query('GRANT SELECT ON ALL TABLES IN SCHEMA demo TO \"' + sp + '\"');
  await client.query('ALTER DEFAULT PRIVILEGES IN SCHEMA demo GRANT SELECT ON TABLES TO \"' + sp + '\"');
  console.log('Grants applied successfully');
  await client.end();
})().catch(e => { console.error(e.message); process.exit(1); });
"
```

### Customizing

To change the Lakebase instance name, database, or catalog, override the variables when deploying:

```bash
databricks bundle deploy -t dev \
  --var lakebase_instance_name=my-custom-instance \
  --var lakebase_database=my_database \
  --var lakebase_catalog=my_catalog
```

## Deployment Steps

### 1. Setup Unity Catalog

```sql
-- Run in a SQL warehouse or notebook
%run ./setup_catalog.sql
```

### 2. Create the DLT Pipeline

**Option A: Via UI**
1. Navigate to Workflows → Delta Live Tables
2. Click "Create Pipeline"
3. Name: `investigative_analytics_demo_pipeline`
4. Product Edition: Advanced
5. Source Code: Path to `data_generation_dlt.py`
6. Target: `investigative_analytics.demo`
7. Save and Start

**Option B: Via Databricks CLI**
```bash
databricks pipelines create --json @dlt_pipeline_config.json
```

### 3. Run the Pipeline

```bash
# Trigger a full refresh
databricks pipelines start --pipeline-id <PIPELINE_ID> --full-refresh
```

### 4. Validate the Data

Run the validation notebook after the pipeline completes:

```python
%run ./validate_data_generation
```

Expected output:
```
✅ PASS: DC incident cell has exactly 50 devices
✅ PASS: Suspect 1 (E_0412) present in DC incident
✅ PASS: Suspect 2 (E_1098) present in DC incident
✅ PASS: Suspect 1 (E_0412) present in Nashville
✅ PASS: Suspect 2 (E_1098) present in Nashville
...
```

## Key Entity IDs

| Entity | ID | Role |
|--------|-----|------|
| Suspect Alpha | `E_0412` | Primary suspect, disappears after DC |
| Suspect Bravo | `E_1098` | Partner, continues throughout |
| Burner Phone | `E_7734` | Replaces Alpha after switch |
| Fence | `E_9901` | Connected to fencing operation |
| Decoy | `E_5555` | Fails handoff criteria (control) |

## Key Time Windows

| Event | Time Bucket | H3 Cell | City |
|-------|-------------|---------|------|
| Nashville Burglary | `2025-01-08T15:15` | `8844c0a305fffff` | Nashville, TN |
| DC Burglary #2 | `2025-01-10T22:00` | `892a1008017ffff` | Washington, DC |
| Arlington Burglary | `2025-01-12T03:30` | `892a1072a93ffff` | Arlington, VA |
| DC Burglary #1 | `2025-01-15T14:30` | `892a1008003ffff` | Washington, DC |
| Burner Switch | `2025-01-15T14:45` | `892a1008003ffff` | Washington, DC |

## Acceptance Criteria

The validation notebook checks all of these:

1. ✅ DC incident bucket has exactly 50 devices in target cell
2. ✅ Suspect pair appears in ≥ 3 burglary windows
3. ✅ Nashville case window shares the suspect pair
4. ✅ Burner switch: old entity disappears, new entity appears at T+1
5. ✅ Suspect rankings return same top 2 on every run (deterministic)
6. ✅ Handoff detection returns correct old→new pair as top-1

## Demo Queries

### Find devices in DC incident cell
```sql
SELECT entity_id, time_bucket
FROM investigative_analytics.demo.location_events_silver
WHERE h3_cell = '892a1008003ffff'
  AND time_bucket = '2025-01-15T14:30'
ORDER BY entity_id;
```

### Get top suspects
```sql
SELECT entity_id, rank, total_score, linked_cases, linked_cities
FROM investigative_analytics.demo.suspect_rankings
WHERE rank <= 5;
```

### Detect burner switch
```sql
SELECT old_entity_id, new_entity_id, handoff_score
FROM investigative_analytics.demo.handoff_candidates
WHERE rank = 1;
```

## Troubleshooting

**Pipeline fails on H3 cell validation**
- Ensure H3 cells are exactly 15 characters (resolution 9)
- Check that coordinates are within valid ranges

**Rankings don't show expected suspects**
- Run validation notebook to identify data issues
- Check that random seed is set correctly (should be 42)

**Handoff not detected**
- Verify Suspect 1 has no events after `2025-01-15T14:30`
- Confirm Burner entity first appears at `2025-01-15T14:45`

## Modifying the Demo Data

To customize the scenario:

1. Edit `config.py` with new entity IDs, timestamps, or H3 cells
2. Update the data generation logic in `data_generation_dlt.py`
3. Re-run the pipeline with `--full-refresh`
4. Validate with `validate_data_generation.py`

Keep the random seed (`RANDOM_SEED = 42`) for deterministic results.

