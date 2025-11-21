/**
 * SQLite Database Manager
 * Provides connection and query helpers for the graph database
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
  const db = new Database(DB_PATH, {
    verbose: console.log,
  });

  // Enable foreign keys
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
 * Get all nodes from database
 */
function getAllNodes(db) {
  const stmt = db.prepare('SELECT * FROM nodes ORDER BY created_at');
  const rows = stmt.all();

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    type: row.type,
    status: row.status,
    properties: JSON.parse(row.properties),
  }));
}

/**
 * Get all edges from database
 */
function getAllEdges(db) {
  const stmt = db.prepare('SELECT * FROM edges ORDER BY created_at');
  const rows = stmt.all();

  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    target: row.target,
    relationshipType: row.relationship_type,
    status: row.status,
    properties: JSON.parse(row.properties),
  }));
}

/**
 * Insert a single node
 */
function insertNode(db, node) {
  const stmt = db.prepare(`
    INSERT INTO nodes (id, label, type, status, properties)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(node.id, node.label, node.type, node.status, JSON.stringify(node.properties));
}

/**
 * Insert a single edge
 */
function insertEdge(db, edge) {
  const stmt = db.prepare(`
    INSERT INTO edges (id, source, target, relationship_type, status, properties)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    edge.id,
    edge.source,
    edge.target,
    edge.relationshipType,
    edge.status,
    JSON.stringify(edge.properties)
  );
}

/**
 * Insert multiple nodes (transaction)
 */
function insertNodes(db, nodes) {
  const insert = db.transaction((nodes) => {
    for (const node of nodes) {
      insertNode(db, node);
    }
  });

  insert(nodes);
  console.log(`✓ Inserted ${nodes.length} nodes`);
}

/**
 * Insert multiple edges (transaction)
 */
function insertEdges(db, edges) {
  const insert = db.transaction((edges) => {
    for (const edge of edges) {
      insertEdge(db, edge);
    }
  });

  insert(edges);
  console.log(`✓ Inserted ${edges.length} edges`);
}

/**
 * Update node status
 */
function updateNodeStatus(db, nodeId, status) {
  const stmt = db.prepare(`
    UPDATE nodes 
    SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  stmt.run(status, nodeId);
}

/**
 * Update edge status
 */
function updateEdgeStatus(db, edgeId, status) {
  const stmt = db.prepare(`
    UPDATE edges 
    SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  stmt.run(edgeId, status);
}

/**
 * Update multiple nodes status (transaction)
 */
function updateNodesStatus(db, nodeIds, status) {
  const update = db.transaction((nodeIds, status) => {
    for (const nodeId of nodeIds) {
      updateNodeStatus(db, nodeId, status);
    }
  });

  update(nodeIds, status);
  console.log(`✓ Updated ${nodeIds.length} nodes to status: ${status}`);
}

/**
 * Update multiple edges status (transaction)
 */
function updateEdgesStatus(db, edgeIds, status) {
  const update = db.transaction((edgeIds, status) => {
    for (const edgeId of edgeIds) {
      updateEdgeStatus(db, edgeId, status);
    }
  });

  update(edgeIds, status);
  console.log(`✓ Updated ${edgeIds.length} edges to status: ${status}`);
}

/**
 * Get all cases from database
 */
function getAllCases(db) {
  const stmt = db.prepare('SELECT * FROM cases ORDER BY created_date DESC');
  const rows = stmt.all();

  return rows.map((row) => ({
    id: row.id,
    caseNumber: row.case_number,
    name: row.name,
    description: row.description,
    status: row.status,
    priority: row.priority,
    classification: row.classification,
    leadAgent: row.lead_agent,
    assignedAgents: row.assigned_agents ? JSON.parse(row.assigned_agents) : [],
    tags: row.tags ? JSON.parse(row.tags) : [],
    notes: row.notes,
    targetDate: row.target_date,
    createdDate: row.created_date,
    updatedDate: row.updated_date,
    entityIds: getCaseEntityIds(db, row.id),
    documents: getCaseDocuments(db, row.id),
  }));
}

/**
 * Get a single case by ID
 */
function getCaseById(db, caseId) {
  const stmt = db.prepare('SELECT * FROM cases WHERE id = ?');
  const row = stmt.get(caseId);

  if (!row) return null;

  return {
    id: row.id,
    caseNumber: row.case_number,
    name: row.name,
    description: row.description,
    status: row.status,
    priority: row.priority,
    classification: row.classification,
    leadAgent: row.lead_agent,
    assignedAgents: row.assigned_agents ? JSON.parse(row.assigned_agents) : [],
    tags: row.tags ? JSON.parse(row.tags) : [],
    notes: row.notes,
    targetDate: row.target_date,
    createdDate: row.created_date,
    updatedDate: row.updated_date,
    entityIds: getCaseEntityIds(db, row.id),
    documents: getCaseDocuments(db, row.id),
  };
}

/**
 * Get entity IDs for a case
 */
function getCaseEntityIds(db, caseId) {
  const stmt = db.prepare('SELECT entity_id FROM case_entities WHERE case_id = ?');
  const rows = stmt.all(caseId);
  return rows.map(row => row.entity_id);
}

/**
 * Get documents for a case
 */
function getCaseDocuments(db, caseId) {
  const stmt = db.prepare('SELECT * FROM case_documents WHERE case_id = ?');
  const rows = stmt.all(caseId);
  return rows.map(row => ({
    id: row.id,
    sourceNodeId: row.source_node_id,
    title: row.title,
    type: row.type,
    path: row.path,
    date: row.date,
    summary: row.summary,
    tags: row.tags ? JSON.parse(row.tags) : [],
  }));
}

/**
 * Insert a single case with entities and documents
 */
function insertCase(db, caseData) {
  const stmt = db.prepare(`
    INSERT INTO cases (
      id, case_number, name, description, status, priority, classification,
      lead_agent, assigned_agents, tags, notes, target_date, created_date, updated_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    caseData.id,
    caseData.caseNumber,
    caseData.name,
    caseData.description || null,
    caseData.status,
    caseData.priority,
    caseData.classification || null,
    caseData.leadAgent || null,
    JSON.stringify(caseData.assignedAgents || []),
    JSON.stringify(caseData.tags || []),
    caseData.notes || null,
    caseData.targetDate || null,
    caseData.createdDate || new Date().toISOString(),
    caseData.updatedDate || new Date().toISOString()
  );

  // Insert entity associations
  if (caseData.entityIds && caseData.entityIds.length > 0) {
    const entityStmt = db.prepare('INSERT INTO case_entities (case_id, entity_id) VALUES (?, ?)');
    const insertEntities = db.transaction((caseId, entityIds) => {
      for (const entityId of entityIds) {
        entityStmt.run(caseId, entityId);
      }
    });
    insertEntities(caseData.id, caseData.entityIds);
  }

  // Insert documents
  if (caseData.documents && caseData.documents.length > 0) {
    const docStmt = db.prepare(`
      INSERT INTO case_documents (id, case_id, source_node_id, title, type, path, date, summary, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertDocs = db.transaction((caseId, documents) => {
      for (const doc of documents) {
        docStmt.run(
          doc.id,
          caseId,
          doc.sourceNodeId || null,
          doc.title,
          doc.type,
          doc.path || null,
          doc.date || null,
          doc.summary || null,
          JSON.stringify(doc.tags || [])
        );
      }
    });
    insertDocs(caseData.id, caseData.documents);
  }
}

/**
 * Insert multiple cases (transaction)
 */
function insertCases(db, cases) {
  const insert = db.transaction((cases) => {
    for (const caseData of cases) {
      insertCase(db, caseData);
    }
  });

  insert(cases);
  console.log(`✓ Inserted ${cases.length} cases`);
}

/**
 * Update a case
 */
function updateCase(db, caseId, updates) {
  const fields = [];
  const values = [];

  // Map frontend field names to database column names
  const fieldMap = {
    caseNumber: 'case_number',
    leadAgent: 'lead_agent',
    assignedAgents: 'assigned_agents',
    targetDate: 'target_date',
    createdDate: 'created_date',
    updatedDate: 'updated_date',
  };

  for (const [key, value] of Object.entries(updates)) {
    if (key === 'entityIds' || key === 'documents') continue; // Handle separately

    const dbKey = fieldMap[key] || key;
    fields.push(`${dbKey} = ?`);

    // JSON fields
    if (key === 'assignedAgents' || key === 'tags') {
      values.push(JSON.stringify(value));
    } else {
      values.push(value);
    }
  }

  // Always update updatedDate
  if (!updates.updatedDate) {
    fields.push('updated_date = ?');
    values.push(new Date().toISOString());
  }

  if (fields.length > 0) {
    const stmt = db.prepare(`UPDATE cases SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values, caseId);
  }

  // Update entities if provided
  if (updates.entityIds) {
    db.prepare('DELETE FROM case_entities WHERE case_id = ?').run(caseId);
    if (updates.entityIds.length > 0) {
      const entityStmt = db.prepare('INSERT INTO case_entities (case_id, entity_id) VALUES (?, ?)');
      const insertEntities = db.transaction((caseId, entityIds) => {
        for (const entityId of entityIds) {
          entityStmt.run(caseId, entityId);
        }
      });
      insertEntities(caseId, updates.entityIds);
    }
  }

  // Update documents if provided
  if (updates.documents) {
    db.prepare('DELETE FROM case_documents WHERE case_id = ?').run(caseId);
    if (updates.documents.length > 0) {
      const docStmt = db.prepare(`
        INSERT INTO case_documents (id, case_id, source_node_id, title, type, path, date, summary, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertDocs = db.transaction((caseId, documents) => {
        for (const doc of documents) {
          docStmt.run(
            doc.id,
            caseId,
            doc.sourceNodeId || null,
            doc.title,
            doc.type,
            doc.path || null,
            doc.date || null,
            doc.summary || null,
            JSON.stringify(doc.tags || [])
          );
        }
      });
      insertDocs(caseId, updates.documents);
    }
  }
}

/**
 * Delete a case
 */
function deleteCase(db, caseId) {
  // CASCADE will automatically delete case_entities and case_documents
  const stmt = db.prepare('DELETE FROM cases WHERE id = ?');
  const result = stmt.run(caseId);
  return result.changes > 0;
}

/**
 * Clear all data from tables
 */
function clearAllData(db) {
  db.exec('DELETE FROM case_documents');
  db.exec('DELETE FROM case_entities');
  db.exec('DELETE FROM cases');
  db.exec('DELETE FROM edges');
  db.exec('DELETE FROM nodes');
  console.log('✓ All data cleared');
}

/**
 * Check if database is empty
 */
function isDatabaseEmpty(db) {
  try {
    const nodeCount = db.prepare('SELECT COUNT(*) as count FROM nodes').get();
    return nodeCount.count === 0;
  } catch (error) {
    // If table doesn't exist, database is empty
    return true;
  }
}

module.exports = {
  initDatabase,
  createTables,
  getAllNodes,
  getAllEdges,
  getAllCases,
  getCaseById,
  getCaseEntityIds,
  getCaseDocuments,
  insertNode,
  insertEdge,
  insertNodes,
  insertEdges,
  insertCase,
  insertCases,
  updateNodeStatus,
  updateEdgeStatus,
  updateNodesStatus,
  updateEdgesStatus,
  updateCase,
  deleteCase,
  clearAllData,
  isDatabaseEmpty,
  DB_PATH,
};
