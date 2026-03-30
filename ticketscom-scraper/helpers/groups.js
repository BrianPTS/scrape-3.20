/**
 * Build ConsecutiveGroup records from parsed tickets.com data.
 *
 * Takes parsed availability (event metadata + pricing) and a parsed seatmap
 * (per-section seat layout + availability masks), then produces an array of
 * ConsecutiveGroup documents ready for MongoDB insertion.
 */

import { expandMask, findPricescaleForConfigId } from './mask.js';

/**
 * Find consecutive runs in a sorted array of seat objects.
 * Seats are consecutive if their integer seat numbers differ by exactly 1.
 *
 * @param {Array<{seatNumber: string, configId: number, ...}>} seats - Sorted by seatNumber
 * @returns {Array<Array>} Array of consecutive groups
 */
function findConsecutiveRuns(seats) {
  if (seats.length === 0) return [];

  const runs = [];
  let currentRun = [seats[0]];

  for (let i = 1; i < seats.length; i++) {
    const prevNum = parseInt(seats[i - 1].seatNumber, 10);
    const currNum = parseInt(seats[i].seatNumber, 10);

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
 * Build ConsecutiveGroup records for a single section.
 *
 * @param {object} availability - Parsed availability data (from parseAvailability)
 * @param {object} seatmapData - Parsed seatmap data (from parseSeatmap)
 * @param {string} sectionId - The section ID
 * @returns {Array<object>} ConsecutiveGroup-shaped documents
 */
export function buildConsecutiveGroups(availability, seatmapData, sectionId) {
  const { event, priceStructure, sectionInventory, sectionConfigs } = availability;
  const { rows, availableMask, pricescaleRanges, extendedDefs } = seatmapData;

  // Expand the available seat mask
  const availableSet = expandMask(availableMask);
  if (availableSet.size === 0) return [];

  // Expand wheelchair/accessibility masks to exclude
  const wheelchairSet = new Set();
  for (const ed of extendedDefs) {
    // extended_def id=5 is Wheelchair, id=1221 is Wheelchair Seating restriction
    wheelchairSet.forEach(() => {}); // no-op
    const defIds = expandMask(ed.mask);
    defIds.forEach((id) => wheelchairSet.add(id));
  }

  const sectionInfo = sectionInventory[sectionId];
  const sectionConfig = sectionConfigs[sectionId];
  const sectionName = sectionConfig?.publicDesc || sectionConfig?.desc || sectionId;

  // Parse event date
  const eventDate = new Date(event.date);

  const groups = [];

  for (const row of rows) {
    // Filter to available, non-wheelchair seats
    const availableSeats = row.seats.filter((seat) => {
      if (!availableSet.has(seat.configId)) return false;
      if (wheelchairSet.has(seat.configId)) return false;
      return true;
    });

    if (availableSeats.length === 0) continue;

    // Sort by seat number (ascending)
    availableSeats.sort(
      (a, b) => parseInt(a.seatNumber, 10) - parseInt(b.seatNumber, 10)
    );

    // Find consecutive runs
    const runs = findConsecutiveRuns(availableSeats);

    for (const run of runs) {
      // Look up pricing via pricescale mask for the first seat in the run
      const psRange = findPricescaleForConfigId(run[0].configId, pricescaleRanges);
      const psId = psRange?.id;
      const pricing = psId ? priceStructure[psId] : null;

      const facePrice = pricing?.facePrice || psRange?.refPrice || 0;
      const allInPrice = pricing?.allInPrice || psRange?.allInRefPrice || 0;

      const seatNumbers = run.map((s) => s.seatNumber);
      const minSeat = seatNumbers[0];
      const maxSeat = seatNumbers[seatNumbers.length - 1];
      const seatRange = minSeat === maxSeat ? minSeat : `${minSeat}-${maxSeat}`;

      const group = {
        eventId: event.id,
        mapping_id: event.code || `TC-${event.id}`,
        event_name: event.name,
        venue_name: event.venue,
        event_date: eventDate,
        section: sectionName,
        row: row.rowLabel,
        seatCount: run.length,
        seatRange,
        seats: run.map((s) => ({
          number: s.seatNumber,
          price: allInPrice,
        })),
        inventory: {
          quantity: run.length,
          section: sectionName,
          hideSeatNumbers: false,
          row: row.rowLabel,
          cost: facePrice,
          stockType: 'Primary',
          lineType: 'Tickets',
          seatType: 'CONSECUTIVE',
          inHandDate: eventDate,
          notes: '',
          tags: '',
          inventoryId: 0,
          offerId: `${event.id}-${sectionId}-${psId || 'unknown'}`,
          splitType: 'CUSTOM',
          publicNotes: '',
          listPrice: allInPrice,
          customSplit: '',
          face_price: facePrice,
          taxed_cost: allInPrice,
          in_hand: false,
          instant_transfer: false,
          files_available: false,
          zone: '',
          shown_quantity: String(run.length),
          passthrough: '',
          event_name: event.name,
          venue_name: event.venue,
          event_date: eventDate,
          eventId: event.id,
          mapping_id: event.code || `TC-${event.id}`,
          tickets: run.map((s, idx) => ({
            id: s.globalId,
            seatNumber: parseInt(s.seatNumber, 10),
            notes: '',
            cost: facePrice,
            faceValue: facePrice,
            taxedCost: allInPrice,
            sellPrice: allInPrice,
            stockType: 'Primary',
            eventId: parseInt(event.id, 10) || 0,
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

/**
 * Build consecutive groups for all sections that have inventory.
 *
 * @param {object} availability - Parsed availability data
 * @param {Map<string, object>} seatmapsBySection - Map of sectionId → parsed seatmap data
 * @returns {Array<object>} All ConsecutiveGroup documents
 */
export function buildAllGroups(availability, seatmapsBySection) {
  const allGroups = [];

  for (const [sectionId, seatmapData] of seatmapsBySection) {
    const groups = buildConsecutiveGroups(availability, seatmapData, sectionId);
    allGroups.push(...groups);
  }

  return allGroups;
}
