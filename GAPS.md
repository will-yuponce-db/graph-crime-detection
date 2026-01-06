# Crime Network Analysis - User Story Gaps

This document identifies gaps and incomplete features discovered during user story testing on January 6, 2026.

---

## ✅ Fixed Issues

### 1. ~~"View on Map" Deep Linking Not Working~~ **FIXED**

**Location:** Case View → Case Detail Modal → "View on Map" button

**Fix:** Added URL parameter handling (`?case=CASE_ID`) in HeatmapDashboard that:

- Reads the case parameter from URL
- Finds matching keyFrame by caseNumber
- Automatically jumps to that case's timeframe and location

---

### 2. ~~"New Case" Button Non-Functional~~ **FIXED**

**Location:** Case View → "New Case" button

**Fix:** Added a complete "Create New Case" dialog with:

- Case title field
- Neighborhood and city fields
- State and priority selector
- Estimated loss field
- Description textarea
- Form validation and case creation

---

### 3. ~~Hotspot Cell Details Missing~~ **FIXED**

**Location:** Hotspot Explorer → Sidebar → Active Hotspots

**Fix:** Added selected hotspot detail panel showing:

- Tower name and city
- Device count and suspect count statistics
- High activity warning for suspicious hotspots
- Visual highlighting of selected hotspot card

---

### 4. ~~Device Card Click Has No Effect~~ **FIXED**

**Location:** Hotspot Explorer → Sidebar → Devices section

**Fix:** Added click handlers to device cards that:

- Highlight the selected device card
- Pan and zoom the map to the device location
- Work for both suspect and non-suspect devices

---

### 5. ~~Hotspot Selection Bug (Duplicate towerId)~~ **FIXED**

**Location:** Hotspot Explorer → Sidebar → Active Hotspots

**Issue:** Clicking the first hotspot would select multiple cards because hotspots shared the same `towerId`.

**Fix:** Changed selection state from object reference to index-based:

- Use `selectedHotspotIdx` instead of `selectedHotspot`
- Updated card keys to `${hs.towerId}-${idx}` for uniqueness
- Selection comparison uses index matching

---

### 6. ~~"View Case" Button Hardcoded Wrong Case~~ **FIXED**

**Location:** Network Analysis → Sidebar → "View Case" button

**Issue:** Button navigated to `/evidence-card?case_id=CASE_008` but CASE_008 doesn't exist.

**Fix:** Changed button to navigate to `/evidence-card` (Case View) without hardcoded case ID. Button now labeled "View Cases" for clarity.

---

### 7. ~~Suspect Card Click Has No Effect~~ **FIXED**

**Location:** Network Analysis → Sidebar → Suspect Cards

**Fix:** Added click handlers to suspect cards that:

- Toggle selection state on click
- Highlight selected card with red border and background tint
- Smooth transition animation on selection change

---

## 🔴 Data Issues (Backend/Database Required)

These issues require changes to the backend data model or database seeding:

### 8. Cases Show 0 Suspects/Devices

**Location:** Case View → Case Cards and Case Detail Modal

**Issue:** All cases display:

- 0 Suspects
- 0 Devices
- 1 Location

**Root Cause:** The `cases` table in the database doesn't have relationships to `persons` (suspects) or `devices` tables. The API returns cases without populated `persons` and `devices` arrays.

**Required Fix:**

- Add `case_persons` junction table linking cases to persons
- Add `case_devices` junction table linking cases to devices
- Update backend API to join and return linked suspects/devices
- Or add `case_id` foreign key to persons and devices tables

---

## 🟢 Enhancement Opportunities

### 9. No Search/Filter Functionality

**Location:** Global

**Current State:** No search bar or filter options across the application.

**Suggested Enhancement:**

- Global search for cases, suspects, devices
- Filter by jurisdiction, date range, priority
- Filter network graph by location or risk score

---

### 10. No Drag-and-Drop for Case Status

**Location:** Case View → Kanban Board

**Current State:** Status changes only via buttons in detail modal.

**Suggested Enhancement:** Allow dragging case cards between Investigating → Under Review → Adjudicated columns.

---

### 11. Timeline Auto-Play Speed Controls

**Location:** Hotspot Explorer → Timeline Controls

**Current State:** Play button auto-advances at fixed 500ms intervals.

**Suggested Enhancement:**

- Speed controls (0.5x, 1x, 2x, 5x)
- Time range selector
- Clear visual indicator of playback state

---

### 12. No Suspect Profile View

**Location:** Network Analysis

**Current State:** Suspect cards show basic info but no dedicated profile page.

**Suggested Enhancement:**

- Full suspect profile with photo/avatar
- Complete device history
- Case involvement timeline
- Known associates network

---

### 13. No Export/Report Generation

**Location:** Global

**Current State:** No way to export data or generate reports.

**Suggested Enhancement:**

- Export case details to PDF
- Export network graph image
- Generate analyst reports
- Export data to CSV

---

## ✅ Working Features

The following features were tested and working correctly:

- ✅ Navigation between tabs (Hotspot Explorer, Network Analysis, Case View)
- ✅ Dark/Light mode toggle with proper styling
- ✅ Case detail modal opens with full information
- ✅ Case status change via modal buttons
- ✅ Network graph visualization with co-location relationships
- ✅ "Analyze Network" button navigates correctly
- ✅ Jump to case buttons in Hotspot Explorer
- ✅ Focus mode toggle in Network Analysis
- ✅ "Detect Burner" AI feature showing burner phone detection
- ✅ Map interactions (zoom, pan)
- ✅ Hotspot cell selection zooms map and shows details
- ✅ Device card selection zooms to device location
- ✅ Deep linking from Case View to Hotspot Explorer
- ✅ New Case creation form
- ✅ Databricks integration badge displayed

---

## Testing Environment

- **Date:** January 6, 2026
- **URL:** http://localhost:5173/
- **Browser:** Chrome (via Browser MCP extension)
- **Theme Tested:** Both Light and Dark modes

---

## Summary of Changes Made

| Issue                                     | Status     | Type    |
| ----------------------------------------- | ---------- | ------- |
| View on Map deep linking                  | ✅ Fixed   | Code    |
| New Case button/form                      | ✅ Fixed   | Code    |
| Hotspot detail panel                      | ✅ Fixed   | Code    |
| Device card click handlers                | ✅ Fixed   | Code    |
| Hotspot selection bug (duplicate towerId) | ✅ Fixed   | Code    |
| View Case hardcoded wrong case            | ✅ Fixed   | Code    |
| Suspect card click in Network Analysis    | ✅ Fixed   | Code    |
| Cases show 0 suspects/devices             | ⚠️ Pending | Data    |
| Search/filter functionality               | 📋 Backlog | Feature |
| Drag-and-drop case status                 | 📋 Backlog | Feature |
