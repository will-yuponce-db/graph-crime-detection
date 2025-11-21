# Databricks Apps Deployment Guide

## Overview

This application is configured to run on **Databricks Apps** with automatic access to your Databricks workspace, including SQL warehouses for data persistence.

## Prerequisites

Your Databricks Apps environment automatically provides:

- ✅ `DATABRICKS_CLIENT_ID` - For authentication
- ✅ `DATABRICKS_CLIENT_SECRET` - For authentication
- ✅ `DATABRICKS_HOST` - Your workspace URL
- ✅ `PORT=8000` - Application port
- ✅ `NODE_ENV=production` - Production mode
- ✅ Node.js v22.16.0 runtime
- ✅ Python 3.11.13 runtime (for databricks-sql-connector)

## Deployment Steps

### 1. Push Your Code to Git

```bash
git add .
git commit -m "Configure for Databricks Apps deployment"
git push
```

### 2. Create the Databricks App

In your Databricks workspace:

1. Go to **Apps** in the sidebar
2. Click **Create App**
3. Select your Git repository
4. Choose the branch (e.g., `main`)
5. Click **Create**

### 3. Configure Environment Variables (Optional)

The app automatically uses Databricks-provided environment variables. If you need to customize:

**SQL Warehouse Path:**

```bash
databricks apps update <app-name> \
  --env DATABRICKS_HTTP_PATH=/sql/1.0/warehouses/YOUR_WAREHOUSE_ID
```

**Table Name:**

```bash
databricks apps update <app-name> \
  --env DATABRICKS_TABLE=main.default.your_table_name
```

### 4. Access Your App

Once deployed, Databricks provides a URL like:

```
https://your-app-name-1444828305810485.aws.databricksapps.com
```

## How It Works

### On Startup

1. **Build Frontend**: `npm run build` creates optimized React app
2. **Install Backend**: Backend dependencies are installed
3. **Initialize Database**: SQLite database is created and seeded (if empty)
4. **Start Server**: Express server starts on port 8000
5. **Serve App**: Backend serves the React app and handles API requests

### Architecture in Databricks Apps

```
User Request
    ↓
Databricks Apps Platform (Port 8000)
    ↓
Express Server (Node.js)
    ├── Static Files → React App (Frontend)
    ├── /api/graph → REST API endpoints
    ├── /health → Health check
    └── SQLite Database (local storage)
            ↓
    Databricks SQL Warehouse (sync on save)
```

### Data Flow

1. **On Load**: Fetch data from SQLite database
2. **User Edits**: Create/modify nodes and edges in browser
3. **On Save**:
   - Write to SQLite (primary storage)
   - Sync to Databricks SQL Warehouse (if configured)
   - Return success to user

## File Structure

```
/
├── dist/                    # Built React app (created by npm run build)
├── backend/
│   ├── server.js           # Express server (serves frontend + API)
│   ├── db/
│   │   ├── graph.db        # SQLite database (created on first run)
│   │   ├── database.js     # Database utilities
│   │   ├── schema.sql      # Database schema
│   │   └── seed.js         # Initial data seeding
│   └── package.json        # Backend dependencies
├── src/                    # React source code
├── .databricks/
│   └── app.yaml            # Databricks Apps configuration
└── package.json            # Root package.json with start script
```

## Database Configuration

### SQLite (Primary Storage)

Located at: `backend/db/graph.db`

- **Purpose**: Fast local storage for graph data
- **Persistence**: Stored in the Databricks Apps file system
- **Backup**: Automatic (part of Databricks Apps storage)

### Databricks SQL Warehouse (Sync Target)

Table: `main.default.property_graph_entity_edges` (configurable)

- **Purpose**: Centralized storage and analytics
- **Schema**: Denormalized edge table with node properties
- **Sync**: On-demand when user clicks "Save to Database"

## Environment Variables Reference

| Variable                   | Source   | Purpose                          |
| -------------------------- | -------- | -------------------------------- |
| `DATABRICKS_CLIENT_ID`     | Auto     | Service principal authentication |
| `DATABRICKS_CLIENT_SECRET` | Auto     | Service principal authentication |
| `DATABRICKS_HOST`          | Auto     | Workspace URL                    |
| `DATABRICKS_WORKSPACE_ID`  | Auto     | Workspace identifier             |
| `PORT`                     | Auto     | Application port (8000)          |
| `NODE_ENV`                 | Auto     | Set to "production"              |
| `DATABRICKS_HTTP_PATH`     | Optional | SQL warehouse endpoint           |
| `DATABRICKS_TABLE`         | Optional | Target table name                |

## API Endpoints

All API endpoints are prefixed with `/api`:

### `GET /health`

Health check with database statistics

**Response:**

```json
{
  "status": "ok",
  "environment": "production",
  "database": {
    "type": "SQLite",
    "nodeCount": 19,
    "edgeCount": 21
  },
  "databricks": {
    "configured": true,
    "host": "e2-demo-field-eng.cloud.databricks.com",
    "table": "main.default.property_graph_entity_edges"
  }
}
```

### `GET /api/graph`

Fetch all nodes and edges

### `POST /api/graph`

Save new nodes and edges to database

### `POST /api/graph/seed`

Reseed database with initial data

### `PATCH /api/graph/status`

Update node/edge status

## Monitoring & Debugging

### Check App Status

In Databricks workspace:

1. Go to **Apps**
2. Find your app
3. Click to view **Logs** and **Status**

### View Application Logs

```bash
databricks apps logs <app-name> --follow
```

### Test Locally Before Deploying

```bash
# Set environment variables
export NODE_ENV=production
export PORT=8000
export DATABRICKS_CLIENT_ID=your-client-id
export DATABRICKS_CLIENT_SECRET=your-secret
export DATABRICKS_HOST=e2-demo-field-eng.cloud.databricks.com

# Run production build
npm run start
```

Then visit: http://localhost:8000

## Troubleshooting

### App Won't Start

**Check logs:**

```bash
databricks apps logs <app-name>
```

**Common issues:**

- Missing dependencies: Check `package.json` includes all required packages
- Build errors: Ensure `npm run build` succeeds locally
- Port conflicts: Port 8000 should be free

### Database Issues

**Database not seeding:**

- Check if `backend/db/graph.db` exists
- Try redeploying to trigger fresh database creation
- Check logs for SQLite errors

**Databricks sync failing:**

- Verify `DATABRICKS_CLIENT_ID` and `DATABRICKS_CLIENT_SECRET` are set
- Check SQL warehouse is running
- Verify table exists or can be created
- Review logs for authentication errors

### Frontend Not Loading

**Check these:**

1. Does `/health` endpoint work?
2. Does `dist/` folder exist with built files?
3. Are static files being served? (check server.js configuration)
4. Any CORS issues in browser console?

## Performance Considerations

### Cold Starts

First request after app wakes may take 10-15 seconds:

- Backend installation
- Database initialization
- Frontend loading

**Mitigation:** Keep app warm with periodic health checks

### Database Size

SQLite is suitable for:

- Up to 10,000 nodes
- Up to 50,000 edges
- Response time < 100ms

For larger graphs, consider:

- Move to Databricks SQL entirely
- Implement pagination
- Add caching layer

## Security

### Authentication

The app uses Databricks service principal authentication:

- Credentials are automatically provided by Databricks Apps
- No need to manage secrets manually
- Scoped to your workspace

### Data Access

- **Frontend**: No direct database access
- **Backend**: All database operations go through REST API
- **Databricks**: Uses workspace-scoped credentials

### CORS

In production, CORS is configured to:

- Allow requests from the app's own domain
- Restrict cross-origin requests

## Scaling

### Horizontal Scaling

Databricks Apps can scale based on load:

```bash
databricks apps update <app-name> --min-replicas 2 --max-replicas 10
```

**Note:** Each replica has its own SQLite database. For multi-replica setups:

1. Use Databricks SQL as primary storage
2. Use SQLite as cache only
3. Or implement shared storage solution

### Vertical Scaling

Adjust compute resources if needed:

```bash
databricks apps update <app-name> --compute-size medium
```

## Updating the App

### Deploy New Version

```bash
git add .
git commit -m "Update graph editor"
git push
```

Databricks Apps will automatically:

1. Pull latest code
2. Rebuild frontend
3. Reinstall dependencies
4. Restart app

### Rolling Back

```bash
databricks apps rollback <app-name> --revision <previous-revision>
```

## Cost Optimization

### Idle Timeout

Configure app to sleep when idle:

```bash
databricks apps update <app-name> --idle-timeout 30m
```

### SQL Warehouse

Use serverless SQL warehouse for:

- Automatic scaling
- Pay-per-query pricing
- Faster startup

## Next Steps

1. **Deploy the app** following the steps above
2. **Test the deployment** by visiting the app URL
3. **Monitor logs** for any issues
4. **Configure SQL warehouse** for data persistence
5. **Set up regular backups** of SQLite database

## Support

For issues specific to:

- **Databricks Apps Platform**: Contact Databricks support
- **Application Code**: Check logs and review this guide
- **Graph Editor Features**: See `INTERACTIVE_EDITOR_GUIDE.md`

---

**Databricks Apps Documentation:**
https://docs.databricks.com/en/dev-tools/databricks-apps/index.html
