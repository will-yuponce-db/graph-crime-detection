# URGENT FIX: Missing src/ Directory in Databricks Apps

## The Problem

Your Databricks Apps deployment is **NOT syncing the `src/` directory**, which is why Vite can't find `./src/main.tsx`.

Looking at your deployment logs, files being synced are:

- ✅ `index.html`
- ✅ `package.json`
- ✅ `vite.config.ts`
- ✅ `.md` files
- ❌ **`src/` directory is MISSING!**

The logs show: `[INFO] Downloading source code from /Workspace/Users/f3f03a9e-2244-48ae-bdf5-de58c1a9d771/src/...`

This means your app is pulling from a **Workspace Git folder**, not directly from GitHub, and that workspace folder is missing or outdated.

## The Fix

### Option 1: Delete and Recreate the App (RECOMMENDED)

This forces a fresh sync from Git:

```bash
# 1. Stop the current app
databricks apps delete crime-graph-demo

# 2. Create a new app pointing directly to GitHub
databricks apps create \
  --name crime-graph-demo \
  --source-code-path https://github.com/will-yuponce-db/graph-crime-detection.git \
  --branch main
```

### Option 2: Update the App's Git Source

Update the existing app to point to the correct Git repo:

```bash
databricks apps update crime-graph-demo \
  --source-code-path https://github.com/will-yuponce-db/graph-crime-detection.git \
  --branch main \
  --restart
```

### Option 3: Via Databricks UI

1. Go to **Databricks Apps** in your workspace
2. Find `crime-graph-demo`
3. Click **Settings** or **Configure**
4. Under **Source Code**, verify it points to:
   - **Repository**: `https://github.com/will-yuponce-db/graph-crime-detection.git`
   - **Branch**: `main`
5. If it says "Workspace" or shows a different path, **change it to Git**
6. Click **Save** and **Restart**

## Verify the Fix

After recreating/updating, check the deployment logs for:

```
[INFO] Downloading source code from https://github.com/will-yuponce-db/graph-crime-detection.git
[INFO] Updated file: python/source_code/src/App.tsx
[INFO] Updated file: python/source_code/src/main.tsx
[INFO] Updated file: python/source_code/src/components/...
```

You should see `src/` files being synced!

## Why This Happened

Databricks Apps might have been created with:

- A Workspace Git folder as the source (instead of GitHub URL)
- That Workspace folder was created before `src/` was added
- Or the Workspace folder got out of sync with GitHub

## Expected Build Output After Fix

```
✓ 12814 modules transformed.
dist/index.html                    0.75 kB
dist/assets/main-*.css            24.74 kB
dist/assets/main-*.js          2,189.26 kB
✓ built in 4-5s
```

Then the server should start successfully on port 8000!

## If It Still Fails

Double-check your Git repo has `src/`:

```bash
# Verify src/ is in the repo
git ls-files src/ | head

# Should show:
# src/App.tsx
# src/main.tsx
# src/components/...
```

If `src/` is missing from Git, something went wrong with previous commits. Check:

```bash
git log --oneline --all -- src/
```

---

**Bottom Line:** Your app is syncing from the wrong source location. Point it directly to GitHub and it should work!
