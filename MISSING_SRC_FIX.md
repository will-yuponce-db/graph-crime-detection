# Deployment 404 Issue - Diagnosis & Fix

## Current Status

The app **builds successfully** in Databricks, but returns **404 when accessing `/`**.

## What We've Added

Enhanced logging in `backend/server.js` to diagnose the issue:

1. **Static file middleware logging** - Shows the dist path and whether it exists
2. **Catch-all route error handling** - Shows detailed error if index.html is missing
3. **Server startup logging** - Lists contents of the dist folder

## Expected Behavior After Deployment

When you redeploy, look for these log entries to diagnose the issue:

### 1. Static Files Configuration (during server startup)

```
[INFO] [static_files] {
  "distPath": "/app/python/source_code/dist",
  "exists": true,
  "__dirname": "/app/python/source_code/backend"
}
```

If `exists: false`, the dist folder wasn't created or is in the wrong location.

### 2. Server Started Log

```
[INFO] [server_started] {
  "url": "http://localhost:8000",
  "dist": {
    "path": "/app/python/source_code/dist",
    "exists": true,
    "contents": ["index.html", "assets", "vite.svg", "pdf.worker.min.mjs"]
  },
  "cwd": "/app/python/source_code/backend",
  "__dirname": "/app/python/source_code/backend"
}
```

If `contents` is empty or missing `index.html`, the build didn't complete properly.

### 3. Catch-All Route Error (if 404 persists)

```
[ERROR] [static_file_missing] {
  "path": "/app/python/source_code/dist/index.html",
  "__dirname": "/app/python/source_code/backend",
  "cwd": "/app/python/source_code/backend"
}
```

This tells us exactly where the server is looking for the file.

## Possible Issues & Solutions

### Issue 1: Dist folder in wrong location

**Symptoms:** `exists: false` in logs

**Cause:** The working directory changed during npm start

**Solution:** Modify the start script in `package.json`:

```json
"start": "npm run build:clean && cd backend && npm install && node server.js"
```

Change to:

```json
"start": "npm run build:clean && NODE_ENV=production node backend/server.js"
```

This runs the server from the root directory, so `__dirname` will be `backend/` and `../dist` will correctly point to the dist folder.

### Issue 2: Static middleware not registered

**Symptoms:** 404 but dist folder exists and has files

**Cause:** NODE_ENV not set to 'production'

**Solution:** Already configured in `app.yaml` with `NODE_ENV: production`. Verify it's actually being set by checking the server logs.

### Issue 3: Wrong base path in built files

**Symptoms:** 404 for JS/CSS assets, but index.html loads

**Cause:** Vite base path configuration

**Solution:** Check `vite.config.ts` and ensure `base: '/'` is set for production builds.

### Issue 4: Build files not persisted after build

**Symptoms:** Build completes successfully, but dist folder is empty when server starts

**Cause:** The build runs in a different context, or dist is being cleaned after build

**Solution:** Modify the start script to avoid cleaning between build and server start:

```json
"start": "npm run build && cd backend && npm install && node server.js"
```

(Remove `build:clean` and use `build` instead)

## Next Steps

1. **Redeploy the app** in Databricks to pick up the new logging
2. **Check the deployment logs** for the diagnostic information
3. **Share the logs** showing:
   - The `static_files` log entry
   - The `server_started` log entry with dist contents
   - Any `static_file_missing` error logs
   - The GET request logs showing the 404

Based on those logs, we'll know exactly what's wrong and can apply the appropriate fix.

## Quick Deploy Command

If you're using Databricks CLI:

```bash
databricks apps restart crime-graph-demo
```

Or redeploy through the Databricks UI:

1. Go to **Databricks Apps**
2. Find `crime-graph-demo`
3. Click **Restart** or trigger a new deployment

---

**Last Updated:** 2024-11-21
