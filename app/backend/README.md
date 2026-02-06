# Crime Graph Backend API

Backend service for the Crime Network Analysis Platform, providing data persistence and Lakebase Postgres / Databricks SQL integration for law enforcement and intelligence agencies.

## Features

- **Lakebase Postgres**: Low-latency reads from synced tables (default data source)
- **Databricks Integration**: Databricks SQL Warehouse for AI agent / model serving
- **SQLite Fallback**: Local database for air-gapped deployments and development
- **RESTful API**: Simple HTTP endpoints for graph data operations
- **Auto-seeding**: Automatically populates demo crime network data
- **CORS Enabled**: Supports frontend development on different ports

## Getting Started

### Prerequisites

- Node.js 16+ and npm
- (Optional) Databricks workspace with SQL Warehouse access

### Installation

```bash
npm install
```

### Configuration

Create a `.env` file:

```bash
cp env.example .env
```

Edit `.env` with your configuration:

```env
# Server Configuration
PORT=3000

# --- Lakebase Postgres (primary data source) ---
# In Databricks Apps, these are auto-injected when a database resource is attached.
# For local dev, get your connection details from Lakebase UI > Connect.
PGHOST=ep-xxx.databricks.com
PGPORT=5432
PGDATABASE=investigative_analytics
PGUSER=your-email@databricks.com
PGPASSWORD=your-oauth-token
PGSSLMODE=require
POSTGRES_SCHEMA=demo

# --- Databricks (for AI agent / model serving) ---
DATABRICKS_HOST=your-workspace.cloud.databricks.com
DATABRICKS_HTTP_PATH=/sql/1.0/warehouses/your-warehouse-id
DATABRICKS_TOKEN=your-personal-access-token
DATABRICKS_AGENT_ENDPOINT=databricks-gpt-5-2
```

#### Database Module

The backend uses `db/postgres.js` by default, which connects to Lakebase Postgres via the `pg` (node-postgres) library. The legacy `db/databricks.js` module (using `@databricks/sql`) is still available if you need to connect directly to a SQL Warehouse instead.

To switch back to the Databricks connector, change the import in `createApp.js`:

```javascript
// Default (Lakebase Postgres)
const databricks = options.databricks || require('./db/postgres');

// Legacy (Databricks SQL Warehouse)
// const databricks = options.databricks || require('./db/databricks');
```

Both modules export the same interface, so no other code changes are needed.

### Start the Server

```bash
npm start
```

The API will be available at `http://localhost:3000`

### Development Mode

For auto-restart on file changes:

```bash
npm run dev
```

## API Endpoints

### GET `/api/graph`

Fetch all crime network entities (nodes and edges)

**Query Parameters:**
- `table` (optional): Databricks table name to query

**Response:**
```json
{
  "nodes": [
    {
      "id": "suspect_001",
      "label": "Miguel Sandoval",
      "type": "Suspect",
      "status": "existing",
      "properties": {
        "name": "Miguel Sandoval",
        "alias": "El Lobo",
        "role": "Cartel Leader",
        "threat_level": "Critical",
        "classification": "SECRET",
        "image_url": "https://..."
      }
    }
  ],
  "edges": [
    {
      "id": "edge_001",
      "source": "suspect_001",
      "target": "org_001",
      "relationshipType": "LEADS",
      "status": "existing",
      "properties": {
        "since": "2015-01-01",
        "confidence": "High",
        "source": "HUMINT"
      }
    }
  ],
  "metadata": {
    "source": "sqlite|databricks",
    "databricksEnabled": true|false,
    "databricksError": null|"error message"
  }
}
```

### POST `/api/graph`

Write crime network entities to database

**Request Body:**
```json
{
  "nodes": [...],
  "edges": [...]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully wrote X nodes and Y edges",
  "writtenNodes": X,
  "writtenEdges": Y,
  "metadata": {
    "source": "sqlite|databricks",
    "databricksEnabled": true|false
  }
}
```

### DELETE `/api/graph/nodes/:nodeId`

Delete a suspect, organization, location, or other entity

**Response:**
```json
{
  "success": true,
  "message": "Node deleted successfully"
}
```

### DELETE `/api/graph/edges/:edgeId`

Delete a relationship between entities

**Response:**
```json
{
  "success": true,
  "message": "Edge deleted successfully"
}
```

## Database Schema

### Databricks Table

The platform expects a denormalized edge table format:

```sql
CREATE TABLE IF NOT EXISTS main.intelligence.crime_network_entities (
  node_start_id STRING,
  node_start_key STRING,
  relationship STRING,
  node_end_id STRING,
  node_end_key STRING,
  node_start_properties STRING,  -- JSON
  node_end_properties STRING     -- JSON
);
```

### SQLite Schema

The local SQLite database mirrors this structure:

```sql
CREATE TABLE IF NOT EXISTS property_graph_entity_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_start_id TEXT NOT NULL,
  node_start_key TEXT NOT NULL,
  relationship TEXT NOT NULL,
  node_end_id TEXT NOT NULL,
  node_end_key TEXT NOT NULL,
  node_start_properties TEXT,
  node_end_properties TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Data Management

### Seeding Demo Data

```bash
npm run seed
```

This populates the database with a realistic international organized crime network including:
- 8 Suspects (high-value targets with photos)
- 4 Criminal Organizations
- 5 Locations (safe houses, warehouses, operational sites)
- 4 Financial Accounts
- 3 Communication Devices
- 3 Events (meetings, transactions, shipments)
- 3 Assets (yacht, aircraft, real estate)
- 35+ Relationships

### Resetting Database

```bash
npm run reseed
```

Clears and repopulates the database.

## Security Considerations

### For Classified Environments

1. **Air-Gapped Deployment**
   - Disable Databricks integration
   - Use SQLite only
   - Deploy on classified network

2. **Access Control**
   - Add authentication middleware
   - Implement role-based access control (RBAC)
   - Log all data access

3. **Data Classification**
   - Ensure proper handling of SECRET/TS data
   - Use separate instances per classification level
   - Implement compartmented access (SCI)

4. **Audit Logging**
   - Log all create/update/delete operations
   - Track user access patterns
   - Retain logs per agency requirements

### Production Hardening

```javascript
// Example: Add authentication middleware
app.use('/api', authenticateUser);
app.use('/api', authorizeRole(['analyst', 'admin']));
app.use('/api', auditLog);
```

## Deployment Options

### Option 1: Air-Gapped (Classified Networks)

- Use SQLite backend only
- Deploy on SIPR/JWICS
- No external dependencies

### Option 2: Cloud (UNCLASS to SECRET)

- Connect to Databricks SQL Warehouse
- Deploy on AWS GovCloud/Azure Government
- FedRAMP compliance considerations

### Option 3: Hybrid

- SQLite for local/field operations
- Databricks for centralized analysis
- Sync mechanisms between instances

## Monitoring

### Health Check

```bash
curl http://localhost:3000/api/graph
```

### Logs

Server logs include:
- API requests and responses
- Database connection status
- Databricks availability
- Error traces

## Troubleshooting

### Databricks Connection Issues

If Databricks is unavailable, the system automatically falls back to SQLite:

```
⚠️  Databricks Error: Connection timeout
📊 Using SQLite fallback database
```

### Database Locked

SQLite may lock during concurrent writes:

```bash
# Stop all connections
npm run seed
```

### Missing Dependencies

```bash
rm -rf node_modules package-lock.json
npm install
```

## Development

### Project Structure

```
backend/
├── db/
│   ├── database.js      # Database initialization
│   ├── seed.js          # Demo data seeding
│   ├── schema.sql       # SQLite schema
│   └── graph.db         # SQLite database file
├── utils/
│   └── logger.js        # Logging utility
├── server.js            # Express server
└── package.json
```

### Adding New Entity Types

1. Update `seed.js` with new entity data
2. Ensure properties include classification markings
3. Add relationships to connect new entities
4. Reseed database

### Extending the API

```javascript
// Add new endpoint in server.js
app.get('/api/analysis/centrality', async (req, res) => {
  // Implement network analysis
});
```

## Performance

- **SQLite**: Handles 100K+ entities efficiently
- **Databricks**: Scales to millions of entities
- **API Response**: < 100ms for typical queries
- **Bulk Writes**: Batched inserts for performance

## License

MIT License

---

**Security Notice**: This backend service handles sensitive law enforcement and intelligence data. Ensure proper access controls, encryption, and compliance with agency security policies before deploying in production.
