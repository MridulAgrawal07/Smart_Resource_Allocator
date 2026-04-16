# SRA Implementation Log — Developer's Manual

Status as of Stage 4 (Ingestion + Extraction + Clustering + Scoring + Coordinator Dashboard + NL Assistant).
This is a working reference — read before touching the backend or frontend.

---

## 1. Project Structure

```
backend/
├── .env.example                  # Template for local env vars
├── .gitignore
├── package.json                  # Runtime + dev deps, npm scripts
└── src/
    ├── server.js                 # Entry point — connects DB then boots Express
    ├── app.js                    # Express app wiring (CORS, morgan, routes, error handler)
    │
    ├── config/
    │   ├── env.js                # Loads .env, exports typed config + warns on missing vars
    │   └── db.js                 # mongoose.connect wrapper with strictQuery
    │
    ├── models/
    │   ├── Report.js             # Raw field submission schema (blueprint §3.1)
    │   └── Incident.js           # Clustered logical event schema (blueprint §3.2)
    │
    ├── services/
    │   ├── gemini.service.js     # Multimodal extraction via Google Generative AI SDK
    │   ├── scoring.service.js    # Composite impact score + explainable breakdown
    │   └── clustering.service.js # Spatial/temporal/category report → incident merger
    │
    ├── controllers/
    │   └── reports.controller.js # Orchestrates ingest → extract → persist → cluster
    │
    ├── routes/
    │   └── reports.routes.js     # POST /api/reports/ingest (multer image upload)
    │
    └── middleware/
        ├── upload.js             # Multer memory storage, 10 MB cap, image-only filter
        └── errorHandler.js       # Central error responder (handles MulterError)
```

---

## 2. API Reference

### `POST /api/reports/ingest`

Accepts a single field observation from a worker (text + optional photo + optional GPS), runs Gemini extraction, persists a `Report`, and clusters it into an `Incident`.

**Headers**
```
Content-Type: multipart/form-data
```

**Body fields**

| Field         | Type     | Required | Notes                                             |
|---------------|----------|----------|---------------------------------------------------|
| `description` | string   | yes      | Raw narrative from the field worker               |
| `image`       | file     | no       | Image/* only, ≤10 MB, stored in-memory (buffer)   |
| `worker_id`   | string   | no       | Defaults to `"anonymous"`                         |
| `lat`         | number   | no       | GPS latitude                                      |
| `lng`         | number   | no       | GPS longitude                                     |
| `submitted_at`| ISO date | no       | Defaults to `Date.now()`                          |

**Success (201) — extraction + clustering succeeded**
```json
{
  "message": "Report ingested successfully",
  "report_id": "65fb...",
  "status": "clustered",
  "extracted_fields": {
    "category": "Safety",
    "urgency_score": 9,
    "people_affected": 50,
    "summarized_need": "Gas leak near market; evacuate and send hazmat team immediately.",
    "model_version": "gemini-2.5-flash"
  },
  "incident_id": "65fb...",
  "impact_score": 0.5821,
  "score_breakdown": {
    "severity": 0.9,
    "people_factor": 0.5653,
    "vulnerability_multiplier": 0,
    "time_decay": 0,
    "resource_scarcity": 0,
    "historical_pattern": 0,
    "weights": { "severity": 0.35, "people": 0.25, "vulnerability": 0.15, "decay": 0.1, "scarcity": 0.1, "history": 0.05 },
    "total": 0.4563
  }
}
```
Note: if the report has no `lat`/`lng`, clustering is skipped and `status` stays `extracted` with `incident_id: null`.

**Manual Review (202) — Gemini call failed, graceful degradation**
```json
{
  "message": "Report received but AI extraction failed — queued for manual review.",
  "report_id": "65fb...",
  "status": "review_required"
}
```
The raw submission is preserved; a coordinator can triage it manually later.

**Validation errors (400)**
```json
{ "error": "Field 'description' is required" }
```

---

## 3. AI Pipeline Logic

### System prompt (in `gemini.service.js`)

The prompt is deliberately strict:
- Declares the role: humanitarian field-report analyzer for an NGO.
- Explicitly permits text-only input ("never refuse just because an image is missing").
- Demands a single JSON object with no prose, no markdown fences.
- Fixes the shape: `category` (enum), `urgency_score` (1–10), `people_affected` (≥1, default 1), `summarized_need` (≤25 words).
- Provides urgency calibration bands (1–3 routine → 9–10 life-threatening).
- Forces an inference on ambiguous input instead of refusing.

### Extraction flow — `extractFromReport({ text, imageBuffer, imageMimeType })`

1. **Client init (lazy)** — `getClient()` instantiates `GoogleGenerativeAI` once per process; throws if `GEMINI_API_KEY` is missing.
2. **Model config** — `getGenerativeModel({ model, generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } })`. Low temperature + JSON MIME type reduces parse failures.
3. **User message build** — The runtime text branches on whether an image is attached (`"A photo is attached..."` vs `"No photo attached — analyze the text alone..."`) to nudge the model away from refusal.
4. **Parts assembly** — `parts = [{ text }]`; if image present, append `{ inlineData: { data: base64, mimeType } }`.
5. **Call** — `model.generateContent({ contents: [{ role: 'user', parts }] })` wrapped in try/catch that logs `err`, `err.response`, `err.status`, `err.statusText` (this is how we diagnosed the 404 / 429 quota errors).
6. **Raw extraction** — `result.response.text()` in its own try/catch.
7. **Parse** — `parseJsonResponse(raw)` tries `JSON.parse`, falls back to a `/\{[\s\S]*\}/` regex capture.
8. **Normalize** — `normalize(parsed)`:
   - `category` validated against the enum; fallback `"Other"`.
   - `urgency_score` coerced to integer, clamped `[1, 10]`, default 5.
   - `people_affected` coerced, clamped `≥1`, rounded, default 1.
   - `summarized_need` trimmed.
   - `model_version: env.GEMINI_MODEL` attached.

### Confidence scoring — current state

Blueprint §4.1 calls for per-field confidence. The current `gemini-2.5-flash` call does **not** return numeric confidence. We're relying on:
- **Schema validation** as a proxy (invalid enum → fallback → lower trust).
- **Temperature 0.2 + JSON MIME** as a reliability lever.
- **Graceful degradation**: any extraction error → 202 + `status: review_required` → human triage.

Proper per-field confidence (and a `confidence_threshold` gate routing low-confidence items into a review queue) is a Week 2/3 TODO. Wire it in when we hook up the coordinator dashboard review queue.

---

## 4. Data Models

### `Report` — raw submission

```js
{
  worker_id: String,                 // indexed, default 'anonymous'
  original_text: String,             // required
  media_refs: [                      // pointers only; no image bytes in Mongo
    { filename, mimetype, size }
  ],
  gps_coordinates: { lat, lng },     // flat lat/lng — NOT GeoJSON
  extracted_fields: {
    category: enum('Health','Food','Water','Shelter','Infrastructure','Education','Safety','Other'),
    urgency_score: Number 1..10,
    people_affected: Number ≥1 default 1,
    summarized_need: String,
    model_version: String
  },
  status: enum('queued','processing','extracted','clustered','review_required','discarded'),
  submitted_at: Date,
  received_at: Date,
  incident_id: ObjectId → Incident   // populated after clustering
}
```
Timestamps: `createdAt` / `updatedAt` (Mongoose default).

Why flat `lat/lng` here instead of GeoJSON? Reports are raw capture — we never run `$near` against them. The GeoJSON story lives on the `Incident`.

### `Incident` — clustered logical event

```js
{
  category: enum(...same 8...),     // indexed
  severity: Number 1..10,            // max urgency across contributing reports
  estimated_people_affected: Number, // sum across contributing reports
  resource_needs: [String],

  location_centroid: {               // GeoJSON Point — 2dsphere indexed
    type: 'Point',
    coordinates: [lng, lat]          // MIND THE ORDER
  },
  location_bounds: { min_lat, max_lat, min_lng, max_lng },
  sanitized_location: {              // GeoJSON Point — 2dsphere indexed
    type: 'Point',
    coordinates: [lng+jitter, lat+jitter]
  },

  contributing_report_ids: [ObjectId → Report],

  impact_score: Number,              // indexed
  score_breakdown: {                 // full explainability trace
    severity, people_factor, vulnerability_multiplier,
    time_decay, resource_scarcity, historical_pattern,
    weights: { severity, people, vulnerability, decay, scarcity, history },
    total
  },

  status: enum('reported','triaged','assigned','in_progress','resolved','verified','closed'),

  assigned_volunteer_ids: [String],
  assignment_history: [{ volunteer_id, assigned_at, released_at, status }],

  resolution_proof_refs: [String],
  verification_status: enum('pending','verified','failed','manual_review'),
  resolved_at: Date,

  escalation_level: Number,
  escalation_history: [{ level, reason, escalated_at }]
}
```
Timestamps: `created_at` / `last_updated_at` (aliased via schema options).

### GeoJSON implementation

- Mongo's `$near` / `$geoWithin` operators require **GeoJSON Point** shape: `{ type: 'Point', coordinates: [lng, lat] }`. Longitude first — this bites every time, double-check.
- `incidentSchema.index({ location_centroid: '2dsphere' })` — enables the clustering `$near` query.
- `incidentSchema.index({ sanitized_location: '2dsphere' })` — enables coordinator heatmap queries against the privacy-jittered point (for Layer 5 map view without leaking beneficiary locations).
- **Two separate fields**, not one with runtime redaction. Raw centroid stays encrypted-at-rest; the map layer reads `sanitized_location`. This is the "privacy-at-read-boundary" posture from blueprint §6.3.

---

## 5. Core Services

### Clustering — `services/clustering.service.js`

Entry point: `attachReportToIncident(report)`.

**Guardrails** — skips clustering entirely if:
- Report has no `gps_coordinates`, OR
- No `extracted_fields`, OR
- lat/lng aren't finite numbers.

**Candidate query** — `findCandidateIncident({ lat, lng, category })`:

```js
Incident.findOne({
  category: <same>,
  status: { $in: ['reported','triaged','assigned','in_progress'] },
  last_updated_at: { $gte: now - 2h },
  location_centroid: {
    $near: {
      $geometry: { type: 'Point', coordinates: [lng, lat] },
      $maxDistance: 500        // meters
    }
  }
})
```

Constants (`clustering.service.js` top):
| Constant                | Value             |
|-------------------------|-------------------|
| `SPATIAL_RADIUS_METERS` | `500`             |
| `TEMPORAL_WINDOW_MS`    | `2 * 60 * 60 * 1000` (2 hours) |
| `ACTIVE_STATUSES`       | `['reported','triaged','assigned','in_progress']` |
| `SANITIZED_JITTER_DEG`  | `0.0009` (~100 m at equator) |

**Merge branch** — `mergeReportIntoIncident(incident, newReport)`:
1. Load all contributing reports (existing + new) from Mongo.
2. Recompute centroid as `mean(lat)` / `mean(lng)` across reports with GPS.
3. Recompute `location_bounds` as min/max lat & lng.
4. `estimated_people_affected = Σ report.extracted_fields.people_affected`.
5. `severity = max(urgency_score)` across reports.
6. Re-run `computeScoreBreakdown({ reports, createdAt: incident.created_at })` — note it uses the **incident's** creation time so time decay grows as the incident ages, not as new reports arrive.
7. Regenerate `sanitized_location` with fresh jitter.
8. Overwrite `contributing_report_ids` with the full list and `save()`.

**Create branch** — `createIncidentFromReport(report)`:
- Seeds a new incident with `status: 'reported'`, `severity` = this one report's urgency, `estimated_people_affected` = this one report's people count, centroid = this report's lat/lng.
- `score_breakdown` computed with `createdAt: new Date()` → `time_decay` starts at 0.

**Logging** — prints `[clustering] merging report X into incident Y` or `[clustering] creating new incident from report X` on every run.

### Impact Score — `services/scoring.service.js`

Entry point: `computeScoreBreakdown({ reports, createdAt, weights = DEFAULT_WEIGHTS })`.

**Default weights** (sum = 1.00):
```js
{
  severity:      0.35,
  people:        0.25,
  vulnerability: 0.15,
  decay:         0.10,
  scarcity:      0.10,
  history:       0.05
}
```

**Component formulas**:

| Component                 | Formula                                                                 | Range   | Notes |
|---------------------------|-------------------------------------------------------------------------|---------|-------|
| `severity`                | `max(urgency_score across reports) / 10`                                | 0..1    | Takes the worst signal, not an average |
| `people_factor`           | `min(1, log10(sumPeople + 1) / log10(1001))`                            | 0..1    | Log-scaled so 1000+ people ≈ cap; prevents mass events from dominating |
| `vulnerability_multiplier`| `1` if any summary matches `/child\|infant\|elder\|pregnan\|disab\|vulnerable\|.../i`, else `0` | 0 or 1 | Binary keyword gate — upgrade to NER later |
| `time_decay`              | `clamp(ageHours / 6, 0, 1)` where `ageHours = (now - createdAt) / 3600000` | 0..1    | Linear growth 0 → 1 over **6 hours**. Older unaddressed incidents escalate |
| `resource_scarcity`       | `0` (hardcoded)                                                         | 0..1    | Stub until resource inventory service lands |
| `historical_pattern`      | `0` (hardcoded)                                                         | 0..1    | Stub until prediction pipeline lands |

**Total**:
```
total = severity*0.35
      + people_factor*0.25
      + vulnerability_multiplier*0.15
      + time_decay*0.10
      + resource_scarcity*0.10
      + historical_pattern*0.05
```
All components and `total` rounded to 4 decimals via `round(n) = Math.round(n*10000)/10000`.

**Theoretical max today**: `0.35 + 0.25 + 0.15 + 0.10 = 0.85` (scarcity and history stub at 0). Remember this when eyeballing scores — a perfect 1.0 isn't reachable yet.

---

## 6. Testing Snippets

Assumes `npm run dev` is running and Mongo is up.

### Health check
```bash
curl http://localhost:4000/health
```

### Text-only ingest (no GPS → clustering skipped)
```bash
curl -X POST http://localhost:4000/api/reports/ingest \
  -F "description=Village well has been dry for three days, families walking 4km for water"
```

### Ingest with GPS (seeds a new incident)
```bash
curl -X POST http://localhost:4000/api/reports/ingest \
  -F "description=Strong smell of gas near the main market area, people are panicking" \
  -F "lat=26.9124" \
  -F "lng=75.7873"
```

### Second report within 500 m / 2 h / same category → should MERGE into the incident above
```bash
curl -X POST http://localhost:4000/api/reports/ingest \
  -F "description=Gas leak still unresolved, elderly residents evacuating, need hazmat team" \
  -F "lat=26.9126" \
  -F "lng=75.7875"
```
Expected: response `incident_id` matches the first call's `incident_id`; `impact_score` rises (people_factor increases, vulnerability_multiplier flips to 1 because "elderly" matches the regex).

### Different category at same coords → should CREATE a new incident
```bash
curl -X POST http://localhost:4000/api/reports/ingest \
  -F "description=Also running low on drinking water bottles at the evac point" \
  -F "lat=26.9125" \
  -F "lng=75.7874"
```
Expected: fresh `incident_id` (category flips to Water/Food, clustering query doesn't match the Safety incident).

### Ingest with image
```bash
curl -X POST http://localhost:4000/api/reports/ingest \
  -F "description=Collapsed wall at school entrance" \
  -F "lat=26.9124" \
  -F "lng=75.7873" \
  -F "image=@./test-assets/wall.jpg"
```

### Mongo sanity check (in `mongosh`)
```js
use sra
db.reports.find().sort({ createdAt: -1 }).limit(5)
db.incidents.find().sort({ last_updated_at: -1 }).limit(5)
db.incidents.getIndexes()   // confirm 2dsphere indexes on location_centroid + sanitized_location
```

---

## 7. Environment & Setup

Copy `backend/.env.example` → `backend/.env` and fill values.

| Variable        | Required | Default              | Notes                                                  |
|-----------------|----------|----------------------|--------------------------------------------------------|
| `PORT`          | no       | `4000`               | HTTP port for Express                                  |
| `NODE_ENV`      | no       | `development`        | Enables morgan dev logging when not `production`       |
| `MONGODB_URI`   | yes      | —                    | e.g. `mongodb://localhost:27017/sra`                   |
| `GEMINI_API_KEY`| yes      | —                    | Google AI Studio key; read lazily on first extraction  |
| `GEMINI_MODEL`  | no       | `gemini-2.5-flash`   | Override to `gemini-flash-latest` / `gemini-2.0-flash` if quota / 404 |

**Install & run**:
```bash
cd backend
npm install
npm run dev            # nodemon, hot reload
# or
npm start              # plain node
```

On boot, `server.js` connects to Mongo first and only then boots Express — a failing `MONGODB_URI` is loud, not silent.

---

## 8. Request Lifecycle

End-to-end journey of a single `POST /api/reports/ingest` call:

```
client
  │  multipart/form-data (description, image?, lat?, lng?, worker_id?)
  ▼
[routes/reports.routes.js]           ── matches POST /api/reports/ingest
  │
  ▼
[middleware/upload.js]                ── multer memoryStorage, 10 MB, image/* only
  │                                     populates req.file.buffer, req.file.mimetype
  ▼
[controllers/reports.controller.js]   ── ingestReport()
  │
  │  1. Validate description (400 if empty)
  │  2. await extractFromReport({ text, imageBuffer, imageMimeType })
  │       └── on failure: Report.create({ status: 'review_required' }) + 202 EARLY RETURN
  │  3. Report.create({ status: 'extracted', extracted_fields, gps_coordinates })
  │  4. await attachReportToIncident(report)
  │       ├── no GPS / bad coords → returns null, status stays 'extracted'
  │       ├── candidate found     → merge + recompute centroid/bounds/people/severity/score
  │       └── no candidate        → createIncidentFromReport (seeds new incident)
  │  5. If incident: report.incident_id = incident._id; status = 'clustered'; save()
  │
  ▼
[errorHandler.js]  ← only reached on thrown exceptions
  │
  ▼
201 JSON { report_id, status, extracted_fields, incident_id, impact_score, score_breakdown }
```

Non-obvious ordering:
- **Extraction happens before persistence.** If Gemini blows up, we persist with `review_required` and bail with 202 — no orphaned `extracted: null` records.
- **Clustering failure is swallowed.** If the `$near` query or `save()` throws, we log and return 201 with `incident_id: null`. The report is still saved in `extracted` state so a coordinator can still see it.
- **Two saves** in the happy path — one for the `extracted` state, then a `.save()` to flip to `clustered` after linking. Worth collapsing to a single write later, but the current shape makes the clustering failure branch simpler.

---

## 9. Error Handling

Three failure surfaces, each handled differently:

| Failure                      | Where caught                      | Response           | Persisted state              |
|------------------------------|-----------------------------------|--------------------|------------------------------|
| Missing `description`        | Controller early return           | `400` JSON error   | Nothing saved                |
| Multer rejects (size/type)   | `errorHandler.js` MulterError arm | `400` JSON error   | Nothing saved                |
| Gemini extraction throws     | Controller try/catch              | `202` manual review| `Report { status: 'review_required' }` |
| Clustering throws            | Controller try/catch (swallowed)  | `201` success      | `Report { status: 'extracted' }`, no incident |
| Mongo connection lost        | Unhandled → `errorHandler.js`     | `500` JSON error   | Depends on when it failed    |
| Uncaught anywhere else       | `next(err)` → `errorHandler.js`   | `500` JSON error   | Depends                      |

The controller's `console.error` calls on Gemini failures deliberately log `err`, `err.stack`, `err.response`, `err.status`, `err.statusText` — this was the scaffolding we used to diagnose the 404 / 429 / model-name mismatches during Stage 2. Don't strip it.

---

## 10. Known Limitations & Next Steps

**Shipped but crude:**
- Vulnerability detection is a regex keyword gate — trivially fooled by phrasing. Replace with NER or a Gemini sub-call on the `summarized_need` text.
- `resource_scarcity` and `historical_pattern` score components are hardcoded to `0`. Theoretical max score is currently `0.85`, not `1.0`.
- No per-field confidence from Gemini. We rely on schema validation + `temperature: 0.2` + graceful degradation. Blueprint §4.1 calls for real per-field confidence — deferred.
- Clustering is a `findOne` + `$near` against the closest candidate. A report near two incidents always joins the nearer one; cross-incident merge isn't handled. Fine for MVP; revisit when density grows.
- `jitterPoint` uses `Math.random()` — fine for privacy posture, not cryptographic. Don't treat sanitized coords as a security primitive.
- No auth / rate limiting / deduplication (`content_hash` from blueprint §3.1 not implemented).

**Wired up but not yet used:**
- `assigned_volunteer_ids`, `assignment_history`, `resolution_proof_refs`, `verification_status`, `escalation_level`, `escalation_history` all exist on the Incident schema but nothing writes to them yet. They're reserved for Stage 4+ (matching pipeline, proof verification, escalation rules).

**Next up (roughly, per blueprint §7):**
1. Coordinator dashboard skeleton — list, heatmap on `sanitized_location`, review queue reading `status: 'review_required'`.
2. Volunteer model + matching pipeline (multi-criteria ranking).
3. Notification service (push first, SMS/WhatsApp later).
4. Wellness Score v1 — hard-exclude overloaded volunteers from matching.
5. Proof verification pipeline (vision check on completion photos).

---

## Cross-check notes (self-verification)

- **`sanitized_location`** — implemented as a **separate GeoJSON Point field** on the Incident, generated by `jitterPoint(lng, lat)` in [clustering.service.js](backend/src/services/clustering.service.js) which offsets both coords by a uniform random value in `[-0.0009, +0.0009]` degrees (~±100 m at equator). Regenerated every time an incident is created OR merged, so the jittered point drifts on each update — intentional, prevents triangulating the true centroid by observing successive snapshots. Indexed with `2dsphere` for heatmap queries.
- **`time_decay`** — linear ramp from 0 → 1 over **6 hours** (not 2 hours — the 2-hour constant is the *clustering temporal window*, a different thing). Formula: `Math.max(0, Math.min(1, ageHours / 6))` where `ageHours = (Date.now() - createdAt) / 3600000`. Uses `incident.created_at` (not report time) during merges so the clock keeps running from first sighting. Contributes `× 0.10` weight to the total.

---

## 11. Stage 4 — Coordinator Read API + NL Assistant

Stage 4 opens the backend for read-side consumers (the dashboard) and adds a natural-language filter endpoint powered by Gemini. No writes, no schema changes.

### New files

```
backend/src/
├── controllers/
│   └── incidents.controller.js   # listOpenIncidents + assistantQuery
├── services/
│   └── assistant.service.js      # Gemini NL → structured filter JSON
└── routes/
    └── incidents.routes.js       # GET / and POST /assistant
```

`app.js` gains `app.use('/api/incidents', incidentsRoutes)`.

### `GET /api/incidents` — list open incidents

Returns every incident whose `status` is in `['reported','triaged','assigned','in_progress','resolved','verified']` (everything except `closed`). Sorted by `impact_score` desc.

**Enrichment**: `Incident` doesn't store `summarized_need` — it lives on the contributing `Report`s. The controller:
1. Loads open incidents.
2. Collects all `contributing_report_ids` into one flat array.
3. Fetches those reports in a single `Report.find({_id: {$in:...}})` call.
4. Builds a `Map<reportId, report>` for O(1) lookup.
5. For each incident, picks the first contributing report and attaches `summarized_need` (fallback chain: `extracted_fields.summarized_need` → `original_text` → `'(no summary available)'`).

**Response**:
```json
{
  "count": 12,
  "incidents": [
    {
      "_id": "...",
      "category": "Safety",
      "severity": 9,
      "estimated_people_affected": 80,
      "impact_score": 0.6123,
      "score_breakdown": { "...": "..." },
      "location_centroid": { "type":"Point", "coordinates":[75.78, 26.91] },
      "sanitized_location": { "type":"Point", "coordinates":[75.7808, 26.9117] },
      "status": "reported",
      "created_at": "...",
      "last_updated_at": "...",
      "contributing_count": 3,
      "summarized_need": "Gas leak near market; evacuate and send hazmat team."
    }
  ]
}
```

The dashboard reads `sanitized_location` (not `location_centroid`) to render pins — privacy-at-read-boundary §6.3.

### `POST /api/incidents/assistant` — NL → filter JSON

**Body**: `{ "query": "Show me high priority safety issues" }`

The service sends the query to Gemini with a strict prompt that forces the response into this shape:
```json
{
  "categories": ["Safety"],
  "min_impact_score": 0.5,
  "keywords": ["gas", "evacuation"],
  "rationale": "Filtering for Safety incidents at or above a 0.5 impact score."
}
```

**Normalization** (`assistant.service.js`):
- `categories` filtered to the 8-value enum (`Health`, `Food`, `Water`, `Shelter`, `Infrastructure`, `Education`, `Safety`, `Other`), others dropped.
- `min_impact_score` coerced to Number, clamped `[0, 1]`; `NaN` → `0`.
- `keywords` lowercased, trimmed, deduped, capped at **5 entries**.
- `rationale` trimmed to a single short sentence.

**Graceful degradation**: any Gemini failure (quota, timeout, parse error) returns **HTTP 200** with a neutral filter and `degraded: true`, so the UI never hard-errors:
```json
{
  "filter": { "categories": [], "min_impact_score": 0, "keywords": [], "rationale": "Assistant unavailable — showing everything." },
  "degraded": true
}
```

The filter is applied **client-side** in `applyAssistantFilter(incidents, filter)` (see §12.3). We deliberately avoid re-querying Mongo — the dataset is small in MVP and the round-trip is unnecessary.

### Model config for the assistant

Reuses `GoogleGenerativeAI` the same way `gemini.service.js` does. Differences:
- `temperature: 0.1` (tighter than extraction's `0.2`).
- `responseMimeType: 'application/json'`.
- Single text part — no images.

---

## 12. Frontend — Coordinator Dashboard (God-View)

### 12.1 Project shape

```
frontend/
├── index.html                   # Inter font preloaded, Leaflet 1.9.4 CSS via unpkg
├── package.json                 # React 18.3, react-leaflet 4.2, leaflet 1.9, lucide-react 0.454, vite 5.4
├── vite.config.js               # port 5173 + proxy /api → http://localhost:4000
└── src/
    ├── main.jsx                 # React 18 root (StrictMode)
    ├── App.jsx                  # State owner: poll, filter, selection
    ├── api.js                   # fetchIncidents + runAssistantQuery
    ├── util.js                  # scoreBand / formatScore / formatRelative / latLngFromIncident / applyAssistantFilter
    ├── styles.css               # Full design system (~750 lines, light theme)
    └── components/
        ├── TopBar.jsx           # Brand + AI search pill + live clock
        ├── CommandMap.jsx       # react-leaflet map + pins + rich popup
        ├── LiveFeed.jsx         # Right-side incident list sorted by urgency
        └── StatsStrip.jsx       # Footer KPIs + top categories
```

Vite dev proxy means frontend code uses **relative** `/api/...` URLs — zero CORS config, zero env-var juggling between dev and prod.

### 12.2 Data flow

```
App.jsx
  │  on mount + every 15s
  │    fetchIncidents() → GET /api/incidents
  │  on submit from TopBar
  │    runAssistantQuery(q) → POST /api/incidents/assistant → { filter }
  │  applyAssistantFilter(incidents, filter) → visibleIncidents (useMemo)
  │
  ├─▶ <TopBar onAssistantSubmit={handleAssistant} assistantState=... />
  │
  ├─▶ conditional <div class="filter-strip">
  │       Sparkles badge "AI Filter"
  │       rationale quote + chips for categories / min_score / keywords
  │       X Clear button → clearFilter()
  │
  ├─▶ <div class="workspace">
  │       <CommandMap incidents={visibleIncidents} selectedId onSelect />
  │       <LiveFeed   incidents={visibleIncidents} selectedId onSelect />
  │       {loadState === 'loading' | 'error'} → <div class="region-overlay"><div class="panel"/>
  │
  └─▶ <StatsStrip incidents={visibleIncidents} totalUnfiltered={incidents.length} />
```

Polling interval constant: `POLL_INTERVAL_MS = 15_000` at the top of `App.jsx`. The poll does **not** reset `loadState` to `loading` on subsequent refreshes — once the feed has landed once, a later transient failure keeps the last-good view rendered and only flips to `error` if the initial fetch never succeeded.

Selection is lifted to App as `selectedId`; both map marker clicks and feed card clicks call `onSelect(id)`, so highlighting is bidirectional.

### 12.3 `util.js` — pure helpers

| Function | Behaviour |
|---|---|
| `scoreBand(score)` | `>= 0.5` → `'crit'`, `>= 0.25` → `'warn'`, else `'nominal'`. Single source of truth for urgency coloring. |
| `formatScore(n)` | `Number(n).toFixed(2)` with NaN guard. |
| `formatRelative(iso)` | `Xs/Xm/Xh/Xd ago`, clamped at `>30d ago`. |
| `latLngFromIncident(inc)` | Reads `sanitized_location.coordinates` first (privacy posture), falls back to `location_centroid.coordinates`. GeoJSON is `[lng, lat]`; returns a Leaflet `[lat, lng]` pair. Returns `null` if neither shape is present. |
| `applyAssistantFilter(incidents, filter)` | No filter → returns input. Otherwise intersects: (a) category membership via `Set(filter.categories)`, (b) `impact_score >= min_impact_score`, (c) every keyword appears as substring in `(summarized_need + ' ' + category).toLowerCase()`. |

Everything is pure — no React, no fetch, trivially unit-testable.

### 12.4 Styling — Phase 3 re-skin

The dashboard was built first in a dark "situation room" palette, then **fully re-skinned** in Phase 3 per explicit instruction to look like "Uber for Business / high-end logistics platform". The dark version is gone — `styles.css` only contains the light theme.

**Design tokens** (top of `styles.css`):

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#f9fafb` | App background |
| `--surface` | `#ffffff` | Cards, topbar, popups |
| `--surface-alt` | `#f8fafc` | Popup inner panels, hover rows |
| `--border` / `--border-strong` | `#e2e8f0` / `#cbd5e1` | Card borders, input rings |
| `--divider` | `#f1f5f9` | Thin separators between feed cards |
| `--text` / `--text-2` / `--text-3` / `--text-4` | `#0f172a` / `#334155` / `#64748b` / `#94a3b8` | Slate-900 → slate-400 ramp |
| `--primary` / `--primary-700` / `--primary-50` / `--primary-100` | `#4f46e5` / `#4338ca` / `#eef2ff` / `#e0e7ff` | Indigo-600 accent + tint system |
| `--critical` | `#dc2626` (+ `-50` `#fef2f2`, `-100` `#fee2e2`) | `crit` band |
| `--elevated` | `#d97706` (+ `-50`, `-100`) | `warn` band |
| `--nominal` | `#16a34a` (+ `-50`, `-100`) | `nominal` band + live pulse |
| `--r-sm..2xl` | `6 / 10 / 14 / 16 / 20 px` | Radius scale (rounded-xl = `--r-xl`) |
| `--shadow-xs..pop` | layered rgba slate shadows | Card elevation |
| `--font` | `'Inter', ui-sans-serif, system-ui, ...` | Body + display; `font-feature-settings: 'cv11','ss01','ss03'` plus tabular numerics for metrics |

**Layout** — `.app` is `flex-direction: column; height: 100vh`. Children: `.topbar` (64px) → optional `.filter-strip` → `.workspace` (`flex: 1 1 auto`) → `.stats-strip`.

`.workspace` is `display: grid; grid-template-columns: minmax(0,1fr) 400px; gap: 20px; padding: 20px 24px 24px; position: relative` — the `position: relative` anchors the `.region-overlay` loading/error state. Responsive `@max-width: 1100px` collapses to a single column and the feed goes underneath the map.

All first-level panels share the `.card` class — `background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-xl); box-shadow: var(--shadow-sm); overflow: hidden;`.

### 12.5 `TopBar.jsx`

- `grid-template-columns: 1fr minmax(420px,640px) 1fr` so the search pill is always centered regardless of brand/clock width.
- **Brand mark** is a 36px indigo gradient square containing an inline shield-with-check SVG (paths `M12 2L4 6...` + `M9 12l2 2 4-4`) — no raster logo. Beside it: `"SRA Coordinator"` (600, `var(--text)`) over `"Smart Resource Allocation"` (10px uppercase tracking, `--text-3`).
- **AI search pill** — a `<form role="search">` with a lucide `Search` icon, the input, a `<kbd>↵</kbd>` hint, and an indigo submit button. Focus lifts the form with a 4px `--primary-50` ring.
- Submit button shows `<Sparkles/> Ask AI` in idle, swaps to `<spinner/> Parsing` when `assistantState === 'loading'`, and is `disabled` during the request. The spinner inline style uses `borderColor: rgba(255,255,255,0.35)` + `borderTopColor: white` — an earlier draft had a duplicate `borderTopColor` key that tripped the build, fixed.
- `useClock()` is a local hook: `setInterval(() => setNow(new Date()), 1000)` inside a `useEffect` with cleanup. Formatted with `formatClock(d)` → `HH:MM` padded.
- **Status pill** — `.status-pill` is a nominal-tinted rounded-full chip with a 6px solid-green dot that pulses via a keyframe animation (radial opacity 1 → 0.4). Says `Live`.

### 12.6 `CommandMap.jsx`

- `<MapContainer center={[20, 78]} zoom={4} scrollWheelZoom worldCopyJump>` — India-centered default view.
- **Single TileLayer**: CartoDB Positron (`https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`, subdomains `abcd`, maxZoom 19). The dark variant from Phase 1 is gone.
- **Pin icons** are built once via `L.divIcon` with `html: '<div class="pin ${band}"><div class="core"></div></div>'` (18×18, anchored center). The three icons live in a top-level `ICONS` map keyed by band. CSS draws `.pin .core` as a 14px filled circle with a 2.5px white halo + drop shadow; `.pin.crit::before` adds an expanding pulse ring so critical incidents visibly throb.
- **`FitToMarkers`** is a no-render helper that grabs `useMap()` and calls `map.fitBounds(L.latLngBounds(points), { padding:[60,60], maxZoom:13 })` inside a `useMemo` keyed off a stringified point list. The effect re-runs whenever the visible set changes (e.g., after an AI filter applies).
- **Popup** is an information-dense card (`.popup`):
  - `head` row: `cat-badge` pill + relative timestamp from `formatRelative`.
  - `need` paragraph with the summarized need.
  - `score-headline` panel on `--surface-alt` with a 30px tabular score number (colored by band) and a two-line label (`Impact Score` / `composite · 0–1`).
  - `meta-row` 2x2 grid of tiles: Severity (`/10`), People affected, Source reports, Status (capitalized).
  - `breakdown-h` + `<BreakdownBars>` showing the six score components.
- **`BreakdownBars`** iterates `BREAKDOWN_ROWS` (`severity`, `people_factor`, `vulnerability_multiplier`, `time_decay`, `resource_scarcity`, `historical_pattern`). For each row it reads `raw = breakdown[row.key]`, the weight from `breakdown.weights[row.weightKey]`, computes `contribution = raw * w`, draws a `.track` + `.fill` bar at `raw * 100%` width, and prints the weighted contribution to 2 decimals on the right. Per-dimension CSS classes color the fill: severity red, people amber, vuln purple (`#a855f7`), decay green, scarcity sky (`#0ea5e9`), history slate-400. This is the end-user surface for the "Why this score?" explainability requirement.
- `.map-head` shows `<MapIcon/>` in a red icon-bubble, `Field Overview` title, `{n} pinned incidents` subtitle, and an inline legend with Critical/Elevated/Routine color dots.

### 12.7 `LiveFeed.jsx`

- `.feed-region.card` right column, fixed 400px wide on desktop.
- `.feed-header` — red icon-bubble with `<Radio/>`, `Live Feed` title, `Sorted by urgency` subtitle, count pill on the right.
- Sorts a copy of `incidents` by `impact_score` desc before rendering (non-mutating; original prop untouched).
- **`IncidentCard`** is a `<button>` (keyboard accessible):
  - `top-line` has the urgency badge and the 2-decimal score number.
  - Urgency badge = `.urgency-badge.${band}` — colored dot + text label `Critical / Elevated / Routine` mapped via `URGENCY_LABEL`. Bg/border tinted per band (`--critical-50`, etc.).
  - `need` paragraph is clamped to 2 lines via `-webkit-line-clamp: 2`.
  - `meta` row: category tag + lucide icon pairs for People (`Users`), Reports (`FileText`), Relative time (`Clock`).
  - Active card (`selectedId === inc._id`) gets a `--primary-50` background and a 3px indigo left rail.
- **Empty state**: an `<Inbox/>` icon in a slate tile + `"No incidents match the current view."` — fires whenever `sorted.length === 0`, which is the dominant state while an AI filter is narrow.

### 12.8 `StatsStrip.jsx`

Footer row with six KPI cards + a trailing legend slot, all glued together in a single pass over `incidents`:
- Single `for` loop tallies `critical / elevated / routine` via `scoreBand`, sums `people` from `estimated_people_affected`, `reports` from `contributing_count`, and builds a `Map<category, count>`.
- Stats rendered: **In view** (`{n} / {total} total`), **Critical**, **Elevated**, **Routine**, **People affected** (`toLocaleString()`), **Source reports**. Each stat card uses an `icon-dot` colored per variant (`crit / warn / nominal`) and a tabular number.
- **Top categories** panel: first 4 entries from the category Map with indigo dots — gives at-a-glance category distribution without a chart.

### 12.9 `App.jsx` — state owner

- Six `useState`s: `incidents`, `loadState` (`loading|ready|error`), `errorMsg`, `selectedId`, `filter`, `filterQuery`, `assistantState` (`idle|loading|error`).
- `refresh = useCallback(async () => ...)` — fetches, sets `ready` on success; on error it **only** flips to `error` if the prior state wasn't already `ready` (otherwise the UI stays on last-good data). `useEffect` fires once on mount then every 15s via `setInterval`, cleanup on unmount.
- `handleAssistant(query)` — sets `assistantState: 'loading'`, calls `runAssistantQuery`, stores `res.filter` + `query` on success. On failure, flips to `error` briefly and auto-resets to `idle` after 1500ms so the button stops spinning.
- `clearFilter()` zeroes both `filter` and `filterQuery`.
- `visibleIncidents = useMemo(() => applyAssistantFilter(incidents, filter), [incidents, filter])` — only thing the three child components see.
- **Filter strip** (rendered only when `filter` exists): `<Sparkles/> AI Filter` badge, the raw query in quotes, the rationale after an em-dash, then `.chip` pills for each category, an optional `score ≥ X.XX` chip when `min_impact_score > 0`, keyword chips, and a `<X/> Clear` button.
- **Overlays**: `.region-overlay` renders inside `.workspace` (absolute, full-area, `backdrop-filter: blur`) for both `loading` and `error` states. The error panel shows the last `errorMsg`.

### 12.10 Gotchas / things that bit us

- **Grid row collapse** — the early Phase 1 layout used `display: grid` on `.app` with no explicit row height, causing the map and feed to collapse to 0 inside `.workspace`. Fix: `.app { display: flex; flex-direction: column; height: 100vh; }` + `.workspace { flex: 1 1 auto; }`. Also fixed a related bug where adding the conditional `.filter-strip` broke implicit grid row counts — flex column sidesteps it entirely.
- **Duplicate inline style key** — the TopBar spinner had `{ borderTopColor: 'white', borderColor: '...', borderTopColor: 'white' }`. The build warned; the second key won anyway, but it's now written once with a clean `{ borderColor, borderTopColor }` shape.
- **GeoJSON order** (again) — `latLngFromIncident` returns `[lat, lng]` for Leaflet but Mongo stores `[lng, lat]`. `util.js` does the flip so components can pass the result straight into `<Marker position={...}>`.
- **`useMemo` in `FitToMarkers`** — using `useEffect` with a deep-equal point array as a dep would refit on every render. Stringifying the points list into a single primitive key (`points.map(p => p.join(',')).join('|')`) makes the dep cheap and stable.
- **No visual verification from the agent environment** — final build reported `316.85 KB JS / 18.53 KB CSS (96.88 KB gzipped)` with zero warnings. To inspect the UI, run `cd backend && npm run dev` + `cd frontend && npm run dev`, then open `http://localhost:5173`.

---

## 13. Running the full stack locally

Two terminals:

```bash
# Terminal 1 — backend
cd backend
npm install
npm run dev          # nodemon, http://localhost:4000

# Terminal 2 — frontend
cd frontend
npm install
npm run dev          # vite, http://localhost:5173
```

The Vite dev server proxies `/api/*` to `http://localhost:4000`, so there is no CORS setup and no env var to point the frontend at the backend in dev. Seed some reports via the `curl` snippets in §6 before opening the dashboard — otherwise the map and feed will sit in the empty-state UIs.
