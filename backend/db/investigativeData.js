/**
 * Synthetic Data Generator for Cross-Jurisdictional Investigative Analytics Demo
 *
 * KEY CONCEPT: Cases are the anchor points (key frames) representing identified infractions.
 * The timeline shows device activity ebbing and flowing around these events.
 * Devices move fluidly between locations over time.
 */

// Deterministic random
class SeededRandom {
  constructor(seed = 12345) {
    this.seed = seed;
  }
  random() {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }
  randomInt(min, max) {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }
  pick(arr) {
    return arr[this.randomInt(0, arr.length - 1)];
  }
}

// City/location configurations with coordinates
const LOCATIONS = {
  // DC locations
  DC_GEORGETOWN: {
    city: 'Washington',
    state: 'DC',
    neighborhood: 'Georgetown',
    lat: 38.9076,
    lon: -77.0723,
  },
  DC_ADAMS_MORGAN: {
    city: 'Washington',
    state: 'DC',
    neighborhood: 'Adams Morgan',
    lat: 38.9214,
    lon: -77.0424,
  },
  DC_DUPONT: {
    city: 'Washington',
    state: 'DC',
    neighborhood: 'Dupont Circle',
    lat: 38.9096,
    lon: -77.0434,
  },
  DC_CAPITOL_HILL: {
    city: 'Washington',
    state: 'DC',
    neighborhood: 'Capitol Hill',
    lat: 38.8899,
    lon: -76.9905,
  },
  DC_NAVY_YARD: {
    city: 'Washington',
    state: 'DC',
    neighborhood: 'Navy Yard',
    lat: 38.8761,
    lon: -77.0031,
  },
  // Nashville locations
  NASH_EAST: {
    city: 'Nashville',
    state: 'TN',
    neighborhood: 'East Nashville',
    lat: 36.1866,
    lon: -86.752,
  },
  NASH_GULCH: {
    city: 'Nashville',
    state: 'TN',
    neighborhood: 'The Gulch',
    lat: 36.1512,
    lon: -86.7897,
  },
  NASH_GERMANTOWN: {
    city: 'Nashville',
    state: 'TN',
    neighborhood: 'Germantown',
    lat: 36.1795,
    lon: -86.793,
  },
  // Baltimore
  BAL_HARBOR: {
    city: 'Baltimore',
    state: 'MD',
    neighborhood: 'Harbor District',
    lat: 39.2868,
    lon: -76.6093,
  },
};

// Suspect device definitions
const SUSPECTS = {
  DEVICE_E0412: {
    name: 'Marcus Williams',
    alias: 'Ghost',
    type: 'iPhone 14 Pro',
    threat: 'High',
    history: 'Prior B&E convictions in VA (2019, 2021)',
  },
  DEVICE_E1098: {
    name: 'Darius Jackson',
    alias: 'Slim',
    type: 'Samsung S23',
    threat: 'High',
    history: 'Prior theft, receiving stolen goods (TN 2020)',
  },
  DEVICE_E2847: {
    name: 'Unknown (Burner)',
    alias: null,
    type: 'Prepaid',
    threat: 'High',
    history: null,
  },
};

/**
 * PRE-CREATED CASES (Key Frames)
 * These are the identified infractions that anchor the timeline
 */
const CASES = [
  {
    id: 'CASE_001',
    case_number: 'DC-2024-1105',
    title: 'Adams Morgan Residential Burglary',
    location_id: 'DC_ADAMS_MORGAN',
    timestamp: '2024-11-05T02:30:00Z',
    status: 'Linked to Series',
    priority: 'Medium',
    description: 'Rear window entry, jewelry and electronics stolen',
    estimated_loss: 15000,
  },
  {
    id: 'CASE_002',
    case_number: 'DC-2024-1107',
    title: 'Dupont Circle Break-in',
    location_id: 'DC_DUPONT',
    timestamp: '2024-11-07T03:15:00Z',
    status: 'Linked to Series',
    priority: 'Medium',
    description: 'Similar M.O. - rear entry, high-value items targeted',
    estimated_loss: 22000,
  },
  {
    id: 'CASE_003',
    case_number: 'DC-2024-1110',
    title: 'Georgetown Burglary #1',
    location_id: 'DC_GEORGETOWN',
    timestamp: '2024-11-10T02:00:00Z',
    status: 'Linked to Series',
    priority: 'High',
    description: 'Upscale residence, significant jewelry theft',
    estimated_loss: 45000,
  },
  {
    id: 'CASE_004',
    case_number: 'DC-2024-1113',
    title: 'Capitol Hill Incident',
    location_id: 'DC_CAPITOL_HILL',
    timestamp: '2024-11-13T01:45:00Z',
    status: 'Linked to Series',
    priority: 'Medium',
    description: 'Attempted entry, suspect fled when alarm triggered',
    estimated_loss: 0,
  },
  {
    id: 'CASE_005',
    case_number: 'TN-2024-1121',
    title: 'East Nashville Break-in',
    location_id: 'NASH_EAST',
    timestamp: '2024-11-21T02:30:00Z',
    status: 'Cross-Jurisdictional Link',
    priority: 'High',
    description: 'Same M.O. detected in Nashville - interstate crew suspected',
    estimated_loss: 35000,
  },
  {
    id: 'CASE_006',
    case_number: 'TN-2024-1124',
    title: 'The Gulch Residential Burglary',
    location_id: 'NASH_GULCH',
    timestamp: '2024-11-24T03:00:00Z',
    status: 'Cross-Jurisdictional Link',
    priority: 'High',
    description: 'High-end condo complex, multiple units hit',
    estimated_loss: 78000,
  },
  {
    id: 'CASE_007',
    case_number: 'DC-2024-1127',
    title: 'Navy Yard Break-in',
    location_id: 'DC_NAVY_YARD',
    timestamp: '2024-11-27T02:15:00Z',
    status: 'Linked to Series',
    priority: 'Medium',
    description: 'Suspects returned to DC area',
    estimated_loss: 28000,
  },
  {
    id: 'CASE_008',
    case_number: 'DC-2024-1201',
    title: 'Georgetown Major Burglary',
    location_id: 'DC_GEORGETOWN',
    timestamp: '2024-12-01T03:00:00Z',
    status: 'Active Investigation',
    priority: 'Critical',
    description: 'PRIMARY INCIDENT - 50 devices detected, high-value theft',
    estimated_loss: 125000,
    isPrimary: true,
  },
];

/**
 * Generate device movement timeline
 * Devices move between locations, with activity peaking around case timestamps
 */
function generateDeviceTimeline(rng) {
  const timeline = [];

  // For each suspect, generate their movement path
  const suspectIds = ['DEVICE_E0412', 'DEVICE_E1098'];

  // Generate hourly positions for Nov 1 - Dec 3
  const startDate = new Date('2024-11-01T00:00:00Z');
  const endDate = new Date('2024-12-03T23:00:00Z');

  // Create case lookup by hour
  const caseByHour = new Map();
  CASES.forEach((c) => {
    const hour = new Date(c.timestamp);
    hour.setMinutes(0, 0, 0);
    caseByHour.set(hour.toISOString(), c);
  });

  // Suspects' base location (changes as they travel)
  let suspectBaseLocation = 'DC_ADAMS_MORGAN';

  // Track when suspects are in Nashville vs DC
  const nashvilleStart = new Date('2024-11-19T00:00:00Z');
  const nashvilleEnd = new Date('2024-11-26T00:00:00Z');

  let current = new Date(startDate);
  while (current <= endDate) {
    const hourKey = current.toISOString();
    const hour = current.getUTCHours();
    const caseAtHour = caseByHour.get(hourKey);

    // Determine if suspects are in Nashville period
    const inNashville = current >= nashvilleStart && current < nashvilleEnd;

    // Activity level based on time of day and proximity to cases
    let activityLevel = 0; // 0 = none, 1 = low, 2 = medium, 3 = high
    let location = null;

    if (caseAtHour) {
      // Key frame - high activity at case location
      activityLevel = 3;
      location = caseAtHour.location_id;
    } else if (hour >= 1 && hour <= 4) {
      // Late night - some activity
      activityLevel = rng.random() < 0.3 ? 1 : 0;

      // Pick a location based on where suspects are
      if (inNashville) {
        location = rng.pick(['NASH_EAST', 'NASH_GULCH', 'NASH_GERMANTOWN']);
      } else {
        location = rng.pick([
          'DC_GEORGETOWN',
          'DC_ADAMS_MORGAN',
          'DC_DUPONT',
          'DC_CAPITOL_HILL',
          'DC_NAVY_YARD',
        ]);
      }
    } else if (hour >= 18 && hour <= 23) {
      // Evening - reconnaissance activity sometimes
      activityLevel = rng.random() < 0.15 ? 1 : 0;
      if (inNashville) {
        location = rng.pick(['NASH_EAST', 'NASH_GULCH']);
      } else {
        location = rng.pick(['DC_GEORGETOWN', 'DC_ADAMS_MORGAN']);
      }
    }

    if (activityLevel > 0 && location) {
      const locData = LOCATIONS[location];

      // Add suspects
      suspectIds.forEach((deviceId) => {
        timeline.push({
          device_id: deviceId,
          timestamp: hourKey,
          location_id: location,
          latitude: locData.lat + (rng.random() - 0.5) * 0.005,
          longitude: locData.lon + (rng.random() - 0.5) * 0.005,
          city: locData.city,
          state: locData.state,
          neighborhood: locData.neighborhood,
          activity_level: activityLevel,
          case_id: caseAtHour?.id || null,
          is_suspect: true,
        });
      });

      // Add noise devices for key frames
      if (caseAtHour) {
        const noiseCount = caseAtHour.isPrimary ? 48 : rng.randomInt(8, 20);
        for (let i = 0; i < noiseCount; i++) {
          const noiseId = `DEVICE_N${rng.randomInt(1000, 9999)}`;
          timeline.push({
            device_id: noiseId,
            timestamp: hourKey,
            location_id: location,
            latitude: locData.lat + (rng.random() - 0.5) * 0.008,
            longitude: locData.lon + (rng.random() - 0.5) * 0.008,
            city: locData.city,
            state: locData.state,
            neighborhood: locData.neighborhood,
            activity_level: activityLevel,
            case_id: caseAtHour.id,
            is_suspect: false,
          });
        }
      }
    }

    // Burner phone appears after primary incident
    if (
      current >= new Date('2024-12-01T03:15:00Z') &&
      current <= new Date('2024-12-02T20:00:00Z')
    ) {
      if (hour >= 1 && hour <= 5) {
        const burnerLoc =
          current < new Date('2024-12-02T00:00:00Z') ? 'DC_GEORGETOWN' : 'BAL_HARBOR';
        const locData = LOCATIONS[burnerLoc];

        timeline.push({
          device_id: 'DEVICE_E2847',
          timestamp: hourKey,
          location_id: burnerLoc,
          latitude: locData.lat + (rng.random() - 0.5) * 0.003,
          longitude: locData.lon + (rng.random() - 0.5) * 0.003,
          city: locData.city,
          state: locData.state,
          neighborhood: locData.neighborhood,
          activity_level: 2,
          case_id: null,
          is_suspect: true,
        });
      }
    }

    current = new Date(current.getTime() + 60 * 60 * 1000);
  }

  return timeline;
}

/**
 * Generate time buckets with activity summaries
 */
function generateTimeBuckets(timeline) {
  const bucketMap = new Map();

  // Initialize all hours
  const startDate = new Date('2024-11-01T00:00:00Z');
  const endDate = new Date('2024-12-03T23:00:00Z');
  let current = new Date(startDate);

  while (current <= endDate) {
    const key = current.toISOString();
    bucketMap.set(key, {
      time_bucket: key,
      device_count: 0,
      suspect_count: 0,
      locations: new Set(),
      cities: new Set(),
      case_id: null,
      is_key_frame: false,
    });
    current = new Date(current.getTime() + 60 * 60 * 1000);
  }

  // Fill with timeline data
  timeline.forEach((event) => {
    const bucket = bucketMap.get(event.timestamp);
    if (bucket) {
      bucket.device_count++;
      if (event.is_suspect) bucket.suspect_count++;
      bucket.locations.add(event.location_id);
      bucket.cities.add(event.city);
      if (event.case_id) {
        bucket.case_id = event.case_id;
        bucket.is_key_frame = true;
      }
    }
  });

  // Convert to array
  return Array.from(bucketMap.values()).map((b) => ({
    ...b,
    locations: Array.from(b.locations),
    cities: Array.from(b.cities),
  }));
}

/**
 * Generate location summaries for map
 */
function generateLocationSummaries(timeline) {
  const locationMap = new Map();

  timeline.forEach((event) => {
    const key = `${event.location_id}_${event.timestamp}`;
    if (!locationMap.has(key)) {
      locationMap.set(key, {
        location_id: event.location_id,
        timestamp: event.timestamp,
        latitude: event.latitude,
        longitude: event.longitude,
        city: event.city,
        state: event.state,
        neighborhood: event.neighborhood,
        devices: new Set(),
        suspects: new Set(),
        case_id: event.case_id,
      });
    }
    const loc = locationMap.get(key);
    loc.devices.add(event.device_id);
    if (event.is_suspect) loc.suspects.add(event.device_id);
  });

  return Array.from(locationMap.values()).map((l) => ({
    ...l,
    device_count: l.devices.size,
    suspect_count: l.suspects.size,
    devices: Array.from(l.devices),
    suspects: Array.from(l.suspects),
  }));
}

/**
 * Generate entity profiles
 */
function generateEntityProfiles() {
  return Object.entries(SUSPECTS).map(([deviceId, data]) => ({
    entity_id: deviceId,
    entity_type: 'device',
    owner_name: data.name,
    owner_alias: data.alias,
    device_type: data.type,
    threat_level: data.threat,
    criminal_history: data.history,
  }));
}

/**
 * Generate all data
 */
function generateAllData() {
  const rng = new SeededRandom(42);

  const deviceTimeline = generateDeviceTimeline(rng);
  const timeBuckets = generateTimeBuckets(deviceTimeline);
  const locationSummaries = generateLocationSummaries(deviceTimeline);
  const entityProfiles = generateEntityProfiles();

  // Enrich cases with location data
  const enrichedCases = CASES.map((c) => ({
    ...c,
    ...LOCATIONS[c.location_id],
  }));

  return {
    cases: enrichedCases,
    device_timeline: deviceTimeline,
    time_buckets: timeBuckets,
    location_summaries: locationSummaries,
    entity_profiles: entityProfiles,
    locations: LOCATIONS,
    config: {
      start_date: '2024-11-01',
      end_date: '2024-12-03',
      total_hours: timeBuckets.length,
      case_count: CASES.length,
      primary_case_id: 'CASE_008',
    },
  };
}

const investigativeData = generateAllData();

module.exports = {
  investigativeData,
  SUSPECTS,
  LOCATIONS,
  CASES,
};
