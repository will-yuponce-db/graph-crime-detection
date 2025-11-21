# Merge Cases Feature - Complete Guide

## ✨ Overview

The Merge Cases feature allows you to consolidate multiple related cases or communities into a single unified case. This is useful for:
- Combining duplicate cases
- Merging related investigations
- Consolidating community-detected cases
- Creating comprehensive case files

## 🎯 Key Features

### 1. **Intelligent Merging**
- ✅ Combines entities without duplicates
- ✅ Merges documents (prevents duplicate URLs/paths)
- ✅ Consolidates tags, agents, and notes
- ✅ Preserves all metadata

### 2. **Flexible Options**
- Choose which case to keep as target
- Keep or delete source cases
- Customize merged case name/description
- Auto-tags source cases if kept

### 3. **Automatic Document Association**
- Documents from all source cases are merged
- Duplicates filtered by URL or path
- Source node tracking maintained
- Auto-extraction from community detection

## 📋 How to Use

### Step 1: Open Merge Dialog

**From Cases Page:**
1. Click **"Merge Cases"** button in top toolbar
2. Dialog opens with list of all cases

**Keyboard Shortcut:** None (future enhancement)

### Step 2: Select Cases

1. **Check the boxes** next to cases you want to merge
   - Minimum: 2 cases
   - Maximum: Unlimited

2. **Choose Target Case:**
   - Click **"Set as Target"** on the case you want to keep
   - Target case retains its ID and case number
   - Other cases merge into it

```
┌─────────────────────────────────────┐
│ ☑ Operation El Lobo (CASE-2024-001)│ [Target]
│ ☑ Red Square Network (CASE-2024-002)│ [Set as Target]
│ ☐ Cross-Pacific (CASE-2024-003)    │
└─────────────────────────────────────┘
```

### Step 3: Review Preview

The dialog shows:
- **Target Case**: Will be kept
- **Source Cases**: Will merge into target
- **Total Entities**: Combined count
- **Total Documents**: Combined count
- **Total Agents**: Combined count

### Step 4: Configure Options

**Option 1: Keep Source Cases**
- ✅ **ON**: Source cases marked as "merged" but not deleted
- ❌ **OFF**: Source cases permanently deleted

**Option 2: Customize Name**
- ✅ **ON**: Provide new name and description
- ❌ **OFF**: Use target case's name

### Step 5: Merge

Click **"Merge X Cases"** button

## 🔄 Merge Process

### What Gets Merged:

**1. Entities (Nodes)**
```
Target Case: [A, B, C]
Source 1:    [C, D, E]
Source 2:    [E, F, G]
────────────────────────
Result:      [A, B, C, D, E, F, G]
```
✅ Duplicates removed automatically

**2. Documents**
```
Target:  doc1.pdf, doc2.pdf
Source:  doc2.pdf, doc3.pdf (duplicate URL filtered)
────────────────────────────
Result:  doc1.pdf, doc2.pdf, doc3.pdf
```
✅ De-duplicated by URL/path

**3. Tags**
```
Target:  ['cartel', 'high-priority']
Source:  ['high-priority', 'smuggling']
────────────────────────────
Result:  ['cartel', 'high-priority', 'smuggling']
```
✅ Unique tags only

**4. Agents**
```
Target:  [Agent Smith, Agent Jones]
Source:  [Agent Jones, Agent Lee]
────────────────────────────
Result:  [Agent Smith, Agent Jones, Agent Lee]
```
✅ Duplicates removed

**5. Notes**
```
Target Notes:
"Primary investigation notes..."

Source 1 Notes:
"--- From Operation Beta (CASE-2024-005) ---
Additional evidence found..."

Source 2 Notes:
"--- From Community 3 (COMM-2024-002) ---
Network analysis shows..."
────────────────────────────
Result: All notes combined with clear separation
```

### What Stays With Target:

- ✅ Case ID
- ✅ Case Number
- ✅ Status (LEADS, INVESTIGATION, etc.)
- ✅ Priority (unless manually changed)
- ✅ Classification
- ✅ Created Date
- ✅ Lead Agent (unless manually changed)

### What Gets Updated:

- ✅ Description (appends merge info)
- ✅ Updated Date (set to now)
- ✅ Change Status (MODIFIED)
- ✅ Entity list (merged)
- ✅ Document list (merged)
- ✅ Tags (merged)
- ✅ Agents (merged)
- ✅ Notes (merged)

## 🤖 Automatic Document Association

### From Community Detection

When detecting communities, documents are **automatically extracted** from node properties:

**Supported Property Fields:**
```javascript
- document
- documentUrl / document_url
- sourceDocument / source_document
- pdf / pdfUrl / pdf_url
- file / fileUrl / file_url
- url
- source
- reference
```

**Example Node:**
```json
{
  "id": "suspect_001",
  "label": "John Doe",
  "type": "Person",
  "properties": {
    "name": "John Doe",
    "documentUrl": "https://doj.gov/case-123.pdf",
    "pdf": "/reports/doj/case-123.pdf"
  }
}
```

**Result:**
Case automatically includes:
- ✅ `case-123.pdf` (from documentUrl)
- ✅ Document type: PDF
- ✅ Source: John Doe (Person)
- ✅ Tags: ['auto-detected', 'Person']

### Document Types

Automatically detected:
- 📄 **PDF**: .pdf extension or "pdf" in URL
- 🖼️ **Image**: .jpg, .jpeg, .png, .gif, .webp
- 📝 **Text**: .txt, .doc, .docx
- 🔗 **URL**: Starts with http/https
- 📦 **Other**: Everything else

## 💡 Use Cases

### 1. Merge Duplicate Investigations

**Scenario:** Two agents created separate cases for same operation

**Solution:**
1. Select both cases
2. Choose one as target
3. Keep or delete source
4. Result: Single unified case

### 2. Consolidate Community-Detected Cases

**Scenario:** Community detection created 5 related cases

**Solution:**
1. Review all community cases
2. Select related ones (e.g., same cartel)
3. Merge into one primary case
4. Keep source cases for history

### 3. Merge After New Evidence

**Scenario:** New evidence links two seemingly unrelated cases

**Solution:**
1. Merge cases
2. Customize name: "Operation Combined Eagle"
3. Update description with linkage details
4. All entities and docs now in one place

### 4. Create Master Case from Sub-Cases

**Scenario:** Multiple small cases are part of larger operation

**Solution:**
1. Create new case: "Operation Kingpin"
2. Merge all sub-cases into it
3. Keep source cases for audit trail
4. Master case has full visibility

## ⚠️ Important Notes

### Before Merging

**✅ DO:**
- Review all cases carefully
- Check for truly related entities
- Decide on target case thoughtfully
- Consider keeping source cases initially

**❌ DON'T:**
- Merge unrelated cases
- Delete source cases without review
- Merge cases from different classifications
- Forget to update lead agent if needed

### After Merging

**If Source Cases Deleted:**
- ❌ **Irreversible** - cannot undo
- ✅ Notes preserved in target
- ✅ All data migrated to target

**If Source Cases Kept:**
- ✅ Can re-merge differently later
- ✅ Marked with "merged" tag
- ✅ Notes show where they merged
- ✅ Still visible in case list

## 🔧 Technical Details

### Redux Action

```typescript
dispatch(mergeCases({
  targetCaseId: 'case_001',
  sourceCaseIds: ['case_002', 'case_003'],
  mergeOptions: {
    keepSourceCases: false,
    newName: 'Custom Name',
    newDescription: 'Custom description'
  }
}));
```

### State Updates

```typescript
// Target case updated
target.entityIds = mergeUnique([target, ...sources].flatMap(c => c.entityIds))
target.documents = mergeDeduplicated([target, ...sources].flatMap(c => c.documents))
target.tags = mergeUnique([target, ...sources].flatMap(c => c.tags))
target.assignedAgents = mergeUnique([target, ...sources].flatMap(c => c.agents))
target.notes = mergeWithSeparators([target, ...sources].map(c => c.notes))
target.updatedDate = new Date()
target.changeStatus = 'modified'

// Source cases (if kept)
sources.forEach(s => {
  s.tags.push('merged')
  s.notes += `\n\nMerged into ${target.name} on ${date}`
})

// Source cases (if deleted)
state.cases = state.cases.filter(c => !sourceCaseIds.includes(c.id))
```

## 📊 Example Workflow

### Scenario: Merge 3 Community Cases

**Before:**
```
Community 1: Sinaloa Network
  - 8 entities, 3 documents
  - Status: LEADS
  - Tags: ['community-detected']

Community 2: El Lobo Associates
  - 5 entities, 2 documents
  - Status: LEADS
  - Tags: ['community-detected']

Community 3: Cartel Operations
  - 12 entities, 5 documents
  - Status: LEADS
  - Tags: ['community-detected', 'high-threat']
```

**Action: Merge all into Community 1**

**After:**
```
Sinaloa Network (TARGET)
  - 23 entities (unique)
  - 8 documents (unique)
  - Status: LEADS
  - Tags: ['community-detected', 'high-threat', '8-documents']
  - Description: "...Merged with 2 case(s) on 11/19/2024"
  - Notes: Combined notes from all 3 cases

Community 2: [DELETED or MARKED 'merged']
Community 3: [DELETED or MARKED 'merged']
```

## 🎯 Best Practices

### When to Merge

✅ **Good Reasons:**
- Cases share 50%+ entities
- Same criminal organization
- Related time period
- Same jurisdiction
- Connected evidence

❌ **Bad Reasons:**
- Just to reduce case count
- Different classifications
- Different investigation types
- No entity overlap

### Naming Conventions

**For Merged Cases:**
```
Good:
  - "Operation Kingpin - Consolidated"
  - "Sinaloa Cartel - Full Network"
  - "Multi-District Investigation #1"

Bad:
  - "Merged Case"
  - "Case 1 + Case 2"
  - "asdf merged"
```

### Documentation

**Always update notes:**
```
Original investigation: [brief summary]

Merged cases:
- CASE-2024-002: Red Square Network
- CASE-2024-005: Operation Beta
- COMM-2024-001: Community Detection #1

Reason for merge: [explain why]

Key findings after merge: [new insights]
```

## 🐛 Troubleshooting

### "Merge button disabled"
- Need at least 2 cases in system
- Create or detect more cases first

### "Cannot merge cases"
- Make sure at least 2 cases selected
- Ensure target case is selected
- Check console for errors

### "Source cases still visible after delete"
- Refresh page (F5)
- Check if "keep source cases" was ON
- Clear Redux state if needed

### "Documents not merging"
- Check if documents have valid URLs/paths
- Duplicates are intentionally filtered
- View target case details to verify

## ✅ Summary

**Merge Cases Feature:**
- ✅ Consolidates multiple cases into one
- ✅ Intelligently merges entities, documents, metadata
- ✅ De-duplicates automatically
- ✅ Optional source case preservation
- ✅ Customizable naming
- ✅ Automatic document extraction
- ✅ Full audit trail in notes

**Perfect for:**
- 🔄 Consolidating related investigations
- 📋 Merging community-detected cases
- 🔗 Linking connected operations
- 📊 Creating master cases
- 🧹 Cleaning up duplicates

🎉 **Your case management just got more powerful!**


