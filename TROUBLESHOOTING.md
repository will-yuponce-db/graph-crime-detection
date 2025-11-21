# Troubleshooting - White Screen Fix

## Quick Fix

If you're seeing a white screen, try these steps in order:

### 1. Clear Browser Storage (Most Common Fix)
```javascript
// Open browser console (F12) and run:
localStorage.clear();
sessionStorage.clear();
// Then refresh the page (F5)
```

### 2. Hard Refresh
```
Windows/Linux: Ctrl + Shift + R
Mac: Cmd + Shift + R
```

### 3. Check Browser Console
```
F12 → Console tab
Look for red errors
```

### 4. Restart Dev Server
```bash
# Kill the current server (Ctrl+C in terminal)
npm run dev
```

## Common Issues After Redux Migration

### Issue: "A non-serializable value was detected"
**Fix:** Already handled in the code with proper serialization

### Issue: "Cannot read property of undefined"
**Cause:** Old localStorage data from Context version
**Fix:** Clear localStorage (see Quick Fix #1)

### Issue: "Module not found"
**Fix:** Reinstall dependencies
```bash
rm -rf node_modules package-lock.json
npm install
```

### Issue: White screen, no errors in console
**Fix:** Check if React is rendering
```javascript
// In browser console:
document.getElementById('root').innerHTML
// Should show content, not empty
```

## Debug Steps

### Step 1: Check if Redux store exists
```javascript
// Browser console:
window.__REDUX_DEVTOOLS_EXTENSION__
// Should return object or function
```

### Step 2: Check if React is mounted
```javascript
// Browser console:
document.querySelector('[data-reactroot]') || document.querySelector('#root').hasChildNodes()
// Should return true
```

### Step 3: Check for JavaScript errors
```
F12 → Console tab
Look for:
- Red errors
- "Failed to compile" messages
- Module resolution errors
```

### Step 4: Check Network tab
```
F12 → Network tab → Refresh page
Look for:
- Failed requests (red)
- 404 errors
- CORS errors
```

## Nuclear Option (If Nothing Works)

```bash
# 1. Clear everything
localStorage.clear() # In browser console
rm -rf node_modules package-lock.json
rm -rf .vite  # Clear Vite cache

# 2. Reinstall
npm install

# 3. Restart
npm run dev

# 4. Open in incognito/private window
# This ensures no cached data
```

## What Changed (Redux Migration)

The white screen is likely caused by:
1. **Old localStorage data** - Context format vs Redux format
2. **Serialization** - Dates stored in old format
3. **Provider order** - Redux needs to wrap everything

## Fixed In Code

✅ Added ErrorBoundary to catch React errors
✅ Added date serialization transforms
✅ Added proper Redux persist configuration
✅ Added loading screen during rehydration
✅ Proper serialization checks disabled

## Current Status

- ✅ No TypeScript errors
- ✅ No linter errors
- ✅ Dev server running
- ✅ HTML page loading
- ✅ Error boundary in place

## Most Likely Cause

**Old localStorage data from the Context version**

The Context version stored data one way, Redux stores it differently. Clear localStorage to fix.

## How to Verify It's Working

After clearing localStorage:

1. Page should load showing Dashboard
2. Console should be clean (no errors)
3. Can click "Detect Communities"
4. Cases appear
5. Can navigate between pages
6. No white screen

## Still Stuck?

Check these files were updated correctly:
- `src/App.tsx` - Has Redux Provider?
- `src/store/index.ts` - Store configured?
- `src/main.tsx` - Has BrowserRouter?

Or restart fresh:
```bash
# In browser console
localStorage.clear()

# In terminal
pkill -f vite
npm run dev

# Then refresh browser
```

---

**TL;DR: Run `localStorage.clear()` in browser console, then refresh page.**


