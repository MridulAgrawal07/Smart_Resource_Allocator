const Incident = require('../models/Incident');
const Report = require('../models/Report');
const { computeScoreBreakdown } = require('./scoring.service');

const SPATIAL_RADIUS_METERS = 500;
const TEMPORAL_WINDOW_MS = 2 * 60 * 60 * 1000;
const ACTIVE_STATUSES = ['reported', 'triaged', 'assigned', 'in_progress'];
const SANITIZED_JITTER_DEG = 0.0009; // ~100 m at equator
const VECTOR_INDEX_NAME = 'incident_semantic_search';
// Threshold for cross-category semantic matches (no category overlap at all).
// Must be high because geo+time are the only other signals.
const VECTOR_SCORE_THRESHOLD = 0.92;
// Confirmation threshold when a category match is found but both sides have embeddings.
// Lower than VECTOR_SCORE_THRESHOLD because category+geo+time already provide strong signal;
// this is only a false-positive guard for same-category incidents that are different events
// (e.g. two "Health" incidents 300 m apart: a chemical spill and an elevator/medication issue).
const CATEGORY_CONFIRM_THRESHOLD = 0.82;
// Atlas $vectorSearch numCandidates must be >= limit; over-fetch so geo/temporal filter has room.
const VECTOR_NUM_CANDIDATES = 150;
const VECTOR_LIMIT = 25;

// ── Cosine similarity ─────────────────────────────────────────────
// Used to validate category-match candidates when both sides have embeddings.
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
}

function jitterPoint(lng, lat) {
  return {
    type: 'Point',
    coordinates: [
      lng + (Math.random() - 0.5) * 2 * SANITIZED_JITTER_DEG,
      lat + (Math.random() - 0.5) * 2 * SANITIZED_JITTER_DEG,
    ],
  };
}

// ── Semantic candidate search (MongoDB Atlas Vector Search) ───────
// Intentionally category-agnostic: Gemini can assign different category
// labels to reports about the same real-world event (e.g. "Health" vs
// "Safety" for the same injured-person scene). Category matching belongs
// only in the fallback path below. Here we rely solely on semantic
// similarity + geospatial + temporal proximity.
//
// $geoWithin/$centerSphere is used instead of $near because $near cannot
// follow $vectorSearch in an aggregation pipeline.
async function findCandidateIncidentSemantic({ lat, lng, embedding }) {
  const cutoff = new Date(Date.now() - TEMPORAL_WINDOW_MS);
  // Radius in radians for $centerSphere (Earth radius ≈ 6 371 000 m)
  const radiusRadians = SPATIAL_RADIUS_METERS / 6_371_000;

  const pipeline = [
    {
      $vectorSearch: {
        index: VECTOR_INDEX_NAME,
        path: 'embedding',
        queryVector: embedding,
        numCandidates: VECTOR_NUM_CANDIDATES,
        limit: VECTOR_LIMIT,
      },
    },
    // Surface the float score as a regular field so $match can compare it
    { $addFields: { _vscore: { $meta: 'vectorSearchScore' } } },
    {
      // NO category filter — semantic similarity already captures cross-category
      // real-world events. Only score, status, geo, and time are enforced.
      $match: {
        _vscore: { $gte: VECTOR_SCORE_THRESHOLD },
        status: { $in: ACTIVE_STATUSES },
        last_updated_at: { $gte: cutoff },
        location_centroid: {
          $geoWithin: {
            $centerSphere: [[lng, lat], radiusRadians],
          },
        },
      },
    },
    { $sort: { _vscore: -1 } },
    { $limit: 1 },
  ];

  const results = await Incident.aggregate(pipeline);
  return results[0] || null;
}

// ── Category-based candidate pool (spatial + temporal) ────────────
// Returns up to `limit` active same-category incidents within radius,
// sorted by distance so the closest candidates are evaluated first.
async function findCandidateIncidentsByCategory({ lat, lng, category, limit = 10 }) {
  const cutoff = new Date(Date.now() - TEMPORAL_WINDOW_MS);
  return Incident.find({
    category,
    status: { $in: ACTIVE_STATUSES },
    last_updated_at: { $gte: cutoff },
    location_centroid: {
      $near: {
        $geometry: { type: 'Point', coordinates: [lng, lat] },
        $maxDistance: SPATIAL_RADIUS_METERS,
      },
    },
  }).limit(limit);
}

// ── Incident factory ──────────────────────────────────────────────
async function createIncidentFromReport(report, embedding) {
  const { lat, lng } = report.gps_coordinates;
  const people = Number(report.extracted_fields.people_affected) || 1;
  const breakdown = computeScoreBreakdown({ reports: [report], createdAt: new Date() });

  return Incident.create({
    category: report.extracted_fields.category,
    severity: report.extracted_fields.urgency_score,
    estimated_people_affected: people,
    contributing_report_ids: [report._id],
    location_centroid: { type: 'Point', coordinates: [lng, lat] },
    location_bounds: { min_lat: lat, max_lat: lat, min_lng: lng, max_lng: lng },
    sanitized_location: jitterPoint(lng, lat),
    impact_score: breakdown.total,
    score_breakdown: breakdown,
    status: 'reported',
    ...(embedding ? { embedding } : {}),
  });
}

// ── Merge path ────────────────────────────────────────────────────
async function mergeReportIntoIncident(incident, newReport) {
  const ids = [...incident.contributing_report_ids, newReport._id];
  const reports = await Report.find({ _id: { $in: ids } });

  const lats = [];
  const lngs = [];
  let peopleSum = 0;
  let maxUrgency = 0;
  // Category resolution: adopt the category from the highest-urgency report.
  // Falls back to the existing incident category so cross-category merges
  // (e.g. "Health" + "Safety" for the same scene) always produce a result.
  let dominantCategory = incident.category;

  for (const r of reports) {
    if (r.gps_coordinates && Number.isFinite(r.gps_coordinates.lat)) {
      lats.push(r.gps_coordinates.lat);
      lngs.push(r.gps_coordinates.lng);
    }
    if (r.extracted_fields) {
      peopleSum += Number(r.extracted_fields.people_affected) || 1;
      const urgency = Number(r.extracted_fields.urgency_score) || 0;
      if (urgency > maxUrgency) {
        maxUrgency = urgency;
        dominantCategory = r.extracted_fields.category || dominantCategory;
      }
    }
  }

  const centroidLat = lats.reduce((a, b) => a + b, 0) / lats.length;
  const centroidLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;

  const breakdown = computeScoreBreakdown({ reports, createdAt: incident.created_at });

  incident.category = dominantCategory;
  incident.contributing_report_ids = reports.map((r) => r._id);
  incident.estimated_people_affected = peopleSum;
  incident.severity = maxUrgency;
  incident.location_centroid = { type: 'Point', coordinates: [centroidLng, centroidLat] };
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

// ── Main entry point ──────────────────────────────────────────────
// embedding is optional — null triggers the pure category fallback.
async function attachReportToIncident(report, embedding = null) {
  if (!report.gps_coordinates || !report.extracted_fields) return null;
  const { lat, lng } = report.gps_coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const category = report.extracted_fields.category;
  let candidate = null;
  let strategy = 'new';

  if (embedding) {
    // ── Embedding-aware path ──────────────────────────────────────
    // Fetch the nearest N same-category incidents (geo + time filter),
    // then rank them all by cosine similarity locally — no Atlas needed.
    // This avoids the "nearest wins" trap where a seeded incident with
    // no embedding sits 50 m closer than the semantically correct match.
    const pool = await findCandidateIncidentsByCategory({ lat, lng, category });

    let bestSim = -1;
    let unvalidatedFallback = null;

    for (const inc of pool) {
      if (inc.embedding && inc.embedding.length) {
        const sim = cosineSimilarity(embedding, inc.embedding);
        console.log(`[clustering] candidate ${inc._id} sim=${sim.toFixed(4)}`);
        if (sim >= CATEGORY_CONFIRM_THRESHOLD && sim > bestSim) {
          bestSim = sim;
          candidate = inc;
          strategy = 'category+semantic';
        }
      } else if (!unvalidatedFallback) {
        // No embedding on this incident (seeded/pre-embedding). Keep as
        // last resort only — don't let it block a validated match above.
        unvalidatedFallback = inc;
      }
    }

    // ── Cross-category semantic fallback (Atlas) ──────────────────
    // Only fires when no validated same-category candidate was found.
    // Catches reports where Gemini labels the same real-world event with
    // two different categories. Higher threshold (0.92) because there is
    // no category signal to lean on.
    if (!candidate) {
      try {
        candidate = await findCandidateIncidentSemantic({ lat, lng, embedding });
        if (candidate) strategy = 'semantic';
      } catch (err) {
        console.warn('[clustering] $vectorSearch unavailable:', err.message);
      }
    }

    // ── Last-resort: unvalidated same-category match ───────────────
    // Semantic search also found nothing (Atlas unavailable or no strong
    // cross-category match). Use the no-embedding category candidate so
    // the report is not orphaned in non-Atlas environments.
    if (!candidate && unvalidatedFallback) {
      candidate = unvalidatedFallback;
      strategy = 'category-unvalidated';
      console.log(`[clustering] using unvalidated fallback ${candidate._id}`);
    }
  } else {
    // ── Legacy path (embedding generation failed) ─────────────────
    // Fall back to nearest same-category match without semantic check.
    const pool = await findCandidateIncidentsByCategory({ lat, lng, category, limit: 1 });
    candidate = pool[0] || null;
    if (candidate) strategy = 'category';
  }

  if (candidate) {
    console.log(`[clustering] ${strategy}: merging report ${report._id} → incident ${candidate._id}`);
    return mergeReportIntoIncident(candidate, report);
  }

  console.log(`[clustering] creating new incident from report ${report._id} (${category})`);
  return createIncidentFromReport(report, embedding);
}

module.exports = {
  attachReportToIncident,
  SPATIAL_RADIUS_METERS,
  TEMPORAL_WINDOW_MS,
};
