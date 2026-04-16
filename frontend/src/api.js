export async function fetchIncidents() {
  const res = await fetch('/api/incidents');
  if (!res.ok) throw new Error(`fetchIncidents failed: ${res.status}`);
  return res.json();
}

export async function runAssistantQuery(query) {
  const res = await fetch('/api/incidents/assistant', {
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
  const res = await fetch('/api/reports/ingest', { method: 'POST', body: form });
  if (!res.ok) throw new Error(`submitReport failed: ${res.status}`);
  return res.json();
}

// ── Volunteer Portal ──────────────────────────────────────────────

export async function fetchVolunteers() {
  const res = await fetch('/api/volunteers');
  if (!res.ok) throw new Error(`fetchVolunteers failed: ${res.status}`);
  return res.json();
}

export async function assignIncident(incidentId) {
  const res = await fetch(`/api/incidents/${incidentId}/assign`, { method: 'POST' });
  if (!res.ok) throw new Error(`assignIncident failed: ${res.status}`);
  return res.json();
}
