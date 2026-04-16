const Incident = require('../models/Incident');
const Report = require('../models/Report');
const { computeScoreBreakdown } = require('./scoring.service');

const SPATIAL_RADIUS_METERS = 500;
const TEMPORAL_WINDOW_MS = 2 * 60 * 60 * 1000;
const ACTIVE_STATUSES = ['reported', 'triaged', 'assigned', 'in_progress'];
const SANITIZED_JITTER_DEG = 0.0009; // ~100 m at equator

function jitterPoint(lng, lat) {
  return {
    type: 'Point',
    coordinates: [
      lng + (Math.random() - 0.5) * 2 * SANITIZED_JITTER_DEG,
      lat + (Math.random() - 0.5) * 2 * SANITIZED_JITTER_DEG,
    ],
  };
}

async function findCandidateIncident({ lat, lng, category }) {
  const cutoff = new Date(Date.now() - TEMPORAL_WINDOW_MS);
  return Incident.findOne({
    category,
    status: { $in: ACTIVE_STATUSES },
    last_updated_at: { $gte: cutoff },
    location_centroid: {
      $near: {
        $geometry: { type: 'Point', coordinates: [lng, lat] },
        $maxDistance: SPATIAL_RADIUS_METERS,
      },
    },
  });
}

async function createIncidentFromReport(report) {
  const { lat, lng } = report.gps_coordinates;
  const people = Number(report.extracted_fields.people_affected) || 1;
  const breakdown = computeScoreBreakdown({ reports: [report], createdAt: new Date() });

  return Incident.create({
    category: report.extracted_fields.category,
    severity: report.extracted_fields.urgency_score,
    estimated_people_affected: people,
    contributing_report_ids: [report._id],
    location_centroid: { type: 'Point', coordinates: [lng, lat] },
    location_bounds: {
      min_lat: lat,
      max_lat: lat,
      min_lng: lng,
      max_lng: lng,
    },
    sanitized_location: jitterPoint(lng, lat),
    impact_score: breakdown.total,
    score_breakdown: breakdown,
    status: 'reported',
  });
}

async function mergeReportIntoIncident(incident, newReport) {
  const ids = [...incident.contributing_report_ids, newReport._id];
  const reports = await Report.find({ _id: { $in: ids } });

  const lats = [];
  const lngs = [];
  let peopleSum = 0;
  let maxUrgency = 0;

  for (const r of reports) {
    if (r.gps_coordinates && Number.isFinite(r.gps_coordinates.lat)) {
      lats.push(r.gps_coordinates.lat);
      lngs.push(r.gps_coordinates.lng);
    }
    if (r.extracted_fields) {
      peopleSum += Number(r.extracted_fields.people_affected) || 1;
      maxUrgency = Math.max(maxUrgency, Number(r.extracted_fields.urgency_score) || 0);
    }
  }

  const centroidLat = lats.reduce((a, b) => a + b, 0) / lats.length;
  const centroidLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;

  const breakdown = computeScoreBreakdown({
    reports,
    createdAt: incident.created_at,
  });

  incident.contributing_report_ids = reports.map((r) => r._id);
  incident.estimated_people_affected = peopleSum;
  incident.severity = maxUrgency;
  incident.location_centroid = {
    type: 'Point',
    coordinates: [centroidLng, centroidLat],
  };
  incident.location_bounds = {
    min_lat: Math.min(...lats),
    max_lat: Math.max(...lats),
    min_lng: Math.min(...lngs),
    max_lng: Math.max(...lngs),
  };
  incident.sanitized_location = jitterPoint(centroidLng, centroidLat);
  incident.impact_score = breakdown.total;
  incident.score_breakdown = breakdown;

  await incident.save();
  return incident;
}

async function attachReportToIncident(report) {
  if (!report.gps_coordinates || !report.extracted_fields) return null;
  const { lat, lng } = report.gps_coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const category = report.extracted_fields.category;
  const candidate = await findCandidateIncident({ lat, lng, category });

  if (candidate) {
    console.log(
      `[clustering] merging report ${report._id} into incident ${candidate._id} (category=${category})`
    );
    return mergeReportIntoIncident(candidate, report);
  }

  console.log(
    `[clustering] creating new incident from report ${report._id} (category=${category})`
  );
  return createIncidentFromReport(report);
}

module.exports = {
  attachReportToIncident,
  SPATIAL_RADIUS_METERS,
  TEMPORAL_WINDOW_MS,
};
