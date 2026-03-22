import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    // SeatScouts API fields
    sync_id: Number, // SeatScouts internal ID (used for confirm/reject API)
    order_id: {
      type: String,
      required: true,
      unique: true,
    },
    external_id: String,
    event_name: String,
    venue: String,
    city: String,
    state: String,
    country: String,
    occurs_at: Date,
    section: String,
    row: String,
    low_seat: Number,
    high_seat: Number,
    quantity: Number,
    status: String,
    delivery: String,
    marketplace: String,
    total: Number,
    unit_price: Number,
    order_date: Date,
    transfer_count: Number,
    pos_event_id: String,
    pos_inventory_id: String,
    pos_invoice_id: String,
    from_csv: Boolean,
    last_seen_internal_notes: String,
    public_notes: String,
    reason: String, // delivery problem reason
    in_hand_date: Date,
    inventory_tags: String,

    // Customer / transfer info (from SeatScouts detail)
    customer_name: String,
    customer_email: String,
    customer_phone: String,
    transfer_to_email: String,

    // Local enrichment
    acknowledged: {
      type: Boolean,
      default: false,
    },
    acknowledgedAt: Date,
    confirmedAt: Date,
    portalEventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
    },
    ticketmasterUrl: String,

    // Pricing strategy used when this order was placed
    pricingStrategy: {
      type: String,
      enum: ["dynamic", "static", "manual"],
      default: null,
    },

    // Cost snapshot at order time (linked via pos_inventory_id → ConsecutiveGroup.inventory.inventoryId)
    costSnapshot: {
      unitCost: { type: Number, default: null },        // per-ticket cost
      taxedCost: { type: Number, default: null },       // cost incl. tax
      facePrice: { type: Number, default: null },       // face value
      listPriceAtOrder: { type: Number, default: null }, // what we listed it for
      snapshotAt: { type: Date, default: null },
    },

    // Inventory snapshot at order time
    inventorySnapshot: {
      eventAvailabilityPct: { type: Number, default: null },   // Event-level availability %
      eventAvailableSeats: { type: Number, default: null },    // Available seats at event level
      eventVenueCapacity: { type: Number, default: null },     // Total venue capacity
      sectionAvailabilityPct: { type: Number, default: null }, // Section-level availability %
      sectionAvailableSeats: { type: Number, default: null },  // Available seats in the order's section
      sectionTotalCapacity: { type: Number, default: null },   // Total capacity for the order's section
      snapshotAt: { type: Date, default: null },               // When the snapshot was taken
    },

    // Issue flagging
    hasIssue: {
      type: Boolean,
      default: false,
    },
    issueNote: {
      type: String,
      default: '',
    },
    issueFlaggedAt: Date,
  },
  {
    timestamps: true,
  }
);

// Indexes
orderSchema.index({ status: 1 });
orderSchema.index({ acknowledged: 1 });
orderSchema.index({ order_date: -1 });
orderSchema.index({ occurs_at: -1 });
orderSchema.index({ event_name: 1 });
orderSchema.index({ status: 1, order_date: -1 });
orderSchema.index({ hasIssue: 1, status: 1 });
orderSchema.index({ confirmedAt: 1, order_date: 1, status: 1 });
orderSchema.index({ marketplace: 1 });
orderSchema.index({ sync_id: 1 });
orderSchema.index({ marketplace: 1, order_date: -1 });
orderSchema.index({ portalEventId: 1, order_date: -1 }); // dynamic markup: most-recent-order-per-event

export const Order =
  mongoose.models.Order || mongoose.model("Order", orderSchema);
