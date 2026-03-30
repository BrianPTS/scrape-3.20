/**
 * Unit tests for the tickets.com parser and mask utilities.
 * Uses Section 12 data from the Marlins (loanDepot park) as test fixtures.
 *
 * Run: node test/parser.test.js
 */

import { expandMask, isInMask, findPricescaleForConfigId } from '../helpers/mask.js';
import { parseAvailability, parseSeatmap } from '../helpers/parser.js';
import { buildConsecutiveGroups } from '../helpers/groups.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ============================================================
// Test: mask.js
// ============================================================
console.log('\n--- mask.js tests ---\n');

// expandMask
{
  const result = expandMask('9601-9602|9612');
  assertEqual(result.size, 3, 'expandMask: 3 items from "9601-9602|9612"');
  assert(result.has(9601), 'expandMask: contains 9601');
  assert(result.has(9602), 'expandMask: contains 9602');
  assert(result.has(9612), 'expandMask: contains 9612');
  assert(!result.has(9603), 'expandMask: does not contain 9603');
}

{
  const result = expandMask('9515-9521');
  assertEqual(result.size, 7, 'expandMask: 7 items from "9515-9521"');
  assert(result.has(9515), 'expandMask: range start 9515');
  assert(result.has(9521), 'expandMask: range end 9521');
}

{
  const result = expandMask('');
  assertEqual(result.size, 0, 'expandMask: empty string → empty set');
}

{
  const result = expandMask('42');
  assertEqual(result.size, 1, 'expandMask: single number "42"');
  assert(result.has(42), 'expandMask: contains 42');
}

// isInMask
{
  assert(isInMask(9601, '9601-9602|9612'), 'isInMask: 9601 in range');
  assert(isInMask(9612, '9601-9602|9612'), 'isInMask: 9612 single');
  assert(!isInMask(9603, '9601-9602|9612'), 'isInMask: 9603 not in mask');
  assert(!isInMask(9600, '9601-9602|9612'), 'isInMask: 9600 not in mask');
}

// findPricescaleForConfigId
{
  const ranges = [
    { id: '2185', mask: '9515-9521', ref_price: '186.00' },
    { id: '2187', mask: '9522-9664', ref_price: '55.00' },
    { id: '2189', mask: '9665-9939', ref_price: '48.00' },
  ];

  const ps1 = findPricescaleForConfigId(9515, ranges);
  assertEqual(ps1?.id, '2185', 'findPricescale: 9515 → HPB A (2185)');

  const ps2 = findPricescaleForConfigId(9601, ranges);
  assertEqual(ps2?.id, '2187', 'findPricescale: 9601 → HPB B (2187)');

  const ps3 = findPricescaleForConfigId(9700, ranges);
  assertEqual(ps3?.id, '2189', 'findPricescale: 9700 → HPB C (2189)');

  const ps4 = findPricescaleForConfigId(1, ranges);
  assertEqual(ps4, null, 'findPricescale: 1 → null (not in any range)');
}

// ============================================================
// Test: parser.js — parseSeatmap with Section 12 data
// ============================================================
console.log('\n--- parser.js seatmap tests ---\n');

const seatmapXml = `<?xml version="1.0" encoding="UTF-8"?>
<map_response accessible_context="non-accessible" expires="2026-03-27T12:45:15.163-04:00">
<seatmap code="SEC012" desc="Section 12" displayOrder="24" height="0" id="5529" timestamp="3/27/2026 1:04 AM EDT" width="0">
<actions allowed_sales_types="SINGLE" current_sales_type="SINGLE" default_to_autolock_mode="false" hold_code_management_allowed="false" lock_allowed="true" microprice_sales_enabled="false" trait_restrc_promo_reqs_patron="false"/>
<layouts><layout cell_coord="-460,63" code="SEC012" desc="Section 12" height="0" id="2092" type="RESERVED" width="0">
<rows>
<row seats="196247,9594,34,1816,5,11|196248,9595,35,1816,5,10|196249,9596,36,1816,5,9|196250,9597,37,1816,5,8|196251,9598,38,1816,5,7|196252,9599,39,1816,5,6|196253,9600,40,1816,5,5|196254,9601,41,1816,5,4|196255,9602,42,1816,5,3|196256,9603,43,1816,5,2|196257,9604,44,1816,5,1" y_cell_coord="10"/>
<row seats="196258,9605,34,1816,6,11|196259,9606,35,1816,6,10|196260,9607,36,1816,6,9|196261,9608,37,1816,6,8|196262,9609,38,1816,6,7|196263,9610,39,1816,6,6|196264,9611,40,1816,6,5|196265,9612,41,1816,6,4|196266,9613,42,1816,6,3|196267,9614,43,1816,6,2|196268,9615,44,1816,6,1" y_cell_coord="11"/>
</rows>
</layout></layouts>
<trims/>
<section_config><section id="1816" mask="9515-9939"/></section_config>
<venue_config mask="9515-9939" timestamp="3/27/2026 1:04 AM EDT"/>
<pricescale_config timestamp="3/27/2026 1:04 AM EDT">
<pricescale all_in_ref_price="208.47" currency="USD" display_order="1" id="2185" mask="9515-9521" ref_buyer_type_id="1" ref_price="186.00"/>
<pricescale all_in_ref_price="66.30" currency="USD" display_order="2" id="2187" mask="9522-9664" ref_buyer_type_id="1" ref_price="55.00"/>
<pricescale all_in_ref_price="58.81" currency="USD" display_order="3" id="2189" mask="9665-9939" ref_buyer_type_id="1" ref_price="48.00"/>
</pricescale_config>
<extended_configs event_id="14478" timestamp="3/27/2026 1:04 AM EDT">
<extended_config id="1141"><extended_def id="5" mask="9926-9939"/></extended_config>
<extended_config id="1241"><extended_def id="1221" mask="9926-9939"/></extended_config>
</extended_configs>
<view_modes event_id="14478" timestamp="TODO">
<view_mode code="core" hold_code_ids="1001" holdcode_id="1001">
<availability available_selectable_mask="9601-9602|9612" locked_by_current_user_mask="" locked_by_others_mask="" unavailable_unselectable_mask="9515-9600|9603-9611|9613-9939"/>
</view_mode>
</view_modes>
</seatmap>
<metadata event_id="14478" is_micropricing_feature_enabled="false" micropricing_sales_event_access="false" ref_price_algo="BUYER_TYPE_DISPLAY_ORDER" sales_type="SINGLE"/>
</map_response>`;

{
  const seatmap = parseSeatmap(seatmapXml);

  assertEqual(seatmap.sectionCode, 'SEC012', 'parseSeatmap: section code is SEC012');
  assertEqual(seatmap.rows.length, 2, 'parseSeatmap: 2 rows (Row 5 and Row 6)');
  assertEqual(seatmap.rows[0].rowLabel, '5', 'parseSeatmap: first row is Row 5');
  assertEqual(seatmap.rows[0].seats.length, 11, 'parseSeatmap: Row 5 has 11 seats');
  assertEqual(seatmap.rows[1].rowLabel, '6', 'parseSeatmap: second row is Row 6');

  // Check seat parsing
  const seat5_4 = seatmap.rows[0].seats.find((s) => s.seatNumber === '4');
  assertEqual(seat5_4?.configId, 9601, 'parseSeatmap: Seat 4 in Row 5 has configId 9601');
  assertEqual(seat5_4?.globalId, 196254, 'parseSeatmap: Seat 4 in Row 5 has globalId 196254');

  // Check availability mask
  assertEqual(seatmap.availableMask, '9601-9602|9612', 'parseSeatmap: available mask correct');

  // Check pricescale ranges
  assertEqual(seatmap.pricescaleRanges.length, 3, 'parseSeatmap: 3 pricescale ranges');
  assertEqual(seatmap.pricescaleRanges[1].id, '2187', 'parseSeatmap: 2nd pricescale is HPB B');
  assertEqual(seatmap.pricescaleRanges[1].refPrice, 55.00, 'parseSeatmap: HPB B ref_price is $55');

  // Check extended defs (wheelchair)
  assertEqual(seatmap.extendedDefs.length, 2, 'parseSeatmap: 2 extended def entries');
  assertEqual(seatmap.extendedDefs[0].mask, '9926-9939', 'parseSeatmap: wheelchair mask is 9926-9939');
}

// ============================================================
// Test: groups.js — buildConsecutiveGroups with Section 12
// ============================================================
console.log('\n--- groups.js tests ---\n');

{
  // Create a minimal availability object for testing
  const availability = {
    event: {
      id: '14478',
      code: '26REG0327',
      name: 'Rockies at Marlins',
      date: '3/27/2026 7:10 PM EDT',
      venue: 'loanDepot park',
      venueId: '1341',
    },
    priceStructure: {
      '2185': { id: '2185', facePrice: 186.00, allInPrice: 208.47, convenienceFee: 8.25, handlingFee: 1.20, taxAmount: 13.02 },
      '2187': { id: '2187', facePrice: 55.00, allInPrice: 66.30, convenienceFee: 6.25, handlingFee: 1.20, taxAmount: 3.85 },
      '2189': { id: '2189', facePrice: 48.00, allInPrice: 58.81, convenienceFee: 6.25, handlingFee: 1.20, taxAmount: 3.36 },
    },
    sectionInventory: {
      '1816': { id: '1816', available: 3, capacity: 391, maxContiguous: 2, pricescales: [], sectionName: '12' },
    },
    sectionConfigs: {
      '1816': { id: '1816', code: 'SEC12', desc: '12', publicDesc: '12', displayOrder: 24 },
    },
  };

  const seatmapData = parseSeatmap(seatmapXml);
  const groups = buildConsecutiveGroups(availability, seatmapData, '1816');

  assertEqual(groups.length, 2, 'groups: 2 consecutive groups from Section 12');

  // Group 1: Row 5, Seats 3-4 (consecutive pair)
  const row5Group = groups.find((g) => g.row === '5');
  assert(row5Group !== undefined, 'groups: found a group in Row 5');
  assertEqual(row5Group?.seatCount, 2, 'groups: Row 5 group has 2 seats');
  assertEqual(row5Group?.seatRange, '3-4', 'groups: Row 5 seat range is "3-4"');
  assertEqual(row5Group?.inventory.face_price, 55.00, 'groups: Row 5 face price is $55.00');
  assertEqual(row5Group?.inventory.taxed_cost, 66.30, 'groups: Row 5 all-in price is $66.30');
  assertEqual(row5Group?.inventory.stockType, 'Primary', 'groups: stockType is Primary');
  assertEqual(row5Group?.section, '12', 'groups: section name is "12"');
  assertEqual(row5Group?.eventId, '14478', 'groups: eventId is 14478');

  // Group 2: Row 6, Seat 4 (single seat)
  const row6Group = groups.find((g) => g.row === '6');
  assert(row6Group !== undefined, 'groups: found a group in Row 6');
  assertEqual(row6Group?.seatCount, 1, 'groups: Row 6 group has 1 seat');
  assertEqual(row6Group?.seatRange, '4', 'groups: Row 6 seat range is "4"');
  assertEqual(row6Group?.inventory.face_price, 55.00, 'groups: Row 6 face price is $55.00');

  // Check tickets sub-array
  assertEqual(row5Group?.inventory.tickets.length, 2, 'groups: Row 5 has 2 tickets');
  assertEqual(row5Group?.inventory.tickets[0].faceValue, 55.00, 'groups: ticket faceValue is $55.00');
  assertEqual(row5Group?.inventory.tickets[0].seatNumber, 3, 'groups: first ticket seat number is 3');

  // Check seats sub-array
  assertEqual(row5Group?.seats.length, 2, 'groups: Row 5 has 2 seats in seats array');
  assertEqual(row5Group?.seats[0].number, '3', 'groups: first seat number is "3"');
  assertEqual(row5Group?.seats[0].price, 66.30, 'groups: seat price is all-in $66.30');
}

// ============================================================
// Summary
// ============================================================
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(40)}\n`);

process.exit(failed > 0 ? 1 : 0);
