# Deployment 404 Issue - FIXED ✅

## The Problem

The app built successfully in Databricks but returned **404 when accessing `/`**.

## Root Cause

The start script was changing directories before running the server:

```json
"start": "npm run build:clean && cd backend && npm install && node server.js"
```

This caused path resolution issues:

1. Build creates `dist/` in project root: `/app/python/source_code/dist/`
2. Script changes to backend directory: `cd backend`
3. Server runs from wrong working directory
4. Static file paths become inconsistent

## The Fix

Changed the start script to run the server from the project root:

```json
"start": "npm run build:clean && npm install --prefix backend && NODE_ENV=production node backend/server.js"
```

Now the paths are consistent:

- Working directory: `/app/python/source_code/`
- Dist folder: `/app/python/source_code/dist/`
- Server: `/app/python/source_code/backend/server.js`
- Static middleware looks for: `path.join(__dirname, '../dist')` = `/app/python/source_code/dist/` ✓

## How to Deploy

**In Databricks:**

1. Go to **Databricks Apps**
2. Find your `crime-graph-demo` app
3. Click **Restart** to trigger a new deployment

**Or using CLI:**

```bash
databricks apps restart crime-graph-demo
```

The fix has been pushed to GitHub (commit `3b2eac4`), so Databricks will automatically pick it up on the next deployment.

## Expected Result

After redeploying, you should see:

1. **Build completes successfully:**

   ```
   ✓ built in 13-15s
   dist/index.html                    0.75 kB
   dist/assets/main-*.css            24.74 kB
   dist/assets/main-*.js          2,189.26 kB
   ```

2. **Server starts with correct paths:**

   ```
   [INFO] [static_files] {
     "distPath": "/app/python/source_code/dist",
     "exists": true,
     "__dirname": "/app/python/source_code/backend"
   }
   ```

3. **Server startup shows dist contents:**

   ```
   [INFO] [server_started] {
     "dist": {
       "exists": true,
       "contents": ["index.html", "assets", "avatars", "pdf.worker.min.mjs", "vite.svg"]
     }
   }
   ```

4. **GET requests succeed:**
   ```
   [INFO] [request] GET / status=200 ...ms
   ```

## Verification

After deployment, test:

- **Root URL**: `https://your-app.databricks.com/` → Should load the React app
- **Health check**: `https://your-app.databricks.com/health` → Should return JSON
- **API endpoints**: `https://your-app.databricks.com/api/graph` → Should return graph data

## Additional Debugging

If it still doesn't work (unlikely), check the logs for:

1. **The `[static_files]` log** - Confirms dist folder exists
2. **The `[server_started]` log** - Shows what files are in dist
3. **Any `[static_file_missing]` errors** - Shows exactly what path failed

The enhanced logging added will pinpoint any remaining issues.

## What Changed

**Before:**

```bash
# Root directory
npm run build:clean   # Creates dist/ here

# Backend directory (cd backend)
node server.js        # Looks for ../dist (wrong context!)
```

**After:**

```bash
# Root directory (stays here)
npm run build:clean           # Creates dist/ here
npm install --prefix backend  # Install deps without cd
node backend/server.js        # Runs from root, finds dist correctly
```

---

**Status:** Fixed  
**Last Updated:** 2024-11-21  
**Commit:** 3b2eac4
