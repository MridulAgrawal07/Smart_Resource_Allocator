const mongoose = require('mongoose');

const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  { _id: false }
);

const locationBoundsSchema = new mongoose.Schema(
  {
    min_lat: Number,
    max_lat: Number,
    min_lng: Number,
    max_lng: Number,
  },
  { _id: false }
);

const scoreBreakdownSchema = new mongoose.Schema(
  {
    severity: Number,
    people_factor: Number,
    vulnerability_multiplier: Number,
    time_decay: Number,
    resource_scarcity: Number,
    historical_pattern: Number,
    weights: {
      severity: Number,
      people: Number,
      vulnerability: Number,
      decay: Number,
      scarcity: Number,
      history: Number,
    },
    total: Number,
  },
  { _id: false }
);

const assignmentHistorySchema = new mongoose.Schema(
  {
    volunteer_id: String,
    assigned_at: Date,
    released_at: Date,
    status: String,
  },
  { _id: false }
);

const escalationEntrySchema = new mongoose.Schema(
  {
    level: Number,
    reason: String,
    escalated_at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const incidentSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: ['Health', 'Food', 'Water', 'Shelter', 'Infrastructure', 'Education', 'Safety', 'Other'],
      required: true,
      index: true,
    },
    severity: { type: Number, min: 1, max: 10 },
    estimated_people_affected: { type: Number, default: 0 },
    resource_needs: [String],

    location_centroid: pointSchema,
    location_bounds: locationBoundsSchema,
    sanitized_location: pointSchema,

    contributing_report_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Report' }],

    impact_score: { type: Number, default: 0, index: true },
    score_breakdown: scoreBreakdownSchema,

    status: {
      type: String,
      enum: ['reported', 'triaged', 'assigned', 'in_progress', 'resolved', 'verified', 'closed'],
      default: 'reported',
      index: true,
    },

    assigned_volunteer_ids: [String],
    assignment_history: [assignmentHistorySchema],

    resolution_proof_refs: [String],
    verification_status: {
      type: String,
      enum: ['pending', 'verified', 'failed', 'manual_review'],
      default: 'pending',
    },
    resolved_at: Date,

    escalation_level: { type: Number, default: 0 },
    escalation_history: [escalationEntrySchema],
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'last_updated_at' } }
);

incidentSchema.index({ location_centroid: '2dsphere' });
incidentSchema.index({ sanitized_location: '2dsphere' });

module.exports = mongoose.model('Incident', incidentSchema);
