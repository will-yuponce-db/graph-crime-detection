# Databricks SQL Warehouse Integration

This document explains how the application connects to Databricks SQL Warehouse to visualize property graph data.

## Overview

The application fetches graph data from a Databricks SQL Warehouse table and displays it as an interactive graph visualization. It uses a **backend API server** to securely connect to Databricks, with automatic fallback to mock data when unavailable.

## Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌──────────────────────┐
│  React Frontend │  HTTP   │ Express Backend │  SQL    │ Databricks Warehouse │
│   (Browser)     │────────▶│   (Node.js)     │────────▶│  property_graph_*    │
│                 │◀────────│                 │◀────────│       tables         │
└─────────────────┘  JSON   └─────────────────┘  Result └──────────────────────┘
```

**Why a backend?** The `@databricks/sql` npm package requires Node.js native modules that cannot run in a browser. Additionally, credentials should never be exposed in frontend code.

## Configuration

### Frontend Environment Variables

Create `.env` in the frontend root:

```env
VITE_USE_BACKEND_API=true
VITE_API_URL=http://localhost:3000/api
```

### Backend Environment Variables

Create `backend/.env`:

```env
PORT=3000
DATABRICKS_HOST=e2-demo-field-eng.cloud.databricks.com
DATABRICKS_HTTP_PATH=/sql/1.0/warehouses/862f1d757f0424f7
DATABRICKS_TABLE=main.default.property_graph_entity_edges
DATABRICKS_CLIENT_ID=your-client-id-here
DATABRICKS_CLIENT_SECRET=your-client-secret-here
```

### Connection Details

The application is pre-configured to connect to:

- **Server Hostname:** `e2-demo-field-eng.cloud.databricks.com`
- **HTTP Path:** `/sql/1.0/warehouses/862f1d757f0424f7`
- **Table:** `main.default.property_graph_entity_edges`

To change these settings, edit `src/services/graphApi.ts`.

## Table Schema

The application expects the following table structure:

```sql
CREATE TABLE main.default.property_graph_entity_edges (
  node_start_id STRING,           -- Unique ID for source node
  node_start_key STRING,          -- Display label for source node
  relationship STRING,            -- Relationship type (e.g., "WORKS_AT")
  node_end_id STRING,             -- Unique ID for target node
  node_end_key STRING,            -- Display label for target node
  node_start_properties STRING,   -- JSON string with source node properties
  node_end_properties STRING      -- JSON string with target node properties
);
```

### Example Data

```sql
INSERT INTO main.default.property_graph_entity_edges VALUES (
  'person_001',                                          -- node_start_id
  'John Doe',                                            -- node_start_key
  'WORKS_AT',                                            -- relationship
  'company_001',                                         -- node_end_id
  'Acme Corp',                                           -- node_end_key
  '{"type": "Person", "age": 30, "title": "Engineer"}', -- node_start_properties
  '{"type": "Company", "industry": "Technology"}'       -- node_end_properties
);
```

## Data Flow

### 1. Fetching Data

```typescript
// Called on component mount and refresh button click
const data = await fetchGraphData();
```

**Process:**

1. Check if credentials are configured
2. If no credentials → return mock data
3. If credentials exist → attempt connection to Databricks
4. Execute SQL query against the table
5. Transform edge-based data into nodes + edges format
6. If any error occurs → fall back to mock data

### 2. Data Transformation

The application transforms the edge-based table format into a graph structure:

**Input (Edge Row):**

```javascript
{
  node_start_id: "person_1",
  node_start_key: "Sarah Johnson",
  relationship: "WORKS_AT",
  node_end_id: "company_1",
  node_end_key: "TechCorp Inc",
  node_start_properties: '{"type": "Person", "title": "CEO"}',
  node_end_properties: '{"type": "Company", "industry": "Technology"}'
}
```

**Output (Graph Structure):**

```javascript
{
  nodes: [
    {
      id: "person_1",
      label: "Sarah Johnson",
      type: "Person",
      properties: { type: "Person", title: "CEO" },
      status: "existing"
    },
    {
      id: "company_1",
      label: "TechCorp Inc",
      type: "Company",
      properties: { type: "Company", industry: "Technology" },
      status: "existing"
    }
  ],
  edges: [
    {
      id: "edge_0_person_1_company_1",
      source: "person_1",
      target: "company_1",
      relationshipType: "WORKS_AT",
      properties: { relationship: "WORKS_AT" },
      status: "existing"
    }
  ]
}
```

### 3. Writing Data Back

When users approve proposed changes:

```typescript
const result = await writeToTable(nodes, edges);
```

**Process:**

1. Filter for nodes/edges with `status: "new"`
2. For each new edge, insert a row into the Databricks table
3. Include both source and target node properties
4. Return success/failure status

## Operating Modes

### Demo Mode (Default)

- **Trigger:** `VITE_USE_BACKEND_API` not set or `false`
- **Behavior:** Uses mock data immediately (no backend required)
- **UI:** Yellow warning banner "Demo Mode: Using mock data"
- **Best For:** Demos, development, testing UI
- **Setup:** None required!

### Backend Connected Mode

- **Trigger:** `VITE_USE_BACKEND_API=true` + backend server running
- **Behavior:** Reads and writes to Databricks first, falls back to SQLite if unavailable
- **UI:** Blue info banner "Connected: Backend API → Databricks (with SQLite fallback)"
- **Best For:** Production use with real data and automatic resilience
- **Setup:** Requires backend server (see `backend/README.md`)

### Fallback Mode

- **Trigger:** Backend mode enabled but backend unavailable
- **Behavior:** Frontend automatically falls back to mock data
- **UI:** Yellow warning banner (appears as Demo Mode)
- **Best For:** Resilient demos, network issues, development

## Code Structure

### Frontend Files

1. **`src/services/graphApi.ts`**
   - HTTP client for backend API
   - Fallback to mock data when backend unavailable
   - Request/response handling

2. **`src/pages/GraphVisualization.tsx`**
   - Loads graph data on mount
   - Detects which mode is active (mock vs backend)
   - Displays appropriate UI banners
   - Handles refresh and write operations

3. **`src/data/mockGraphData.ts`**
   - Fallback data source
   - Realistic example data
   - Same structure as Databricks data

### Backend Files

1. **`backend/server.js`**
   - Express API server
   - Databricks SQL connection logic
   - SQL query execution
   - Data transformation
   - Error handling and logging

2. **`backend/package.json`**
   - Dependencies (@databricks/sql, express, cors, dotenv)
   - Start scripts

3. **`backend/env.example`**
   - Environment variable template
   - Databricks credentials configuration

### Authentication

The backend uses **Service Principal authentication**:

```javascript
// In backend/server.js
const connection = await client.connect({
  host: DATABRICKS_CONFIG.host,
  path: DATABRICKS_CONFIG.path,
  token: '', // Empty for service principal
  clientId: DATABRICKS_CONFIG.clientId, // From backend .env
  clientSecret: DATABRICKS_CONFIG.clientSecret, // From backend .env
});
```

**Security:** Credentials are stored server-side only and never exposed to the browser.

## Development Tips

### Testing Without Databricks

Just run the app without setting environment variables:

```bash
npm run dev
```

The app will automatically use mock data.

### Testing With Databricks

1. Create a `.env` file:

   ```env
   VITE_DATABRICKS_CLIENT_ID=your-id
   VITE_DATABRICKS_CLIENT_SECRET=your-secret
   ```

2. Restart the dev server (Vite needs restart for env var changes)

3. Navigate to the Graph Visualization page

4. Check the browser console for connection logs

### Debugging

**Check connection status:**

```javascript
// In browser console
console.log(import.meta.env.VITE_DATABRICKS_CLIENT_ID);
```

**Common issues:**

- ❌ "Using mock data" → Credentials not set or connection failed
- ❌ TypeScript errors → Run `npm install` to ensure @databricks/sql is installed
- ❌ Connection timeout → Check warehouse is running and accessible
- ❌ Query errors → Verify table exists and schema matches

## Security Notes

✅ **This implementation follows security best practices:**

1. **Backend Proxy Architecture:**
   - Frontend → Express API → Databricks
   - Credentials stored server-side only in `backend/.env`
   - Never exposed to browser/frontend code

2. **Service Principal Authentication:**
   - Uses OAuth 2.0 client credentials flow
   - Databricks manages token lifecycle
   - No password storage required

3. **Production Recommendations:**
   - Add authentication to backend API (JWT, API keys)
   - Use HTTPS for all connections
   - Implement rate limiting
   - Add request validation and sanitization
   - Use environment-specific configs
   - Enable audit logging

4. **Architecture:**
   ```
   Browser (Public) → Backend API (Private credentials) → Databricks
   ```

## Troubleshooting

### "Failed to resolve entry for package 'lz4'" (Frontend)

**Cause:** Trying to use @databricks/sql in the browser  
**Solution:** Use the backend server architecture - @databricks/sql only works in Node.js

### Frontend always showing mock data

**Possible causes:**

1. Backend server not running
2. `VITE_USE_BACKEND_API` not set to `true` in frontend `.env`
3. Wrong `VITE_API_URL` in frontend `.env`
4. CORS issues (check browser console)

**Solution:**

```bash
# 1. Check frontend .env
cat .env  # Should have VITE_USE_BACKEND_API=true

# 2. Start backend if not running
cd backend && npm start

# 3. Restart frontend
npm run dev
```

### "Failed to connect to Databricks" (Backend)

**Check:**

1. Is the warehouse running in Databricks?
2. Are credentials correct in `backend/.env`?
3. Is the network accessible from backend server?
4. Does the service principal have query permissions?

**Verify with:**

```bash
# Check backend env vars
cd backend
cat .env | grep DATABRICKS

# Test backend health endpoint
curl http://localhost:3000/health
```

### "Connection refused" from frontend

**Checks:**

1. Is backend server running? (`cd backend && npm start`)
2. Is it on the correct port? (default: 3000)
3. Check CORS configuration in `backend/server.js`
4. Verify `VITE_API_URL` matches backend port

## Performance Considerations

- **Query Limit:** Currently set to 10,000 rows (configurable in `fetchGraphData`)
- **Caching:** None implemented (each refresh queries Databricks)
- **Large Graphs:** Consider pagination or limiting query scope

## Future Enhancements

- [ ] Backend proxy for secure credential handling
- [ ] Query result caching
- [ ] Pagination for large datasets
- [ ] Real-time updates via Databricks Change Data Feed
- [ ] Query performance metrics in UI
- [ ] Batch insert optimization for write operations
- [ ] Connection pooling
- [ ] Retry logic with exponential backoff

---

**Last Updated:** November 5, 2025
**Package Version:** @databricks/sql (latest)
