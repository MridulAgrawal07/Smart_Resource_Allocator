const mongoose = require('mongoose');

const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  { _id: false }
);

const availabilityWindowSchema = new mongoose.Schema(
  {
    day: { type: String, enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
    start: String, // "09:00"
    end: String,   // "18:00"
  },
  { _id: false }
);

const wellnessFlagSchema = new mongoose.Schema(
  {
    type: String,
    flagged_at: { type: Date, default: Date.now },
    reason: String,
  },
  { _id: false }
);

const volunteerSchema = new mongoose.Schema(
  {
    // Identity
    name: { type: String, required: true },
    contact_channels: {
      push_token: String,
      sms: String,
      whatsapp: String,
    },

    // Capability
    skills: [{ type: String, index: true }],
    certifications: [String],
    languages: [String],
    transportation_mode: {
      type: String,
      enum: ['walk', 'bicycle', 'motorcycle', 'car', 'public_transit'],
      default: 'walk',
    },

    // Availability
    availability_windows: [availabilityWindowSchema],
    current_status: {
      type: String,
      enum: ['available', 'assigned', 'resting', 'offline'],
      default: 'available',
      index: true,
    },

    // Location — GeoJSON Point, 2dsphere indexed for $near queries
    last_known_location: pointSchema,
    service_radius: { type: Number, default: 10 }, // km

    // Workload
    active_assignments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Incident' }],
    hours_last_7_days: { type: Number, default: 0 },
    consecutive_high_urgency_count: { type: Number, default: 0 },

    // Wellness (Burnout Prevention Engine — blueprint §6.1)
    wellness_score: { type: Number, default: 1.0, min: 0, max: 1 },
    wellness_flags: [wellnessFlagSchema],
    mandatory_rest_until: { type: Date, default: null },

    // Trust (blueprint §6.2)
    completion_rate: { type: Number, default: 0 },
    verification_pass_rate: { type: Number, default: 0 },
    trust_score: { type: Number, default: 0.5, min: 0, max: 1 },

    // History
    total_assignments: { type: Number, default: 0 },
    total_resolved: { type: Number, default: 0 },
    joined_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// Geospatial index for proximity-based matching queries
volunteerSchema.index({ last_known_location: '2dsphere' });

module.exports = mongoose.model('Volunteer', volunteerSchema);
