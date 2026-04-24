const Incident = require('../models/Incident');
const Volunteer = require('../models/Volunteer');
const { parseAssistantQuery } = require('../services/assistant.service');
const Report = require('../models/Report');

const OPEN_STATUSES = ['reported', 'triaged', 'assigned', 'in_progress', 'resolved', 'verified'];

async function listOpenIncidents(req, res, next) {
  try {
    const incidents = await Incident.find({ status: { $in: OPEN_STATUSES } })
      .sort({ impact_score: -1, last_updated_at: -1 })
      .limit(500)
      .lean();

    const reportIds = [];
    for (const inc of incidents) {
      if (Array.isArray(inc.contributing_report_ids)) {
        for (const rid of inc.contributing_report_ids) reportIds.push(rid);
      }
    }

    const reports = reportIds.length
      ? await Report.find({ _id: { $in: reportIds } })
          .select('_id extracted_fields original_text submitted_at')
          .lean()
      : [];
    const reportById = new Map(reports.map((r) => [String(r._id), r]));

    // Batch-load volunteer names for assigned incidents
    const allVolunteerIds = [
      ...new Set(
        incidents.flatMap((inc) => inc.assigned_volunteer_ids || [])
      ),
    ];
    const volunteers = allVolunteerIds.length
      ? await Volunteer.find({ _id: { $in: allVolunteerIds } })
          .select('_id name')
          .lean()
      : [];
    const volunteerById = new Map(volunteers.map((v) => [String(v._id), v.name]));

    const enriched = incidents.map((inc) => {
      const sampleReport = (inc.contributing_report_ids || [])
        .map((rid) => reportById.get(String(rid)))
        .find(Boolean);

      const summarized_need =
        sampleReport?.extracted_fields?.summarized_need ||
        sampleReport?.original_text ||
        '(no summary available)';

      const assigned_volunteer_ids = inc.assigned_volunteer_ids || [];
      const assigned_volunteers = assigned_volunteer_ids.map((id) => ({
        id: String(id),
        name: volunteerById.get(String(id)) || 'Unknown',
      }));

      return {
        _id: inc._id,
        category: inc.category,
        severity: inc.severity,
        estimated_people_affected: inc.estimated_people_affected,
        impact_score: inc.impact_score,
        score_breakdown: inc.score_breakdown,
        status: inc.status,
        location_centroid: inc.location_centroid,
        sanitized_location: inc.sanitized_location,
        assigned_volunteer_ids,
        assigned_volunteers,
        contributing_count: (inc.contributing_report_ids || []).length,
        summarized_need,
        created_at: inc.created_at,
        last_updated_at: inc.last_updated_at,
      };
    });

    return res.json({ count: enriched.length, incidents: enriched });
  } catch (err) {
    next(err);
  }
}

async function assistantQuery(req, res, next) {
  try {
    const { query } = req.body || {};
    if (!query || !String(query).trim()) {
      return res.status(400).json({ error: "Field 'query' is required" });
    }
    const filter = await parseAssistantQuery(String(query).trim());
    return res.json({ query, filter });
  } catch (err) {
    console.error('[assistant] parse failed:', err);
    return res.status(200).json({
      query: req.body?.query || '',
      filter: { categories: [], min_impact_score: 0, keywords: [], rationale: 'Assistant unavailable — showing all incidents.' },
      degraded: true,
    });
  }
}

module.exports = { listOpenIncidents, assistantQuery };
