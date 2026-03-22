/**
 * ROI-Based Dynamic Pricing Engine
 *
 * Computes a target ROI% on cost, then converts to the list price
 * needed to achieve that ROI after the standard sell fee (8%).
 *
 * Three factors pull ROI down from the ceiling:
 *   1. Availability — more competing inventory → lower ROI to stay competitive
 *   2. Order Velocity — stale orders → lower ROI to attract sales
 *   3. Time to Event — closer events → more aggressive pricing
 *
 * ROI Ceiling: 15%  |  ROI Floor: 5%  |  Sell Fee: 8%
 *
 * Formula:  listPrice = cost × (1 + ROI/100) / (1 - SELL_FEE/100)
 *
 * Example at $100 cost, 15% ROI:
 *   listPrice = 100 × 1.15 / 0.92 = $125.00
 *   net after 8% fee = $115.00 → $15.00 profit (15% ROI) ✓
 */

export const SELL_FEE_PCT = 8;
const BASE_ROI = 15;   // Start at ceiling — best case
const ROI_CEILING = 15;
const ROI_FLOOR = 5;

// ── Factor 1: Availability ──────────────────────────────────────────
// High availability = oversupplied, harder to sell → discount
// Low availability = scarce, buyers have fewer options → charge more
export function getAvailabilityAdjustment(availabilityPct: number | null | undefined): number {
  if (availabilityPct == null) return 0;
  if (availabilityPct >= 70) return -2;  // oversupplied — discount to compete
  if (availabilityPct >= 40) return 0;   // normal range — hold at base
  if (availabilityPct >= 20) return 1;   // thinning out — bump price
  return 2;                               // < 20% — scarce, charge more
}

// ── Factor 2: Order Velocity ────────────────────────────────────────
// Only penalises — if orders are flowing, don't touch.
// If orders have dried up, lower ROI to attract sales.
export function getOrderVelocityAdjustment(lastOrderDate: Date | null | undefined): number {
  if (!lastOrderDate) return -3;         // never had an order
  const daysSinceOrder = (Date.now() - new Date(lastOrderDate).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceOrder <= 2) return 0;     // within 48h — working fine
  if (daysSinceOrder <= 7) return -1;    // 2–7 days — stalling
  return -3;                              // 7+ days — not converting
}

// ── Factor 3: Time to Event ─────────────────────────────────────────
// As the event approaches, we need to be more aggressive to move inventory.
export function getTimeToEventAdjustment(eventDateTime: Date | string | null | undefined): number {
  if (!eventDateTime) return 0;
  const daysUntil = (new Date(eventDateTime).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysUntil < 0) return -5;    // event has passed — fire sale
  if (daysUntil < 3) return -5;    // < 3 days
  if (daysUntil < 7) return -3;    // 3–7 days
  if (daysUntil < 14) return -2;   // 7–14 days
  if (daysUntil < 30) return -1;   // 14–30 days
  return 0;                         // 30+ days — no pressure
}

// ── Composite calculation ───────────────────────────────────────────
export interface MarkupFactors {
  base: number;
  availability: number;
  orderVelocity: number;
  timeToEvent: number;
}

export function calculateDynamicMarkup(factors: MarkupFactors): number {
  const raw = factors.base + factors.availability + factors.orderVelocity + factors.timeToEvent;
  return Math.min(ROI_CEILING, Math.max(ROI_FLOOR, raw));
}

// ── Price conversion ────────────────────────────────────────────────
// Given a cost and target ROI%, returns the list price that achieves
// that ROI after the sell fee is deducted.
export function roiToListPrice(cost: number, targetROI: number): number {
  return cost * (1 + targetROI / 100) / (1 - SELL_FEE_PCT / 100);
}

// Convenience: compute everything in one call
export function computeFullMarkup(params: {
  availabilityPct: number | null | undefined;
  lastOrderDate: Date | null | undefined;
  eventDateTime: Date | string | null | undefined;
}): { markup: number; factors: MarkupFactors } {
  const factors: MarkupFactors = {
    base: BASE_ROI,
    availability: getAvailabilityAdjustment(params.availabilityPct),
    orderVelocity: getOrderVelocityAdjustment(params.lastOrderDate),
    timeToEvent: getTimeToEventAdjustment(params.eventDateTime),
  };
  return { markup: calculateDynamicMarkup(factors), factors };
}
