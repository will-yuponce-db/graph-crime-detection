-- SQLite Schema for Cross-Jurisdictional Investigative Analytics Demo
-- This schema supports the full demo with cell towers, devices, people, and cases

-- Drop tables if they exist (in correct order for foreign keys)
DROP TABLE IF EXISTS device_positions;
DROP TABLE IF EXISTS person_relationships;
DROP TABLE IF EXISTS case_devices;
DROP TABLE IF EXISTS case_persons;
DROP TABLE IF EXISTS demo_cases;
DROP TABLE IF EXISTS devices;
DROP TABLE IF EXISTS persons;
DROP TABLE IF EXISTS cell_towers;

-- Cell Towers table
CREATE TABLE cell_towers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  city TEXT NOT NULL,
  state TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Persons table (suspects, witnesses, civilians)
CREATE TABLE persons (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  alias TEXT,
  is_suspect INTEGER DEFAULT 0,
  threat_level TEXT DEFAULT 'Unknown',
  age INTEGER,
  criminal_history TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Devices table (phones linked to persons)
CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  device_type TEXT DEFAULT 'smartphone',
  owner_id TEXT,
  is_burner INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES persons(id)
);

-- Device positions over time (hourly for 72 hours)
CREATE TABLE device_positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  hour INTEGER NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  tower_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (device_id) REFERENCES devices(id),
  FOREIGN KEY (tower_id) REFERENCES cell_towers(id),
  UNIQUE(device_id, hour)
);

-- Demo cases (key frames in the timeline)
CREATE TABLE demo_cases (
  id TEXT PRIMARY KEY,
  case_number TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  neighborhood TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  hour INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'investigating',
  priority TEXT NOT NULL DEFAULT 'Medium',
  assigned_to TEXT,
  estimated_loss INTEGER,
  method_of_entry TEXT,
  stolen_items TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Person relationships (CO_LOCATED, CONTACTED, etc.)
CREATE TABLE person_relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person1_id TEXT NOT NULL,
  person2_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  count INTEGER DEFAULT 1,
  cities TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (person1_id) REFERENCES persons(id),
  FOREIGN KEY (person2_id) REFERENCES persons(id),
  UNIQUE(person1_id, person2_id, relationship_type)
);

-- Case-Person associations
CREATE TABLE case_persons (
  case_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  role TEXT DEFAULT 'suspect',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (case_id, person_id),
  FOREIGN KEY (case_id) REFERENCES demo_cases(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE
);

-- Case-Device associations
CREATE TABLE case_devices (
  case_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (case_id, device_id),
  FOREIGN KEY (case_id) REFERENCES demo_cases(id) ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

-- Create indexes for better query performance
CREATE INDEX idx_device_positions_device_id ON device_positions(device_id);
CREATE INDEX idx_device_positions_hour ON device_positions(hour);
CREATE INDEX idx_device_positions_tower_id ON device_positions(tower_id);
CREATE INDEX idx_devices_owner_id ON devices(owner_id);
CREATE INDEX idx_persons_is_suspect ON persons(is_suspect);
CREATE INDEX idx_demo_cases_hour ON demo_cases(hour);
CREATE INDEX idx_demo_cases_status ON demo_cases(status);
CREATE INDEX idx_demo_cases_city ON demo_cases(city);
CREATE INDEX idx_person_relationships_type ON person_relationships(relationship_type);
