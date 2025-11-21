# Quick Testing Guide - Crime Graph App Flow

## 🚀 How to Test the Improved Flow

### Prerequisites
```bash
# Make sure dev server is running
npm run dev

# Open browser to: http://localhost:5173
```

## 🧭 Navigation Test Sequence

### Test 1: Dashboard Landing (30 seconds)
1. Open `http://localhost:5173/`
2. **Verify:**
   - ✓ Dashboard page loads
   - ✓ Six metric cards visible (Total Cases, Active, Entities, etc.)
   - ✓ Quick action buttons present
   - ✓ Top navigation shows 6 tabs (Dashboard is highlighted)
   - ✓ NO sidebar visible
   - ✓ Theme toggle in top-right corner

**Expected:** Clean, professional landing page with overview

---

### Test 2: Top Navigation (1 minute)
1. From Dashboard, click each nav tab:
   - **Cases** → Should load cases page
   - **Graph** → Should load graph visualization
   - **Timeline** → Should load activity timeline
   - **Map** → Should load geographic map
   - **Documents** → Should load document viewer
   - **Dashboard** → Return to dashboard

2. **Verify:**
   - ✓ Each page loads correctly
   - ✓ Active tab highlights correctly
   - ✓ URL changes (/, /cases, /graph, /timeline, /map, /documents)
   - ✓ Browser back button works
   - ✓ No console errors

---

### Test 3: Sidebar Behavior (1 minute)
1. Navigate to **Dashboard** → No sidebar
2. Navigate to **Cases** → No sidebar
3. Navigate to **Graph** → Sidebar appears
4. Navigate to **Timeline** → Sidebar stays
5. Navigate to **Map** → Sidebar stays
6. Navigate to **Documents** → Sidebar disappears

**Expected:** Sidebar only shows on graph/timeline/map views

---

### Test 4: Case Selection and URL (2 minutes)
1. Go to **Graph** page
2. Open sidebar (should be visible)
3. Click "Detect Communities" button
   - AI creates cases from network clusters
4. After cases are created, click on any case in sidebar
5. **Verify:**
   - ✓ URL updates to `/graph?case=CASE_ID`
   - ✓ Graph filters to show only that case's entities
   - ✓ Case name highlighted in sidebar
   - ✓ URL is shareable (copy and paste in new tab)

6. Click "All Entities" in sidebar
7. **Verify:**
   - ✓ URL updates to `/graph` (no case param)
   - ✓ Graph shows all entities

---

### Test 5: Cross-View Case Persistence (2 minutes)
1. From Graph, select a case (URL: `/graph?case=ID`)
2. Click **Timeline** in top nav
3. **Verify:**
   - ✓ URL is `/timeline?case=ID` (case param preserved)
   - ✓ Timeline shows activities for that case only
   - ✓ Sidebar still shows case selected

4. Click **Map** in top nav
5. **Verify:**
   - ✓ URL is `/map?case=ID`
   - ✓ Map shows locations for that case
   - ✓ Sidebar shows case selected

6. Click **Graph** to return
7. **Verify:**
   - ✓ Still filtered to same case
   - ✓ Browser back/forward buttons work

---

### Test 6: Cases Page → Graph Flow (2 minutes)
1. Go to **Cases** page
2. **Verify:**
   - ✓ Board view or List view toggles
   - ✓ Cases displayed in cards
   - ✓ Each card has icons at bottom

3. Find any case card
4. Click the **Graph icon** (network/tree icon) at bottom-left
5. **Verify:**
   - ✓ Navigates to `/graph?case=ID`
   - ✓ Graph filtered to that case
   - ✓ Sidebar shows case selected

6. Go back to Cases page
7. Click **Timeline icon** on a case
8. **Verify:** Navigates to `/timeline?case=ID`

9. Go back, click **Map icon**
10. **Verify:** Navigates to `/map?case=ID`

---

### Test 7: Create Case from Sidebar (1 minute)
1. Go to Graph page
2. Open sidebar
3. Click "New Case" button
4. Fill out form:
   - Name: "Test Investigation"
   - Description: "Testing case creation"
   - Priority: High
5. Click "Create Case"
6. **Verify:**
   - ✓ Dialog closes
   - ✓ New case appears in sidebar
   - ✓ Can click it to filter graph

---

### Test 8: Manage Cases Button (30 seconds)
1. From Graph/Timeline/Map with sidebar open
2. Click "Manage Cases" button at top of sidebar
3. **Verify:**
   - ✓ Navigates to `/cases` page
   - ✓ Can view all cases in board/list format
   - ✓ Can navigate back to graph

---

### Test 9: Dashboard Quick Actions (1 minute)
1. Go to Dashboard
2. Click "View All Cases"
   - **Verify:** Goes to `/cases`
3. Click "Network Graph"
   - **Verify:** Goes to `/graph`
4. Click "Detect Communities"
   - **Verify:** Creates cases from network
5. Click "Geographic Map"
   - **Verify:** Goes to `/map`

---

### Test 10: URL Bookmarking (1 minute)
1. Navigate to `/graph?case=SOME_CASE_ID`
2. Copy URL from browser
3. Open new browser tab/window
4. Paste URL and load
5. **Verify:**
   - ✓ Page loads with case filter active
   - ✓ Graph shows filtered entities
   - ✓ Sidebar shows case selected
   - ✓ No errors

---

### Test 11: Browser Navigation (1 minute)
1. Start at Dashboard
2. Navigate: Dashboard → Cases → Graph → Timeline → Map
3. Click browser **back button** 4 times
4. **Verify:**
   - ✓ Goes back through: Map → Timeline → Graph → Cases → Dashboard
   - ✓ Each page renders correctly
   - ✓ No broken states

5. Click browser **forward button** 4 times
6. **Verify:** Returns to Map

---

### Test 12: Mobile Responsiveness (30 seconds)
1. Open browser dev tools (F12)
2. Toggle device toolbar (mobile view)
3. Navigate through pages
4. **Verify:**
   - ✓ Navigation responsive
   - ✓ Sidebar collapses or adapts
   - ✓ Content readable on small screens

---

## 🎯 Expected User Flow Summary

### Analyst Workflow
```
1. Land on Dashboard
   ↓
2. View stats and recent cases
   ↓
3. Click "Detect Communities" or go to Cases
   ↓
4. Select or create a case
   ↓
5. Click Graph/Timeline/Map icons to analyze
   ↓
6. Use sidebar to switch between cases
   ↓
7. Share URLs with team
   ↓
8. Return to Dashboard for next task
```

### Key Benefits Demonstrated
- ✅ Clear entry point (Dashboard)
- ✅ Easy case management (Cases page)
- ✅ Quick navigation (Top nav + sidebar)
- ✅ Context preservation (URL params)
- ✅ Shareable views (Bookmarkable URLs)
- ✅ Natural workflow (Create → Analyze → Share)

---

## 🐛 Common Issues to Check

### If pages don't load:
- Check console for errors (F12)
- Verify dev server is running (`npm run dev`)
- Clear browser cache

### If case filtering doesn't work:
- Check URL has `?case=ID` parameter
- Verify case exists in context
- Check sidebar shows selected case

### If navigation breaks:
- Check for console errors
- Verify React Router is installed
- Check all imports are correct

### If sidebar doesn't show/hide:
- Check current route (`/graph`, `/timeline`, `/map` = sidebar)
- Other routes should have no sidebar

---

## ✅ Success Criteria

After completing all tests, you should see:

1. **Routing** - All 6 routes work with proper URLs
2. **Navigation** - Top nav and sidebar both functional
3. **Case Context** - URL params sync with case selection
4. **Persistence** - Case filter preserved across views
5. **Browser** - Back/forward buttons work correctly
6. **Sharing** - URLs with case context are shareable
7. **Sidebar** - Contextual (only on relevant pages)
8. **Dashboard** - Professional landing page
9. **No Errors** - Console clean, no linter errors
10. **Smooth UX** - Fast, responsive, intuitive

---

## 📊 Testing Results Template

```
Date: ___________
Tester: ___________

✅ Test 1: Dashboard Landing - PASS / FAIL
✅ Test 2: Top Navigation - PASS / FAIL  
✅ Test 3: Sidebar Behavior - PASS / FAIL
✅ Test 4: Case Selection and URL - PASS / FAIL
✅ Test 5: Cross-View Case Persistence - PASS / FAIL
✅ Test 6: Cases Page → Graph Flow - PASS / FAIL
✅ Test 7: Create Case from Sidebar - PASS / FAIL
✅ Test 8: Manage Cases Button - PASS / FAIL
✅ Test 9: Dashboard Quick Actions - PASS / FAIL
✅ Test 10: URL Bookmarking - PASS / FAIL
✅ Test 11: Browser Navigation - PASS / FAIL
✅ Test 12: Mobile Responsiveness - PASS / FAIL

Notes:
_________________________________
_________________________________
_________________________________
```

---

**Total Testing Time: ~15 minutes for comprehensive walkthrough**

🎉 **Happy Testing!**


