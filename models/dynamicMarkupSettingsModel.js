import mongoose from 'mongoose';

const dynamicMarkupSettingsSchema = new mongoose.Schema({
  isEnabled: {
    type: Boolean,
    default: false,
  },
  // Run once daily — interval in minutes (default 1440 = 24h)
  scheduleIntervalMinutes: {
    type: Number,
    min: 60,
    max: 1440,
    default: 1440,
  },
  lastRunAt: {
    type: Date,
    default: null,
  },
  nextRunAt: {
    type: Date,
    default: null,
  },
  totalRuns: {
    type: Number,
    default: 0,
  },
  lastRunStats: {
    eventsProcessed: { type: Number, default: 0 },
    eventsUpdated: { type: Number, default: 0 },
    errors: [{ type: String }],
    durationMs: { type: Number, default: 0 },
  },
}, {
  timestamps: true,
});

const DynamicMarkupSettings = mongoose.models.DynamicMarkupSettings
  || mongoose.model('DynamicMarkupSettings', dynamicMarkupSettingsSchema);

export { DynamicMarkupSettings };
