// Strip any accidental trailing slash so template literals never produce //
const BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export async function fetchIncidents() {
  const res = await fetch(`${BASE}/api/incidents`);
  if (!res.ok) throw new Error(`fetchIncidents failed: ${res.status}`);
  return res.json();
}

export async function runAssistantQuery(query) {
  const res = await fetch(`${BASE}/api/incidents/assistant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`assistant failed: ${res.status}`);
  return res.json();
}

// ── Field Portal ──────────────────────────────────────────────────

export async function submitReport({ description, image, lat, lng, worker_id }) {
  const form = new FormData();
  form.append('description', description);
  if (image) form.append('image', image);
  if (lat != null) form.append('lat', String(lat));
  if (lng != null) form.append('lng', String(lng));
  if (worker_id) form.append('worker_id', worker_id);
  const res = await fetch(`${BASE}/api/reports/ingest`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`submitReport failed: ${res.status}`);
  return res.json();
}

// ── Volunteer Portal ──────────────────────────────────────────────

export async function fetchVolunteers() {
  const res = await fetch(`${BASE}/api/volunteers`);
  if (!res.ok) throw new Error(`fetchVolunteers failed: ${res.status}`);
  return res.json();
}

export async function fetchMatches(incidentId) {
  const res = await fetch(`${BASE}/api/incidents/${incidentId}/matches`);
  if (!res.ok) throw new Error(`fetchMatches failed: ${res.status}`);
  return res.json();
}

export async function confirmAssignment(incidentId, volunteerIds) {
  const res = await fetch(`${BASE}/api/incidents/${incidentId}/confirm-assignment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ volunteerIds }),
  });
  if (!res.ok) throw new Error(`confirmAssignment failed: ${res.status}`);
  return res.json();
}

// ── Moderation Queue ──────────────────────────────────────────────

export async function fetchPendingReports() {
  const res = await fetch(`${BASE}/api/reports/pending`);
  if (!res.ok) throw new Error(`fetchPendingReports failed: ${res.status}`);
  return res.json();
}

export async function approveReport(reportId) {
  const res = await fetch(`${BASE}/api/reports/${reportId}/approve`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `approveReport failed: ${res.status}`);
  }
  return res.json();
}

export async function rejectReport(reportId) {
  const res = await fetch(`${BASE}/api/reports/${reportId}/reject`, { method: 'POST' });
  if (!res.ok) throw new Error(`rejectReport failed: ${res.status}`);
  return res.json();
}

// ── Geo-verified 2-step task flow ────────────────────────────────

// Step 1: verify on-site arrival (does NOT resolve the incident)
export async function geoCheckin(incidentId, volunteerId, lat, lng) {
  const res = await fetch(`${BASE}/api/volunteers/checkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ incidentId, volunteerId, lat, lng }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `geoCheckin failed: ${res.status}`);
  }
  return res.json();
}

// Step 2: mark mission complete — releases all assigned volunteers
export async function completeTask(incidentId, volunteerId) {
  const res = await fetch(`${BASE}/api/volunteers/complete-task`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ incidentId, volunteerId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `completeTask failed: ${res.status}`);
  }
  return res.json();
}
