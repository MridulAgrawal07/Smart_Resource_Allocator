/**
 * seedCity.js — Jaipur City Seeder
 *
 * Populates the database with realistic test data across all three tiers:
 *   - 25 volunteers with diverse skills, wellness, trust, and locations
 *   - 55 reports that trigger the clustering pipeline (groups + standalones)
 *   - The clustering pipeline creates ~18 incidents from the 55 reports
 *
 * Designed to be called via POST /api/admin/seed-all or directly via:
 *   node -e "require('./src/scripts/seedCity').run()"
 *
 * Clears ALL existing data first — clean slate every run.
 */

const Report = require('../models/Report');
const Incident = require('../models/Incident');
const Volunteer = require('../models/Volunteer');
const { attachReportToIncident } = require('../services/clustering.service');

// ════════════════════════════════════════════════════════════════════════════
// JAIPUR LANDMARKS — real coordinates for realistic map clusters
// ════════════════════════════════════════════════════════════════════════════

const LANDMARKS = {
  hawaMahal:    { lat: 26.9239, lng: 75.8267 },
  cityPalace:  { lat: 26.9258, lng: 75.8237 },
  jawaharCircle:{ lat: 26.8515, lng: 75.8064 },
  mansarovar:  { lat: 26.8686, lng: 75.7597 },
  malviyaNagar:{ lat: 26.8530, lng: 75.8133 },
  vaishaliNagar:{ lat: 26.9123, lng: 75.7415 },
  tonkRoad:    { lat: 26.8738, lng: 75.7910 },
  cHandPole:   { lat: 26.9197, lng: 75.8146 },
  rajapark:    { lat: 26.9050, lng: 75.8120 },
  sikarRoad:   { lat: 26.9450, lng: 75.7620 },
  lnmiit:      { lat: 26.8654, lng: 75.6510 },
  amberFort:   { lat: 26.9855, lng: 75.8513 },
  nahargarh:   { lat: 26.9378, lng: 75.8156 },
  jlnMarg:     { lat: 26.9100, lng: 75.7860 },
  baniPark:    { lat: 26.9310, lng: 75.7890 },
  sodala:      { lat: 26.9220, lng: 75.7710 },
  sanganer:    { lat: 26.8280, lng: 75.7910 },
  sitapura:    { lat: 26.7870, lng: 75.8380 },
};

/** Add ±offset meters of jitter to simulate nearby-but-not-identical reports */
function jitter(coord, metersMax = 120) {
  const degPerMeter = 1 / 111_320;
  const offset = () => (Math.random() - 0.5) * 2 * metersMax * degPerMeter;
  return { lat: coord.lat + offset(), lng: coord.lng + offset() };
}

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomBetween(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

// ════════════════════════════════════════════════════════════════════════════
// VOLUNTEERS — 25 across Jaipur
// ════════════════════════════════════════════════════════════════════════════

const JAIPUR_NAMES = [
  'Aarav Sharma', 'Priya Gupta', 'Vikram Singh', 'Neha Rathore', 'Arjun Meena',
  'Kavita Joshi', 'Rohan Yadav', 'Sunita Verma', 'Deepak Kumawat', 'Anjali Patel',
  'Ravi Choudhary', 'Pooja Kanwar', 'Manoj Saini', 'Divya Shekhawat', 'Amit Tanwar',
  'Rekha Bairwa', 'Sunil Jangid', 'Meera Agarwal', 'Karan Rajput', 'Nisha Soni',
  'Hemant Godara', 'Shalini Tak', 'Vikas Dhaka', 'Anita Bhatt', 'Yogesh Pareek',
];

const SKILL_POOLS = [
  ['Health', 'Medical', 'First Aid'],
  ['Safety', 'Security', 'First Aid'],
  ['Food', 'Logistics', 'Distribution'],
  ['Water', 'Sanitation', 'Logistics'],
  ['Infrastructure', 'Construction', 'Engineering'],
  ['Education', 'Counseling', 'Teaching'],
  ['Shelter', 'Construction', 'Logistics'],
  ['Health', 'Counseling', 'Education'],
];

const TRANSPORT_MODES = ['walk', 'bicycle', 'motorcycle', 'car', 'public_transit'];
const LANGUAGES = [['Hindi', 'English'], ['Hindi', 'Rajasthani'], ['Hindi'], ['Hindi', 'English', 'Marwari']];
const VOLUNTEER_LOCS = [
  LANDMARKS.hawaMahal, LANDMARKS.cityPalace, LANDMARKS.mansarovar, LANDMARKS.malviyaNagar,
  LANDMARKS.vaishaliNagar, LANDMARKS.tonkRoad, LANDMARKS.rajapark, LANDMARKS.sikarRoad,
  LANDMARKS.baniPark, LANDMARKS.sodala, LANDMARKS.jawaharCircle, LANDMARKS.cHandPole,
  LANDMARKS.lnmiit, LANDMARKS.amberFort, LANDMARKS.sanganer, LANDMARKS.jlnMarg,
  LANDMARKS.sitapura, LANDMARKS.nahargarh, LANDMARKS.mansarovar, LANDMARKS.hawaMahal,
  LANDMARKS.rajapark, LANDMARKS.baniPark, LANDMARKS.tonkRoad, LANDMARKS.vaishaliNagar,
  LANDMARKS.malviyaNagar,
];

function buildVolunteers() {
  return JAIPUR_NAMES.map((name, i) => {
    const loc = jitter(VOLUNTEER_LOCS[i], 800);
    const skills = SKILL_POOLS[i % SKILL_POOLS.length];
    const wellnessRaw = randomBetween(0.15, 1.0);
    const isBurntOut = wellnessRaw < 0.30;
    const isAssigned = !isBurntOut && Math.random() < 0.2;

    return {
      name,
      skills,
      languages: randomFrom(LANGUAGES),
      transportation_mode: randomFrom(TRANSPORT_MODES),
      last_known_location: { type: 'Point', coordinates: [loc.lng, loc.lat] },
      service_radius: randomBetween(5, 30),
      current_status: isBurntOut ? 'resting' : isAssigned ? 'assigned' : 'available',
      wellness_score: Math.round(wellnessRaw * 100) / 100,
      trust_score: randomBetween(0.40, 0.98),
      hours_last_7_days: Math.round(randomBetween(0, 40)),
      consecutive_high_urgency_count: Math.round(randomBetween(0, 6)),
      total_assignments: Math.round(randomBetween(0, 45)),
      total_resolved: Math.round(randomBetween(0, 30)),
      mandatory_rest_until: isBurntOut
        ? new Date(Date.now() + randomBetween(2, 24) * 60 * 60 * 1000)
        : null,
      wellness_flags: isBurntOut
        ? [{ type: 'overwork', reason: `${Math.round(randomBetween(30, 42))}h in 7 days — mandatory rest`, flagged_at: new Date() }]
        : [],
      contact_channels: { sms: `+91-90000${String(i).padStart(5, '0')}` },
      availability_windows: [
        { day: randomFrom(['mon', 'tue', 'wed', 'thu', 'fri']), start: '08:00', end: '18:00' },
        { day: randomFrom(['sat', 'sun']), start: '09:00', end: '15:00' },
      ],
    };
  });
}

// ════════════════════════════════════════════════════════════════════════════
// REPORTS — 55 total
//   Groups A-G: clusterable (same area + category → should merge)
//   Standalones: unique high-urgency incidents
// ════════════════════════════════════════════════════════════════════════════

function buildReports() {
  const reports = [];
  const now = Date.now();

  // Helper to push a pre-extracted report (bypasses Gemini)
  function addReport({ text, category, urgency, people, summary, lat, lng, worker, minutesAgo = 0 }) {
    const coords = jitter({ lat, lng }, 80);
    reports.push({
      worker_id: worker || `field-worker-${Math.floor(Math.random() * 20) + 1}`,
      original_text: text,
      gps_coordinates: { lat: coords.lat, lng: coords.lng },
      extracted_fields: {
        category,
        urgency_score: urgency,
        people_affected: people,
        summarized_need: summary,
        model_version: 'seed-v1',
      },
      status: 'extracted', // clustering will flip to 'clustered'
      submitted_at: new Date(now - minutesAgo * 60_000),
      received_at: new Date(now - minutesAgo * 60_000),
    });
  }

  // ── GROUP A: Fallen tree near Hawa Mahal park (3 reports → 1 incident) ──
  addReport({
    text: 'A large banyan tree has fallen across the road near Hawa Mahal, blocking traffic completely.',
    category: 'Infrastructure', urgency: 7, people: 30,
    summary: 'Large banyan tree fallen blocking road near Hawa Mahal; traffic halted.',
    ...LANDMARKS.hawaMahal, worker: 'fw-hawa-1', minutesAgo: 25,
  });
  addReport({
    text: 'Big tree fell on the park side near Hawa Mahal entrance. Some scooters are crushed underneath.',
    category: 'Infrastructure', urgency: 7, people: 15,
    summary: 'Fallen tree damaged parked scooters near Hawa Mahal entrance.',
    ...LANDMARKS.hawaMahal, worker: 'fw-hawa-2', minutesAgo: 18,
  });
  addReport({
    text: 'Tree still blocking the road near Hawa Mahal. Traffic police trying to reroute but people are stuck.',
    category: 'Infrastructure', urgency: 6, people: 50,
    summary: 'Ongoing road blockage from fallen tree near Hawa Mahal; 50+ commuters affected.',
    ...LANDMARKS.hawaMahal, worker: 'fw-hawa-3', minutesAgo: 10,
  });

  // ── GROUP B: Water logging at Mansarovar (2 reports → 1 incident) ──
  addReport({
    text: 'Heavy water logging on the main road near Mansarovar metro. Water is knee-deep, vehicles stuck.',
    category: 'Water', urgency: 6, people: 100,
    summary: 'Knee-deep water logging near Mansarovar metro; vehicles stranded.',
    ...LANDMARKS.mansarovar, worker: 'fw-mansarovar-1', minutesAgo: 40,
  });
  addReport({
    text: 'Mansarovar main road completely flooded. Shopkeepers pumping out water from their stores.',
    category: 'Water', urgency: 7, people: 60,
    summary: 'Flooding on Mansarovar main road; shops damaged, residents pumping water.',
    ...LANDMARKS.mansarovar, worker: 'fw-mansarovar-2', minutesAgo: 30,
  });

  // ── GROUP C: Food distribution needed at Jawahar Circle (3 reports → 1 incident) ──
  addReport({
    text: 'Many migrant families sheltering near Jawahar Circle garden. Children look malnourished.',
    category: 'Food', urgency: 8, people: 40,
    summary: 'Migrant families with malnourished children need food at Jawahar Circle.',
    ...LANDMARKS.jawaharCircle, worker: 'fw-jawahar-1', minutesAgo: 90,
  });
  addReport({
    text: 'Around 30 families at Jawahar Circle have not eaten since yesterday. Mostly women and kids.',
    category: 'Food', urgency: 9, people: 80,
    summary: '30 families without food for 24+ hours at Jawahar Circle; women and children affected.',
    ...LANDMARKS.jawaharCircle, worker: 'fw-jawahar-2', minutesAgo: 70,
  });
  addReport({
    text: 'Situation worsening at Jawahar Circle. Need immediate food packets and drinking water.',
    category: 'Food', urgency: 9, people: 100,
    summary: 'Urgent food and water needed at Jawahar Circle for 100+ displaced people.',
    ...LANDMARKS.jawaharCircle, worker: 'fw-jawahar-3', minutesAgo: 45,
  });

  // ── GROUP D: Gas leak near Chandpole (2 reports → 1 incident) ──
  addReport({
    text: 'Strong smell of cooking gas in the narrow lane near Chandpole Gate. Residents evacuating.',
    category: 'Safety', urgency: 9, people: 25,
    summary: 'Gas leak detected near Chandpole Gate; residents evacuating narrow lane.',
    ...LANDMARKS.cHandPole, worker: 'fw-chandpole-1', minutesAgo: 15,
  });
  addReport({
    text: 'Gas cylinder leak at a restaurant near Chandpole. Fire brigade called but hasn\'t arrived.',
    category: 'Safety', urgency: 10, people: 40,
    summary: 'Cylinder leak at Chandpole restaurant; fire brigade delayed, 40 people at risk.',
    ...LANDMARKS.cHandPole, worker: 'fw-chandpole-2', minutesAgo: 8,
  });

  // ── GROUP E: Medical emergency at Tonk Road (3 reports → 1 incident) ──
  addReport({
    text: 'Construction worker fell from third floor at the Tonk Road site. Bleeding heavily from head.',
    category: 'Health', urgency: 10, people: 1,
    summary: 'Construction worker head injury from 3rd floor fall at Tonk Road site.',
    ...LANDMARKS.tonkRoad, worker: 'fw-tonk-1', minutesAgo: 5,
  });
  addReport({
    text: 'Ambulance needed urgently at Tonk Road construction. Man unconscious, possible spinal injury.',
    category: 'Health', urgency: 10, people: 1,
    summary: 'Unconscious man with possible spinal injury at Tonk Road construction; ambulance needed.',
    ...LANDMARKS.tonkRoad, worker: 'fw-tonk-2', minutesAgo: 3,
  });
  addReport({
    text: 'Two more workers also injured at the same Tonk Road site. No safety gear was being used.',
    category: 'Health', urgency: 8, people: 3,
    summary: 'Multiple worker injuries at Tonk Road site; no safety equipment in use.',
    ...LANDMARKS.tonkRoad, worker: 'fw-tonk-3', minutesAgo: 1,
  });

  // ── GROUP F: Shelter needed near Sanganer (2 reports → 1 incident) ──
  addReport({
    text: 'Flood-displaced families sleeping under flyover near Sanganer. Around 15 families with small children.',
    category: 'Shelter', urgency: 7, people: 60,
    summary: '15 displaced families with children sleeping under Sanganer flyover; need shelter.',
    ...LANDMARKS.sanganer, worker: 'fw-sanganer-1', minutesAgo: 100,
  });
  addReport({
    text: 'Same group near Sanganer flyover — they have been here 3 days. Elderly man looks very sick.',
    category: 'Shelter', urgency: 8, people: 65,
    summary: 'Elderly man sick among 65 displaced people at Sanganer flyover; 3 days without shelter.',
    ...LANDMARKS.sanganer, worker: 'fw-sanganer-2', minutesAgo: 60,
  });

  // ── GROUP G: Education disruption at LNMIIT area (2 reports → 1 incident) ──
  addReport({
    text: 'Government school near LNMIIT collapsed partially during rain. 200 students have no classroom.',
    category: 'Education', urgency: 6, people: 200,
    summary: 'Partial school collapse near LNMIIT; 200 students displaced from classrooms.',
    ...LANDMARKS.lnmiit, worker: 'fw-lnmiit-1', minutesAgo: 110,
  });
  addReport({
    text: 'Kids from the collapsed school are studying under a tree. Teachers asking for tents or temporary structure.',
    category: 'Education', urgency: 5, people: 200,
    summary: 'Displaced students studying outdoors near LNMIIT; teachers requesting temporary shelter.',
    ...LANDMARKS.lnmiit, worker: 'fw-lnmiit-2', minutesAgo: 80,
  });

  // ── STANDALONE HIGH-URGENCY REPORTS (each becomes its own incident) ────

  // S1: Chemical spill at Sitapura industrial area
  addReport({
    text: 'Chemical tanker overturned at Sitapura RIICO industrial area. Fumes spreading, workers coughing.',
    category: 'Safety', urgency: 10, people: 150,
    summary: 'Chemical tanker spill at Sitapura RIICO; toxic fumes affecting 150 workers.',
    ...LANDMARKS.sitapura, worker: 'fw-sitapura-1', minutesAgo: 12,
  });

  // S2: Elderly collapse at Amber Fort
  addReport({
    text: 'Elderly tourist collapsed at Amber Fort entrance. No medical facility nearby. Crowd gathering.',
    category: 'Health', urgency: 9, people: 1,
    summary: 'Elderly tourist collapsed at Amber Fort; no nearby medical help, needs ambulance.',
    ...LANDMARKS.amberFort, worker: 'fw-amber-1', minutesAgo: 7,
  });

  // S3: Wall collapse at Nahargarh
  addReport({
    text: 'Retaining wall collapsed on the road to Nahargarh fort. Two vehicles buried under debris.',
    category: 'Infrastructure', urgency: 9, people: 8,
    summary: 'Retaining wall collapse on Nahargarh road; 2 vehicles buried, 8 people trapped.',
    ...LANDMARKS.nahargarh, worker: 'fw-nahargarh-1', minutesAgo: 20,
  });

  // S4: Fire at Bani Park residential
  addReport({
    text: 'Fire broke out in a two-story house in Bani Park. Family of 6 including pregnant woman still inside.',
    category: 'Safety', urgency: 10, people: 6,
    summary: 'House fire in Bani Park; family of 6 including pregnant woman trapped inside.',
    ...LANDMARKS.baniPark, worker: 'fw-banipark-1', minutesAgo: 2,
  });

  // S5: Water contamination at Sodala
  addReport({
    text: 'Municipal water supply in Sodala area has turned brown. Multiple children reporting stomach cramps.',
    category: 'Water', urgency: 8, people: 500,
    summary: 'Contaminated brown water in Sodala; children with stomach cramps, 500 households affected.',
    ...LANDMARKS.sodala, worker: 'fw-sodala-1', minutesAgo: 55,
  });

  // ── ADDITIONAL SCATTERED REPORTS to fill density ────────────────────────

  const scatteredData = [
    { text: 'Stray dog pack near Raja Park market chasing people. A child was bitten.', category: 'Safety', urgency: 6, people: 5, summary: 'Stray dog attack near Raja Park market; child bitten.', ...LANDMARKS.rajapark, minutesAgo: 35 },
    { text: 'Open sewer on JLN Marg. Pedestrians falling in at night. Very dangerous.', category: 'Infrastructure', urgency: 7, people: 20, summary: 'Open sewer pit on JLN Marg; pedestrians at risk of falling in.', ...LANDMARKS.jlnMarg, minutesAgo: 50 },
    { text: 'Pregnant woman in labor at Malviya Nagar slum. No transport available.', category: 'Health', urgency: 10, people: 1, summary: 'Woman in labor at Malviya Nagar slum; needs immediate transport to hospital.', ...LANDMARKS.malviyaNagar, minutesAgo: 4 },
    { text: 'Street vendors at Sikar Road overpass haven\'t eaten in 2 days due to lockdown.', category: 'Food', urgency: 7, people: 25, summary: '25 street vendors at Sikar Road without food for 2 days due to lockdown.', ...LANDMARKS.sikarRoad, minutesAgo: 65 },
    { text: 'Broken electric pole sparking near Vaishali Nagar playground. Children play nearby.', category: 'Safety', urgency: 8, people: 30, summary: 'Sparking broken electric pole near Vaishali Nagar playground; children at risk.', ...LANDMARKS.vaishaliNagar, minutesAgo: 22 },
    { text: 'Water tanker hasn\'t come in 4 days to Mansarovar sector 7. 80 families without water.', category: 'Water', urgency: 7, people: 320, summary: 'No water supply for 4 days in Mansarovar sector 7; 80 families affected.', lat: LANDMARKS.mansarovar.lat + 0.008, lng: LANDMARKS.mansarovar.lng + 0.005, minutesAgo: 75 },
    { text: 'Abandoned building near Sanganer collapsing slowly. Homeless people living inside.', category: 'Shelter', urgency: 7, people: 12, summary: 'Collapsing abandoned building near Sanganer with homeless occupants inside.', lat: LANDMARKS.sanganer.lat + 0.006, lng: LANDMARKS.sanganer.lng - 0.004, minutesAgo: 88 },
    { text: 'Community health worker reports measles outbreak in Sitapura labor colony.', category: 'Health', urgency: 9, people: 45, summary: 'Measles outbreak in Sitapura labor colony; 45 children affected.', lat: LANDMARKS.sitapura.lat + 0.005, lng: LANDMARKS.sitapura.lng - 0.003, minutesAgo: 30 },
    { text: 'Bridge near Amber road has deep cracks. Heavy vehicles still crossing.', category: 'Infrastructure', urgency: 8, people: 100, summary: 'Cracked bridge near Amber road with heavy vehicle traffic; structural failure risk.', lat: LANDMARKS.amberFort.lat - 0.012, lng: LANDMARKS.amberFort.lng - 0.005, minutesAgo: 42 },
    { text: 'Night school for working children in Raja Park shut down. 40 kids have nowhere to go.', category: 'Education', urgency: 5, people: 40, summary: 'Night school closure at Raja Park leaves 40 working children without education.', lat: LANDMARKS.rajapark.lat + 0.003, lng: LANDMARKS.rajapark.lng - 0.002, minutesAgo: 95 },
    { text: 'Food packets delivered last week are expired. People at Tonk Road shelter falling sick.', category: 'Food', urgency: 8, people: 35, summary: 'Expired food packets at Tonk Road shelter causing illness among 35 residents.', lat: LANDMARKS.tonkRoad.lat + 0.007, lng: LANDMARKS.tonkRoad.lng + 0.004, minutesAgo: 38 },
    { text: 'Transformer exploded at City Palace area. Entire block without power since morning.', category: 'Infrastructure', urgency: 6, people: 200, summary: 'Transformer explosion near City Palace; entire block without power.', ...LANDMARKS.cityPalace, minutesAgo: 115 },
    { text: 'Elderly couple stranded on their rooftop in Vaishali Nagar due to flooding.', category: 'Shelter', urgency: 9, people: 2, summary: 'Elderly couple stranded on rooftop in Vaishali Nagar; needs rescue from flooding.', lat: LANDMARKS.vaishaliNagar.lat + 0.004, lng: LANDMARKS.vaishaliNagar.lng + 0.003, minutesAgo: 16 },
    { text: 'Leaking sewage pipe at JLN Marg near the hospital. Patients complaining of smell.', category: 'Water', urgency: 6, people: 80, summary: 'Sewage leak at JLN Marg near hospital; patients and staff affected by smell.', lat: LANDMARKS.jlnMarg.lat - 0.003, lng: LANDMARKS.jlnMarg.lng + 0.002, minutesAgo: 68 },
    { text: 'Missing 8-year-old child last seen near Chandpole bazaar. Mother is frantic.', category: 'Safety', urgency: 10, people: 1, summary: 'Missing 8-year-old child near Chandpole bazaar; urgent search needed.', lat: LANDMARKS.cHandPole.lat + 0.002, lng: LANDMARKS.cHandPole.lng - 0.003, minutesAgo: 6 },
    { text: 'Disabled man in wheelchair stuck in waterlogged underpass near Sodala.', category: 'Health', urgency: 8, people: 1, summary: 'Disabled man in wheelchair trapped in waterlogged underpass at Sodala.', lat: LANDMARKS.sodala.lat - 0.003, lng: LANDMARKS.sodala.lng + 0.002, minutesAgo: 9 },
    { text: 'Community kitchen volunteer burnt while cooking. Need medical supplies and antiseptic.', category: 'Health', urgency: 6, people: 1, summary: 'Kitchen volunteer sustained burns at Bani Park community kitchen; needs medical supplies.', lat: LANDMARKS.baniPark.lat - 0.004, lng: LANDMARKS.baniPark.lng + 0.003, minutesAgo: 48 },
    { text: 'Three families with infants sleeping in open field near Malviya Nagar. Temperatures dropping.', category: 'Shelter', urgency: 8, people: 15, summary: '3 families with infants in open field at Malviya Nagar; cold exposure risk.', lat: LANDMARKS.malviyaNagar.lat - 0.005, lng: LANDMARKS.malviyaNagar.lng + 0.004, minutesAgo: 33 },
  ];

  for (const s of scatteredData) {
    addReport(s);
  }

  return reports;
}

// ════════════════════════════════════════════════════════════════════════════
// EXECUTION
// ════════════════════════════════════════════════════════════════════════════

async function run() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║       SRA — JAIPUR CITY SEEDER                  ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  // ── 1. Clean slate ─────────────────────────────────────────────
  console.log('[seed] Clearing existing data...');
  const delR = await Report.deleteMany({});
  const delI = await Incident.deleteMany({});
  const delV = await Volunteer.deleteMany({});
  console.log(`  reports:   ${delR.deletedCount} removed`);
  console.log(`  incidents: ${delI.deletedCount} removed`);
  console.log(`  volunteers: ${delV.deletedCount} removed`);

  // ── 2. Seed volunteers ─────────────────────────────────────────
  console.log('\n[seed] Creating volunteers...');
  const volData = buildVolunteers();
  const volunteers = await Volunteer.insertMany(volData);
  const statusCounts = { available: 0, assigned: 0, resting: 0 };
  for (const v of volunteers) statusCounts[v.current_status] = (statusCounts[v.current_status] || 0) + 1;
  console.log(`  ${volunteers.length} volunteers created`);
  console.log(`  status breakdown: ${statusCounts.available} available, ${statusCounts.assigned} assigned, ${statusCounts.resting} resting`);

  // ── 3. Seed reports + run clustering pipeline ──────────────────
  console.log('\n[seed] Creating reports and running clustering pipeline...');
  const reportData = buildReports();
  let clustered = 0;
  let newIncidents = 0;
  let merged = 0;

  for (const rd of reportData) {
    const report = await Report.create(rd);
    try {
      const incidentBefore = await Incident.countDocuments();
      const incident = await attachReportToIncident(report);
      if (incident) {
        report.incident_id = incident._id;
        report.status = 'clustered';
        await report.save();
        clustered++;
        const incidentAfter = await Incident.countDocuments();
        if (incidentAfter > incidentBefore) newIncidents++;
        else merged++;
      }
    } catch (err) {
      console.warn(`  [warn] clustering failed for report ${report._id}: ${err.message}`);
    }
  }

  console.log(`  ${reportData.length} reports created`);
  console.log(`  ${clustered} reports clustered into incidents`);
  console.log(`  ${newIncidents} new incidents created`);
  console.log(`  ${merged} reports merged into existing incidents`);

  // ── 4. Summary ─────────────────────────────────────────────────
  const totalIncidents = await Incident.countDocuments();
  const totalReports = await Report.countDocuments();
  const totalVols = await Volunteer.countDocuments();

  const critCount = await Incident.countDocuments({ impact_score: { $gte: 0.5 } });
  const warnCount = await Incident.countDocuments({ impact_score: { $gte: 0.25, $lt: 0.5 } });
  const nomCount = await Incident.countDocuments({ impact_score: { $lt: 0.25 } });

  console.log('\n┌──────────────────────────────────────────────────┐');
  console.log('│  SEED COMPLETE — SUMMARY                         │');
  console.log('├──────────────────────────────────────────────────┤');
  console.log(`│  Volunteers: ${String(totalVols).padStart(4)}                              │`);
  console.log(`│  Reports:    ${String(totalReports).padStart(4)}                              │`);
  console.log(`│  Incidents:  ${String(totalIncidents).padStart(4)} (${critCount} critical, ${warnCount} elevated, ${nomCount} routine) │`);
  console.log('└──────────────────────────────────────────────────┘\n');

  return {
    volunteers: totalVols,
    reports: totalReports,
    incidents: totalIncidents,
    breakdown: { critical: critCount, elevated: warnCount, routine: nomCount },
  };
}

module.exports = { run };
