# 🚨 Smart Resource Allocator (SRA)

> **The AI-powered coordination fabric for grassroots humanitarian response — compressing the time between a field observation and a qualified volunteer on-site from days to under two hours.**

<div align="center">

[![Live Demo](https://img.shields.io/badge/🌐%20Live%20Demo-Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://smart-resource-allocator-sra.web.app)
[![Backend API](https://img.shields.io/badge/⚙️%20Backend%20API-Cloud%20Run-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white)](https://smart-resource-allocator-775785844877.europe-west1.run.app/health)

[![React](https://img.shields.io/badge/React%2018-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite%205-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express%204-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com)
[![MongoDB](https://img.shields.io/badge/MongoDB%20Atlas-47A248?style=flat-square&logo=mongodb&logoColor=white)](https://www.mongodb.com/atlas)
[![Gemini](https://img.shields.io/badge/Gemini%202.5%20Flash-8E75B2?style=flat-square&logo=google&logoColor=white)](https://deepmind.google/technologies/gemini/)
[![Firebase](https://img.shields.io/badge/Firebase%20Hosting-FFCA28?style=flat-square&logo=firebase&logoColor=black)](https://firebase.google.com)
[![Cloud Run](https://img.shields.io/badge/Cloud%20Run-4285F4?style=flat-square&logo=googlecloud&logoColor=white)](https://cloud.google.com/run)

</div>

---

## 🔗 Live Deployment

| Service | URL |
|---|---|
| **Coordinator Dashboard** | [smart-resource-allocator-sra.web.app](https://smart-resource-allocator-sra.web.app) |
| **Backend Health Check** | [.../health](https://smart-resource-allocator-775785844877.europe-west1.run.app/health) |

---

## 🌍 The Problem

Local NGOs and disaster-response groups collect critical field data through paper surveys, voice notes, and WhatsApp messages. This data is:

- **Scattered** — across notebooks, phones, and group chats
- **Unstructured** — impossible to aggregate or prioritize at scale
- **Disconnected from action** — coordinators drown in noise while trained volunteers sit idle

**The bottleneck is not goodwill. It is coordination.**

## ✅ The Solution

SRA compresses a multi-day, error-prone, manual workflow into a **continuous, AI-accelerated pipeline**:

```
Field Observation → AI Extraction → Smart Deduplication → Impact Scoring → Volunteer Match → Geo-Verified Completion
```

Every stage is observable, auditable, and designed to operate ethically even when the data is messy, the internet is slow, and the stakes are high.

---

## ✨ Core Features

### 🤖 Real-Time AI Extraction (Google Gemini 2.5 Flash)
Multimodal field reports (text + images) are processed by Gemini to produce structured JSON: category, urgency score, estimated people affected, and a plain-language summarized need — each with a confidence score. Low-confidence extractions are held for coordinator review rather than auto-processed.

### 🧠 Smart Incident Deduplication (Embeddings + Atlas Vector Search)
Five field workers reporting the same flood should not create five tasks. The clustering pipeline generates 3072-dimension semantic embeddings and runs a three-tier similarity search:
1. **Category + Cosine similarity** — validates same-category candidates using local cosine ranking against a pool of nearby incidents (`threshold: 0.82`)
2. **Cross-category Atlas Vector Search** — catches reports where Gemini assigns different labels to the same real-world event (`threshold: 0.92`)
3. **Unvalidated geographic fallback** — for environments without Atlas Vector Search

Matching reports are merged into a single logical incident. Diverging reports spin up a new one.

### 🏛️ Civic Trust Architecture (Moderation Queue)
SRA implements a two-tier ingestion model to separate **signal capture from AI cost**:

- **Raw ingest** (`POST /api/reports/ingest`) — saves the report immediately, returns `202`. Zero AI spend.
- **Coordinator approval** (`POST /api/reports/:id/approve`) — triggers Gemini extraction, embedding generation, and clustering **only for approved reports**.

This prevents spam from burning API budget and gives coordinators a human checkpoint before unverified field data enters the live operational picture. The Pending Approvals inbox in the Coordinator Dashboard is the moderation interface.

### 📍 Geo-Verified Accountability (Volunteer Check-In)
Volunteer task completion is a two-step, tamper-resistant process:

1. **Geo-Verified Check-In** — the volunteer's browser GPS coordinates are verified by the backend using the Haversine formula against the incident's stored coordinates. Must be within 200m. Records arrival in `checked_in_volunteer_ids`.
2. **Mark Mission Complete** — any on-site volunteer can resolve the incident. The backend applies **Smart Cleanup**: volunteers in `checked_in_volunteer_ids` receive credit (`total_resolved++`); volunteers who were assigned but never arrived are freed without credit. All assigned volunteers are returned to `available` status.

### 🔥 Impact Scoring Engine
Every incident receives a composite Impact Score computed from six weighted components:

| Component | Source |
|---|---|
| Severity | AI urgency score (1–10) |
| People Affected | Logarithmically scaled head count |
| Vulnerability Multiplier | Keywords: children, elderly, disabled |
| Time Decay | Escalates unaddressed incidents over time |
| Resource Scarcity | Low-inventory resource types |
| Historical Pattern | Recurring area/category combinations |

The full score breakdown is returned with every incident for coordinator transparency.

### 🗺️ Three-Portal Architecture
| Portal | Audience | Key Capability |
|---|---|---|
| **Coordinator Dashboard** | NGO program managers | Heatmap, moderation inbox, AI assistant, live feed |
| **Field Portal** | Field workers | Multimodal report submission (text, image, audio), GPS tagging |
| **Volunteer Portal** | Community volunteers | Roster view, mission briefing, geo-verified check-in, task completion |

---

## 🛠️ Tech Stack

### Frontend
| Technology | Role |
|---|---|
| React 18 + Vite 5 | UI framework and build tooling |
| React Router v7 | Multi-portal routing (Dashboard / Field / Volunteer) |
| React Leaflet + OpenStreetMap | Interactive incident heatmap |
| react-resizable-panels | Draggable split-pane dashboard layout |
| lucide-react | Icon system |

### Backend
| Technology | Role |
|---|---|
| Node.js + Express 4 | REST API server |
| Mongoose 8 | MongoDB ODM and schema enforcement |
| Multer | Multipart form / image upload handling |
| Morgan | HTTP request logging |

### Database
| Technology | Role |
|---|---|
| MongoDB Atlas | Primary data store (reports, incidents, volunteers) |
| Atlas Vector Search | Semantic incident clustering (`incident_semantic_search` index) |
| 2dsphere indexes | Geospatial proximity queries for clustering and volunteer matching |

### AI / ML
| Technology | Role |
|---|---|
| Gemini 2.5 Flash (`gemini-2.5-flash`) | Multimodal extraction — text + image → structured JSON |
| Gemini Embeddings (`gemini-embedding-001`) | 3072-dim semantic vectors for incident clustering |
| `@google/generative-ai` SDK | Unified client for both model families |

### Deployment
| Service | What it hosts |
|---|---|
| Firebase Hosting | Vite production build (`/dist`) with SPA rewrites |
| Google Cloud Run | Node.js backend (stateless, auto-scaling) |

---

## 🚀 Local Development Setup

### Prerequisites
- Node.js 18+
- A [MongoDB Atlas](https://cloud.mongodb.com) cluster with a **Vector Search index** named `incident_semantic_search` on the `incidents` collection (field: `embedding`, dimensions: `3072`, similarity: `cosine`)
- A [Google AI Studio](https://aistudio.google.com) API key with access to Gemini 2.5 Flash and Gemini Embeddings

### 1. Clone the repository

```bash
git clone https://github.com/<your-handle>/smart-resource-allocator.git
cd smart-resource-allocator
```

### 2. Backend setup

```bash
cd backend
npm install
```

Create `backend/.env`:

```env
# ── Required ─────────────────────────────────────────────────────
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/sra?retryWrites=true&w=majority
GEMINI_API_KEY=your_google_ai_studio_key_here

# ── Optional (defaults shown) ─────────────────────────────────────
PORT=4000
NODE_ENV=development
GEMINI_MODEL=gemini-2.5-flash
```

Start the backend:

```bash
npm run dev        # nodemon — auto-restarts on save
# or
npm start          # plain Node
```

The API will be live at `http://localhost:4000`. Verify with:

```bash
curl http://localhost:4000/health
# → { "status": "ok", "service": "sra-backend" }
```

Seed sample data (Jaipur test dataset):

```bash
curl -X POST http://localhost:4000/api/admin/seed-all
```

### 3. Frontend setup

```bash
cd frontend
npm install
```

The frontend uses Vite's dev proxy to forward `/api` requests to `localhost:4000` — **no `.env` file is needed for local development**.

Start the frontend:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

> **Routing:** `/` → Coordinator Dashboard · `/field` → Field Portal · `/volunteer` → Volunteer Portal

### 4. Production build (optional)

Create `frontend/.env.production`:

```env
VITE_API_BASE_URL=https://your-cloud-run-backend-url.run.app
```

Then:

```bash
npm run build      # outputs to frontend/dist/
```

---

## 🗂️ Repository Structure

```
smart-resource-allocator/
├── backend/
│   ├── src/
│   │   ├── app.js                    # Express app, routes, middleware wiring
│   │   ├── server.js                 # HTTP server entry point
│   │   ├── config/
│   │   │   ├── db.js                 # MongoDB Atlas connection
│   │   │   └── env.js                # Environment variable validation
│   │   ├── controllers/
│   │   │   ├── incidents.controller.js   # List incidents, AI assistant query
│   │   │   ├── reports.controller.js     # Ingest, approve, reject, pending queue
│   │   │   └── volunteers.controller.js  # Roster, matching, assignment, geo check-in
│   │   ├── models/
│   │   │   ├── Incident.js           # Clustered event with impact score + geo index
│   │   │   ├── Report.js             # Raw field submission with approval status
│   │   │   └── Volunteer.js          # Profile, wellness score, active assignments
│   │   ├── routes/
│   │   │   ├── incidents.routes.js
│   │   │   ├── reports.routes.js
│   │   │   └── volunteers.routes.js
│   │   ├── services/
│   │   │   ├── gemini.service.js     # Extraction (multimodal) + embedding generation
│   │   │   ├── clustering.service.js # 3-tier incident deduplication pipeline
│   │   │   ├── scoring.service.js    # Composite impact score formula
│   │   │   ├── matching.service.js   # Multi-criteria volunteer ↔ incident ranking
│   │   │   └── assistant.service.js  # Natural-language coordinator query interface
│   │   └── scripts/
│   │       └── seedCity.js           # Jaipur test dataset (incidents + volunteers)
│   ├── .env                          # Secrets — never committed
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── api.js                    # All fetch calls — single source of truth for BASE URL
│   │   ├── App.jsx                   # Coordinator Dashboard (map + live feed + approvals)
│   │   ├── main.jsx                  # React root + router setup
│   │   ├── util.js                   # scoreBand, formatScore, formatRelative, applyFilter
│   │   ├── styles.css                # Global design system (CSS variables, all component styles)
│   │   ├── components/
│   │   │   ├── CommandMap.jsx        # Leaflet heatmap with incident popups + assignment
│   │   │   ├── LiveFeed.jsx          # Real-time scrollable incident list
│   │   │   ├── PendingApprovals.jsx  # Moderation inbox (backend + audio reports)
│   │   │   ├── TopBar.jsx            # AI assistant search bar
│   │   │   ├── StatsStrip.jsx        # Aggregate KPI footer
│   │   │   ├── StatusCapsule.jsx     # Backend connectivity indicator
│   │   │   ├── AudioVisualizer.jsx   # Waveform display for audio field reports
│   │   │   ├── PortalNav.jsx         # Cross-portal navigation
│   │   │   └── Toast.jsx             # Non-blocking notification system
│   │   ├── context/
│   │   │   └── ThemeContext.jsx      # Dark / light mode provider
│   │   └── pages/
│   │       ├── FieldPortal.jsx       # Report capture (text, image, audio + GPS)
│   │       └── VolunteerPortal.jsx   # Roster → mission briefing → geo check-in flow
│   ├── .env.production               # VITE_API_BASE_URL for Cloud Run (committed, no secrets)
│   ├── firebase.json                 # Firebase Hosting config (SPA rewrite rule)
│   ├── .firebaserc                   # Firebase project binding
│   └── package.json
│
└── README.md
```

---

## 🔌 API Reference (Key Endpoints)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Service health check |
| `GET` | `/api/incidents` | All active incidents (enriched, with impact scores) |
| `POST` | `/api/incidents/assistant` | Natural-language query over operational data |
| `POST` | `/api/reports/ingest` | Submit a field report (raw, pending moderation) |
| `GET` | `/api/reports/pending` | Fetch all unreviewed reports |
| `POST` | `/api/reports/:id/approve` | Approve → triggers Gemini extraction + clustering |
| `POST` | `/api/reports/:id/reject` | Reject and discard a report |
| `GET` | `/api/volunteers` | All volunteers (enriched with active incident details) |
| `GET` | `/api/incidents/:id/matches` | Ranked volunteer candidates for an incident |
| `POST` | `/api/incidents/:id/confirm-assignment` | Assign volunteer(s) to an incident |
| `POST` | `/api/volunteers/checkin` | Geo-verify volunteer arrival (step 1) |
| `POST` | `/api/volunteers/complete-task` | Resolve incident + smart volunteer cleanup (step 2) |
| `POST` | `/api/admin/seed-all` | Seed full Jaipur test dataset |

---

## 🏗️ Architecture Flow

```
Field Worker                Coordinator                   Volunteer
     │                          │                              │
     ▼                          │                              │
POST /ingest ──────────► Pending Queue ──────────────────────►│
(202, raw saved)           (zero AI cost)                      │
                               │                              │
                          [Approve]                            │
                               │                              │
                               ▼                              │
                    Gemini Extraction                          │
                    + Embedding (3072d)                        │
                    + Clustering Pipeline ────────────────────►│
                         │        │                            │
                    [New Incident] [Merged]                    │
                         │                                     │
                    Impact Scoring                             │
                    Matching Service ───────────── Assignment ►│
                                                               │
                                                  [Geo Check-In: 200m]
                                                  checked_in_volunteer_ids
                                                               │
                                                  [Mark Complete]
                                                  ► Incident: resolved
                                                  ► Heroes: total_resolved++
                                                  ► Latecomers: freed, no credit
```

---

## 🤝 Contributing

This project was built as a hackathon submission. Issues and pull requests are welcome.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes
4. Open a pull request

---

## 📄 License

MIT © 2026 Smart Resource Allocator Contributors
