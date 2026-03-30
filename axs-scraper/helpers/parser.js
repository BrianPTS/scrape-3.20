/**
 * JSON parser for AXS inventory and pricing responses.
 *
 * AXS returns clean JSON (no XML parsing needed). Two endpoints:
 * - Inventory: POST /offer/search → { offers: [{ items: [seat, seat, ...] }] }
 * - Pricing: GET /price → { offerPrices: [{ zonePrices: [{ priceLevels: [...] }] }] }
 */

// Status codes observed in AXS data
export const STATUS_CODES = {
  AVAILABLE: 6,
  ACCESSIBLE_SEATING: 37,
  AXS_DISTRO: 45188,
  AVAILABLE_SINGLE: 1179,
};

/**
 * Parse the inventory JSON response.
 * Flattens nested offers[].items[] into a flat seat array.
 *
 * @param {object} data - Parsed JSON from the inventory endpoint
 * @returns {{ eventId: string, seats: Array<object>, offers: Array<object> }}
 */
export function parseInventory(data) {
  const offers = Array.isArray(data.offers) ? data.offers : [];
  const seats = [];
  let eventId = '';

  for (const offer of offers) {
    if (!eventId && offer.eventID) {
      eventId = String(offer.eventID);
    }

    const items = Array.isArray(offer.items) ? offer.items : [];
    for (const item of items) {
      seats.push({
        id: item.id,
        sectionID: item.sectionID,
        sectionLabel: item.sectionLabel,
        rowID: item.rowID,
        rowLabel: item.rowLabel,
        number: item.number,
        displayOrder: parseInt(item.displayOrder, 10) || 0,
        statusCode: item.statusCode,
        statusCodeLabel: item.statusCodeLabel || '',
        offerID: item.offerID || offer.offerID,
        offerGroupID: offer.offerGroupID,
        isGASection: item.isGASection || false,
        priceLevelID: item.priceLevelID,
        seatType: item.seatType || 'STANDARD',
        neighborhoodPrintDescription: item.neighborhoodPrintDescription || '',
      });
    }
  }

  return { eventId, seats, offers };
}

/**
 * Filter seats to only available, standard (non-accessible) seats.
 *
 * @param {Array} seats - Flat seat array from parseInventory
 * @param {object} [options]
 * @param {boolean} [options.includeAccessible=false] - Include accessible seats
 * @returns {Array} Filtered seats
 */
export function filterAvailableSeats(seats, options = {}) {
  const { includeAccessible = false } = options;

  return seats.filter((seat) => {
    // Filter out GA sections
    if (seat.isGASection) return false;

    // Accessible seats have their own status code (37)
    if (seat.seatType === 'ACCESSIBLE') {
      if (!includeAccessible) return false;
      // Include accessible seats with their dedicated status code
      return seat.statusCode === STATUS_CODES.ACCESSIBLE_SEATING ||
             seat.statusCode === STATUS_CODES.AVAILABLE;
    }

    // Standard seats must have available status
    return seat.statusCode === STATUS_CODES.AVAILABLE ||
           seat.statusCode === STATUS_CODES.AVAILABLE_SINGLE;
  });
}

/**
 * Parse the pricing JSON response.
 * Builds a Map of priceLevelID → pricing details.
 *
 * @param {object} data - Parsed JSON from the pricing endpoint
 * @returns {Map<string, {label: string, facePrice: number, facilityFee: number, totalPrice: number, components: Array}>}
 */
export function parsePricing(data) {
  const priceLevels = new Map();
  const offerPrices = Array.isArray(data.offerPrices) ? data.offerPrices : [];

  for (const offer of offerPrices) {
    // Skip resale offers (they have null offerGroupID)
    if (offer.offerGroupID === null || offer.offerGroupID === undefined) continue;

    const zonePrices = Array.isArray(offer.zonePrices) ? offer.zonePrices : [];
    for (const zone of zonePrices) {
      const levels = Array.isArray(zone.priceLevels) ? zone.priceLevels : [];
      for (const level of levels) {
        const plId = String(level.priceLevelID);
        if (priceLevels.has(plId)) continue; // Don't overwrite

        const prices = Array.isArray(level.prices) ? level.prices : [];
        const primaryPrice = prices[0]; // First price entry is the primary

        if (!primaryPrice) continue;

        // Extract components
        const components = Array.isArray(primaryPrice.priceComponents)
          ? primaryPrice.priceComponents
          : [];

        let baseAmount = 0;
        let facilityFee = 0;
        let foodBev = 0;

        for (const comp of components) {
          const amount = (comp.amount || 0) / 100; // cents → dollars
          if (comp.base === true || comp.name === 'Base Component') {
            baseAmount = amount;
          } else if (comp.name === 'VEN_FacFee') {
            facilityFee = amount;
          } else if (comp.name === 'Food & Beverage') {
            foodBev = amount;
          }
        }

        const totalPrice = (primaryPrice.base || 0) / 100; // cents → dollars

        priceLevels.set(plId, {
          priceLevelID: plId,
          label: level.label || '',
          facePrice: baseAmount,
          facilityFee,
          foodBev,
          totalPrice,
          availability: level.availability?.amount || 0,
          components,
        });
      }
    }
  }

  return priceLevels;
}
