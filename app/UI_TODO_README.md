# UI / Story / Databricks Data TODO (crime-graph)

This is a prioritized punchlist to make the UI feel coherent, polished, and **fully driven by the available Databricks tables** (vs placeholders).

## Status (checklist)

- [x] **Removed React duplicate-key spam** on Hotspot Explorer by making hotspot keys unique and making hotspot selection stable across filtering (`src/pages/HeatmapDashboard.tsx`).
- [x] **Normalized `persons` fields coming from the backend** (snake_case → camelCase) so “Suspects” counts and threat levels render correctly (`src/services/api.ts`).
- [x] **Populated case → linked entities** using Databricks `entity_case_overlap`, so Case View no longer shows “0 suspects” everywhere (`backend/server.js`).

---

## P0 — Story coherence (what the user should understand in 30 seconds)

- [x] **Clarify vocabulary in UI copy**
  - [x] **Problem**: The app labels 199 rows as "Suspects", but the underlying Databricks model is "entities" with risk scoring. That reads like 199 named suspects, which feels wrong.
  - [x] **Fix**: Rename UI labels where appropriate:
    - [x] "Suspects" → "Persons of Interest" in UI labels (StatsCard, HeatmapDashboard, GraphExplorer, EvidenceCard)
    - [ ] Show a quick tooltip/legend for: "Risk score", "Threat level", "Co-location", "Social edge"

- [ ] **Define the “happy path” CTA flow**
  - [ ] **Goal**: Hotspot Explorer → pick a hotspot/time → see top entities → jump to Network Analysis filtered → open Case View for linked cases → generate an evidence summary.
  - [ ] **Work**:
    - [x] Add a “Continue Investigation” CTA in Hotspot Explorer that deep-links into Network Analysis with filters (time bucket / city / selected entities)
    - [x] Add a “View in Network” CTA in the Case Detail dialog (currently only “View on Map”)

## P0 — Use more Databricks data where it’s already available

- [ ] **Case View: show real linked entities + evidence (not just counts)**
  - [ ] **Now**: Case cards show entity counts (from `entity_case_overlap`), but Case Detail doesn’t surface the actual ranked list or evidence fields.
  - [ ] **Add**:
    - [x] In Case Detail dialog: render the top linked entities list (entity name, overlap score, threat level, linked cities).
    - [x] Use Databricks `evidence_card_data.geo_evidence` to show a small “why we think this entity is linked” section (time buckets / h3 / address).

- [ ] **Hotspot Explorer: make “Active Hotspots” actually active**
  - [ ] **Issue**: `activeHotspots` uses `suspectCount > 0` but current data often returns 0, so the “Active Hotspots 0/50” panel feels broken.
  - [ ] **Fix options**:
    - [ ] If `cell_device_counts.suspect_count` is trustworthy: ensure it’s selected/returned consistently.
    - [ ] Otherwise compute `suspectCount` from `suspect_rankings`/`location_events_silver` for the current hour/time bucket.

- [ ] **Network Analysis: avoid “Entity E\_####” as the default UX**
  - [ ] Use persisted naming via `entity_titles.json` + UI workflows:
    - [ ] Bulk title seeding for top N entities (risk score) from Databricks `evidence_card_data.display_name`
    - [ ] Add name-edit support in Hotspot Explorer + Case View (Graph already supports edit)

## P1 — UX polish / usability

- [ ] **Filter controls that match the data scale**
  - [ ] Network Analysis and Hotspot Explorer should have “Top N by risk score” and “Threat level >= …” toggles.
  - [ ] Add “Jurisdiction / City” filter chips (DC, Arlington, Nashville, …) that actually filter nodes + hotspots + cases.

- [ ] **Selection consistency across screens**
  - [ ] When a case is selected, highlight its related entities across:
    - [ ] Hotspot Explorer map markers
    - [ ] Network Analysis node highlights
    - [ ] Case View entity list

- [ ] **Performance guardrails**
  - [ ] 199-node graph is fine, but links can explode visually; add a default link cap or “Top edges only” mode.
  - [ ] Add skeleton loading states for sidebars (currently it’s mostly spinners).

## P2 — Data + API consistency / maintainability

- [ ] **Return consistent casing from the backend**
  - [ ] Standardize JSON fields to camelCase in `/api/demo/*` responses (or explicitly document snake_case and always normalize client-side).

- [ ] **Make the “hour” simulation explicit**
  - [ ] Today the timeline is a simulated 72-hour loop. Add a small “Simulated timeline” label and map it to Databricks `time_bucket` where available (`entity_case_overlap.time_bucket`).

- [ ] **Add a lightweight “Data provenance” panel**
  - [ ] Show which Databricks tables power the current screen (e.g., “This view uses `location_events_silver` + `cell_device_counts`”).
