const Report = require('../models/Report');
const { extractFromReport, generateEmbedding } = require('../services/gemini.service');
const { attachReportToIncident } = require('../services/clustering.service');

// ── POST /api/reports/ingest ──────────────────────────────────────
// Saves raw report only — no AI processing. Returns 202 immediately.
// Coordinator must approve before Gemini extraction + clustering fire.
async function ingestReport(req, res, next) {
  try {
    const { description, worker_id, lat, lng, submitted_at } = req.body;

    if (!description || !description.trim()) {
      return res.status(400).json({ error: "Field 'description' is required" });
    }

    const file = req.file || null;

    const report = await Report.create({
      worker_id: worker_id || 'anonymous',
      original_text: description,
      media_refs: file
        ? [{ filename: file.originalname, mimetype: file.mimetype, size: file.size }]
        : [],
      gps_coordinates: lat && lng ? { lat: Number(lat), lng: Number(lng) } : undefined,
      status: 'queued',
      approvalStatus: 'pending',
      submitted_at: submitted_at ? new Date(submitted_at) : new Date(),
    });

    return res.status(202).json({
      message: 'Report received and queued for coordinator review.',
      report_id: report._id,
      status: report.status,
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/reports/pending ──────────────────────────────────────
async function getPendingReports(req, res, next) {
  try {
    const reports = await Report.find({ approvalStatus: 'pending' }).sort({ submitted_at: 1 });
    return res.json({ reports, total: reports.length });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/reports/:id/approve ─────────────────────────────────
// Runs Gemini extraction + embedding + clustering for the first time.
async function approveReport(req, res, next) {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    if (report.approvalStatus !== 'pending') {
      return res.status(400).json({ error: `Report is already ${report.approvalStatus}` });
    }

    let extracted;
    try {
      // Image buffer is not persisted from ingest — text-only extraction on approval.
      extracted = await extractFromReport({
        text: report.original_text,
        imageBuffer: null,
        imageMimeType: null,
      });
    } catch (aiErr) {
      console.error('[approve] Gemini extraction failed:', aiErr.message);
      return res.status(502).json({ error: 'AI extraction failed — try again or reject manually.' });
    }

    let embedding = null;
    try {
      const embText = `${extracted.category}: ${extracted.summarized_need}`;
      embedding = await generateEmbedding(embText);
      console.log(`[approve] generated ${embedding.length}-dim embedding`);
    } catch (embErr) {
      console.warn('[approve] embedding failed — clustering will use category fallback:', embErr.message);
    }

    report.extracted_fields = extracted;
    report.status = 'extracted';
    report.approvalStatus = 'approved';
    if (embedding) report.embedding = embedding;
    await report.save();

    let incident = null;
    try {
      incident = await attachReportToIncident(report, embedding);
      if (incident) {
        report.incident_id = incident._id;
        report.status = 'clustered';
        await report.save();
      }
    } catch (clusterErr) {
      console.error('[approve] clustering failed — report approved without incident link:', clusterErr.message);
    }

    return res.json({
      message: 'Report approved and processed',
      report_id: report._id,
      status: report.status,
      extracted_fields: report.extracted_fields,
      incident_id: incident ? incident._id : null,
      impact_score: incident ? incident.impact_score : null,
    });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/reports/:id/reject ──────────────────────────────────
async function rejectReport(req, res, next) {
  try {
    const report = await Report.findByIdAndUpdate(
      req.params.id,
      { approvalStatus: 'rejected', status: 'discarded' },
      { new: true }
    );
    if (!report) return res.status(404).json({ error: 'Report not found' });
    return res.json({ message: 'Report rejected', report_id: report._id });
  } catch (err) {
    next(err);
  }
}

module.exports = { ingestReport, getPendingReports, approveReport, rejectReport };
