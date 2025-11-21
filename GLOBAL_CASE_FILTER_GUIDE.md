# Global Case Filter - User Guide

## ✨ New Feature: Global Case Filter

A powerful, always-visible case filter in the top navigation bar that filters **all views** across the entire application.

### 🎯 What It Does

The Global Case Filter allows you to:
- **Select a case** from anywhere in the app
- **Filter all visualizations** automatically (Graph, Timeline, Map)
- **See at a glance** which case is currently active
- **Clear the filter** with one click
- **Persist selection** across page navigation

---

## 📍 Location

**Top Navigation Bar** - Between the navigation buttons and theme toggle

```
┌────────────────────────────────────────────────────────────┐
│ Crime Network │ [Dashboard] [Cases] [Graph] ... │ 🔍[Case Filter] 🌙│
└────────────────────────────────────────────────────────────┘
```

Always visible on every page!

---

## 🚀 How to Use

### Select a Case

**Step 1:** Click the dropdown in the top nav bar

**Step 2:** See all available cases with details:
```
📁 Operation El Lobo
   CASE-2024-001 | Critical | 8 entities

📁 Red Square Financial Network  
   CASE-2024-002 | High | 10 entities

📁 Cross-Pacific Logistics
   CASE-2024-003 | Medium | 3 entities
```

**Step 3:** Click a case to filter

**Result:** All views now show only entities related to that case!

### Clear Filter

**Method 1:** Click the ❌ button next to the dropdown

**Method 2:** Select "All Entities (No Filter)" from dropdown

**Result:** All views show complete dataset again

---

## 🔍 What Gets Filtered

### Graph View
**Before Filter:**
- Shows all 100+ nodes and edges

**With Filter (e.g., Operation El Lobo):**
- Shows 8 case entities
- Shows connected nodes (1-hop neighbors)
- Shows all edges connecting these nodes
- Result: Focused network view

### Timeline View
**Before Filter:**
- Shows all activities from all entities

**With Filter:**
- Shows only activities involving case entities
- Grouped by date
- Chronological case timeline

### Map View
**Before Filter:**
- Shows all locations with all markers

**With Filter:**
- Shows only locations with case-related activities
- Markers for case entity locations
- Activity dots filtered to case

---

## 💡 Visual Indicators

### Filter Status Banner

When a case is selected, you'll see:

```
┌──────────────────────────────────────┐
│ 🔍 Filtering: Operation El Lobo     │
│ Showing 8 entities across all views │
└──────────────────────────────────────┘
```

Appears below the dropdown to confirm active filter.

### Dropdown Appearance

**No Filter:**
- Grey filter icon
- Shows "Filter by Case"

**Filter Active:**
- Blue filter icon (highlighted)
- Shows case name
- ❌ clear button visible

### Color-Coded Cases

Each case shows status color:
- 🔵 **Blue** - Active Investigation
- 🟢 **Green** - Closed
- 🟠 **Orange** - Prosecution
- ⚪ **Grey** - Leads

---

## 🔄 Cross-Page Behavior

### Scenario: Filter While Viewing Graph

1. You're on **Graph** page viewing all entities
2. Select **"Operation El Lobo"** from global filter
3. Graph immediately updates to show only relevant nodes
4. Navigate to **Timeline** page
5. Timeline automatically shows only case activities
6. Navigate to **Map** page
7. Map automatically shows only case locations

**Filter persists across all pages!**

### URL Synchronization

Filter updates the URL automatically:
```
/graph               → No filter
/graph?case=case_001 → Filtered to case_001
```

- Share URLs with filters active
- Browser back/forward respects filter
- Refresh page keeps filter active

---

## 📊 Use Cases

### 1. Focus on Single Investigation

**Situation:** Working on one case, need tunnel vision

**Action:**
1. Select case from global filter
2. Navigate between Graph/Timeline/Map
3. Only see relevant entities everywhere

**Benefit:** No distractions, focused workflow

### 2. Compare Case to Full Dataset

**Situation:** Want to see if case entities connect to others

**Action:**
1. Clear global filter (see all data)
2. Note all connections
3. Select case (see filtered view)
4. Compare differences

**Benefit:** Understand case scope in broader context

### 3. Case Presentation

**Situation:** Briefing stakeholders on specific case

**Action:**
1. Select case before presentation
2. Navigate through views (all filtered)
3. Show graph network
4. Show timeline of events
5. Show map of locations

**Benefit:** Professional, focused presentation

### 4. Quick Case Switching

**Situation:** Managing multiple cases simultaneously

**Action:**
1. Work on Case A (select from filter)
2. Review graph, add notes
3. Switch to Case B (select from filter)
4. Review timeline, update status
5. Switch back to Case A

**Benefit:** Fast context switching

---

## 🎨 Filter Details Display

Each case in the dropdown shows:

```
┌────────────────────────────────────────┐
│ 📁 Operation El Lobo                  │
│   ┌─────────────┬──────────┬──────────┐│
│   │CASE-2024-001│ Critical │8 entities││
│   └─────────────┴──────────┴──────────┘│
└────────────────────────────────────────┘
```

**Information Shown:**
- 📁 Folder icon with status color
- Case name (truncated if long)
- Case number
- Priority (with color coding)
- Entity count

---

## ⚙️ Technical Details

### State Management

**Redux Store:**
```typescript
state.cases.selectedCaseId: string | null
```

**Filtering Functions:**
- `filterGraphByCase(graphData, selectedCase, includeConnections)`
- `filterActivitiesByCase(activities, selectedCase)`
- `filterMarkersByCase(markers, selectedCase)`

### Real-Time Updates

Changes are **instant**:
1. Select case in filter
2. Redux state updates
3. All components re-render
4. Filtered data displayed
5. Total time: < 100ms

### Persistence

Filter persists through:
- ✅ Page navigation
- ✅ Page refresh (Redux persist)
- ✅ Browser back/forward
- ✅ URL sharing

Filter clears on:
- ❌ Explicitly clicking clear
- ❌ Selecting "All Entities"
- ❌ Clearing local storage

---

## 🆚 Global Filter vs. Sidebar

### Global Filter (Top Nav)
- ✅ Always visible
- ✅ Quick selection
- ✅ Shows filtered status
- ✅ Available on all pages
- ✅ One-click clear

### Case Sidebar (Left Panel)
- ✅ Full case list with details
- ✅ Case creation
- ✅ Case management
- ✅ Status organization
- ✅ Only on Graph/Timeline/Map

**Use Both Together:**
- Sidebar for case management
- Global filter for quick filtering

---

## 🔍 Filter Statistics

### Example: Operation El Lobo

**Unfiltered:**
- 150 total nodes
- 300 total edges
- 50 activities
- 15 locations

**Filtered:**
- 8 case nodes
- 12 connected nodes (20 total shown)
- 35 edges
- 12 activities
- 3 locations

**Reduction:** ~87% less data to focus on

---

## 💡 Tips & Tricks

### Tip 1: Use for Data Entry

When adding entities to graph:
1. Select target case
2. Add nodes/edges
3. They're automatically associated

### Tip 2: Visual Comparison

Switch filter on/off rapidly:
1. Note filtered view
2. Clear filter (see all)
3. Select filter again
4. Spot differences quickly

### Tip 3: Share Filtered Views

Copy URL with filter active:
```
/graph?case=case_001
```
Send to colleague → They see same filtered view

### Tip 4: Multi-Case Review

Review multiple cases systematically:
1. Open case list
2. Select Case 1 from global filter
3. Review all views
4. Select Case 2 from global filter
5. Review all views
6. Repeat

### Tip 5: Check Entity Associations

Unsure which case an entity belongs to?
1. Clear filter (see all)
2. Select entity
3. Try each case filter
4. See if entity disappears/appears

---

## 🐛 Troubleshooting

### "Filter not working"

**Check:**
1. Is a case actually selected? (Check dropdown)
2. Does case have entities assigned?
3. Are you viewing the right page? (Graph/Timeline/Map)
4. Try clearing filter and reselecting

### "Can't see any entities after filtering"

**Possible Causes:**
1. Case has no entities assigned → Add entities
2. Wrong case selected → Check case name
3. Entities not on current view → Check other views

**Solution:** Clear filter to verify entities exist

### "Filter not persisting"

**Check:**
1. Browser local storage enabled?
2. Redux DevTools → Check `state.cases.selectedCaseId`
3. Try hard refresh (Cmd+Shift+R)

### "Dropdown shows no cases"

**Cause:** No cases created yet

**Solution:**
1. Go to Cases page
2. Click "New Case" or "Detect Communities"
3. Return and filter will work

---

## 🎯 Best Practices

### DO:
- ✅ Use global filter for focused analysis
- ✅ Clear filter when doing broad exploration
- ✅ Filter before presentations
- ✅ Check filter status before adding entities
- ✅ Use in combination with sidebar

### DON'T:
- ❌ Leave filter active and forget
- ❌ Filter then wonder why entities missing
- ❌ Ignore the filter status banner
- ❌ Filter during community detection
- ❌ Filter when assigning entities to cases

---

## 📈 Workflow Examples

### Morning Case Review

```
1. Arrive at work
2. Select yesterday's case from global filter
3. Check Graph → Review overnight connections
4. Check Timeline → New activities?
5. Check Map → Location changes?
6. Switch to today's case
7. Repeat
```

### New Lead Investigation

```
1. Cases page → Create new case
2. Global filter → Select new case
3. Graph page → Add lead entities
4. Assign relationships
5. Timeline → Add activity events
6. Map → Pin locations
7. All data automatically filtered to case!
```

### Multi-Case Analysis

```
1. Clear global filter
2. Graph → See all entities
3. Spot interesting connections
4. Select Case A from filter
5. Entities turn out connected!
6. Consider merging cases
7. Navigate to Cases → Merge function
```

---

## ✅ Summary

**Global Case Filter:**
- ✅ **Location:** Top navigation bar (always visible)
- ✅ **Function:** Filters Graph, Timeline, Map views
- ✅ **Persistence:** Survives navigation and refresh
- ✅ **Speed:** Instant filtering
- ✅ **Visibility:** Clear status indicators
- ✅ **Control:** One-click clear
- ✅ **Integration:** Works with sidebar and URL

**Key Benefits:**
- 🎯 **Focus** on specific investigations
- ⚡ **Fast** case switching
- 🔄 **Consistent** filtering across all views
- 📊 **Professional** presentations
- 🔗 **Shareable** filtered views

🎉 **Your investigation workflow just got exponentially more efficient!**

---

## 🔜 Coming Soon

Potential enhancements:
- 📌 Pin multiple cases (multi-select filter)
- 📊 Filter statistics dashboard
- 🔍 Search cases in filter dropdown
- ⭐ Favorite/recent cases quick access
- 🏷️ Filter by tags alongside cases
- 📈 Filter impact preview


