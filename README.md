# Cross-Jurisdictional Investigative Analytics

> "We turn 'right place, right time' into a prioritized investigative lead in under 90 seconds."

A Map-First Investigative Workspace where **Place + Time** become a ranked lead set. We use **Graph Analytics** to instantly validate alibis and **GenAI** to explain the connections in plain English.

## The Problem

Crime doesn't stop at the county line. A burglary crew hitting homes in Washington D.C. today might hit Nashville next week. Currently, connecting these dots takes weeks of manual coordination because data is siloed and signals are noisy.

## The Solution

This demo showcases how modern analytics can transform investigation workflows:

1. **Map-First Triage** - Filter to the exact 15-minute window, highlight a cell with 50 devices
2. **Graph Expansion** - Show which devices have been seen together at OTHER burglary sites
3. **Agentic Investigation** - Generate evidence cards citing geospatial, narrative, and social sources
4. **Plot Twist** - Detect burner phone switches when suspects swap devices
5. **Warrant Package** - One-click export to court-ready PDF

## Project Structure

```
pubsec-buildathon-team2/
├── databricks.yml                     # Databricks Asset Bundle config
├── README.md                          # This file
├── resources/                         # DAB resource definitions
│   ├── pipeline.yml                   # Pipeline configuration
│   └── jobs.yml                       # Job definitions
├── pipelines/                         # Data generation (SDP)
│   ├── data_generation_dlt.py         # Lakeflow Spark Declarative Pipeline
│   ├── config.py                      # Configuration constants
│   ├── query_functions.py             # API functions for app
│   ├── validate_data_generation.py    # Validation notebook
│   ├── setup_catalog.sql              # Unity Catalog setup
│   └── README.md                      # Pipeline documentation
├── app/                               # (Coming) Databricks App
└── notebooks/                         # (Coming) Investigation notebooks
```

## Demo Story Arc

### Act I: The Trigger (Map-First Triage)
- Analyst sees high-priority burglary in DC
- Filters to exact 15-minute window
- Map highlights cell with 50 devices → "Okay, who are they?"

### Act II: The Connection (Graph Expansion)  
- Pivots to Graph Explorer
- Query: "Show me which devices have been seen together at OTHER burglary sites"
- Graph collapses 50 devices → **2 Suspects**
- Reveal: Both were also co-located at a crime scene in Nashville, TN last week

### Plot Twist: The "Burner Phone" Switch
- Trail goes cold after the crime (suspect's phone disappears)
- System detects new device appearing where old one vanished
- "They didn't disappear; they swapped phones. We caught the hand-off."

### Act III: The Proof (Agentic Investigation)
- Agent summarizes connection with 3 cited sources:
  - **Geospatial**: "Co-present at both scenes"
  - **Narrative**: "Both case files describe 'rear window smash' and 'jewelry theft'"
  - **Social**: "Suspect A is connected to a known fence"

### Grand Finale
- One click: **Generate Warrant Package**
- PDF combines map screenshot, graph link, and GenAI summary
- "In 90 seconds, we went from a dot on a map to a court-ready document."

## Key Demo Entities

| Entity | ID | Role |
|--------|-----|------|
| Suspect Alpha | `E_0412` | Primary suspect, disappears after DC |
| Suspect Bravo | `E_1098` | Partner, continues throughout |
| Burner Phone | `E_7734` | Replaces Alpha after switch |
| Fence | `E_9901` | Connected to fencing operation |

## Key Time Windows

| Event | Time | Location |
|-------|------|----------|
| Nashville Burglary | Jan 8, 3:15 PM | Belle Meade, TN |
| DC Burglary #2 | Jan 10, 10:00 PM | Connecticut Ave |
| Arlington Burglary | Jan 12, 3:30 AM | Clarendon, VA |
| DC Burglary #1 | Jan 15, 2:30 PM | Georgetown |
| Burner Switch | Jan 15, 2:45 PM | Georgetown |

## Getting Started

### Prerequisites

1. **Databricks CLI v0.200+** - Install with:
   ```bash
   brew tap databricks/tap
   brew install databricks
   ```

2. **Authentication** - Configure your Databricks profile:
   ```bash
   databricks auth login --host https://your-workspace.cloud.databricks.com
   ```

### Deploy with Databricks Asset Bundle (DAB)

#### 1. Validate the bundle configuration
```bash
databricks bundle validate -t dev
```

#### 2. Deploy to development
```bash
databricks bundle deploy -t dev
```

#### 3. Run the pipeline
```bash
databricks bundle run investigative_analytics_pipeline -t dev
```

#### 4. Run with full refresh (for demo reset)
```bash
databricks bundle run demo_reset_job -t dev
```

### Available Targets

| Target | Catalog | Description |
|--------|---------|-------------|
| `dev` | `investigative_analytics_dev` | Development environment (default) |
| `staging` | `investigative_analytics_staging` | Staging/test environment |
| `prod` | `investigative_analytics` | Production environment |

### Alternative: Manual Deployment

If not using DAB, see [pipelines/README.md](pipelines/README.md) for manual instructions.

### Validation

The validation notebook checks:
- ✅ DC incident bucket has exactly 50 devices
- ✅ Suspect pair appears in ≥ 3 burglary windows
- ✅ Nashville case window shares the suspect pair
- ✅ Burner switch detection works correctly
- ✅ Rankings return consistent top 2 suspects

## Team Roles

| Role | Owner | Focus |
|------|-------|-------|
| Data Gen | Scott | Create the "Needle in the Haystack" pattern |
| Graph/AI | Will J | Build query logic for the "Aha" moment |
| App/UI | Will Y | Build the "Warrant Package" export button |
| Story/Geo | Anand | Refine narrative, ensure geography makes sense |

## Tech Stack

- **Databricks** - Unity Catalog, Lakeflow Spark Declarative Pipelines (SDP)
- **H3** - Uber's hexagonal hierarchical spatial index
- **Streamlit** - Databricks App frontend (coming soon)
- **GenAI** - Evidence summarization (coming soon)

> **Note**: This project uses the newer `pyspark.pipelines` module syntax (imported as `dp`) instead of the legacy `dlt` module. See the [Databricks Python language reference](https://docs.databricks.com/aws/en/ldp/developer/python-ref) for details.

## Definition of Done

- [ ] Heatmap reliably shows one highlighted cell with 50 devices in DC window
- [ ] Graph reliably collapses 50 → the same 2 suspects  
- [ ] Cross-jurisdiction link reliably shows Nashville case + shared co-presence
- [ ] Burner switch reliably returns correct handoff as top candidate
- [ ] Agent reliably returns Evidence Card with 3 sources
- [ ] PDF export works every time (with graceful fallback)
