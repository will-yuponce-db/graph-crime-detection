/**
 * Seed script for Cross-Jurisdictional Investigative Analytics Demo
 * Generates all mock data for the demo: cell towers, persons, devices, positions, cases, and relationships
 */

const {
  initDatabase,
  createTables,
  clearAllData,
  insertCellTowers,
  insertPersons,
  insertDevices,
  insertDevicePositions,
  insertDemoCases,
  insertRelationships,
} = require('./database');

// ============== CELL TOWERS ==============
const CELL_TOWERS = [
  {
    id: 'tower_dc_georgetown',
    name: 'Georgetown',
    latitude: 38.9076,
    longitude: -77.0723,
    city: 'DC',
    state: 'DC',
  },
  {
    id: 'tower_dc_adams',
    name: 'Adams Morgan',
    latitude: 38.9214,
    longitude: -77.0425,
    city: 'DC',
    state: 'DC',
  },
  {
    id: 'tower_dc_dupont',
    name: 'Dupont Circle',
    latitude: 38.9096,
    longitude: -77.0434,
    city: 'DC',
    state: 'DC',
  },
  {
    id: 'tower_dc_capitol',
    name: 'Capitol Hill',
    latitude: 38.8899,
    longitude: -76.9905,
    city: 'DC',
    state: 'DC',
  },
  {
    id: 'tower_dc_navy',
    name: 'Navy Yard',
    latitude: 38.8764,
    longitude: -77.003,
    city: 'DC',
    state: 'DC',
  },
  {
    id: 'tower_nash_east',
    name: 'East Nashville',
    latitude: 36.1866,
    longitude: -86.745,
    city: 'Nashville',
    state: 'TN',
  },
  {
    id: 'tower_nash_gulch',
    name: 'The Gulch',
    latitude: 36.1512,
    longitude: -86.7893,
    city: 'Nashville',
    state: 'TN',
  },
  {
    id: 'tower_balt_harbor',
    name: 'Harbor District',
    latitude: 39.2804,
    longitude: -76.6081,
    city: 'Baltimore',
    state: 'MD',
  },
];

// ============== PERSONS ==============
const PERSONS = [
  {
    id: 'person_marcus',
    name: 'Marcus Williams',
    alias: 'Ghost',
    is_suspect: true,
    threat_level: 'High',
    age: 32,
    criminal_history: 'Prior burglary convictions in Virginia (2019, 2021)',
    notes: 'Known to use burner phones. Expert at disabling residential alarms.',
  },
  {
    id: 'person_darius',
    name: 'Darius Jackson',
    alias: 'Slim',
    is_suspect: true,
    threat_level: 'High',
    age: 28,
    criminal_history: 'B&E charges in Nashville (2020), probation violation',
    notes: 'Works as a team with Marcus. Specializes in quick entry.',
  },
  {
    id: 'person_alice',
    name: 'Alice Chen',
    alias: null,
    is_suspect: false,
    threat_level: 'Low',
    age: 34,
  },
  {
    id: 'person_bob',
    name: 'Bob Martinez',
    alias: null,
    is_suspect: false,
    threat_level: 'Low',
    age: 45,
  },
  {
    id: 'person_carol',
    name: 'Carol Smith',
    alias: null,
    is_suspect: false,
    threat_level: 'Low',
    age: 29,
  },
  {
    id: 'person_david',
    name: 'David Lee',
    alias: null,
    is_suspect: false,
    threat_level: 'Low',
    age: 52,
  },
  {
    id: 'person_emma',
    name: 'Emma Wilson',
    alias: null,
    is_suspect: false,
    threat_level: 'Low',
    age: 38,
  },
];

// ============== DEVICES ==============
const DEVICES = [
  {
    id: 'device_marcus',
    name: 'iPhone (E0412)',
    device_type: 'smartphone',
    owner_id: 'person_marcus',
    is_burner: false,
  },
  {
    id: 'device_marcus_burner',
    name: 'Prepaid (E2847)',
    device_type: 'smartphone',
    owner_id: 'person_marcus',
    is_burner: true,
  },
  {
    id: 'device_darius',
    name: 'Samsung (E1098)',
    device_type: 'smartphone',
    owner_id: 'person_darius',
    is_burner: false,
  },
  {
    id: 'device_alice',
    name: 'Phone 100',
    device_type: 'smartphone',
    owner_id: 'person_alice',
    is_burner: false,
  },
  {
    id: 'device_bob',
    name: 'Phone 101',
    device_type: 'smartphone',
    owner_id: 'person_bob',
    is_burner: false,
  },
  {
    id: 'device_carol',
    name: 'Phone 102',
    device_type: 'smartphone',
    owner_id: 'person_carol',
    is_burner: false,
  },
  {
    id: 'device_david',
    name: 'Phone 103',
    device_type: 'smartphone',
    owner_id: 'person_david',
    is_burner: false,
  },
  {
    id: 'device_emma',
    name: 'Phone 104',
    device_type: 'smartphone',
    owner_id: 'person_emma',
    is_burner: false,
  },
];

// ============== DEMO CASES (KEY FRAMES) ==============
const DEMO_CASES = [
  {
    id: 'CASE_001',
    case_number: 'DC-2024-1105',
    title: 'Adams Morgan Residential Burglary',
    description: 'Initial surveillance detected - suspects casing neighborhood',
    city: 'Washington',
    state: 'DC',
    neighborhood: 'Adams Morgan',
    latitude: 38.9214,
    longitude: -77.0425,
    hour: 8,
    status: 'adjudicated',
    priority: 'Medium',
    assigned_to: 'Det. Johnson',
    estimated_loss: 15000,
    method_of_entry: 'Rear window smash',
    stolen_items: 'Jewelry, Electronics',
    person_ids: ['person_marcus', 'person_darius'],
    device_ids: ['device_marcus', 'device_darius'],
  },
  {
    id: 'CASE_002',
    case_number: 'DC-2024-1107',
    title: 'Dupont Circle Break-in',
    description: 'Pattern confirmed - same suspects identified',
    city: 'Washington',
    state: 'DC',
    neighborhood: 'Dupont Circle',
    latitude: 38.9096,
    longitude: -77.0434,
    hour: 15,
    status: 'adjudicated',
    priority: 'Medium',
    assigned_to: 'Det. Johnson',
    estimated_loss: 22000,
    method_of_entry: 'Rear window smash',
    stolen_items: 'Jewelry, Cash',
    person_ids: ['person_marcus', 'person_darius'],
    device_ids: ['device_marcus', 'device_darius'],
  },
  {
    id: 'CASE_008',
    case_number: 'DC-2024-1201',
    title: 'Georgetown Major Burglary',
    description: 'PRIMARY INCIDENT - High-value residential burglary targeting jewelry collection',
    city: 'Washington',
    state: 'DC',
    neighborhood: 'Georgetown',
    latitude: 38.9076,
    longitude: -77.0723,
    hour: 25,
    status: 'investigating',
    priority: 'Critical',
    assigned_to: 'Det. Johnson',
    estimated_loss: 185000,
    method_of_entry: 'Rear window smash',
    stolen_items: 'Jewelry, Watches, Art',
    person_ids: ['person_marcus', 'person_darius'],
    device_ids: ['device_marcus', 'device_darius'],
  },
  {
    id: 'CASE_005',
    case_number: 'TN-2024-1121',
    title: 'East Nashville Break-in',
    description: 'Cross-jurisdictional connection established',
    city: 'Nashville',
    state: 'TN',
    neighborhood: 'East Nashville',
    latitude: 36.1866,
    longitude: -86.745,
    hour: 48,
    status: 'review',
    priority: 'High',
    assigned_to: 'Det. Martinez',
    estimated_loss: 45000,
    method_of_entry: 'Rear window smash',
    stolen_items: 'Jewelry, Electronics',
    person_ids: ['person_marcus', 'person_darius'],
    device_ids: ['device_marcus', 'device_darius'],
  },
  {
    id: 'CASE_006',
    case_number: 'TN-2024-1124',
    title: 'Gulch District Theft',
    description: 'Nashville operation confirmed - same MO',
    city: 'Nashville',
    state: 'TN',
    neighborhood: 'The Gulch',
    latitude: 36.1512,
    longitude: -86.7893,
    hour: 60,
    status: 'review',
    priority: 'High',
    assigned_to: 'Det. Martinez',
    estimated_loss: 67000,
    method_of_entry: 'Rear window smash',
    stolen_items: 'Jewelry, Designer goods',
    person_ids: ['person_marcus', 'person_darius'],
    device_ids: ['device_marcus', 'device_darius'],
  },
];

// ============== PERSON RELATIONSHIPS ==============
const RELATIONSHIPS = [
  {
    person1_id: 'person_marcus',
    person2_id: 'person_darius',
    relationship_type: 'CO_LOCATED',
    count: 10,
    cities: 'DC, Nashville',
    notes: 'Present together at all crime scenes',
  },
  {
    person1_id: 'person_marcus',
    person2_id: 'person_darius',
    relationship_type: 'CONTACTED',
    count: 47,
    cities: 'DC, Nashville',
    notes: 'Frequent phone contact, especially before incidents',
  },
  {
    person1_id: 'person_marcus',
    person2_id: 'person_darius',
    relationship_type: 'KNOWN_ASSOCIATE',
    count: 1,
    cities: null,
    notes: 'Prior arrests together in Virginia',
  },
];

/**
 * Generate device positions for 72 hours
 * Suspects follow a pattern through DC neighborhoods, then to Nashville
 * Civilians stay near their home towers
 */
function generateDevicePositions() {
  const positions = [];

  // Get tower by id helper
  const getTower = (id) => CELL_TOWERS.find((t) => t.id === id);

  // Suspect path through investigation timeline
  const suspectPath = [
    // Hours 0-9: Adams Morgan area (DC)
    ...Array(10).fill('tower_dc_adams'),
    // Hours 10-19: Dupont Circle (DC)
    ...Array(10).fill('tower_dc_dupont'),
    // Hours 20-29: Georgetown - PRIMARY INCIDENT at hour 25
    ...Array(10).fill('tower_dc_georgetown'),
    // Hours 30-39: Navy Yard (laying low)
    ...Array(10).fill('tower_dc_navy'),
    // Hours 40-54: Travel to Nashville - East Nashville
    ...Array(15).fill('tower_nash_east'),
    // Hours 55-71: The Gulch, Nashville
    ...Array(17).fill('tower_nash_gulch'),
  ];

  // Generate suspect positions (Marcus and Darius move together)
  for (let hour = 0; hour < 72; hour++) {
    const tower = getTower(suspectPath[hour]);
    const jitter = () => (Math.random() - 0.5) * 0.01;

    // Marcus
    positions.push({
      device_id: 'device_marcus',
      hour,
      latitude: tower.latitude + jitter(),
      longitude: tower.longitude + jitter(),
      tower_id: tower.id,
    });

    // Darius (slightly different position, same tower)
    positions.push({
      device_id: 'device_darius',
      hour,
      latitude: tower.latitude + jitter(),
      longitude: tower.longitude + jitter(),
      tower_id: tower.id,
    });

    // Marcus burner only appears after hour 65 (after Georgetown incident) in Baltimore
    if (hour >= 65) {
      const baltTower = getTower('tower_balt_harbor');
      positions.push({
        device_id: 'device_marcus_burner',
        hour,
        latitude: baltTower.latitude + jitter(),
        longitude: baltTower.longitude + jitter(),
        tower_id: 'tower_balt_harbor',
      });
    }
  }

  // Generate civilian positions (mostly stationary with occasional movement)
  const civilianTowers = [
    'tower_dc_adams',
    'tower_dc_dupont',
    'tower_dc_capitol',
    'tower_dc_navy',
    'tower_dc_georgetown',
  ];
  const civilianDevices = [
    'device_alice',
    'device_bob',
    'device_carol',
    'device_david',
    'device_emma',
  ];

  civilianDevices.forEach((deviceId, idx) => {
    const homeTower = getTower(civilianTowers[idx % civilianTowers.length]);

    for (let hour = 0; hour < 72; hour++) {
      // 80% chance to stay at home tower, 20% chance to wander
      const wandering = Math.random() > 0.8;
      const tower = wandering
        ? getTower(civilianTowers[Math.floor(Math.random() * civilianTowers.length)])
        : homeTower;
      const jitter = () => (Math.random() - 0.5) * 0.015;

      positions.push({
        device_id: deviceId,
        hour,
        latitude: tower.latitude + jitter(),
        longitude: tower.longitude + jitter(),
        tower_id: tower.id,
      });
    }
  });

  return positions;
}

/**
 * Main seed function
 */
function seedDatabase(force = false) {
  console.log('\n🌱 Seeding database...\n');

  const db = initDatabase();

  // Create tables (drops existing)
  createTables(db);

  // Clear any existing data
  if (force) {
    clearAllData(db);
  }

  // Insert all data
  insertCellTowers(db, CELL_TOWERS);
  insertPersons(db, PERSONS);
  insertDevices(db, DEVICES);
  insertDevicePositions(db, generateDevicePositions());
  insertDemoCases(db, DEMO_CASES);
  insertRelationships(db, RELATIONSHIPS);

  // Summary
  const towers = db.prepare('SELECT COUNT(*) as count FROM cell_towers').get().count;
  const persons = db.prepare('SELECT COUNT(*) as count FROM persons').get().count;
  const devices = db.prepare('SELECT COUNT(*) as count FROM devices').get().count;
  const positions = db.prepare('SELECT COUNT(*) as count FROM device_positions').get().count;
  const cases = db.prepare('SELECT COUNT(*) as count FROM demo_cases').get().count;
  const relationships = db
    .prepare('SELECT COUNT(*) as count FROM person_relationships')
    .get().count;

  console.log('\n✅ Database seeded successfully!');
  console.log(`   📡 ${towers} cell towers`);
  console.log(`   👤 ${persons} persons`);
  console.log(`   📱 ${devices} devices`);
  console.log(`   📍 ${positions} device positions`);
  console.log(`   📋 ${cases} cases`);
  console.log(`   🔗 ${relationships} relationships\n`);

  db.close();
}

// Run if called directly
if (require.main === module) {
  seedDatabase(true);
}

module.exports = { seedDatabase };
