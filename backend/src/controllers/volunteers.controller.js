const Volunteer = require('../models/Volunteer');
const Incident = require('../models/Incident');
const { findBestVolunteers } = require('../services/matching.service');

// ── POST /api/volunteers/seed ────────────────────────────────────
// Seeds 5 diverse test volunteers around Jaipur (lat ~26.9, lng ~75.7–75.8).
async function seedVolunteers(req, res, next) {
  try {
    const seed = [
      {
        name: 'Priya Sharma',
        skills: ['Health', 'Medical', 'First Aid'],
        languages: ['Hindi', 'English'],
        transportation_mode: 'motorcycle',
        last_known_location: { type: 'Point', coordinates: [75.7873, 26.9124] },
        service_radius: 15,
        wellness_score: 0.95,
        trust_score: 0.88,
        hours_last_7_days: 8,
        consecutive_high_urgency_count: 0,
        contact_channels: { sms: '+91-9000000001' },
        availability_windows: [
          { day: 'mon', start: '08:00', end: '18:00' },
          { day: 'wed', start: '08:00', end: '18:00' },
          { day: 'fri', start: '08:00', end: '18:00' },
        ],
      },
      {
        name: 'Rahul Meena',
        skills: ['Safety', 'Security', 'First Aid'],
        languages: ['Hindi'],
        transportation_mode: 'car',
        last_known_location: { type: 'Point', coordinates: [75.7935, 26.9210] },
        service_radius: 25,
        wellness_score: 0.60,
        trust_score: 0.72,
        hours_last_7_days: 22,
        consecutive_high_urgency_count: 3,
        contact_channels: { sms: '+91-9000000002', whatsapp: '+91-9000000002' },
        availability_windows: [
          { day: 'mon', start: '06:00', end: '22:00' },
          { day: 'tue', start: '06:00', end: '22:00' },
          { day: 'wed', start: '06:00', end: '22:00' },
          { day: 'thu', start: '06:00', end: '22:00' },
          { day: 'fri', start: '06:00', end: '22:00' },
        ],
      },
      {
        name: 'Anita Verma',
        skills: ['Food', 'Logistics', 'Distribution'],
        languages: ['Hindi', 'Rajasthani'],
        transportation_mode: 'bicycle',
        last_known_location: { type: 'Point', coordinates: [75.7780, 26.9050] },
        service_radius: 8,
        wellness_score: 0.85,
        trust_score: 0.91,
        hours_last_7_days: 5,
        consecutive_high_urgency_count: 0,
        contact_channels: { whatsapp: '+91-9000000003' },
        availability_windows: [
          { day: 'sat', start: '09:00', end: '17:00' },
          { day: 'sun', start: '09:00', end: '17:00' },
        ],
      },
      {
        name: 'Deepak Joshi',
        skills: ['Water', 'Sanitation', 'Infrastructure', 'Construction'],
        languages: ['Hindi', 'English'],
        transportation_mode: 'car',
        last_known_location: { type: 'Point', coordinates: [75.8020, 26.9300] },
        service_radius: 30,
        wellness_score: 0.40,
        trust_score: 0.65,
        hours_last_7_days: 35,
        consecutive_high_urgency_count: 5,
        // Burnout prevention: this volunteer is on mandatory rest
        mandatory_rest_until: new Date(Date.now() + 24 * 60 * 60 * 1000), // +24h from now
        contact_channels: { sms: '+91-9000000004' },
        wellness_flags: [
          { type: 'overwork', reason: '35h in 7 days exceeds 30h threshold', flagged_at: new Date() },
        ],
        availability_windows: [
          { day: 'mon', start: '07:00', end: '20:00' },
          { day: 'tue', start: '07:00', end: '20:00' },
          { day: 'wed', start: '07:00', end: '20:00' },
          { day: 'thu', start: '07:00', end: '20:00' },
          { day: 'fri', start: '07:00', end: '20:00' },
          { day: 'sat', start: '07:00', end: '20:00' },
        ],
      },
      {
        name: 'Kavita Rathore',
        skills: ['Education', 'Counseling', 'Health'],
        languages: ['Hindi', 'English', 'Marwari'],
        transportation_mode: 'public_transit',
        last_known_location: { type: 'Point', coordinates: [75.7690, 26.8980] },
        service_radius: 12,
        wellness_score: 0.78,
        trust_score: 0.82,
        hours_last_7_days: 12,
        consecutive_high_urgency_count: 1,
        contact_channels: { sms: '+91-9000000005', whatsapp: '+91-9000000005' },
        availability_windows: [
          { day: 'tue', start: '10:00', end: '16:00' },
          { day: 'thu', start: '10:00', end: '16:00' },
          { day: 'sat', start: '08:00', end: '14:00' },
        ],
      },
    ];

    // Drop existing seed data so the endpoint is idempotent
    await Volunteer.deleteMany({
      name: { $in: seed.map((v) => v.name) },
    });

    const docs = await Volunteer.insertMany(seed);
    return res.status(201).json({
      message: `Seeded ${docs.length} volunteers`,
      volunteers: docs.map((v) => ({
        _id: v._id,
        name: v.name,
        skills: v.skills,
        wellness_score: v.wellness_score,
        trust_score: v.trust_score,
        mandatory_rest_until: v.mandatory_rest_until,
        current_status: v.current_status,
      })),
    });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/incidents/:id/assign ───────────────────────────────
// Runs the matching pipeline, picks the top volunteer, assigns them.
async function assignVolunteer(req, res, next) {
  try {
    const { id } = req.params;

    // 1. Load incident
    const incident = await Incident.findById(id);
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }
    if (incident.status === 'closed') {
      return res.status(400).json({ error: 'Cannot assign volunteers to a closed incident' });
    }

    // 2. Run matching pipeline
    const ranked = await findBestVolunteers(id, { limit: 5 });
    if (ranked.length === 0) {
      return res.status(200).json({
        message: 'No eligible volunteers found for this incident',
        incident_id: id,
        candidates: [],
      });
    }

    // 3. Pick the top-ranked volunteer
    const best = ranked[0];
    const volunteer = await Volunteer.findById(best.volunteer._id);

    // 4. Update volunteer state
    volunteer.current_status = 'assigned';
    volunteer.active_assignments.push(incident._id);
    volunteer.total_assignments += 1;
    await volunteer.save();

    // 5. Update incident state
    incident.status = 'assigned';
    incident.assigned_volunteer_ids.push(String(volunteer._id));
    incident.assignment_history.push({
      volunteer_id: String(volunteer._id),
      assigned_at: new Date(),
      status: 'assigned',
    });
    await incident.save();

    console.log(
      `[matching] assigned volunteer ${volunteer.name} (${volunteer._id}) to incident ${incident._id} with score ${best.matchScore}`
    );

    // 6. Return the full ranking so the coordinator can see alternatives
    return res.json({
      message: `Assigned ${volunteer.name} to incident`,
      incident_id: incident._id,
      incident_status: incident.status,
      assigned: {
        volunteer_id: volunteer._id,
        name: volunteer.name,
        matchScore: best.matchScore,
        breakdown: best.breakdown,
      },
      alternatives: ranked.slice(1).map((r) => ({
        volunteer_id: r.volunteer._id,
        name: r.volunteer.name,
        matchScore: r.matchScore,
        breakdown: r.breakdown,
      })),
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/volunteers ──────────────────────────────────────────
async function listVolunteers(req, res, next) {
  try {
    const volunteers = await Volunteer.find()
      .sort({ trust_score: -1 })
      .lean();
    return res.json({ count: volunteers.length, volunteers });
  } catch (err) {
    next(err);
  }
}

module.exports = { seedVolunteers, assignVolunteer, listVolunteers };
