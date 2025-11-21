# Interactive Graph Editor - User Guide

## Overview

The graph visualization tool has been upgraded to a full-featured **interactive graph editor** where you can:

- Create new nodes by dragging from a palette
- Create relationships by clicking nodes
- Edit existing nodes and edges
- Delete user-created items
- Save changes to a SQLite database (with optional Databricks sync)

## Quick Start

### 1. Backend Setup

First, initialize and start the backend server:

```bash
cd backend
npm install
npm run seed    # Seed the database with initial data
npm start       # Start the server on http://localhost:3000
```

The backend will:

- Create a SQLite database at `backend/db/graph.db`
- Seed it with mock graph data (if empty)
- Provide REST API endpoints for the frontend
- Optionally sync to Databricks if configured

### 2. Frontend Setup

In a new terminal, start the frontend:

```bash
npm install
npm run dev     # Start Vite dev server
```

The frontend will connect to the backend at `http://localhost:3000/api` by default.

## Features

### Creating Nodes

**Method: Drag and Drop from Palette**

1. In the left sidebar, you'll see the **Node Palette** with 4 node types:
   - Person (blue)
   - Company (purple)
   - Product (orange)
   - Location (red)

2. **Drag** any node type button onto the canvas

3. A form will appear asking for:
   - Label (required)
   - Type (pre-filled)
   - Custom properties (key-value pairs)

4. Click **Create** to add the node to the graph

The new node will appear as **green** (proposed status) until you save it to the database.

### Creating Edges (Relationships)

**Method: Click-to-Connect**

1. Click the **"Create Edge"** button in the Node Palette

2. The canvas cursor will change to a crosshair

3. Click on a **source node** (it will be highlighted in green)

4. Click on a **target node**

5. A form will appear asking for:
   - Relationship type (WORKS_AT, PRODUCES, LOCATED_IN, etc.)
   - Custom properties

6. Click **Create** to add the relationship

7. Press **Escape** to cancel edge creation mode

### Editing Nodes and Edges

**For Nodes:**

- Click on any node in the graph
- A form will open with its current properties
- Modify any field and click **Save**

**For Edges:**

- Currently, edges can only be deleted (editing coming soon)

### Deleting Items

**Using Keyboard:**

1. Click to select a node or edge (only NEW items can be deleted)
2. Press **Delete** or **Backspace** key

**Note:** Only items with "Proposed" status (newly created, not yet saved) can be deleted. Existing items from the database cannot be deleted through the UI.

### Saving to Database

1. Create or modify nodes and edges

2. The **"Save to Database"** button in the top-right will show how many new items exist:

   ```
   Save to Database (3 nodes, 5 edges)
   ```

3. Click the button to open a confirmation dialog

4. Click **"Confirm Save"** to write changes

5. The backend will:
   - Save to SQLite database
   - Try to sync to Databricks (if configured)
   - Update the status of new items to "existing"

### Graph Controls

The right sidebar provides:

- **Show Proposed Changes** toggle
- **Node Type** filters (Person, Company, Product, Location)
- **Relationship Type** filters
- **Reset View** button
- **Statistics** (total nodes, edges, proposed changes)
- **Legend** showing node colors and status

## Backend API

### Endpoints

#### `GET /api/graph`

Fetch all nodes and edges from the database

**Response:**

```json
{
  "nodes": [
    {
      "id": "node_1",
      "label": "Example Node",
      "type": "Person",
      "status": "existing",
      "properties": { "name": "John Doe" }
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "source": "node_1",
      "target": "node_2",
      "relationshipType": "WORKS_AT",
      "status": "existing",
      "properties": {}
    }
  ]
}
```

#### `POST /api/graph`

Save new nodes and edges

**Request Body:**

```json
{
  "nodes": [
    /* array of new nodes */
  ],
  "edges": [
    /* array of new edges */
  ]
}
```

**Response:**

```json
{
  "success": true,
  "message": "Successfully wrote 3 nodes and 5 edges to SQLite",
  "target": "SQLite only",
  "databricksSuccess": false,
  "writtenNodes": 3,
  "writtenEdges": 5,
  "jobId": "job_1699..."
}
```

#### `POST /api/graph/seed`

Reseed the database with initial mock data

**Response:**

```json
{
  "success": true,
  "message": "Database reseeded successfully",
  "nodeCount": 19,
  "edgeCount": 21
}
```

#### `GET /health`

Check server and database status

**Response:**

```json
{
  "status": "ok",
  "database": {
    "type": "SQLite",
    "nodeCount": 19,
    "edgeCount": 21
  },
  "databricks": {
    "configured": false,
    "host": "e2-demo-field-eng.cloud.databricks.com",
    "table": "main.default.property_graph_entity_edges"
  }
}
```

## Database Schema

### SQLite Tables

**nodes table:**

```sql
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'existing',
  properties TEXT NOT NULL,  -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**edges table:**

```sql
CREATE TABLE edges (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  status TEXT DEFAULT 'existing',
  properties TEXT NOT NULL,  -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source) REFERENCES nodes(id),
  FOREIGN KEY (target) REFERENCES nodes(id)
);
```

## Databricks Integration (Optional)

To sync data to Databricks:

### 1. Configure Credentials

Edit `backend/.env`:

```env
# Databricks SQL Warehouse Configuration
DATABRICKS_HOST=your-workspace.cloud.databricks.com
DATABRICKS_HTTP_PATH=/sql/1.0/warehouses/your-warehouse-id
DATABRICKS_TABLE=main.default.property_graph_entity_edges

# Service Principal Authentication
DATABRICKS_CLIENT_ID=your-client-id
DATABRICKS_CLIENT_SECRET=your-client-secret
```

### 2. How It Works

When you save changes:

1. Backend **always** writes to SQLite (primary data store)
2. Backend **attempts** to write to Databricks
3. If Databricks write succeeds, you'll see: `"target": "Databricks and SQLite"`
4. If Databricks write fails, you'll see: `"target": "SQLite only"` with error details

### 3. Databricks Table Format

The backend writes to a denormalized edge table:

| Column                | Type   | Description               |
| --------------------- | ------ | ------------------------- |
| node_start_id         | STRING | Source node ID            |
| node_start_key        | STRING | Source node label         |
| relationship          | STRING | Relationship type         |
| node_end_id           | STRING | Target node ID            |
| node_end_key          | STRING | Target node label         |
| node_start_properties | STRING | JSON properties of source |
| node_end_properties   | STRING | JSON properties of target |

## Keyboard Shortcuts

- **Escape** - Cancel edge creation mode
- **Delete / Backspace** - Delete selected node or edge (NEW items only)

## Troubleshooting

### Backend won't start

**Error:** `Error: Cannot find module 'better-sqlite3'`

**Solution:**

```bash
cd backend
npm install
```

### Database is corrupted

**Solution:**

```bash
cd backend
rm db/graph.db   # Delete the database
npm run seed     # Recreate and seed
```

### Frontend can't connect to backend

**Error:** `Failed to fetch graph data`

**Check:**

1. Is the backend running? `cd backend && npm start`
2. Is it on the correct port? Default is `http://localhost:3000`
3. Check browser console for CORS errors

**Override API URL:**
Create `.env` in project root:

```env
VITE_API_URL=http://localhost:3000/api
```

### Changes aren't being saved

**Check:**

1. Did you click "Save to Database"?
2. Check the snackbar notification for success/error messages
3. Check backend logs for errors
4. Open browser DevTools → Network tab to see API requests

### Databricks sync failing

**Check:**

1. Are credentials configured in `backend/.env`?
2. Do you have network access to Databricks?
3. Does the table exist?
4. Check backend logs for detailed error messages

**Fallback:** Even if Databricks fails, data is still saved to SQLite.

## Technical Architecture

### Frontend Stack

- **React** with TypeScript
- **Material-UI** for components
- **react-force-graph-2d** for visualization
- **Vite** for build/dev server

### Backend Stack

- **Node.js** with Express
- **better-sqlite3** for SQLite database
- **@databricks/sql** for Databricks integration

### State Management

- Custom `useGraphEditor` hook manages:
  - Original data from backend
  - User-created nodes/edges (NEW status)
  - Modified existing items
  - Deleted items
  - Selection state
  - Edge creation mode

### Data Flow

```
Frontend → Backend → SQLite (primary)
                   ↘ Databricks (optional)
```

## Future Enhancements

Possible improvements:

- [ ] Bulk delete operations
- [ ] Undo/redo functionality
- [ ] Export graph as JSON/CSV
- [ ] Import nodes/edges from file
- [ ] Advanced search and filtering
- [ ] Node clustering/grouping
- [ ] Edit existing edges
- [ ] Delete existing (non-NEW) items
- [ ] Graph layout algorithms (force-directed, hierarchical, etc.)
- [ ] Real-time collaboration

## Support

For issues or questions:

1. Check the browser console for errors
2. Check backend logs for API errors
3. Review this guide for common solutions
4. Check the `DATABRICKS_INTEGRATION.md` for Databricks-specific help
