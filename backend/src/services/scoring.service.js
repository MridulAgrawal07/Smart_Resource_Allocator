const DEFAULT_WEIGHTS = {
  severity: 0.35,
  people: 0.25,
  vulnerability: 0.15,
  decay: 0.10,
  scarcity: 0.10,
  history: 0.05,
};

const VULNERABILITY_REGEX =
  /\b(child|children|kid|kids|infant|infants|baby|babies|toddler|elder|elderly|senior|pregnan|disab|wheelchair|vulnerable|orphan)\b/i;

function detectVulnerability(extractedList) {
  return extractedList.some((f) => {
    const text = `${f.summarized_need || ''}`;
    return VULNERABILITY_REGEX.test(text);
  });
}

// Logarithmic normalization — caps out around 1000 people affected.
function normalizePeople(count) {
  const safe = Math.max(1, Number(count) || 1);
  return Math.min(1, Math.log10(safe + 1) / Math.log10(1001));
}

function computeTimeDecay(createdAt) {
  const ageMs = Date.now() - new Date(createdAt || Date.now()).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  // Linear growth from 0 → 1 over 6 hours. Older unaddressed incidents escalate.
  return Math.max(0, Math.min(1, ageHours / 6));
}

function computeScoreBreakdown({ reports, createdAt, weights = DEFAULT_WEIGHTS }) {
  const extracted = reports.map((r) => r.extracted_fields).filter(Boolean);

  const maxUrgency = extracted.reduce(
    (m, f) => Math.max(m, Number(f.urgency_score) || 0),
    0
  );
  const totalPeople = extracted.reduce(
    (s, f) => s + (Number(f.people_affected) || 1),
    0
  );

  const severity = maxUrgency / 10;
  const people_factor = normalizePeople(totalPeople);
  const vulnerability_multiplier = detectVulnerability(extracted) ? 1 : 0;
  const time_decay = computeTimeDecay(createdAt);
  const resource_scarcity = 0; // wired in once resource inventory service lands
  const historical_pattern = 0; // wired in once prediction pipeline lands

  const total =
    severity * weights.severity +
    people_factor * weights.people +
    vulnerability_multiplier * weights.vulnerability +
    time_decay * weights.decay +
    resource_scarcity * weights.scarcity +
    historical_pattern * weights.history;

  return {
    severity: round(severity),
    people_factor: round(people_factor),
    vulnerability_multiplier,
    time_decay: round(time_decay),
    resource_scarcity,
    historical_pattern,
    weights,
    total: round(total),
  };
}

function round(n) {
  return Math.round(n * 10000) / 10000;
}

module.exports = { computeScoreBreakdown, DEFAULT_WEIGHTS };
