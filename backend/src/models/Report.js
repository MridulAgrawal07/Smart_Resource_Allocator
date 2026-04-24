const mongoose = require('mongoose');

const mediaRefSchema = new mongoose.Schema(
  {
    filename: String,
    mimetype: String,
    size: Number,
  },
  { _id: false }
);

const extractedFieldsSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: ['Health', 'Food', 'Water', 'Shelter', 'Infrastructure', 'Education', 'Safety', 'Other'],
    },
    urgency_score: { type: Number, min: 1, max: 10 },
    people_affected: { type: Number, min: 1, default: 1 },
    summarized_need: String,
    model_version: String,
  },
  { _id: false }
);

const gpsSchema = new mongoose.Schema(
  {
    lat: Number,
    lng: Number,
  },
  { _id: false }
);

const reportSchema = new mongoose.Schema(
  {
    worker_id: { type: String, default: 'anonymous', index: true },
    original_text: { type: String, required: true },
    media_refs: [mediaRefSchema],
    gps_coordinates: gpsSchema,
    extracted_fields: extractedFieldsSchema,
    status: {
      type: String,
      enum: ['queued', 'processing', 'extracted', 'clustered', 'review_required', 'discarded'],
      default: 'queued',
      index: true,
    },
    submitted_at: { type: Date, default: Date.now },
    received_at: { type: Date, default: Date.now },
    incident_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Incident', default: null },
    embedding: { type: [Number], default: undefined },
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Report', reportSchema);
