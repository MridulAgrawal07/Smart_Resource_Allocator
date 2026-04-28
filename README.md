# 🚨 The Smart Resource Allocator (SRA)

> **The nervous system for grassroots emergency response — bridging the chaos of the field with the clarity of the command center.**

[![Status](https://img.shields.io/badge/status-MVP%20In%20Development-orange)](#)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](#)
[![Frontend](https://img.shields.io/badge/frontend-React%2018-61DAFB?logo=react)](#)
[![Backend](https://img.shields.io/badge/backend-Node.js%20%7C%20Express-339933?logo=node.js)](#)
[![Database](https://img.shields.io/badge/database-MongoDB%20Atlas-47A248?logo=mongodb)](#)
[![Build](https://img.shields.io/badge/build-Vite-646CFF?logo=vite)](#)
[![Team](https://img.shields.io/badge/team-VAMOS-purple)](#)

---

## 📖 About The Project

In emergency response, the bottleneck is rarely goodwill — it is **coordination**. Critical observations from the field get lost in WhatsApp threads, paper notes, and unstructured voice memos, while coordinators drown in noise and volunteers wait idle.

**The Smart Resource Allocator (SRA)** is an AI-ready emergency incident management system designed to dissolve that bottleneck. It is the connective tissue between the chaotic, low-bandwidth reality of the ground and the structured, decisive workflow of a centralized command center — ensuring that every reported incident is **captured, verified, prioritized, and dispatched** with precision.

SRA is not just another dashboard or task-list app. It is a **coordination fabric** built for real conditions: shaky GPS, manual address scribbles, hands-free voice reports, and admins who need to trust their data before they act on it.

---

## ✨ Key Features

### 🛰️ Command Center Dashboard
A fully responsive operations cockpit with seamless **Dark / Light mode** switching, a chronologically sorted **Live Feed** of incoming verified incidents, and **interactive threat-level stat cards** that filter the feed in real time by severity.

### 🗺️ Interactive Geographic Map
Built on **Leaflet** and **React-Leaflet**, the map visualizes the entire operational picture — clustering **unassigned vs. assigned incidents** with color-coded markers, enabling coordinators to identify hotspots and dispatch volunteers spatially.

### 📍 Hybrid Location Engine
A field portal that respects ground reality. Reporters can **tag location via native GPS** with one tap, OR fall back to **manual address entry** powered by **OpenStreetMap Nominatim Geocoding** when satellites or signal fail. No incident gets lost because of a bad fix.

### 🎙️ Audio Incident Reports
Hands-free voice reporting using the browser's native **MediaRecorder API**. Includes a stunning real-time **"moving slabs" audio visualizer** built with the **Web Audio API**, and **Base64 local prototype storage** for instant playback in the admin verification queue.

### ✅ Admin Verification Workflow
A dedicated **approvals queue** ensures no field data hits the Live Feed unverified. Coordinators see **global state notification badges** the moment a new report arrives, can review media + metadata, and approve or reject with a single click.

---

## 🛠️ Tech Stack

### Frontend
- **React 18** — Component-driven UI
- **Vite 5** — Lightning-fast dev server and build tool
- **React Router DOM 7** — Client-side routing
- **Leaflet & React-Leaflet** — Interactive geographic maps
- **Lucide React** — Icon system
- **React Resizable Panels** — Adaptive dashboard layout
- **Tailwind-style utility CSS** — Responsive Dark/Light theming

### Backend
- **Node.js + Express 4** — REST API server
- **MongoDB Atlas + Mongoose 8** — Cloud-native operational data store
- **Multer** — Multipart media upload handling
- **CORS, Morgan, dotenv** — Standard middleware
- **@google/generative-ai** — AI pipeline integration scaffold (for upcoming NLP features)
- **Nodemon** — Hot-reload development

### Browser APIs
- **MediaRecorder API** — Native audio capture
- **Web Audio API** — Real-time waveform visualization
- **Geolocation API** — Native GPS tagging

---

## 📋 Prerequisites

Before you begin, ensure you have:

- **Node.js** v18.x or higher → [Download](https://nodejs.org/)
- **npm** v9+ (ships with Node.js)
- A **MongoDB Atlas** cluster (free tier works) → [Get one here](https://www.mongodb.com/cloud/atlas)
- A modern browser (Chrome / Edge / Firefox) for MediaRecorder + Geolocation support

---

## 🚀 Installation & Setup

### 1. Clone the Repository

```bash
git clone https://github.com/Team-VAMOS/Smart_Resource_Allocator.git
cd Smart_Resource_Allocator
```

### 2. Install Backend Dependencies

```bash
cd backend
npm install
```

### 3. Install Frontend Dependencies

```bash
cd ../frontend
npm install
```

### 4. Configure Environment Variables

Create a `.env` file inside the `backend/` directory:

```env
# backend/.env
PORT=5000
MONGO_URI=your_mongodb_atlas_connection_string_here
NODE_ENV=development
```

> 💡 Make sure your MongoDB Atlas cluster has the current IP whitelisted (or `0.0.0.0/0` for development).

If your frontend needs to point to a non-default backend URL, create a `.env` inside `frontend/`:

```env
# frontend/.env
VITE_API_URL=http://localhost:5000
```

---

## 🧑‍💻 Usage

### Start the Backend Dev Server

From the `backend/` directory:

```bash
npm run dev
```

The API will be live on `http://localhost:5000`.

### Start the Frontend Dev Server

In a **separate terminal**, from the `frontend/` directory:

```bash
npm run dev
```

The dashboard will open at `http://localhost:5173` (Vite's default).

### 🌱 Seed Dummy Data

To populate your database with realistic dummy incidents, volunteers, and verification samples for testing the full workflow, run the seed script from the `backend/` directory:

```bash
npm run seed
```

> *Equivalent to running `node seed.js` directly. This will clear and re-populate the relevant collections — do not run on a production database.*

You should now see a fully populated Live Feed, populated map markers, and an active approvals queue when you load the dashboard.

---

## 🛣️ Future Roadmap

SRA's MVP delivers the spine end-to-end. The following innovations are next on deck — each carefully designed to deepen the system's intelligence without compromising its ethical posture.

### 🧠 AI-Powered Audio Processing
Implementing a full **NLP engine** that automatically **listens to, transcribes, and extracts actionable data** from field voice notes. The pipeline will auto-fill incident reports with structured fields (category, urgency, people affected, location, resource needs) — turning a 30-second voice memo into a fully-formed, ready-to-dispatch incident with per-field confidence scores.

### 🏆 Volunteer Reputation System
A dynamic **gamification and reliability score** that rewards the responsive and gently disincentivizes the unreliable:
- ✅ Volunteers **earn points** for successfully completing deployed jobs (with geo-verified check-in and AI proof verification).
- ⚠️ Volunteers **lose points** if they mark themselves *"available on standby"* and then **fail to respond** to site assignments.
- 📊 Reputation feeds directly into the matching pipeline, so the system learns who actually shows up.

### 🌐 AI-Driven Geospatial Clustering for Optimized Dispatch
Moving beyond simple radius-based grouping to **vector-embedding clustering** that fuses spatial, temporal, and semantic similarity. Five reports of the same flood from five workers collapse into one logical incident with corroboration scoring — and dispatch routes are optimized across multiple incidents in a single zone for maximum volunteer efficiency.

---

## 👥 Team VAMOS

SRA is built by **Team VAMOS** — a multidisciplinary squad obsessed with closing the gap between *a need observed* and *a hand offered*.

> *"Vamos"* — Spanish for *"let's go."* It's both our name and our mandate. Emergencies don't wait. Neither do we.

We believe that the highest-leverage problem in social impact today is not effort or empathy — it is **coordination**. Every line of SRA exists to compress the time between signal and action, ethically and resiliently, even when the internet doesn't.

---

## 📜 License

This project is released under the MIT License.

---

<p align="center">
  <strong>Built with ⚡ by Team VAMOS</strong><br/>
  <em>From chaos to coordination, in under two hours.</em>
</p>
