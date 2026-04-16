const Volunteer = require('../models/Volunteer');
const Incident = require('../models/Incident');

// ── Matching weights (sum = 1.0) ────────────────────────────────
const W_PROXIMITY = 0.40;
const W_WELLNESS  = 0.40;
const W_TRUST     = 0.20;

// Max distance considered (meters). Beyond this, proximity score = 0.
const MAX_DISTANCE_M = 50_000; // 50 km

// Category → required skills mapping.
// A volunteer whose `skills` array includes any of these is eligible.
const CATEGORY_SKILL_MAP = {
  Health:         ['Health', 'Medical', 'First Aid'],
  Food:           ['Food', 'Logistics', 'Distribution'],
  Water:          ['Water', 'Sanitation', 'Logistics'],
  Shelter:        ['Shelter', 'Construction', 'Logistics'],
  Infrastructure: ['Infrastructure', 'Construction', 'Engineering'],
  Education:      ['Education', 'Teaching', 'Counseling'],
  Safety:         ['Safety', 'Security', 'First Aid'],
  Other:          [],  // any skill is fine
};

/**
 * Find and rank the best volunteers for a given incident.
 *
 * Pipeline:
 *   1. Load the incident (needs location + category).
 *   2. Query volunteers: status === 'available', skill match, mandatory_rest not active.
 *   3. For each candidate compute a composite match score.
 *   4. Return ranked array (best first), capped at `limit`.
 *
 * @param {string} incidentId
 * @param {object} [opts]
 * @param {number} [opts.limit=5]  Max candidates to return.
 * @returns {Promise<Array<{ volunteer, matchScore, breakdown }>>}
 */
async function findBestVolunteers(incidentId, { limit = 5 } = {}) {
  // ── 1. Load incident ───────────────────────────────────────────
  const incident = await Incident.findById(incidentId).lean();
  if (!incident) throw new Error(`Incident ${incidentId} not found`);

  const coords = incident.location_centroid?.coordinates; // [lng, lat]
  if (!coords || coords.length < 2) {
    throw new Error('Incident has no location — cannot run proximity matching');
  }

  // ── 2. Build volunteer query ───────────────────────────────────
  const requiredSkills = CATEGORY_SKILL_MAP[incident.category] || [];
  const now = new Date();

  const filter = {
    current_status: 'available',
    // Burnout Prevention: exclude anyone on mandatory rest
    $or: [
      { mandatory_rest_until: null },
      { mandatory_rest_until: { $lte: now } },
    ],
  };

  // Skill filter — only when the category has required skills
  if (requiredSkills.length > 0) {
    filter.skills = { $in: requiredSkills };
  }

  // Prefer a geospatial sort so the nearest candidates come first,
  // but fall back to a plain find if the volunteer has no location.
  let candidates;
  try {
    candidates = await Volunteer.find({
      ...filter,
      last_known_location: {
        $near: {
          $geometry: { type: 'Point', coordinates: coords },
          $maxDistance: MAX_DISTANCE_M,
        },
      },
    })
      .limit(limit * 3) // over-fetch so we have room to rank
      .lean();
  } catch (err) {
    // $near fails if no 2dsphere docs exist yet — fall back gracefully
    console.warn('[matching] $near query failed, falling back to plain find:', err.message);
    candidates = await Volunteer.find(filter).limit(limit * 3).lean();
  }

  if (candidates.length === 0) return [];

  // ── 3. Score each candidate ────────────────────────────────────
  const scored = candidates.map((vol) => {
    const proximity = computeProximityScore(vol, coords);
    const wellness  = Number(vol.wellness_score) || 0;
    const trust     = Number(vol.trust_score)    || 0;

    const matchScore =
      proximity * W_PROXIMITY +
      wellness  * W_WELLNESS  +
      trust     * W_TRUST;

    return {
      volunteer: vol,
      matchScore: round(matchScore),
      breakdown: {
        proximity: round(proximity),
        wellness:  round(wellness),
        trust:     round(trust),
        weights: { proximity: W_PROXIMITY, wellness: W_WELLNESS, trust: W_TRUST },
      },
    };
  });

  // ── 4. Sort desc by composite score, trim to limit ─────────────
  scored.sort((a, b) => b.matchScore - a.matchScore);
  return scored.slice(0, limit);
}

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Proximity score: 1.0 at distance 0, linear decay to 0.0 at MAX_DISTANCE_M.
 * Volunteers without a location get a 0.
 */
function computeProximityScore(volunteer, incidentCoords) {
  const volCoords = volunteer.last_known_location?.coordinates;
  if (!volCoords || volCoords.length < 2) return 0;

  const distM = haversineMeters(
    incidentCoords[1], incidentCoords[0], // lat, lng of incident
    volCoords[1],      volCoords[0]       // lat, lng of volunteer
  );

  return Math.max(0, 1 - distM / MAX_DISTANCE_M);
}

/**
 * Haversine distance in meters between two (lat, lng) pairs.
 */
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6_371_000; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function round(n) {
  return Math.round(n * 10000) / 10000;
}

module.exports = { findBestVolunteers, CATEGORY_SKILL_MAP };
