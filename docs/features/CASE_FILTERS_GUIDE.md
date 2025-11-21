# Case Filters & Panel Menu - User Guide

## ✨ New Features

### 1. **Three-Dots Menu (⋮) on Each Status Panel**
- Located in the top-right corner of each status column
- Works in Board View (Kanban)
- Provides filtering and sorting options

### 2. **Comprehensive Filtering**
- Filter by Priority (Critical, High, Medium, Low)
- Filter by Tags (all available tags)
- Multiple filters can be active simultaneously
- Filters apply across all status columns

### 3. **Smart Sorting**
- Sort by Recent (date updated)
- Sort by Priority (Critical first)
- Sort by Name (A-Z)
- Sorting applies to entire board

## 📋 How to Use

### Accessing the Menu

**Step 1: Open Board View**
- Click "Board View" tab on Cases page
- See status columns: Leads, Investigation, Prosecution, Closed

**Step 2: Click Three Dots (⋮)**
- Each column header has a three-dots icon
- Click it to open the filter menu
- Menu shows all available options

```
┌─────────────────────────────┐
│ Leads        [5]      [⋮]   │ ← Click here
└─────────────────────────────┘
```

### Filter Options

#### Priority Filters

Filter cases by importance level:

```
☐ Critical  - Immediate attention
☐ High      - Important cases
☐ Medium    - Standard priority
☐ Low       - Background cases
```

**How It Works:**
- ✅ Check boxes to include that priority
- Multiple priorities can be selected
- Example: Check "Critical" + "High" = shows only critical and high-priority cases

**Use Cases:**
- Focus on urgent cases: Check "Critical" only
- Review high-value cases: Check "Critical" + "High"
- See all active work: Check all except "Low"

#### Tag Filters

Filter by case tags:

```
☐ drug-trafficking
☐ money-laundering
☐ cartel
☐ high-priority
☐ community-detected
... (up to 10 visible, +X more)
```

**How It Works:**
- ✅ Check tags to show only cases with those tags
- Cases with ANY checked tag will appear (OR logic)
- First 10 tags shown, with indication of more

**Use Cases:**
- View all cartel cases: Check "cartel"
- See community-detected cases: Check "community-detected"
- Find specific investigation types: Check relevant tags

#### Sort Options

Change how cases are ordered:

```
● Recent      - Most recently updated first
○ Priority    - Critical → High → Medium → Low
○ Name (A-Z)  - Alphabetically by case name
```

**How It Works:**
- Radio button selection (only one at a time)
- Applies to ALL status columns
- Persistent until changed

**Use Cases:**
- Find recent activity: Use "Recent" (default)
- Triage urgent cases: Use "Priority"
- Locate specific case: Use "Name (A-Z)"

### Clear Filters

Remove all active filters:

```
[Clear Filters]  (red text at bottom of menu)
```

- Removes all priority filters
- Removes all tag filters
- Keeps sort order
- Resets pagination to page 1

## 🎨 Visual Indicators

### Filter Status Badge

When filters are active, the count chip changes color:

**No Filters:**
```
Leads  [5]  ← Grey chip, shows total
```

**With Filters:**
```
Leads  [3/5]  ← Blue chip, shows filtered/total
```

### Filter Info Banner

Below the main toolbar, see active filters:

```
🔍 2 priority filter(s), 1 tag filter(s) active  [Clear]
```

- Click "Clear" for quick reset
- Shows filter count at a glance
- Visible in both Board and List views

### Column Counts

Each column shows how many cases match filters:

```
┌─────────────────────┐
│ Leads  [3/8]  [⋮]  │  ← 3 matches, 8 total
│                     │
│ [Case 1]            │
│ [Case 2]            │
│ [Case 3]            │
└─────────────────────┘
```

## 🔄 Filter Behavior

### Across All Columns

Filters apply to **all status columns** simultaneously:

**Example:**
- Filter: Priority = "Critical"
- Result:
  - Leads: Shows only Critical cases in Leads
  - Investigation: Shows only Critical cases in Investigation
  - Prosecution: Shows only Critical cases in Prosecution
  - Closed: Shows only Critical cases in Closed

### With Pagination

Filters work with pagination:

**Example:**
- 45 total cases
- Filter by "cartel" tag
- 12 cases match
- Pagination shows "Page 1 of 1" (if 12 per page)

### In List View

Filters also apply in List View:

- Same filters active
- Grid layout shows filtered cases
- Pagination updates to filtered count
- Filter banner shows at top

## 💡 Common Workflows

### 1. Find All High-Priority Cases

```
1. Click ⋮ on any column
2. Check "Critical"
3. Check "High"
4. All columns now show only Critical + High cases
```

**Result:** Easy triage of urgent work

### 2. Review Cartel Investigations

```
1. Click ⋮ on any column
2. Scroll to Tags section
3. Check "cartel"
4. All cartel-related cases visible
```

**Result:** Focused view of specific operation type

### 3. Sort by Priority Within Each Column

```
1. Click ⋮ on any column
2. Select "Priority" in Sort By
3. Critical cases appear first in each column
```

**Result:** Quick identification of urgent cases in each stage

### 4. Find Recently Updated Cases

```
1. Click ⋮ on any column
2. Select "Recent" in Sort By (default)
3. Most recently updated cases show first
```

**Result:** See what's been worked on lately

### 5. Community Case Review

```
1. Click ⋮ on any column
2. Check "community-detected" tag
3. Review all automatically detected cases
4. Decide which to merge or investigate
```

**Result:** Efficient community case management

## 🎯 Advanced Filtering

### Multiple Priority Filters

Combine priorities for custom views:

**Critical + High:**
```
☑ Critical
☑ High
☐ Medium
☐ Low
```
Shows: Urgent and important cases only

**Medium + Low:**
```
☐ Critical
☐ High
☑ Medium
☑ Low
```
Shows: Lower-priority background work

### Multiple Tag Filters

Combine tags to narrow results:

**Example: High-value cartel cases**
```
☑ cartel
☑ high-priority
```
Shows: Cases tagged with "cartel" OR "high-priority"

**Note:** Tag filters use OR logic (any match shows case)

### Priority + Tags + Sort

Ultimate filtering power:

```
Priority: Critical + High
Tags: drug-trafficking, money-laundering
Sort: Recent
```

**Result:** Recent updates on high-priority drug/money cases

## 📊 Filter Statistics

### Case Counts

**Before Filters:**
```
Leads:         15 cases
Investigation: 12 cases
Prosecution:    8 cases
Closed:        20 cases
Total:         55 cases
```

**After Filtering (Priority: Critical):**
```
Leads:         2/15 cases
Investigation: 3/12 cases
Prosecution:   1/8 cases
Closed:        0/20 cases
Total:         6/55 cases
```

### Filter Impact

See immediately how many cases match:
- Column chips show filtered/total
- Banner shows number of active filters
- Pagination updates to filtered count
- Empty columns show "No cases on this page"

## 🔧 Technical Details

### Filter State

Filters are stored in component state:
```typescript
priorityFilters: Set<CasePriority>
tagFilters: Set<string>
sortBy: 'date' | 'priority' | 'name'
```

### Filter Logic

```typescript
// Priority filter (AND within priorities, OR across)
if (priorityFilters.size > 0) {
  filtered = filtered.filter(c => priorityFilters.has(c.priority))
}

// Tag filter (OR logic)
if (tagFilters.size > 0) {
  filtered = filtered.filter(c => 
    c.tags.some(tag => tagFilters.has(tag))
  )
}

// Sort
filtered.sort((a, b) => {
  switch (sortBy) {
    case 'name': return a.name.localeCompare(b.name)
    case 'priority': return priorityOrder[a.priority] - priorityOrder[b.priority]
    case 'date': return b.updatedDate - a.updatedDate
  }
})
```

### Performance

- Filters applied in-memory (fast)
- UseMemo hooks prevent unnecessary recalculation
- Pagination on filtered results
- Smooth for hundreds of cases

## 🐛 Troubleshooting

### "Three dots don't appear"
- Make sure you're in Board View (not List View)
- Check if columns are rendering
- Refresh page (F5)

### "Filters don't work"
- Check if filters are actually applied (look for blue chip)
- Try clearing filters and reapplying
- Verify cases have the tags/priorities you're filtering for

### "No cases show after filtering"
- Normal if no cases match criteria
- Check the X/Y counts in chips
- Try broader filters
- Click "Clear Filters" to reset

### "Filter applies to wrong column"
- Filters apply to ALL columns (this is by design)
- Use status tabs at top to focus on one status
- Or accept that filters are global across board

## ✅ Best Practices

### Efficient Filtering

**DO:**
- ✅ Use priority filters for triage
- ✅ Use tag filters for themed reviews
- ✅ Sort by priority when prioritizing work
- ✅ Clear filters when done with focused view

**DON'T:**
- ❌ Leave filters active when browsing all cases
- ❌ Forget why cases are "missing" (check filters)
- ❌ Over-filter (too narrow = empty results)

### Organizing Tags

For best filtering experience:
```
Good tags:
  - "cartel"
  - "high-priority"
  - "multi-agency"
  - "international"
  
Bad tags:
  - "case" (too broad)
  - "misc" (not useful)
  - Random case-specific notes
```

### Workflow Integration

**Morning Review:**
```
1. Sort by Recent
2. Filter: Critical + High
3. Review overnight updates
4. Triage new urgent cases
```

**Weekly Planning:**
```
1. Filter by each priority level
2. Review case distribution
3. Reassign as needed
4. Clear filters
```

**Themed Investigation Day:**
```
1. Filter by tag (e.g., "cartel")
2. Review all related cases
3. Look for connections
4. Consider merging related cases
```

## 🎉 Summary

**New Features:**
- ✅ Three-dots menu on each status column
- ✅ Priority filters (Critical/High/Medium/Low)
- ✅ Tag filters (all case tags)
- ✅ Sort options (Recent/Priority/Name)
- ✅ Clear filters button
- ✅ Visual filter indicators
- ✅ Filtered/total counts
- ✅ Filter info banner
- ✅ Works in Board & List views

**Benefits:**
- 🎯 Focus on urgent cases
- 🔍 Find cases by theme
- 📊 Better case visibility
- ⚡ Faster triage
- 🧹 Cleaner workflow
- 📈 Improved productivity

**Your case management just got a major upgrade!** 🚀

