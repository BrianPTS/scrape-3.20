import mongoose from "mongoose";

const eventSchema = new mongoose.Schema(
  {
    mapping_id: {
      type: String,
      required: true,
      unique: true,
    },
    Event_ID: {
      type: String,
      required: true,
      unique: true,
    },
    Event_Name: {
      type: String,
      required: true,
    },
    Event_DateTime: {
      type: Date,
      required: true,
    },
    Venue: String,
    URL: {
      type: String,
      required: true,
    },
    source: {
      type: String,
      enum: ['ticketmaster', 'ticketscom'],
      default: 'ticketmaster',
    },
    Zone: {
      type: String,
      default: "none",
    },
    Available_Seats: {
      type: Number,
      default: 0,
    },
    Venue_Capacity: {
      type: Number,
      default: 0,
    },
    Availability_Percentage: {
      type: Number,
      default: null,
    },
    Skip_Scraping: {
      type: Boolean,
      default: true,
    },
    inHandDate: {
      type: Date,
      default: Date.now,
    },
    priceIncreasePercentage: {
      type: Number,
      default: 15, // Default 15% target ROI (was 25% raw markup)
    },
    // A/B pricing strategy: "dynamic" | "static" | "manual"
    pricingStrategy: {
      type: String,
      enum: ["dynamic", "static", "manual"],
      default: "dynamic",
    },
    standardMarkupAdjustment: {
      type: Number,
      default: 0, // +/- offset on top of scraper default for STANDARD tickets
    },
    resaleMarkupAdjustment: {
      type: Number,
      default: 0, // +/- offset on top of scraper default for RESALE tickets
    },
    includeStandardSeats: {
      type: Boolean,
      default: true, // Include STANDARD seats in CSV export
    },
    includeResaleSeats: {
      type: Boolean,
      default: true, // Include RESALE seats in CSV export
    },
    useStubHubPricing: {
      type: Boolean,
      default: false, // When true, CSV export uses scraper's suggestedPrice instead of markup formula
    },
    stubhubEnabled: {
      type: Boolean,
      default: true, // When false, scraper skips this event (independent of Skip_Scraping)
    },
    Last_Updated: {
      type: Date,
      default: Date.now,
    },
    // TM Discovery API date sync tracking
    lastTmDateSync: {
      type: Date,
      default: null,
    },
    tmStatus: {
      type: String,
      default: null, // "onsale" | "offsale" | "canceled" | "postponed" | "rescheduled"
    },
    tmDateSyncHistory: [{
      syncedAt: { type: Date, default: Date.now },
      previousDateTime: Date,
      newDateTime: Date,
      previousStatus: String,
      newStatus: String,
      source: { type: String, default: 'daily-sync' },
    }],
    // When non-null, scraper automatically resumes this event at the given time
    autoResumeAt: {
      type: Date,
      default: null,
    },
    // Sport / category — required before scraping can be started.
    // null = not yet chosen (forces the user to pick before hitting Start).
    eventType: {
      type: String,
      enum: ['NFL', 'MLB', 'NHL', 'NBA', 'OTHER', null],
      default: null,
    },
    // StubHub matching fields (set by scraper)
    stubhubEventId: {
      type: String,
      default: null,
    },
    stubhubUrl: {
      type: String,
      default: null,
    },
    stubhubLastScraped: {
      type: Date,
      default: null,
    },
    // Dynamic pricing engine
    dynamicPricingEnabled: {
      type: Boolean,
      default: true,
    },
    // Per-event ROI band (overrides global defaults of 5%–15%)
    roiFloor: {
      type: Number,
      default: null, // null = use global default (5%)
    },
    roiCeiling: {
      type: Number,
      default: null, // null = use global default (15%)
    },
    calculatedMarkup: {
      type: Number,
      default: 15, // Default 15% target ROI (was 30% raw markup)
    },
    lastMarkupCalcAt: {
      type: Date,
      default: null,
    },
    markupFactors: {
      availability: { type: Number, default: 0 },
      orderVelocity: { type: Number, default: 0 },
      timeToEvent: { type: Number, default: 0 },
      base: { type: Number, default: 30 },
    },
    metadata: {
      lastUpdate: String,
      iterationNumber: Number,
      scrapeStartTime: Date,
      scrapeEndTime: Date,
      inHandDate: Date,
      scrapeDurationSeconds: Number,
      totalRunningTimeMinutes: Number,
      ticketStats: {
        totalTickets: Number,
        ticketCountChange: Number,
        previousTicketCount: Number,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
eventSchema.index({ URL: 1 }, { unique: true });
eventSchema.index({ Last_Updated: 1 }); // Index for CSV generation filtering

export const Event = mongoose.models.Event || mongoose.model("Event", eventSchema);
