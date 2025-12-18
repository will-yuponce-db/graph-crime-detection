# Investigative Analytics Demo - Entity-Relationship Diagram

## Data Model Overview

This document describes the data entities and relationships displayed in the Investigative Analytics Demo application.

## Core Entities and Relationships

```mermaid
erDiagram
    LOCATION_EVENTS ||--o{ ENTITY_PROFILES : "references"
    LOCATION_EVENTS }o--|| H3_CELLS : "located_in"
    LOCATION_EVENTS }o--o| CASES : "linked_to"
    CO_PRESENCE_EDGES }o--|| ENTITY_PROFILES : "entity1"
    CO_PRESENCE_EDGES }o--|| ENTITY_PROFILES : "entity2"
    CO_PRESENCE_EDGES }o--o{ CASES : "associated_with"
    HANDOFF_CANDIDATES }o--|| ENTITY_PROFILES : "old_entity"
    HANDOFF_CANDIDATES }o--|| ENTITY_PROFILES : "new_entity"
    SOCIAL_LINKS }o--|| ENTITY_PROFILES : "entity1"
    SOCIAL_LINKS }o--|| ENTITY_PROFILES : "entity2"
    EVIDENCE_CARD }o--o{ ENTITY_PROFILES : "includes"
    EVIDENCE_CARD }o--o{ CASES : "links"
    EVIDENCE_CARD }o--o{ CO_PRESENCE_EDGES : "cites_geospatial"
    EVIDENCE_CARD }o--o{ SOCIAL_LINKS : "cites_social"

    LOCATION_EVENTS {
        string id PK
        string entity_id FK
        string entity_type
        string h3_cell FK
        timestamp time_bucket
        string city
        string state
        float latitude
        float longitude
        string case_id FK
    }

    ENTITY_PROFILES {
        string entity_id PK
        string entity_type
        string device_type
        string owner_name
        string owner_alias
        int age
        string last_known_address
        string criminal_history
        string threat_level
        string image_url
        string notes
    }

    H3_CELLS {
        string h3_cell PK
        float center_lat
        float center_lon
        string city
        string state
        string neighborhood
        string cell_type
    }

    CASES {
        string id PK
        string case_number
        string title
        string city
        string state
        timestamp time_window_start
        timestamp time_window_end
        text narrative
        string method_of_entry
        string stolen_items
        string status
        string priority
    }

    CO_PRESENCE_EDGES {
        string id PK
        string entity1 FK
        string entity2 FK
        int weight
        int occurrences
        array h3_cells
        array time_buckets
        array cities
        array case_ids
    }

    HANDOFF_CANDIDATES {
        string id PK
        string old_entity FK
        string new_entity FK
        float score
        string h3_cell
        timestamp time_bucket_old
        timestamp time_bucket_new
        array shared_neighbors
        int shared_neighbor_count
        int temporal_gap_minutes
        float spatial_distance_meters
        string confidence
        text reasoning
    }

    SOCIAL_LINKS {
        string id PK
        string entity1 FK
        string entity2 FK
        string relationship_type
        string source
        date since
        string confidence
        text notes
    }

    EVIDENCE_CARD {
        string title
        timestamp generated_at
        array entities
        array linked_cases
        object signals
        text summary
        text recommended_action
    }
```

## Application Flow and Data Usage

```mermaid
graph TB
    subgraph HeatmapDashboard [Heatmap Dashboard Page]
        timeBuckets[Time Buckets]
        cellCounts[Cell Device Counts]
        entitiesInCell[Entities in Selected Cell]
    end

    subgraph GraphExplorer [Graph Explorer Page]
        coPresenceEdges[Co-Presence Edges]
        rankedEntities[Ranked Entities]
        handoffDetection[Handoff Candidates]
        graphVisualization[Force-Directed Graph]
    end

    subgraph EvidenceCardPage [Evidence Card Page]
        geospatialSignals[Geospatial Signals]
        narrativeSignals[Narrative M.O. Analysis]
        socialSignals[Social Network Links]
        aiSummary[AI-Generated Summary]
    end

    subgraph WarrantPackage [Warrant Package Page]
        pdfGeneration[PDF Generator]
        courtDocument[Court-Ready Document]
    end

    LOCATION_EVENTS --> timeBuckets
    LOCATION_EVENTS --> cellCounts
    LOCATION_EVENTS --> entitiesInCell
    H3_CELLS --> cellCounts
    ENTITY_PROFILES --> entitiesInCell

    CO_PRESENCE_EDGES --> coPresenceEdges
    CO_PRESENCE_EDGES --> rankedEntities
    ENTITY_PROFILES --> rankedEntities
    ENTITY_PROFILES --> graphVisualization
    CO_PRESENCE_EDGES --> graphVisualization

    HANDOFF_CANDIDATES --> handoffDetection

    CO_PRESENCE_EDGES --> geospatialSignals
    CASES --> narrativeSignals
    SOCIAL_LINKS --> socialSignals
    geospatialSignals --> aiSummary
    narrativeSignals --> aiSummary
    socialSignals --> aiSummary

    aiSummary --> pdfGeneration
    pdfGeneration --> courtDocument
```

## Key Entity Descriptions

### LOCATION_EVENTS

**Purpose**: Tracks device locations in 15-minute time buckets for geospatial analysis.

**Display**: Heatmap Dashboard

- Shows device density per H3 cell
- Filters by time bucket
- Highlights DC incident with 50 devices

**Key Fields**:

- `h3_cell`: H3 hexagonal grid cell identifier
- `time_bucket`: 15-minute time window (ISO 8601 format)
- `entity_id`: Device or person identifier

### ENTITY_PROFILES

**Purpose**: Stores suspect/device profile information for identification.

**Display**: All pages

- Profile cards with photos
- Threat level badges
- Criminal history

**Key Fields**:

- `owner_name`: Actual name of device owner
- `threat_level`: High, Medium, Low
- `image_url`: Avatar/photo path

### CO_PRESENCE_EDGES

**Purpose**: Precomputed co-location patterns between entities.

**Display**: Graph Explorer

- Force-directed graph visualization
- Edge thickness = weight
- Node size = score

**Key Fields**:

- `weight`: Strength of co-presence (1-10)
- `occurrences`: Number of times seen together
- `cities`: Cross-jurisdictional indicator

### CASES

**Purpose**: Burglary case records for M.O. matching.

**Display**: Evidence Card

- Case list with locations
- Narrative M.O. analysis
- Method of entry comparison

**Key Fields**:

- `method_of_entry`: "Rear window smash" (signature)
- `stolen_items`: Target preferences
- `narrative`: Case description

### HANDOFF_CANDIDATES

**Purpose**: Burner phone switch detection results.

**Display**: Graph Explorer (after "Detect Switch" button)

- Old device → New device visualization
- Confidence scoring
- Reasoning explanation

**Key Fields**:

- `score`: Detection confidence (0.0-1.0)
- `shared_neighbors`: Associates in common
- `temporal_gap_minutes`: Time between last/first appearance

### SOCIAL_LINKS

**Purpose**: Known associations between entities from intelligence sources.

**Display**: Evidence Card

- Social network evidence section
- Relationship types
- Source attribution

**Key Fields**:

- `relationship_type`: "Known Associates", "Connected To"
- `source`: Data provenance
- `confidence`: Reliability rating

### EVIDENCE_CARD

**Purpose**: AI-generated evidence summary for prosecution.

**Display**: Evidence Card Page & Warrant Package

- Structured evidence signals
- Geospatial + Narrative + Social
- Probable cause summary

**Key Structure**:

```json
{
  "signals": {
    "geospatial": [{"claim": "...", "support": [...], "confidence": "High"}],
    "narrative": [{"claim": "...", "support": [...], "confidence": "High"}],
    "social": [{"claim": "...", "support": [...], "confidence": "Medium"}]
  },
  "summary": "AI-generated probable cause narrative",
  "recommended_action": "Next steps for investigation"
}
```

## Demo Configuration

The `config` object defines the demo scenario parameters:

```json
{
  "dc_incident": {
    "case_id": "CASE_DC_003",
    "time_bucket": "2024-12-02T03:30:00.000Z",
    "h3_cell": "8a2a1072b59ffff",
    "expected_device_count": 50
  },
  "suspects": {
    "suspect1_old": "DEVICE_E0412",
    "suspect2": "DEVICE_E1098",
    "suspect1_new": "DEVICE_E2847"
  },
  "handoff": {
    "old_device": "DEVICE_E0412",
    "new_device": "DEVICE_E2847",
    "detection_id": "HANDOFF_001"
  }
}
```

## Data Generation

All data is generated deterministically with seed `42` in `backend/db/investigativeData.js`:

- **50 devices** in DC incident cell (noise)
- **2 suspects** recurring across **4 burglary scenes**
- **1 burner phone handoff** after DC crime
- **3 social links** between suspects and fence
- **5 cases** across DC, Nashville, and Baltimore

## API Endpoints

| Endpoint                                | Data Returned             | Used By           |
| --------------------------------------- | ------------------------- | ----------------- |
| `/api/investigative/cells`              | Device counts per H3 cell | Heatmap Dashboard |
| `/api/investigative/entities-in-cell`   | Entities at location/time | Heatmap Dashboard |
| `/api/investigative/co-presence`        | Co-presence edges         | Graph Explorer    |
| `/api/investigative/rank-entities`      | Ranked suspects           | Graph Explorer    |
| `/api/investigative/handoff-candidates` | Burner phone switches     | Graph Explorer    |
| `/api/investigative/evidence-card`      | AI evidence summary       | Evidence Card     |
| `/api/investigative/config`             | Demo configuration        | All pages         |
| `/api/investigative/time-buckets`       | Available time windows    | Heatmap Dashboard |

## User Flow (Happy Path - 90 seconds)

1. **Heatmap Dashboard** (15s)
   - View DC incident time bucket
   - Click hotspot cell with 50 devices
   - See top 2 suspects highlighted in red

2. **Graph Explorer** (30s)
   - Click "Explore in Graph View"
   - View co-presence network
   - Click "Collapse to Top 2 Suspects"
   - Click "Detect Burner Phone Switch"
   - See handoff detection

3. **Evidence Card** (25s)
   - Click "Generate Evidence Card"
   - Review 3 evidence types (Geospatial, Narrative, Social)
   - Read AI summary

4. **Warrant Package** (20s)
   - Click "Generate Warrant Package"
   - Review court-ready document
   - Click "Download Warrant Package (PDF)"
   - **Done: 90 seconds from map to warrant**

---

**Built for**: Cross-jurisdictional investigative analytics demo
**Target Audience**: Law enforcement analysts, prosecutors
**Key Insight**: "Right place, right time" → prioritized lead in under 90 seconds
