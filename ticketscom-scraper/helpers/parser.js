/**
 * XML parser for tickets.com availability and seatmap responses.
 *
 * Uses fast-xml-parser to convert XML to JS objects, then extracts
 * the structured data needed for scraping.
 */

import { XMLParser } from 'fast-xml-parser';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  // Ensure single-element arrays stay arrays
  isArray: (name) => {
    const arrayTags = [
      'pricescale', 'buyer_type', 'service_charge', 'service_charge_group',
      'section', 'extended_def', 'extended_config', 'row', 'promotion',
    ];
    return arrayTags.includes(name);
  },
});

/**
 * Ensure a value is always an array.
 */
function ensureArray(val) {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

/**
 * Parse the availability XML response.
 *
 * @param {string} xmlString - Raw XML from the availability endpoint
 * @returns {{ venue, event, pricescales, priceStructure, sectionInventory, sections, sectionConfigs }}
 */
export function parseAvailability(xmlString) {
  const parsed = xmlParser.parse(xmlString);
  const root = parsed.map_response;

  // --- Venue ---
  const venueRaw = root.venue;
  const venue = {
    id: venueRaw.id,
    code: venueRaw.code,
    name: venueRaw.public_desc || venueRaw.name,
    desc: venueRaw.desc,
  };

  // --- Pricescale definitions (from venue) ---
  const pricescaleDefs = {};
  for (const ps of ensureArray(venueRaw?.pricescales?.pricescale)) {
    pricescaleDefs[ps.id] = {
      id: ps.id,
      code: ps.code,
      desc: ps.desc,
      publicDesc: ps.public_desc,
      color: ps.color,
      displayOrder: parseInt(ps.display_order, 10),
      groupId: ps.pricescale_group_id,
      minTickets: parseInt(ps.min_tickets, 10),
      maxTickets: parseInt(ps.max_tickets, 10),
    };
  }

  // --- Price structure (per-event pricing) ---
  const priceStructureRaw = root.price_structure;
  const priceStructure = {};
  for (const ps of ensureArray(priceStructureRaw?.pricescale)) {
    const adultBuyer = ensureArray(ps.buyer_type).find(
      (bt) => bt.full_price === 'true' || bt.full_price === true
    );
    if (!adultBuyer) continue;

    let convenienceFee = 0;
    let handlingFee = 0;
    let taxAmount = 0;

    // service_charge can be individual elements
    for (const sc of ensureArray(adultBuyer.service_charge)) {
      const desc = (sc.description || '').toLowerCase();
      if (desc.includes('handling')) {
        handlingFee = parseFloat(sc.amount);
      } else if (desc.includes('tax')) {
        taxAmount = parseFloat(sc.amount);
      }
    }

    // service_charge_group is the convenience fee
    for (const scg of ensureArray(adultBuyer.service_charge_group)) {
      convenienceFee = parseFloat(scg.amount);
    }

    priceStructure[ps.id] = {
      id: ps.id,
      facePrice: parseFloat(ps.ref_price || adultBuyer.price),
      allInPrice: parseFloat(ps.all_in_ref_price || adultBuyer.all_in_price),
      convenienceFee,
      handlingFee,
      taxAmount,
      displayOrder: parseInt(ps.display_order, 10),
    };
  }

  // --- Event metadata ---
  const eventRaw = root.event;
  const event = {
    id: String(eventRaw.id),
    code: eventRaw.code?.trim(),
    name: eventRaw.public_desc,
    date: eventRaw.event_date_time,
    venue: venue.name,
    venueId: venue.id,
    accessibleSeatingAvailable: eventRaw.accessible_seating_available === 'true',
    seatMapsEnabled: eventRaw.seat_maps_enabled === 'true',
    maxTickets: parseInt(eventRaw.max_tickets, 10),
  };

  // --- Master config: section configs ---
  const masterConfig = root.master_config;
  const sectionConfigs = {};
  for (const sec of ensureArray(masterConfig?.section_config?.section)) {
    sectionConfigs[String(sec.id).trim()] = {
      id: String(sec.id).trim(),
      code: sec.code?.trim(),
      desc: sec.desc?.trim(),
      publicDesc: sec.public_desc?.trim(),
      displayOrder: parseInt(sec.display_order, 10),
    };
  }

  // --- Section inventory ---
  const sectionInventory = {};
  const invRaw = masterConfig?.section_inventory;
  for (const sec of ensureArray(invRaw?.section)) {
    const available = parseInt(String(sec.available).trim(), 10);
    const capacity = parseInt(String(sec.capacity).trim(), 10);
    const maxContiguous = parseInt(String(sec.max_contiguous).trim(), 10);
    const sectionId = String(sec.id).trim();

    const psBySection = [];
    for (const ps of ensureArray(sec.pricescale)) {
      psBySection.push({
        id: String(ps.id).trim(),
        available: parseInt(String(ps.available).trim(), 10),
        maxContiguous: parseInt(String(ps.max_contiguous).trim(), 10),
      });
    }

    sectionInventory[sectionId] = {
      id: sectionId,
      available,
      capacity,
      maxContiguous,
      pricescales: psBySection,
      sectionName: sectionConfigs[sectionId]?.publicDesc || sectionConfigs[sectionId]?.desc || sectionId,
    };
  }

  // --- Extended definitions (accessibility types) ---
  const extendedDefs = {};
  for (const ed of ensureArray(venueRaw?.extended_defs?.extended_def)) {
    extendedDefs[ed.id] = {
      id: ed.id,
      code: ed.code,
      desc: ed.desc,
      type: ed.type,
      displayIndicator: ed.display_indicator,
    };
  }

  // --- Seatmap config (hotspot coords for sections) ---
  const seatmapConfig = root.seatmap_config;
  const seatmapDefs = {};
  if (seatmapConfig?.seatmap) {
    for (const sm of ensureArray(seatmapConfig.seatmap)) {
      seatmapDefs[sm.code?.trim()] = {
        id: sm.id,
        code: sm.code?.trim(),
        desc: sm.desc?.trim(),
      };
    }
  }

  return {
    venue,
    event,
    pricescaleDefs,
    priceStructure,
    sectionInventory,
    sectionConfigs,
    extendedDefs,
    seatmapDefs,
  };
}

/**
 * Parse a single seat string from the pipe-delimited row format.
 * Format: "globalSeatId,seatConfigId,xCoord,sectionId,rowLabel,seatNumber"
 *
 * @param {string} seatStr - e.g. "196254,9601,41,1816,5,4"
 * @returns {{ globalId: number, configId: number, xCoord: number, sectionId: string, rowLabel: string, seatNumber: string }}
 */
function parseSeatString(seatStr) {
  const parts = seatStr.split(',');
  return {
    globalId: parseInt(parts[0], 10),
    configId: parseInt(parts[1], 10),
    xCoord: parseInt(parts[2], 10),
    sectionId: parts[3],
    rowLabel: parts[4],
    seatNumber: parts[5],
  };
}

/**
 * Parse the seatmap XML response for a single section.
 *
 * @param {string} xmlString - Raw XML from the seatmap endpoint
 * @returns {{ sectionCode, seatmapId, rows, availableMask, pricescaleRanges, extendedDefs, wheelchairConfigIds }}
 */
export function parseSeatmap(xmlString) {
  const parsed = xmlParser.parse(xmlString);
  const root = parsed.map_response;
  const seatmap = root.seatmap;

  const sectionCode = seatmap.code?.trim();
  const seatmapId = seatmap.id;

  // --- Parse seat rows ---
  const layouts = seatmap.layouts?.layout;
  const layoutArr = ensureArray(layouts);
  const rows = [];

  for (const layout of layoutArr) {
    for (const row of ensureArray(layout.rows?.row)) {
      const seatsStr = row.seats;
      if (!seatsStr) continue;

      const seatParts = seatsStr.split('|');
      const seats = seatParts.map(parseSeatString);

      // All seats in a row share the same rowLabel
      const rowLabel = seats[0]?.rowLabel || '';
      rows.push({
        rowLabel,
        yCellCoord: parseInt(row.y_cell_coord, 10),
        seats,
      });
    }
  }

  // --- Availability masks ---
  const viewModes = seatmap.view_modes;
  let availableMask = '';
  let unavailableMask = '';
  let lockedByOthersMask = '';

  if (viewModes?.view_mode) {
    const vm = Array.isArray(viewModes.view_mode)
      ? viewModes.view_mode[0]
      : viewModes.view_mode;
    const avail = vm.availability;
    if (avail) {
      availableMask = avail.available_selectable_mask?.trim() || '';
      unavailableMask = avail.unavailable_unselectable_mask?.trim() || '';
      lockedByOthersMask = avail.locked_by_others_mask?.trim() || '';
    }
  }

  // --- Pricescale ranges (seatConfigId → pricescale mapping) ---
  const pricescaleRanges = [];
  const psConfig = seatmap.pricescale_config;
  if (psConfig) {
    for (const ps of ensureArray(psConfig.pricescale)) {
      pricescaleRanges.push({
        id: String(ps.id).trim(),
        mask: ps.mask?.trim() || '',
        refPrice: ps.ref_price ? parseFloat(ps.ref_price) : null,
        allInRefPrice: ps.all_in_ref_price ? parseFloat(ps.all_in_ref_price) : null,
        displayOrder: ps.display_order ? parseInt(ps.display_order, 10) : 0,
      });
    }
  }

  // --- Extended definitions (wheelchair, obstructed, etc.) ---
  const extendedDefs = [];
  const extConfigs = seatmap.extended_configs;
  if (extConfigs?.extended_config) {
    for (const ec of ensureArray(extConfigs.extended_config)) {
      for (const ed of ensureArray(ec.extended_def)) {
        extendedDefs.push({
          configId: ec.id,
          defId: ed.id,
          mask: ed.mask?.trim() || '',
        });
      }
    }
  }

  // --- Section config (section mask) ---
  let sectionMask = '';
  const secConfig = seatmap.section_config;
  if (secConfig?.section) {
    const sec = Array.isArray(secConfig.section)
      ? secConfig.section[0]
      : secConfig.section;
    sectionMask = sec.mask?.trim() || '';
  }

  return {
    sectionCode,
    seatmapId,
    rows,
    availableMask,
    unavailableMask,
    lockedByOthersMask,
    pricescaleRanges,
    extendedDefs,
    sectionMask,
  };
}
