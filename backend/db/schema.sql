-- SQLite Schema for Graph Database
-- Tables for nodes, edges, and cases

-- Drop tables if they exist
DROP TABLE IF EXISTS case_documents;
DROP TABLE IF EXISTS case_entities;
DROP TABLE IF EXISTS cases;
DROP TABLE IF EXISTS edges;
DROP TABLE IF EXISTS nodes;

-- Nodes table
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'existing',
  properties TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Edges table
CREATE TABLE edges (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  status TEXT DEFAULT 'existing',
  properties TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source) REFERENCES nodes(id),
  FOREIGN KEY (target) REFERENCES nodes(id)
);

-- Create indexes for better query performance
CREATE INDEX idx_nodes_type ON nodes(type);
CREATE INDEX idx_nodes_status ON nodes(status);
CREATE INDEX idx_edges_source ON edges(source);
CREATE INDEX idx_edges_target ON edges(target);
CREATE INDEX idx_edges_relationship_type ON edges(relationship_type);
CREATE INDEX idx_edges_status ON edges(status);

-- Cases table
CREATE TABLE cases (
  id TEXT PRIMARY KEY,
  case_number TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  classification TEXT,
  lead_agent TEXT,
  assigned_agents TEXT, -- JSON array
  tags TEXT, -- JSON array
  notes TEXT,
  target_date TEXT, -- ISO date string
  created_date TEXT NOT NULL, -- ISO date string
  updated_date TEXT NOT NULL, -- ISO date string
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Case-Entity associations (many-to-many)
CREATE TABLE case_entities (
  case_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (case_id, entity_id),
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (entity_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- Case-Document associations
CREATE TABLE case_documents (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  source_node_id TEXT,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  path TEXT,
  date TEXT, -- ISO date string
  summary TEXT,
  tags TEXT, -- JSON array
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (source_node_id) REFERENCES nodes(id) ON DELETE SET NULL
);

-- Create indexes for cases
CREATE INDEX idx_cases_status ON cases(status);
CREATE INDEX idx_cases_priority ON cases(priority);
CREATE INDEX idx_cases_lead_agent ON cases(lead_agent);
CREATE INDEX idx_cases_created_date ON cases(created_date);
CREATE INDEX idx_case_entities_case_id ON case_entities(case_id);
CREATE INDEX idx_case_entities_entity_id ON case_entities(entity_id);
CREATE INDEX idx_case_documents_case_id ON case_documents(case_id);

