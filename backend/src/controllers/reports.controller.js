const Report = require('../models/Report');
const { extractFromReport } = require('../services/gemini.service');
const { attachReportToIncident } = require('../services/clustering.service');

async function ingestReport(req, res, next) {
  try {
    const { description, worker_id, lat, lng, submitted_at } = req.body;

    if (!description || !description.trim()) {
      return res.status(400).json({ error: "Field 'description' is required" });
    }

    const file = req.file || null;

    let extracted;
    try {
      extracted = await extractFromReport({
        text: description,
        imageBuffer: file ? file.buffer : null,
        imageMimeType: file ? file.mimetype : null,
      });
    } catch (aiErr) {
      console.error('[controller] Gemini extraction failed — full error below:');
      console.error(aiErr);
      if (aiErr && aiErr.stack) console.error(aiErr.stack);
      const queued = await Report.create({
        worker_id: worker_id || 'anonymous',
        original_text: description,
        media_refs: file
          ? [{ filename: file.originalname, mimetype: file.mimetype, size: file.size }]
          : [],
        gps_coordinates: lat && lng ? { lat: Number(lat), lng: Number(lng) } : undefined,
        status: 'review_required',
        submitted_at: submitted_at ? new Date(submitted_at) : new Date(),
      });
      return res.status(202).json({
        message: 'Report received but AI extraction failed — queued for manual review.',
        report_id: queued._id,
        status: queued.status,
      });
    }

    const report = await Report.create({
      worker_id: worker_id || 'anonymous',
      original_text: description,
      media_refs: file
        ? [{ filename: file.originalname, mimetype: file.mimetype, size: file.size }]
        : [],
      gps_coordinates: lat && lng ? { lat: Number(lat), lng: Number(lng) } : undefined,
      extracted_fields: extracted,
      status: 'extracted',
      submitted_at: submitted_at ? new Date(submitted_at) : new Date(),
    });

    let incident = null;
    try {
      incident = await attachReportToIncident(report);
      if (incident) {
        report.incident_id = incident._id;
        report.status = 'clustered';
        await report.save();
      }
    } catch (clusterErr) {
      console.error('[controller] Clustering failed — report saved without incident link:');
      console.error(clusterErr);
    }

    return res.status(201).json({
      message: 'Report ingested successfully',
      report_id: report._id,
      status: report.status,
      extracted_fields: report.extracted_fields,
      incident_id: incident ? incident._id : null,
      impact_score: incident ? incident.impact_score : null,
      score_breakdown: incident ? incident.score_breakdown : null,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { ingestReport };
