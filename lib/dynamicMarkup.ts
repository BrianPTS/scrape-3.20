/**
 * Dynamic Markup Engine
 *
 * Computes an event's markup based on three factors:
 *   1. Availability — more inventory on the market = lower markup (more risk)
 *   2. Order Velocity — no recent orders = lower markup to attract sales
 *   3. Time to Event — closer events need more aggressive pricing
 *
 * Base: 30%  |  Floor: 20%  |  No hard ceiling (max practical ~35%)
 */

const BASE_MARKUP = 30;
const FLOOR = 20;

// ── Factor 1: Availability ──────────────────────────────────────────
// High availability = lots of competing inventory = price lower
// Low availability  = scarce, buyers have fewer options = price higher
export function getAvailabilityAdjustment(availabilityPct: number | null | undefined): number {
  if (availabilityPct == null) return 0;
  if (availabilityPct >= 80) return -5;
  if (availabilityPct >= 60) return -3;
  if (availabilityPct >= 40) return 0;
  if (availabilityPct >= 20) return 2;
  return 5; // < 20%
}

// ── Factor 2: Order Velocity ────────────────────────────────────────
// Only penalises — if orders are flowing, don't touch.
// If orders have dried up, lower markup to attract sales.
export function getOrderVelocityAdjustment(lastOrderDate: Date | null | undefined): number {
  if (!lastOrderDate) return -5; // never had an order
  const daysSinceOrder = (Date.now() - new Date(lastOrderDate).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceOrder <= 2) return 0;   // within 48h — working fine
  if (daysSinceOrder <= 7) return -3;   // 2–7 days — stalling
  return -5;                            // 7+ days — not converting
}

// ── Factor 3: Time to Event ─────────────────────────────────────────
// As the event approaches, we need to be more aggressive to sell remaining tickets.
export function getTimeToEventAdjustment(eventDateTime: Date | string | null | undefined): number {
  if (!eventDateTime) return 0;
  const daysUntil = (new Date(eventDateTime).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysUntil < 0) return -7;    // event has passed, fire sale
  if (daysUntil < 3) return -7;    // < 3 days
  if (daysUntil < 7) return -5;    // 3–7 days
  if (daysUntil < 14) return -3;   // 7–14 days
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
  return Math.max(FLOOR, raw); // floor at 20%, no hard ceiling
}

// Convenience: compute everything in one call
export function computeFullMarkup(params: {
  availabilityPct: number | null | undefined;
  lastOrderDate: Date | null | undefined;
  eventDateTime: Date | string | null | undefined;
}): { markup: number; factors: MarkupFactors } {
  const factors: MarkupFactors = {
    base: BASE_MARKUP,
    availability: getAvailabilityAdjustment(params.availabilityPct),
    orderVelocity: getOrderVelocityAdjustment(params.lastOrderDate),
    timeToEvent: getTimeToEventAdjustment(params.eventDateTime),
  };
  return { markup: calculateDynamicMarkup(factors), factors };
}
