/**
 * Unit tests for the AXS parser and group builder.
 * Uses Houston Rockets data as test fixtures (eventID 5002).
 *
 * Run: node test/parser.test.js
 */

import { parseInventory, filterAvailableSeats, parsePricing, STATUS_CODES } from '../helpers/parser.js';
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
// Test Fixtures — Real Rockets data (simplified)
// ============================================================

const inventoryFixture = {
  offers: [
    {
      category: "SEAT",
      offerGroupID: "85129908",
      offerID: "85129907",
      eventID: "5002",
      zoneID: "1",
      allowEmptySingleSeats: false,
      requireContiguousSeats: true,
      items: [
        { id: "1", sectionLabel: "119", rowLabel: "WC25", number: "5", statusCode: 37, statusCodeLabel: "ACCESSIBLE SEATING", priceLevelID: "2079", seatType: "ACCESSIBLE", isGASection: false, displayOrder: "1" },
        { id: "2", sectionLabel: "119", rowLabel: "WC25", number: "6", statusCode: 37, statusCodeLabel: "ACCESSIBLE SEATING", priceLevelID: "2079", seatType: "ACCESSIBLE", isGASection: false, displayOrder: "2" },
      ]
    },
    {
      category: "SEAT",
      offerGroupID: "85129915",
      offerID: "85129914",
      eventID: "5002",
      zoneID: "1",
      allowEmptySingleSeats: false,
      requireContiguousSeats: true,
      items: [
        { id: "10", sectionLabel: "107", rowLabel: "2", number: "13", statusCode: 6, statusCodeLabel: "AVAILABLE", priceLevelID: "2051", seatType: "STANDARD", isGASection: false, displayOrder: "10" },
        { id: "11", sectionLabel: "107", rowLabel: "2", number: "14", statusCode: 6, statusCodeLabel: "AVAILABLE", priceLevelID: "2051", seatType: "STANDARD", isGASection: false, displayOrder: "11" },
        { id: "12", sectionLabel: "107", rowLabel: "2", number: "15", statusCode: 6, statusCodeLabel: "AVAILABLE", priceLevelID: "2051", seatType: "STANDARD", isGASection: false, displayOrder: "12" },
        { id: "20", sectionLabel: "104", rowLabel: "16", number: "9", statusCode: 6, statusCodeLabel: "AVAILABLE", priceLevelID: "2058", seatType: "STANDARD", isGASection: false, displayOrder: "20" },
        { id: "21", sectionLabel: "104", rowLabel: "16", number: "10", statusCode: 6, statusCodeLabel: "AVAILABLE", priceLevelID: "2058", seatType: "STANDARD", isGASection: false, displayOrder: "21" },
        { id: "30", sectionLabel: "104", rowLabel: "16", number: "15", statusCode: 6, statusCodeLabel: "AVAILABLE", priceLevelID: "2058", seatType: "STANDARD", isGASection: false, displayOrder: "30" },
        { id: "40", sectionLabel: "401", rowLabel: "5", number: "1", statusCode: 45188, statusCodeLabel: "AXS DISTRO", priceLevelID: "2070", seatType: "STANDARD", isGASection: false, displayOrder: "40" },
        { id: "50", sectionLabel: "107", rowLabel: "2", number: "17", statusCode: 1179, statusCodeLabel: "AVAILABLE - SINGLE", priceLevelID: "2051", seatType: "STANDARD", isGASection: false, displayOrder: "50" },
      ]
    }
  ]
};

const pricingFixture = {
  offerPrices: [
    {
      offerID: "85129914",
      offerGroupID: "85129915",
      offerLookupId: "E_HR260331_AD_75",
      offerName: "03/31/26 Rockets vs. New York Game 36 - Admissions",
      min: 1,
      max: 6,
      increment: 1,
      offerType: "Single",
      zonePrices: [
        {
          productID: "83829030",
          zoneID: "1",
          eventID: "5002",
          priceLevels: [
            {
              label: "P4-A Club",
              priceLevelID: "2051",
              availability: { amount: 3 },
              prices: [{
                base: 65000,
                priceTypeID: "48390",
                priceComponents: [
                  { name: "Base Component", amount: 64500, calculationMethod: "Fixed", base: true, taxIds: [] },
                  { name: "VEN_FacFee", amount: 500, calculationMethod: "Fixed", base: false, taxIds: [] }
                ]
              }],
              order: 9
            },
            {
              label: "P7-B Lower Bowl",
              priceLevelID: "2058",
              availability: { amount: 10 },
              prices: [{
                base: 12500,
                priceTypeID: "48390",
                priceComponents: [
                  { name: "Base Component", amount: 12000, calculationMethod: "Fixed", base: true, taxIds: [] },
                  { name: "VEN_FacFee", amount: 500, calculationMethod: "Fixed", base: false, taxIds: [] }
                ]
              }],
              order: 15
            },
            {
              label: "P9-C Upper End Zone",
              priceLevelID: "2070",
              availability: { amount: 50 },
              prices: [{
                base: 3300,
                priceTypeID: "48390",
                priceComponents: [
                  { name: "Base Component", amount: 2800, calculationMethod: "Fixed", base: true, taxIds: [] },
                  { name: "VEN_FacFee", amount: 500, calculationMethod: "Fixed", base: false, taxIds: [] }
                ]
              }],
              order: 20
            },
            {
              label: "Ledge Dining",
              priceLevelID: "91",
              availability: { amount: 2 },
              prices: [{
                base: 27500,
                priceTypeID: "48390",
                priceComponents: [
                  { name: "Base Component", amount: 21000, calculationMethod: "Fixed", base: true, taxIds: [] },
                  { name: "VEN_FacFee", amount: 500, calculationMethod: "Fixed", base: false, taxIds: [] },
                  { name: "Food & Beverage", amount: 6000, calculationMethod: "Fixed", base: false, taxIds: [] }
                ]
              }],
              order: 5
            }
          ]
        }
      ]
    },
    {
      offerID: "9000000157919775",
      offerGroupID: null,
      offerName: "Resale Ticket",
      zonePrices: [{ priceLevels: [{ priceLevelID: "99999", label: "Resale", prices: [{ base: 50000, priceComponents: [] }] }] }]
    }
  ]
};

// ============================================================
// Test: parser.js — parseInventory
// ============================================================
console.log('\n--- parseInventory tests ---\n');

{
  const result = parseInventory(inventoryFixture);

  assertEqual(result.eventId, '5002', 'parseInventory: eventId is "5002"');
  assertEqual(result.offers.length, 2, 'parseInventory: 2 offers');
  assertEqual(result.seats.length, 10, 'parseInventory: 10 total seats');

  const seat107 = result.seats.find(s => s.sectionLabel === '107' && s.number === '13');
  assert(seat107 !== undefined, 'parseInventory: found Section 107, Seat 13');
  assertEqual(seat107?.statusCode, 6, 'parseInventory: Seat 13 statusCode is 6 (AVAILABLE)');
  assertEqual(seat107?.priceLevelID, '2051', 'parseInventory: Seat 13 priceLevelID is 2051');
  assertEqual(seat107?.seatType, 'STANDARD', 'parseInventory: Seat 13 is STANDARD');
  assertEqual(seat107?.rowLabel, '2', 'parseInventory: Seat 13 rowLabel is "2"');

  const wcSeat = result.seats.find(s => s.seatType === 'ACCESSIBLE');
  assert(wcSeat !== undefined, 'parseInventory: found ACCESSIBLE seat');
  assertEqual(wcSeat?.statusCode, 37, 'parseInventory: accessible seat statusCode is 37');
}

// ============================================================
// Test: parser.js — filterAvailableSeats
// ============================================================
console.log('\n--- filterAvailableSeats tests ---\n');

{
  const allSeats = parseInventory(inventoryFixture).seats;

  const available = filterAvailableSeats(allSeats);
  assertEqual(available.length, 7, 'filterAvailable: 7 available standard seats (excludes 2 accessible + 1 AXS DISTRO)');

  const hasAccessible = available.some(s => s.seatType === 'ACCESSIBLE');
  assert(!hasAccessible, 'filterAvailable: no ACCESSIBLE seats');

  const hasDistro = available.some(s => s.statusCode === STATUS_CODES.AXS_DISTRO);
  assert(!hasDistro, 'filterAvailable: no AXS DISTRO seats');

  const hasSingle = available.some(s => s.statusCode === STATUS_CODES.AVAILABLE_SINGLE);
  assert(hasSingle, 'filterAvailable: includes AVAILABLE_SINGLE (statusCode 1179)');

  // With accessible included
  const withAccessible = filterAvailableSeats(allSeats, { includeAccessible: true });
  assertEqual(withAccessible.length, 9, 'filterAvailable (includeAccessible): 9 seats');
}

// ============================================================
// Test: parser.js — parsePricing
// ============================================================
console.log('\n--- parsePricing tests ---\n');

{
  const priceLevels = parsePricing(pricingFixture);

  assertEqual(priceLevels.size, 4, 'parsePricing: 4 price levels (excludes resale)');
  assert(!priceLevels.has('99999'), 'parsePricing: resale price level excluded (null offerGroupID)');

  const p4a = priceLevels.get('2051');
  assert(p4a !== undefined, 'parsePricing: found P4-A Club (2051)');
  assertEqual(p4a?.label, 'P4-A Club', 'parsePricing: label is "P4-A Club"');
  assertEqual(p4a?.totalPrice, 650.00, 'parsePricing: totalPrice is $650.00 (65000 cents / 100)');
  assertEqual(p4a?.facePrice, 645.00, 'parsePricing: facePrice is $645.00');
  assertEqual(p4a?.facilityFee, 5.00, 'parsePricing: facilityFee is $5.00');
  assertEqual(p4a?.availability, 3, 'parsePricing: availability is 3');

  const p7b = priceLevels.get('2058');
  assertEqual(p7b?.totalPrice, 125.00, 'parsePricing: P7-B totalPrice is $125.00');
  assertEqual(p7b?.facePrice, 120.00, 'parsePricing: P7-B facePrice is $120.00');

  const p9c = priceLevels.get('2070');
  assertEqual(p9c?.totalPrice, 33.00, 'parsePricing: P9-C totalPrice is $33.00');
  assertEqual(p9c?.facePrice, 28.00, 'parsePricing: P9-C facePrice is $28.00');

  const ledge = priceLevels.get('91');
  assertEqual(ledge?.totalPrice, 275.00, 'parsePricing: Ledge Dining totalPrice is $275.00');
  assertEqual(ledge?.facePrice, 210.00, 'parsePricing: Ledge Dining facePrice is $210.00');
  assertEqual(ledge?.foodBev, 60.00, 'parsePricing: Ledge Dining F&B is $60.00');
}

// ============================================================
// Test: groups.js — buildConsecutiveGroups
// ============================================================
console.log('\n--- buildConsecutiveGroups tests ---\n');

{
  const allSeats = parseInventory(inventoryFixture).seats;
  const available = filterAvailableSeats(allSeats);
  const priceLevels = parsePricing(pricingFixture);

  const eventMeta = {
    eventId: '5002',
    eventName: 'Rockets vs. New York',
    venue: 'Toyota Center',
    eventDate: '2026-03-31T19:00:00',
  };

  const groups = buildConsecutiveGroups(available, priceLevels, eventMeta);

  // Expected groups:
  // Section 107, Row 2: seats 13,14,15 (consecutive) + seat 17 (single) = 2 groups
  // Section 104, Row 16: seats 9,10 (consecutive) + seat 15 (single) = 2 groups
  // Total: 4 groups
  assertEqual(groups.length, 4, 'groups: 4 consecutive groups');

  // Section 107, Row 2, Seats 13-15 (consecutive triple)
  const g107_triple = groups.find(g => g.section === '107' && g.seatRange === '13-15');
  assert(g107_triple !== undefined, 'groups: found Section 107 group with seats 13-15');
  assertEqual(g107_triple?.seatCount, 3, 'groups: Section 107 13-15 has 3 seats');
  assertEqual(g107_triple?.row, '2', 'groups: row is "2"');
  assertEqual(g107_triple?.inventory.face_price, 645.00, 'groups: face price is $645.00');
  assertEqual(g107_triple?.inventory.taxed_cost, 650.00, 'groups: total (taxed_cost) is $650.00');
  assertEqual(g107_triple?.inventory.stockType, 'Primary', 'groups: stockType is Primary');
  assertEqual(g107_triple?.eventId, '5002', 'groups: eventId is "5002"');
  assertEqual(g107_triple?.event_name, 'Rockets vs. New York', 'groups: event_name matches');
  assertEqual(g107_triple?.venue_name, 'Toyota Center', 'groups: venue_name matches');

  // Section 107, Row 2, Seat 17 (single from AVAILABLE_SINGLE status)
  const g107_single = groups.find(g => g.section === '107' && g.seatRange === '17');
  assert(g107_single !== undefined, 'groups: found Section 107 single seat 17');
  assertEqual(g107_single?.seatCount, 1, 'groups: single seat has seatCount 1');

  // Section 104, Row 16, Seats 9-10 (consecutive pair)
  const g104_pair = groups.find(g => g.section === '104' && g.seatRange === '9-10');
  assert(g104_pair !== undefined, 'groups: found Section 104 pair seats 9-10');
  assertEqual(g104_pair?.seatCount, 2, 'groups: Section 104 9-10 has 2 seats');
  assertEqual(g104_pair?.inventory.face_price, 120.00, 'groups: Section 104 face price is $120.00');
  assertEqual(g104_pair?.inventory.taxed_cost, 125.00, 'groups: Section 104 total is $125.00');

  // Section 104, Row 16, Seat 15 (single, non-consecutive)
  const g104_single = groups.find(g => g.section === '104' && g.seatRange === '15');
  assert(g104_single !== undefined, 'groups: found Section 104 single seat 15');
  assertEqual(g104_single?.seatCount, 1, 'groups: Section 104 seat 15 is single');

  // Check tickets sub-array
  assertEqual(g107_triple?.inventory.tickets.length, 3, 'groups: Section 107 has 3 tickets');
  assertEqual(g107_triple?.inventory.tickets[0].faceValue, 645.00, 'groups: ticket faceValue is $645.00');
  assertEqual(g107_triple?.inventory.tickets[0].seatNumber, 13, 'groups: first ticket seatNumber is 13');

  // Check seats sub-array
  assertEqual(g107_triple?.seats.length, 3, 'groups: Section 107 has 3 in seats array');
  assertEqual(g107_triple?.seats[0].number, '13', 'groups: first seat number is "13"');
  assertEqual(g107_triple?.seats[0].price, 650.00, 'groups: seat price is $650.00 (total)');

  // Check mapping_id format
  assertEqual(g107_triple?.mapping_id, 'AXS-5002', 'groups: mapping_id is "AXS-5002"');

  // Check offerId format
  assertEqual(g107_triple?.inventory.offerId, 'AXS-5002-2051', 'groups: offerId is "AXS-5002-2051"');

  // Check zone field uses price level label
  assertEqual(g107_triple?.inventory.zone, 'P4-A Club', 'groups: zone is price level label');
}

// ============================================================
// Edge cases
// ============================================================
console.log('\n--- Edge case tests ---\n');

{
  // Empty inventory
  const empty = parseInventory({ offers: [] });
  assertEqual(empty.seats.length, 0, 'edge: empty offers → 0 seats');

  const emptyGroups = buildConsecutiveGroups([], new Map(), { eventId: '1' });
  assertEqual(emptyGroups.length, 0, 'edge: empty seats → 0 groups');

  // Empty pricing
  const emptyPricing = parsePricing({ offerPrices: [] });
  assertEqual(emptyPricing.size, 0, 'edge: empty offerPrices → 0 price levels');

  // Missing offers key
  const noOffers = parseInventory({});
  assertEqual(noOffers.seats.length, 0, 'edge: missing offers key → 0 seats');
}

// ============================================================
// Summary
// ============================================================
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(40)}\n`);

process.exit(failed > 0 ? 1 : 0);
