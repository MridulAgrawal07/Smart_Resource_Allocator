export function scoreBand(score) {
  const s = Number(score) || 0;
  if (s >= 0.5) return 'crit';
  if (s >= 0.25) return 'warn';
  return 'nominal';
}

export function formatScore(score) {
  const s = Number(score) || 0;
  return s.toFixed(2);
}

export function formatRelative(dateLike) {
  if (!dateLike) return '—';
  const then = new Date(dateLike).getTime();
  if (!Number.isFinite(then)) return '—';
  const diffSec = Math.max(0, (Date.now() - then) / 1000);
  if (diffSec < 60) return `${Math.round(diffSec)}s ago`;
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  return `${Math.round(diffSec / 86400)}d ago`;
}

export function latLngFromIncident(inc) {
  const pt = inc.sanitized_location || inc.location_centroid;
  if (!pt || !Array.isArray(pt.coordinates) || pt.coordinates.length < 2) return null;
  const [lng, lat] = pt.coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return [lat, lng];
}

function matchesComparison(value, comp) {
  if (!comp || typeof comp !== 'object') return true;
  const v = Number(value) || 0;
  if ('$gt' in comp && !(v > comp.$gt)) return false;
  if ('$gte' in comp && !(v >= comp.$gte)) return false;
  if ('$lt' in comp && !(v < comp.$lt)) return false;
  if ('$lte' in comp && !(v <= comp.$lte)) return false;
  return true;
}

export function applyAssistantFilter(incidents, filter) {
  if (!filter) return incidents;
  const { categories = [], min_impact_score = 0, keywords = [], people_affected, impact_score } = filter;
  const catSet = new Set(categories);
  const kws = keywords.map((k) => k.toLowerCase());
  return incidents.filter((inc) => {
    if (catSet.size > 0 && !catSet.has(inc.category)) return false;
    if ((Number(inc.impact_score) || 0) < min_impact_score) return false;
    if (!matchesComparison(inc.estimated_people_affected, people_affected)) return false;
    if (!matchesComparison(inc.impact_score, impact_score)) return false;
    if (kws.length > 0) {
      const hay = `${inc.summarized_need || ''} ${inc.category || ''}`.toLowerCase();
      if (!kws.some((k) => hay.includes(k))) return false;
    }
    return true;
  });
}
