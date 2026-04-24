const Volunteer = require('../models/Volunteer');
const Incident = require('../models/Incident');
const Report = require('../models/Report');
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

// ── GET /api/incidents/:id/matches ──────────────────────────────
// Read-only: runs matching algorithm and returns top 3-5 candidates.
// Does NOT persist anything to the database.
async function getMatches(req, res, next) {
  try {
    const { id } = req.params;

    const incident = await Incident.findById(id).lean();
    if (!incident) return res.status(404).json({ error: 'Incident not found' });

    const ranked = await findBestVolunteers(id, { limit: 5 });
    if (ranked.length === 0) {
      return res.json({ incident_id: id, candidates: [] });
    }

    return res.json({
      incident_id: id,
      candidates: ranked.map((r) => ({
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

// ── POST /api/incidents/:id/confirm-assignment ───────────────────
// Persists the coordinator's volunteer selection.
// Body: { volunteerIds: string[] }
async function confirmAssignment(req, res, next) {
  try {
    const { id } = req.params;
    const { volunteerIds } = req.body || {};

    if (!Array.isArray(volunteerIds) || volunteerIds.length === 0) {
      return res.status(400).json({ error: 'volunteerIds must be a non-empty array' });
    }

    const incident = await Incident.findById(id);
    if (!incident) return res.status(404).json({ error: 'Incident not found' });
    if (incident.status === 'closed') {
      return res.status(400).json({ error: 'Cannot assign volunteers to a closed incident' });
    }

    const volunteers = await Volunteer.find({ _id: { $in: volunteerIds } });
    if (volunteers.length === 0) {
      return res.status(404).json({ error: 'No volunteers found for the given IDs' });
    }

    const now = new Date();

    // Mark each volunteer as assigned
    await Promise.all(
      volunteers.map((vol) => {
        vol.current_status = 'assigned';
        vol.active_assignments.push(incident._id);
        vol.total_assignments += 1;
        return vol.save();
      })
    );

    // Update incident with all selected volunteers
    incident.status = 'assigned';
    for (const vol of volunteers) {
      incident.assigned_volunteer_ids.push(vol._id);
      incident.assignment_history.push({
        volunteer_id: String(vol._id),
        assigned_at: now,
        status: 'assigned',
      });
    }
    await incident.save();

    const names = volunteers.map((v) => v.name).join(', ');
    console.log(`[matching] confirmed assignment of [${names}] to incident ${incident._id}`);

    return res.json({
      incident_id: incident._id,
      incident_status: incident.status,
      assigned: volunteers.map((v) => ({ volunteer_id: v._id, name: v.name })),
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/volunteers ──────────────────────────────────────────
// Returns all volunteers enriched with their active incident details.
// Assigned volunteers include `active_incident` (category, summarized_need,
// impact_score) so the roster UI can show the mission box without a
// second round-trip.
async function listVolunteers(req, res, next) {
  try {
    const volunteers = await Volunteer.find().sort({ trust_score: -1 }).lean();

    // Reverse-lookup: find active incidents for all assigned volunteers.
    // Using Incident.assigned_volunteer_ids as the authoritative source.
    const assignedIds = volunteers
      .filter((v) => v.current_status === 'assigned')
      .map((v) => v._id);

    let incidentByVolId = new Map();

    if (assignedIds.length) {
      const activeIncidents = await Incident.find({
        assigned_volunteer_ids: { $in: assignedIds },
        status: { $in: ['assigned', 'in_progress'] },
      })
        .select('_id category severity impact_score status assigned_volunteer_ids contributing_report_ids')
        .lean();

      // Pull one sample report per incident to get summarized_need
      const reportIds = activeIncidents.flatMap((inc) => inc.contributing_report_ids || []);
      const reports = reportIds.length
        ? await Report.find({ _id: { $in: reportIds } })
            .select('_id extracted_fields original_text')
            .lean()
        : [];
      const reportById = new Map(reports.map((r) => [String(r._id), r]));

      for (const inc of activeIncidents) {
        const sampleReport = (inc.contributing_report_ids || [])
          .map((rid) => reportById.get(String(rid)))
          .find(Boolean);

        const summarized_need =
          sampleReport?.extracted_fields?.summarized_need ||
          sampleReport?.original_text ||
          null;

        const payload = {
          _id: inc._id,
          category: inc.category,
          severity: inc.severity,
          impact_score: inc.impact_score,
          status: inc.status,
          summarized_need,
        };

        // Map every assigned volunteer on this incident
        for (const volId of inc.assigned_volunteer_ids || []) {
          const key = String(volId);
          if (!incidentByVolId.has(key)) incidentByVolId.set(key, payload);
        }
      }
    }

    const enriched = volunteers.map((v) => ({
      ...v,
      active_incident: incidentByVolId.get(String(v._id)) || null,
    }));

    return res.json({ count: enriched.length, volunteers: enriched });
  } catch (err) {
    next(err);
  }
}

module.exports = { seedVolunteers, getMatches, confirmAssignment, listVolunteers };
