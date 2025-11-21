/**
 * Database Seed Script
 * Seeds the SQLite database with REAL crime data extracted from DOJ documents
 */

const fs = require('fs');
const path = require('path');
const {
  initDatabase,
  createTables,
  insertNodes,
  insertEdges,
  insertCases,
  clearAllData,
} = require('./database');

// Load real crime data extracted from DOJ documents
const realDataPath = path.join(__dirname, 'realCrimeData.json');
let realData;

try {
  realData = JSON.parse(fs.readFileSync(realDataPath, 'utf8'));
  console.log(`✓ Loaded real crime data: ${realData.nodes.length} nodes, ${realData.edges.length} edges`);
} catch (error) {
  console.error('⚠️  Could not load real crime data:', error.message);
  console.error('⚠️  Using empty dataset');
  realData = { nodes: [], edges: [] };
}

// Cases will be synced from frontend via Redux middleware
// (mockCaseData.ts contains TypeScript which is complex to parse)
const mockCases = [];
console.log('ℹ️  Cases will be created via frontend Redux middleware');

// Use real data
const mockNodes = realData.nodes || [];
const mockEdges = realData.edges || [];

/**
 * Seed the database with REAL crime data
 */
function seedDatabase(clearFirst = true) {
  console.log('🌱 Seeding database with REAL crime network data...');

  const db = initDatabase();

  try {
    // Create tables
    createTables(db);

    // Clear existing data if requested
    if (clearFirst) {
      clearAllData(db);
    }

    // Insert nodes and edges
    insertNodes(db, mockNodes);
    insertEdges(db, mockEdges);

    console.log('✅ Database seeded successfully with REAL crime data!');
    console.log(`  - ${mockNodes.length} nodes inserted`);
    console.log(`  - ${mockEdges.length} edges inserted`);
    console.log(`  - Cases will be synced from frontend (0 seeded)`);
    
    // Show breakdown by node type
    const nodeTypes = {};
    mockNodes.forEach(node => {
      nodeTypes[node.type] = (nodeTypes[node.type] || 0) + 1;
    });
    console.log('\n📊 Node Types:');
    Object.entries(nodeTypes).forEach(([type, count]) => {
      console.log(`  - ${type}: ${count}`);
    });
    
    // Show breakdown by relationship type
    const edgeTypes = {};
    mockEdges.forEach(edge => {
      edgeTypes[edge.relationshipType] = (edgeTypes[edge.relationshipType] || 0) + 1;
    });
    console.log('\n🔗 Relationship Types:');
    Object.entries(edgeTypes).forEach(([type, count]) => {
      console.log(`  - ${type}: ${count}`);
    });
    
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  } finally {
    db.close();
  }
}

// Run seed if called directly
if (require.main === module) {
  seedDatabase(true);
}

module.exports = {
  seedDatabase,
  mockNodes,
  mockEdges,
};
