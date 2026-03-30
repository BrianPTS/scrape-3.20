/**
 * Build ConsecutiveGroup records from parsed AXS data.
 *
 * Takes a flat array of available seats + pricing lookup,
 * groups by section+row, finds consecutive runs, and produces
 * ConsecutiveGroup documents for MongoDB.
 */

/**
 * Find consecutive runs in a sorted array of seat objects.
 * Seats are consecutive if their integer seat numbers differ by exactly 1.
 *
 * @param {Array<object>} seats - Sorted by seat number
 * @returns {Array<Array>} Array of consecutive groups
 */
function findConsecutiveRuns(seats) {
  if (seats.length === 0) return [];

  const runs = [];
  let currentRun = [seats[0]];

  for (let i = 1; i < seats.length; i++) {
    const prevNum = parseInt(seats[i - 1].number, 10);
    const currNum = parseInt(seats[i].number, 10);

    if (Math.abs(currNum - prevNum) === 1) {
      currentRun.push(seats[i]);
    } else {
      runs.push(currentRun);
      currentRun = [seats[i]];
    }
  }
  runs.push(currentRun);
  return runs;
}

/**
 * Build ConsecutiveGroup records from available seats and pricing.
 *
 * @param {Array} seats - Filtered available seats from parseInventory + filterAvailableSeats
 * @param {Map} priceLevels - Price lookup from parsePricing
 * @param {object} eventMeta - Event metadata: { eventId, eventName, venue, eventDate }
 * @returns {Array<object>} ConsecutiveGroup-shaped documents
 */
export function buildConsecutiveGroups(seats, priceLevels, eventMeta) {
  const { eventId, eventName = '', venue = '', eventDate = new Date() } = eventMeta;
  const parsedDate = eventDate instanceof Date ? eventDate : new Date(eventDate);

  // Group seats by section + row
  const byRow = new Map();
  for (const seat of seats) {
    const key = `${seat.sectionLabel}||${seat.rowLabel}`;
    if (!byRow.has(key)) byRow.set(key, []);
    byRow.get(key).push(seat);
  }

  const groups = [];

  for (const [key, rowSeats] of byRow) {
    const [sectionLabel, rowLabel] = key.split('||');

    // Sort by seat number ascending
    rowSeats.sort((a, b) => parseInt(a.number, 10) - parseInt(b.number, 10));

    // Find consecutive runs
    const runs = findConsecutiveRuns(rowSeats);

    for (const run of runs) {
      // Look up pricing for the first seat's price level
      const plId = String(run[0].priceLevelID);
      const pricing = priceLevels.get(plId);

      const facePrice = pricing?.facePrice || 0;
      const totalPrice = pricing?.totalPrice || 0;

      const seatNumbers = run.map((s) => s.number);
      const minSeat = seatNumbers[0];
      const maxSeat = seatNumbers[seatNumbers.length - 1];
      const seatRange = minSeat === maxSeat ? minSeat : `${minSeat}-${maxSeat}`;

      const group = {
        eventId,
        mapping_id: `AXS-${eventId}`,
        event_name: eventName,
        venue_name: venue,
        event_date: parsedDate,
        section: sectionLabel,
        row: rowLabel,
        seatCount: run.length,
        seatRange,
        seats: run.map((s) => ({
          number: s.number,
          price: totalPrice,
        })),
        inventory: {
          quantity: run.length,
          section: sectionLabel,
          hideSeatNumbers: false,
          row: rowLabel,
          cost: facePrice,
          stockType: 'Primary',
          lineType: 'Tickets',
          seatType: 'CONSECUTIVE',
          inHandDate: parsedDate,
          notes: pricing?.label || '',
          tags: '',
          inventoryId: 0,
          offerId: `AXS-${eventId}-${plId}`,
          splitType: 'CUSTOM',
          publicNotes: '',
          listPrice: totalPrice,
          customSplit: '',
          face_price: facePrice,
          taxed_cost: totalPrice,
          in_hand: false,
          instant_transfer: false,
          files_available: false,
          zone: pricing?.label || '',
          shown_quantity: String(run.length),
          passthrough: '',
          event_name: eventName,
          venue_name: venue,
          event_date: parsedDate,
          eventId,
          mapping_id: `AXS-${eventId}`,
          tickets: run.map((s) => ({
            id: parseInt(s.id, 10) || 0,
            seatNumber: parseInt(s.number, 10),
            notes: '',
            cost: facePrice,
            faceValue: facePrice,
            taxedCost: totalPrice,
            sellPrice: totalPrice,
            stockType: 'Primary',
            eventId: parseInt(eventId, 10) || 0,
            accountId: 0,
            status: 'Available',
            auditNote: '',
          })),
        },
      };

      groups.push(group);
    }
  }

  return groups;
}
