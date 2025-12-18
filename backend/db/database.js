/**
 * SQLite Database Manager for Cross-Jurisdictional Investigative Analytics Demo
 * Provides connection and query helpers for all demo data
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'graph.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

/**
 * Initialize database connection
 */
function initDatabase() {
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  return db;
}

/**
 * Create tables from schema file
 */
function createTables(db) {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);
  console.log('✓ Database tables created');
}

/**
 * Check if database is empty (no cell towers = needs seeding)
 */
function isDatabaseEmpty(db) {
  try {
    const count = db.prepare('SELECT COUNT(*) as count FROM cell_towers').get();
    return count.count === 0;
  } catch {
    return true;
  }
}

// ============== CELL TOWERS ==============

function getAllCellTowers(db) {
  return db.prepare('SELECT * FROM cell_towers ORDER BY city, name').all();
}

function insertCellTower(db, tower) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO cell_towers (id, name, latitude, longitude, city, state)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(tower.id, tower.name, tower.latitude, tower.longitude, tower.city, tower.state || null);
}

function insertCellTowers(db, towers) {
  const insert = db.transaction((towers) => {
    for (const tower of towers) {
      insertCellTower(db, tower);
    }
  });
  insert(towers);
  console.log(`✓ Inserted ${towers.length} cell towers`);
}

// ============== PERSONS ==============

function getAllPersons(db) {
  return db.prepare('SELECT * FROM persons ORDER BY is_suspect DESC, name').all();
}

function getPersonById(db, personId) {
  return db.prepare('SELECT * FROM persons WHERE id = ?').get(personId);
}

function getSuspects(db) {
  return db.prepare('SELECT * FROM persons WHERE is_suspect = 1').all();
}

function insertPerson(db, person) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO persons (id, name, alias, is_suspect, threat_level, age, criminal_history, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    person.id,
    person.name,
    person.alias || null,
    person.is_suspect ? 1 : 0,
    person.threat_level || 'Unknown',
    person.age || null,
    person.criminal_history || null,
    person.notes || null
  );
}

function insertPersons(db, persons) {
  const insert = db.transaction((persons) => {
    for (const person of persons) {
      insertPerson(db, person);
    }
  });
  insert(persons);
  console.log(`✓ Inserted ${persons.length} persons`);
}

// ============== DEVICES ==============

function getAllDevices(db) {
  return db
    .prepare(
      `
    SELECT d.*, p.name as owner_name, p.alias as owner_alias, p.is_suspect
    FROM devices d
    LEFT JOIN persons p ON d.owner_id = p.id
    ORDER BY p.is_suspect DESC, d.name
  `
    )
    .all();
}

function getDeviceById(db, deviceId) {
  return db
    .prepare(
      `
    SELECT d.*, p.name as owner_name, p.alias as owner_alias, p.is_suspect
    FROM devices d
    LEFT JOIN persons p ON d.owner_id = p.id
    WHERE d.id = ?
  `
    )
    .get(deviceId);
}

function insertDevice(db, device) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO devices (id, name, device_type, owner_id, is_burner)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(
    device.id,
    device.name,
    device.device_type || 'smartphone',
    device.owner_id || null,
    device.is_burner ? 1 : 0
  );
}

function insertDevices(db, devices) {
  const insert = db.transaction((devices) => {
    for (const device of devices) {
      insertDevice(db, device);
    }
  });
  insert(devices);
  console.log(`✓ Inserted ${devices.length} devices`);
}

// ============== DEVICE POSITIONS ==============

function getDevicePositionsAtHour(db, hour) {
  return db
    .prepare(
      `
    SELECT dp.*, d.name as device_name, d.owner_id, 
           p.name as owner_name, p.alias as owner_alias, p.is_suspect,
           ct.name as tower_name, ct.city as tower_city
    FROM device_positions dp
    JOIN devices d ON dp.device_id = d.id
    LEFT JOIN persons p ON d.owner_id = p.id
    LEFT JOIN cell_towers ct ON dp.tower_id = ct.id
    WHERE dp.hour = ?
    ORDER BY p.is_suspect DESC
  `
    )
    .all(hour);
}

function getDevicePositionHistory(db, deviceId) {
  return db
    .prepare(
      `
    SELECT dp.*, ct.name as tower_name, ct.city as tower_city
    FROM device_positions dp
    LEFT JOIN cell_towers ct ON dp.tower_id = ct.id
    WHERE dp.device_id = ?
    ORDER BY dp.hour
  `
    )
    .all(deviceId);
}

function insertDevicePosition(db, position) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO device_positions (device_id, hour, latitude, longitude, tower_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(
    position.device_id,
    position.hour,
    position.latitude,
    position.longitude,
    position.tower_id || null
  );
}

function insertDevicePositions(db, positions) {
  const insert = db.transaction((positions) => {
    for (const pos of positions) {
      insertDevicePosition(db, pos);
    }
  });
  insert(positions);
  console.log(`✓ Inserted ${positions.length} device positions`);
}

// ============== DEMO CASES ==============

function getAllDemoCases(db) {
  const cases = db.prepare('SELECT * FROM demo_cases ORDER BY hour').all();
  return cases.map((c) => ({
    ...c,
    persons: getCasePersons(db, c.id),
    devices: getCaseDevices(db, c.id),
  }));
}

function getDemoCaseById(db, caseId) {
  const caseData = db.prepare('SELECT * FROM demo_cases WHERE id = ?').get(caseId);
  if (!caseData) return null;
  return {
    ...caseData,
    persons: getCasePersons(db, caseId),
    devices: getCaseDevices(db, caseId),
  };
}

function getDemoCaseByHour(db, hour) {
  const cases = db.prepare('SELECT * FROM demo_cases WHERE hour = ?').all(hour);
  return cases.map((c) => ({
    ...c,
    persons: getCasePersons(db, c.id),
    devices: getCaseDevices(db, c.id),
  }));
}

function getCasePersons(db, caseId) {
  return db
    .prepare(
      `
    SELECT p.*, cp.role
    FROM case_persons cp
    JOIN persons p ON cp.person_id = p.id
    WHERE cp.case_id = ?
  `
    )
    .all(caseId);
}

function getCaseDevices(db, caseId) {
  return db
    .prepare(
      `
    SELECT d.*, p.name as owner_name, p.alias as owner_alias
    FROM case_devices cd
    JOIN devices d ON cd.device_id = d.id
    LEFT JOIN persons p ON d.owner_id = p.id
    WHERE cd.case_id = ?
  `
    )
    .all(caseId);
}

function insertDemoCase(db, caseData) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO demo_cases (
      id, case_number, title, description, city, state, neighborhood,
      latitude, longitude, hour, status, priority, assigned_to,
      estimated_loss, method_of_entry, stolen_items, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  stmt.run(
    caseData.id,
    caseData.case_number,
    caseData.title,
    caseData.description || null,
    caseData.city,
    caseData.state,
    caseData.neighborhood,
    caseData.latitude,
    caseData.longitude,
    caseData.hour,
    caseData.status || 'investigating',
    caseData.priority || 'Medium',
    caseData.assigned_to || null,
    caseData.estimated_loss || null,
    caseData.method_of_entry || null,
    caseData.stolen_items || null
  );

  // Link persons
  if (caseData.person_ids) {
    const personStmt = db.prepare(
      'INSERT OR IGNORE INTO case_persons (case_id, person_id, role) VALUES (?, ?, ?)'
    );
    for (const personId of caseData.person_ids) {
      personStmt.run(caseData.id, personId, 'suspect');
    }
  }

  // Link devices
  if (caseData.device_ids) {
    const deviceStmt = db.prepare(
      'INSERT OR IGNORE INTO case_devices (case_id, device_id) VALUES (?, ?)'
    );
    for (const deviceId of caseData.device_ids) {
      deviceStmt.run(caseData.id, deviceId);
    }
  }
}

function insertDemoCases(db, cases) {
  const insert = db.transaction((cases) => {
    for (const c of cases) {
      insertDemoCase(db, c);
    }
  });
  insert(cases);
  console.log(`✓ Inserted ${cases.length} demo cases`);
}

function updateDemoCaseStatus(db, caseId, status) {
  const stmt = db.prepare(`
    UPDATE demo_cases SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `);
  stmt.run(status, caseId);
}

// ============== PERSON RELATIONSHIPS ==============

function getAllRelationships(db) {
  return db
    .prepare(
      `
    SELECT pr.*, 
           p1.name as person1_name, p1.alias as person1_alias,
           p2.name as person2_name, p2.alias as person2_alias
    FROM person_relationships pr
    JOIN persons p1 ON pr.person1_id = p1.id
    JOIN persons p2 ON pr.person2_id = p2.id
    ORDER BY pr.count DESC
  `
    )
    .all();
}

function getRelationshipsForPerson(db, personId) {
  return db
    .prepare(
      `
    SELECT pr.*, 
           p1.name as person1_name, p1.alias as person1_alias,
           p2.name as person2_name, p2.alias as person2_alias
    FROM person_relationships pr
    JOIN persons p1 ON pr.person1_id = p1.id
    JOIN persons p2 ON pr.person2_id = p2.id
    WHERE pr.person1_id = ? OR pr.person2_id = ?
    ORDER BY pr.count DESC
  `
    )
    .all(personId, personId);
}

function insertRelationship(db, rel) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO person_relationships (person1_id, person2_id, relationship_type, count, cities, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    rel.person1_id,
    rel.person2_id,
    rel.relationship_type,
    rel.count || 1,
    rel.cities || null,
    rel.notes || null
  );
}

function insertRelationships(db, relationships) {
  const insert = db.transaction((relationships) => {
    for (const rel of relationships) {
      insertRelationship(db, rel);
    }
  });
  insert(relationships);
  console.log(`✓ Inserted ${relationships.length} relationships`);
}

// ============== HOTSPOT QUERIES ==============

function getHotspotsAtHour(db, hour) {
  return db
    .prepare(
      `
    SELECT 
      ct.id as tower_id,
      ct.name as tower_name,
      ct.latitude,
      ct.longitude,
      ct.city,
      COUNT(dp.device_id) as device_count,
      SUM(CASE WHEN p.is_suspect = 1 THEN 1 ELSE 0 END) as suspect_count
    FROM cell_towers ct
    LEFT JOIN device_positions dp ON ct.id = dp.tower_id AND dp.hour = ?
    LEFT JOIN devices d ON dp.device_id = d.id
    LEFT JOIN persons p ON d.owner_id = p.id
    GROUP BY ct.id
    HAVING device_count > 0
    ORDER BY suspect_count DESC, device_count DESC
  `
    )
    .all(hour);
}

// ============== UTILITIES ==============

function clearAllData(db) {
  db.exec('DELETE FROM device_positions');
  db.exec('DELETE FROM case_devices');
  db.exec('DELETE FROM case_persons');
  db.exec('DELETE FROM person_relationships');
  db.exec('DELETE FROM demo_cases');
  db.exec('DELETE FROM devices');
  db.exec('DELETE FROM persons');
  db.exec('DELETE FROM cell_towers');
  console.log('✓ All demo data cleared');
}

module.exports = {
  initDatabase,
  createTables,
  isDatabaseEmpty,
  // Cell Towers
  getAllCellTowers,
  insertCellTower,
  insertCellTowers,
  // Persons
  getAllPersons,
  getPersonById,
  getSuspects,
  insertPerson,
  insertPersons,
  // Devices
  getAllDevices,
  getDeviceById,
  insertDevice,
  insertDevices,
  // Device Positions
  getDevicePositionsAtHour,
  getDevicePositionHistory,
  insertDevicePosition,
  insertDevicePositions,
  // Demo Cases
  getAllDemoCases,
  getDemoCaseById,
  getDemoCaseByHour,
  getCasePersons,
  getCaseDevices,
  insertDemoCase,
  insertDemoCases,
  updateDemoCaseStatus,
  // Relationships
  getAllRelationships,
  getRelationshipsForPerson,
  insertRelationship,
  insertRelationships,
  // Hotspots
  getHotspotsAtHour,
  // Utilities
  clearAllData,
  DB_PATH,
};
