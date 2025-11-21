# Case Lifecycle Management - User Guide

## ✨ New Features Implemented

### 1. **Full Edit Case Functionality** ✅
- Edit case name, description, priority
- Change case status through lifecycle
- Update lead agent and classification
- Add/remove tags
- Update case notes

### 2. **Intuitive Status Transitions** ✅
- Visual stepper showing case lifecycle
- One-click "Move to Next Status" button
- Click any step to jump to that status
- Status descriptions at each stage
- Color-coded progress indicators

## 🔄 Case Lifecycle Workflow

```
LEADS → ACTIVE INVESTIGATION → PROSECUTION → CLOSED
```

### Status Descriptions:

1. **LEADS** (Blue-Grey)
   - Initial leads and intelligence gathering
   - Preliminary information collection
   - Determining case viability

2. **ACTIVE INVESTIGATION** (Blue)
   - Active investigation in progress
   - Evidence collection
   - Witness interviews
   - Surveillance operations

3. **PROSECUTION** (Orange)
   - Case referred to prosecution
   - Building legal case
   - Court proceedings
   - Working with prosecutors

4. **CLOSED** (Green)
   - Case resolved or archived
   - Successful prosecution
   - Case inactive
   - Archived for reference

## 📝 How to Use

### Edit a Case

**Method 1: From Case Card**
1. Go to Cases page
2. Click the **Edit icon** (pencil) on any case card
3. Edit dialog opens with full case details

**Method 2: From Case Details**
1. Click **View Details** on a case card
2. Click **Edit Case** button at bottom
3. Edit dialog opens

### Transition Case Status

**Quick Transition (One Click):**
1. Open Edit Case dialog
2. See the case lifecycle stepper at top
3. Click blue **"Move to [Next Status]"** button
4. Status advances automatically

**Jump to Any Status:**
1. Open Edit Case dialog
2. Click on any step in the stepper
3. Status changes to that step
4. Useful for corrections or special circumstances

**Visual Indicators:**
- ✅ Completed steps (past statuses)
- 🔵 Current step (active status)
- ⚪ Future steps (upcoming statuses)

### Example Workflow

```
Case Created
    ↓
[LEADS] - Gather intelligence
    ↓ (Click "Move to Active Investigation")
[ACTIVE INVESTIGATION] - Conduct investigation
    ↓ (Click "Move to Prosecution")
[PROSECUTION] - Legal proceedings
    ↓ (Click "Move to Closed")
[CLOSED] - Case resolved
```

## 🎨 Visual Features

### In Edit Dialog:
- **Status Stepper** - Shows progression through lifecycle
- **Color Coding** - Each status has distinct color
- **Quick Action** - Blue alert box with "Move to Next" button
- **Current Status Description** - Shows what phase means
- **Success Indicator** - Green check when case closed

### On Case Cards:
- **Status Chip** - Shows current status with color
- **Priority Badge** - Critical/High/Medium/Low
- **Quick Action Icons** - Graph, Timeline, Map views
- **Edit Button** - Opens full edit dialog

## 🔧 What You Can Edit

### Basic Information
- ✅ Case Name
- ✅ Description
- ✅ Priority (Critical/High/Medium/Low)
- ✅ Classification (Unclassified/Confidential/Secret/Top Secret)

### Assignment
- ✅ Lead Agent
- ✅ Assigned Agents (view only, edit coming soon)

### Organization
- ✅ Tags - Add/remove custom tags
- ✅ Notes - Case observations and next steps

### Status
- ✅ Current lifecycle status
- ✅ One-click transitions
- ✅ Jump to any status

## 💡 Best Practices

### Status Transitions
1. **Don't skip statuses** unless necessary
   - Linear progression is recommended
   - Stepper allows jumping if needed

2. **Update notes** when changing status
   - Document why status changed
   - Record key milestones

3. **Set priority appropriately**
   - Critical: Immediate threat, high-value target
   - High: Active operation, time-sensitive
   - Medium: Standard investigation
   - Low: Background research, cold cases

### Tags Usage
- Use for categorization: "cartel", "fraud", "cyber"
- Link related cases with common tags
- Track themes: "high-priority", "multi-agency"
- Geographic indicators: "mexico", "california"

## 🚀 Quick Tips

### Keyboard Shortcuts (in Edit Dialog)
- `Enter` - Add tag (when in tag input)
- `Escape` - Close dialog

### Analyst Workflow
```
1. Create case from Community Detection
2. Review entities assigned to case
3. Set to ACTIVE INVESTIGATION
4. View in Graph to analyze network
5. Update notes with findings
6. Move to PROSECUTION when ready
7. Close case when resolved
```

### Multi-Case Operations
- Edit one case at a time
- Changes save immediately to Redux
- Updates persist across page refreshes
- Visible in all views instantly

## 📊 Status Statistics

The Cases page shows:
- **Total cases** across all statuses
- **Active cases** (Investigation + Prosecution)
- **Cases by status** (Leads, Investigation, Prosecution, Closed)

Board view organizes by status columns for easy overview.

## 🎯 Common Workflows

### New Investigation
```
1. Create case (LEADS)
2. Add tags: "priority", "narcotics"
3. Assign lead agent
4. Move to ACTIVE INVESTIGATION
5. View in Graph → analyze network
6. Update notes with findings
```

### Case Handoff
```
1. Open Edit Case
2. Change Lead Agent
3. Update notes: "Handed off to Agent Smith"
4. Add tag: "transferred"
5. Save
```

### Close Case
```
1. Open Edit Case
2. Click "Move to Closed"
3. Update notes: "Suspects arrested, case resolved"
4. Change priority to Low
5. Add tag: "resolved"
6. Save
```

## 🔍 Troubleshooting

### Edit button doesn't work
- Refresh page (F5)
- Check Redux DevTools for errors
- Clear localStorage if needed

### Status doesn't change
- Make sure you click "Save Changes"
- Check that you clicked the status or "Move to" button
- Verify Redux DevTools shows the action

### Changes don't persist
- Redux persist should save automatically
- Check localStorage is enabled
- Verify no browser errors in console

---

## ✅ Summary

**Edit Case:**
- Click edit icon on any case card
- Full featured dialog with all case fields
- Changes save to Redux + localStorage

**Status Transitions:**
- Visual stepper shows lifecycle
- One-click "Move to Next Status"
- Click any step to jump
- Color-coded progress

**Persists Everywhere:**
- Redux state management
- Automatic localStorage backup
- Visible in all views instantly
- Survives page refresh

**Professional UX:**
- Material-UI Stepper component
- Intuitive workflow
- Visual feedback
- Smart defaults

🎉 **Case management is now fully functional and intuitive!**


