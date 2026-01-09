# Databricks Apps Deployment

## Quick Deploy

```bash
git push origin main
# Wait for Databricks Apps to rebuild
```

## Troubleshooting Build Errors

### Issue: "Failed to resolve /src/main.tsx" during build

This is a caching issue in Databricks Apps. Try these steps:

**Option 1: Force Rebuild in Databricks Apps UI**

1. Go to your Databricks App dashboard
2. Click **Stop App**
3. Wait for it to stop completely
4. Click **Start App**
5. This forces a fresh rebuild with no cache

**Option 2: Clear Databricks Apps Cache (via CLI)**

```bash
# Delete and recreate the app
databricks apps delete <app-name>
databricks apps create --source-code-path . --name <app-name>
```

**Option 3: Trigger Cache Clear**

```bash
# Update the app with restart flag
databricks apps update <app-name> --restart
```

**Option 4: Local Verification**

```bash
# Verify build works locally first
npm run build:clean
npm run start
```

## What We Changed to Fix Build

1. **Explicit Path Resolution** (`vite.config.ts`)
   - Added `path.resolve(__dirname)` for absolute paths
   - Specified `index.html` explicitly in rollupOptions

2. **Clean Build Process** (`package.json`)
   - Added `clean` script to remove `dist/` and `.vite` cache
   - Changed `start` to use `build:clean` instead of `build`
   - Forces fresh build on every deploy

3. **Databricks Ignore** (`.databricksignore`)
   - Excludes `dist/`, `node_modules/`, and cache directories
   - Ensures no stale build artifacts are synced

## Expected Build Output

```
✓ 12814 modules transformed.
dist/index.html                    0.75 kB
dist/assets/main-5z0MLl8e.css     24.74 kB
dist/assets/main-DRMsJt3k.js   2,189.26 kB
✓ built in 4-5s
```

## Environment Configuration

The `.databricks/app.yaml` sets:

- `NODE_ENV=production` - Enables production build
- `PORT=8000` - Server port
- `VITE_FORCE_OPTIMIZE_DEPS=true` - Forces dependency re-optimization

## Checking App Status

```bash
# View app logs
databricks apps logs <app-name> --follow

# Check app status
databricks apps get <app-name>

# List all apps
databricks apps list
```

## Common Issues

### Build succeeds but app won't start

- Check backend logs: `databricks apps logs <app-name>`
- Verify backend dependencies installed: Check for `npm install` errors
- Ensure database can be created: Check file permissions

### "Module not found" errors

- Clear cache and rebuild (Option 1 above)
- Verify `node_modules` was installed fresh
- Check that `package.json` has all required dependencies

### App starts but shows blank page

- Check browser console for errors
- Verify `dist/` folder was created with bundled assets
- Check that backend is serving static files from `dist/`

## Architecture

```
Databricks Apps Deploy
├── 1. npm install         (install frontend dependencies)
├── 2. npm run start       (start script)
│   ├── npm run build:clean
│   │   ├── rm -rf dist node_modules/.vite
│   │   └── vite build    (transform React → static files)
│   ├── cd backend
│   ├── npm install       (install backend dependencies)
│   └── node server.js    (serve app on port 8000)
```

## Success Indicators

✅ Build completes without errors  
✅ Server starts and logs show: `server_started`  
✅ Database auto-seeds: `1858 nodes, 256 edges`  
✅ App accessible at Databricks Apps URL  
✅ Health check responds: `GET /health`

## Support

- **Deployment Guide**: `docs/guides/DATABRICKS_APPS_DEPLOYMENT.md`
- **Build Issues**: Check this file first
- **Runtime Issues**: Check backend logs and `TROUBLESHOOTING.md`
