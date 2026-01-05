-- =============================================================================
-- Catalog and Schema Setup for Cross-Jurisdictional Investigative Analytics
-- =============================================================================
-- Run this script before deploying the DLT pipeline to create the required
-- Unity Catalog objects.
-- =============================================================================

-- Create the catalog (requires MANAGE CATALOG privilege)
CREATE CATALOG IF NOT EXISTS investigative_analytics
COMMENT 'Cross-Jurisdictional Investigative Analytics Demo';

-- Use the catalog
USE CATALOG investigative_analytics;

-- Create the demo schema
CREATE SCHEMA IF NOT EXISTS demo
COMMENT 'Demo tables for the burglary crew investigation story';

-- Grant usage to workspace users (adjust as needed for your environment)
-- GRANT USAGE ON CATALOG investigative_analytics TO `users`;
-- GRANT USAGE ON SCHEMA investigative_analytics.demo TO `users`;
-- GRANT SELECT ON SCHEMA investigative_analytics.demo TO `users`;

-- Verify setup
SHOW SCHEMAS IN investigative_analytics;

-- =============================================================================
-- Table Descriptions (for reference - DLT creates these automatically)
-- =============================================================================
-- 
-- BRONZE LAYER (Raw Data):
--   location_events_bronze  - Raw synthetic location pings
--   cases_bronze            - Raw case/incident records  
--   social_edges_bronze     - Raw social network relationships
--
-- SILVER LAYER (Cleaned & Enriched):
--   location_events_silver  - Cleaned events with timestamps
--   cases_silver            - Enriched case data with categories
--   social_edges_silver     - Cleaned social edges with flags
--
-- GOLD LAYER (Analytics):
--   co_presence_edges       - Entity co-location relationships
--   entity_case_overlap     - Entities linked to crime scenes
--   suspect_rankings        - Multi-factor suspect scoring
--   handoff_candidates      - Burner phone switch detection
--   cell_device_counts      - Heatmap aggregations
--   evidence_card_data      - Pre-computed evidence for AI
-- =============================================================================

