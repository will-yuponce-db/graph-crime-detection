# Neo4j + Databricks Integration Workflow

## Overview

This app is designed as the **verification and approval step** in the Neo4j + Databricks data workflow. It allows users to visually verify proposed changes to a knowledge graph before committing them to Neo4j Aura.

## Complete Workflow

### 1. Engineer Data in Databricks

- Transform and prepare data in Databricks notebooks/workflows
- Data engineering happens in Delta Lake tables

### 2. Create Graph in Neo4j

- Initial graph is created in Neo4j Aura with Databricks data
- Uses Spark Connector or Neo4j Connector for Databricks

### 3. Extract Edge Table from Neo4j in Databricks

- Neo4j graph is extracted back to Databricks as an edge table
- Table format: `main.default.property_graph_entity_edges`

**Expected Schema:**

```sql
CREATE TABLE main.default.property_graph_entity_edges (
  node_start_id STRING,
  node_start_key STRING,
  relationship STRING,
  node_end_id STRING,
  node_end_key STRING,
  node_start_properties STRING,  -- JSON
  node_end_properties STRING     -- JSON
);
```

### 4. Identify New Nodes/Edges (Data Engineering)

- Databricks workflow identifies proposed additions
- Marks new nodes/edges with status = 'new'
- Writes to the edge table alongside existing data

### 5. Verify Graph Changes (THIS APP)

**Interactive Graph Editor on Databricks Apps**

Users can:

- ✅ Visualize the entire graph (existing + proposed)
- ✅ Toggle visibility of proposed changes
- ✅ Filter by node types and relationship types
- ✅ Inspect node/edge properties
- ✅ Manually create additional nodes/edges
- ✅ Edit proposed items
- ✅ Delete proposed items
- ✅ Verify changes before approval

### 6. Approve Data Merge

**"Save to Database" Button**

When clicked:

1. App writes NEW nodes/edges to Databricks SQL table
2. Updates status from 'new' → 'existing'
3. Can optionally trigger Databricks workflow (see below)

### 7. Engineering Workflow Writes to Neo4j

**Databricks → Neo4j Sync (Separate Workflow)**

After approval in the app:

- Databricks Job/Workflow monitors the edge table
- Detects newly approved items
- Writes them to Neo4j Aura using:
  - Neo4j Spark Connector
  - Neo4j Python Driver
  - Or REST API

## Current Implementation

### What the App Does

- **Reads from**: Databricks SQL Warehouse (`main.default.property_graph_entity_edges`)
- **Writes to**: Same Databricks table + SQLite cache
- **Status tracking**: Marks items as 'new' or 'existing'
- **Approval mechanism**: "Save to Database" button writes approved changes

### What Happens After Approval

The app writes to the Databricks table. A separate process (to be implemented) should:

1. **Option A: Databricks Job (Recommended)**

   ```python
   # scheduled_neo4j_sync.py
   from databricks import sql
   from neo4j import GraphDatabase

   # Read approved items from Databricks
   with sql.connect(...) as conn:
       new_items = conn.cursor().execute("""
           SELECT * FROM main.default.property_graph_entity_edges
           WHERE status = 'existing' AND updated_at > last_sync_time
       """).fetchall()

   # Write to Neo4j Aura
   with GraphDatabase.driver(neo4j_uri, auth=(user, password)) as driver:
       with driver.session() as session:
           for item in new_items:
               session.run("""
                   MERGE (a {id: $start_id})
                   SET a = $start_props
                   MERGE (b {id: $end_id})
                   SET b = $end_props
                   MERGE (a)-[r:$relationship]->(b)
               """, ...)
   ```

2. **Option B: Databricks Workflow Trigger**
   - App calls Databricks REST API to trigger workflow
   - Workflow handles Neo4j sync
   - Returns job ID for tracking

3. **Option C: Real-time Sync**
   - App writes to both Databricks AND Neo4j
   - Requires Neo4j credentials in app environment
   - More complex error handling

## Integration Points

### For Neo4j Product Team Demo

**What to Show:**

1. **Load existing graph** from Databricks (extracted from Neo4j)
2. **Toggle proposed changes** to show what's new
3. **Interactive exploration** - zoom, filter, inspect properties
4. **Manual additions** - drag-drop nodes, create edges
5. **Approval workflow** - click "Save to Database"
6. **Result**: Changes written to Databricks table (ready for Neo4j sync)

**Demo Flow:**

```
Neo4j Graph (existing)
  → Databricks Extract
    → App Visualization
      → Propose Changes
        → Verify & Approve
          → Databricks Table
            → [Workflow] → Neo4j Graph (updated)
```

### Environment Variables

The app uses these Databricks-provided variables:

```bash
DATABRICKS_HOST=e2-demo-field-eng.cloud.databricks.com
DATABRICKS_CLIENT_ID=603e4b84-f78b-4fea-bbac-91b93e910a08
DATABRICKS_CLIENT_SECRET=*** (auto-provided)
DATABRICKS_HTTP_PATH=/sql/1.0/warehouses/... (optional)
DATABRICKS_TABLE=main.default.property_graph_entity_edges (optional)
```

### Optional: Add Neo4j Sync Trigger

To trigger a Databricks workflow after approval, update `backend/server.js`:

```javascript
// After successful write to Databricks table
app.post('/api/graph', async (req, res) => {
  // ... write to Databricks SQL ...

  // Trigger Neo4j sync workflow
  if (process.env.DATABRICKS_WORKFLOW_ID) {
    try {
      await fetch(`https://${DATABRICKS_HOST}/api/2.1/jobs/run-now`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getAccessToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          job_id: process.env.DATABRICKS_WORKFLOW_ID,
        }),
      });
      console.log('✓ Neo4j sync workflow triggered');
    } catch (error) {
      console.warn('⚠️ Failed to trigger workflow:', error);
    }
  }

  res.json({ success: true, ... });
});
```

## Data Format

### Nodes (Stored in Edge Table)

```json
{
  "id": "person_1",
  "label": "Sarah Johnson",
  "type": "Person",
  "status": "existing",
  "properties": {
    "name": "Sarah Johnson",
    "title": "CEO",
    "email": "sarah@example.com"
  }
}
```

### Edges (Stored in Edge Table)

```json
{
  "id": "edge_1",
  "source": "person_1",
  "target": "company_1",
  "relationshipType": "WORKS_AT",
  "status": "new",
  "properties": {
    "start_date": "2024-01-01",
    "department": "Executive"
  }
}
```

### Databricks Table Format

```
| node_start_id | node_start_key | relationship | node_end_id | node_end_key | node_start_properties | node_end_properties | status   |
|---------------|----------------|--------------|-------------|--------------|------------------------|---------------------|----------|
| person_1      | Sarah Johnson  | WORKS_AT     | company_1   | TechCorp     | {"name":"Sarah",...}   | {"name":"Tech",...} | existing |
| person_2      | John Doe       | MANAGES      | person_3    | Jane Smith   | {"name":"John",...}    | {"name":"Jane",...} | new      |
```

## Timeline Alignment

### 7 November - Technical Reconvene

**Show:**

- ✅ Interactive graph visualization
- ✅ Proposed changes visualization (green vs blue)
- ✅ Approval workflow ("Save to Database")
- ✅ Databricks integration (reads/writes)
- 🔄 Discuss Neo4j sync approach

### 14 November - Neo4j Product Brief

**Demo:**

1. Load graph from Databricks (previously extracted from Neo4j)
2. Show existing knowledge graph
3. Demonstrate proposed additions (new nodes/edges)
4. Interactive verification (zoom, filter, inspect)
5. Approve changes with "Save to Database"
6. Explain: "Changes now ready for Databricks → Neo4j sync"

**Value Proposition:**

- Visual verification prevents bad data from entering Neo4j
- Interactive UI for data scientists/engineers
- Seamless Databricks + Neo4j workflow
- Reduces errors and improves data quality

## Next Steps

### Before Demo

1. ✅ App deployed to Databricks Apps
2. ✅ Load test data into Databricks table
3. ✅ Configure Databricks SQL Warehouse connection
4. 🔄 (Optional) Implement Neo4j sync workflow
5. 🔄 Test end-to-end with sample Neo4j data

### For Production

1. Add authentication/authorization
2. Implement audit logging
3. Add rollback capability
4. Scale to larger graphs (pagination, lazy loading)
5. Add Neo4j health checks
6. Monitoring and alerting

## Resources

- **Neo4j Spark Connector**: https://neo4j.com/docs/spark/current/
- **Neo4j Python Driver**: https://neo4j.com/docs/python-manual/current/
- **Databricks Jobs API**: https://docs.databricks.com/api/workspace/jobs
- **Graph Visualization Library**: https://github.com/neo4j/python-graph-visualization

## Contact

For questions about this integration:

- **Databricks Side**: [Your team contact]
- **Neo4j Side**: Neo4j Product Team (Spark Connect Team)
