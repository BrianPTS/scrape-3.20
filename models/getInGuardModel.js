import mongoose from 'mongoose';

// Per-event, per-pool price floor snapshot from the last CSV run.
// listingCosts stores { inventoryId: cost } for every listing that was
// included, so the next run can detect both new listings and drastic
// price drops on existing ones.
const csvPriceFloorSchema = new mongoose.Schema({
  mapping_id: { type: String, required: true },
  tag: { type: String, enum: ['standard', 'resale'], required: true },
  minCost: { type: Number, required: true },
  inventoryIds: [Number],
  listingCosts: { type: Map, of: Number, default: {} },
  updatedAt: { type: Date, default: Date.now },
});
csvPriceFloorSchema.index({ mapping_id: 1, tag: 1 }, { unique: true });

// Tracks new listings on probation (price dropped X% below previous floor).
// Must survive `getInProbationRuns` consecutive CSV runs before graduating.
const listingProbationSchema = new mongoose.Schema({
  inventoryId: { type: Number, required: true, unique: true },
  mapping_id: { type: String, required: true, index: true },
  tag: { type: String, enum: ['standard', 'resale'] },
  cost: { type: Number, required: true },
  runCount: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const CsvPriceFloor = mongoose.models.CsvPriceFloor
  || mongoose.model('CsvPriceFloor', csvPriceFloorSchema);

export const ListingProbation = mongoose.models.ListingProbation
  || mongoose.model('ListingProbation', listingProbationSchema);
