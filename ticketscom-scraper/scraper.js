/**
 * Main scraper orchestrator for tickets.com.
 *
 * Uses Patchright (Playwright fork with anti-detection) to:
 * 1. Navigate to an event page
 * 2. Intercept the availability XML response
 * 3. For each section with inventory, trigger seatmap loads
 * 4. Capture seatmap XML responses
 * 5. Build ConsecutiveGroup records from the parsed data
 */

import { chromium } from 'patchright';
import { parseAvailability, parseSeatmap } from './helpers/parser.js';
import { buildConsecutiveGroups } from './helpers/groups.js';
import { ConsecutiveGroup } from './models/ConsecutiveGroup.js';

/**
 * Scrape a single event from tickets.com.
 *
 * @param {string} eventUrl - Full URL, e.g. "https://mlb.tickets.com/schedule/?agency=MLB_MPH&orgid=27#/event/14478/seatmap/"
 * @param {object} [options]
 * @param {boolean} [options.headless=true]
 * @param {boolean} [options.saveToDB=true]
 * @param {number} [options.sectionDelay=1500] - ms delay between section fetches
 * @returns {Promise<{groups: Array, availability: object}>}
 */
export async function scrapeEvent(eventUrl, options = {}) {
  const {
    headless = true,
    saveToDB = true,
    sectionDelay = 1500,
  } = options;

  let browser;
  let availabilityXml = null;
  const seatmapXmls = new Map(); // sectionCode → xmlString
  let availabilityResolve;
  const availabilityPromise = new Promise((resolve) => {
    availabilityResolve = resolve;
  });

  try {
    browser = await chromium.launch({ headless });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    // --- Intercept XML responses ---
    page.on('response', async (response) => {
      const url = response.url();
      const contentType = response.headers()['content-type'] || '';

      try {
        // Availability endpoint: returns the full venue+event+inventory XML
        if (
          contentType.includes('xml') &&
          url.includes('availability') &&
          !availabilityXml
        ) {
          availabilityXml = await response.text();
          console.log(`  ✓ Captured availability XML (${availabilityXml.length} bytes)`);
          availabilityResolve(availabilityXml);
          return;
        }

        // Seatmap endpoint: returns per-section seat data XML
        if (contentType.includes('xml') && url.includes('seatmap')) {
          const xml = await response.text();
          // Extract section code from the XML itself
          const codeMatch = xml.match(/seatmap\s+code="([^"]+)"/);
          if (codeMatch) {
            const code = codeMatch[1].trim();
            seatmapXmls.set(code, xml);
            console.log(`  ✓ Captured seatmap XML for ${code} (${xml.length} bytes)`);
          }
        }
      } catch (err) {
        // Response may have been destroyed, ignore
      }
    });

    // --- Navigate to event ---
    console.log(`Navigating to: ${eventUrl}`);
    await page.goto(eventUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait for availability XML to be captured
    console.log('Waiting for availability data...');
    const availXmlTimeout = Promise.race([
      availabilityPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout waiting for availability XML')), 30000)
      ),
    ]);
    await availXmlTimeout;

    // --- Parse availability ---
    const availability = parseAvailability(availabilityXml);
    console.log(
      `Event: ${availability.event.name} @ ${availability.venue.name}`
    );
    console.log(`Event ID: ${availability.event.id}`);

    // Find sections with available seats
    const sectionsWithInventory = Object.values(availability.sectionInventory)
      .filter((s) => s.available > 0);

    console.log(
      `Found ${sectionsWithInventory.length} sections with inventory ` +
      `(${sectionsWithInventory.reduce((sum, s) => sum + s.available, 0)} total available seats)`
    );

    // --- Fetch seatmaps for each section ---
    const allGroups = [];

    // Build a map of sectionId → seatmap code for clicking
    const sectionIdToCode = {};
    for (const [id, config] of Object.entries(availability.sectionConfigs)) {
      // The seatmap code is usually "SEC" + the section number, e.g. SEC012
      // Match against the seatmapDefs to find the right code
      const paddedDesc = config.desc?.padStart(3, '0');
      const possibleCodes = [
        `SEC${paddedDesc}`,
        `SEC${config.desc}`,
        config.code?.trim(),
      ];

      for (const code of possibleCodes) {
        if (code && availability.seatmapDefs[code]) {
          sectionIdToCode[id] = code;
          break;
        }
      }

      // Fallback: try matching by seatmap desc containing section desc
      if (!sectionIdToCode[id]) {
        for (const [smCode, smDef] of Object.entries(availability.seatmapDefs)) {
          if (smDef.desc?.includes(config.desc?.trim())) {
            sectionIdToCode[id] = smCode;
            break;
          }
        }
      }
    }

    for (const section of sectionsWithInventory) {
      const seatmapCode = sectionIdToCode[section.id];
      console.log(
        `  Processing section ${section.sectionName} (id=${section.id}, ` +
        `available=${section.available}, seatmapCode=${seatmapCode || 'unknown'})`
      );

      // Try to trigger seatmap load by clicking on the section in the map
      try {
        // The seatmap is loaded via clicking a section hotspot on the SVG/canvas
        // Try multiple selector strategies
        const sectionConfig = availability.sectionConfigs[section.id];
        const sectionDesc = sectionConfig?.desc?.trim();

        // Strategy 1: Click the hotspot area element
        const clicked = await tryClickSection(page, section, sectionDesc);

        if (clicked) {
          // Wait for the seatmap XML response
          await waitForSeatmap(page, seatmapXmls, seatmapCode, 8000);
        }
      } catch (err) {
        console.log(`    Warning: Could not trigger seatmap for section ${section.sectionName}: ${err.message}`);
      }

      // Check if we captured the seatmap XML
      const capturedCode = seatmapCode || findCapturedSeatmap(seatmapXmls, section);
      if (capturedCode && seatmapXmls.has(capturedCode)) {
        const seatmapData = parseSeatmap(seatmapXmls.get(capturedCode));
        const groups = buildConsecutiveGroups(availability, seatmapData, section.id);
        allGroups.push(...groups);
        console.log(`    → ${groups.length} consecutive group(s) found`);
      } else {
        console.log(`    → No seatmap data captured for this section`);
      }

      // Navigate back to the venue map for next section
      if (sectionsWithInventory.indexOf(section) < sectionsWithInventory.length - 1) {
        try {
          // Click the "Go Back" / close button to return to venue map
          const backButton = page.locator('[class*="back"], [aria-label*="back"], [aria-label*="Back"], [class*="close-map"]').first();
          if (await backButton.isVisible({ timeout: 2000 }).catch(() => false)) {
            await backButton.click();
            await page.waitForTimeout(sectionDelay);
          } else {
            // Navigate back via URL
            await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
            await page.waitForTimeout(sectionDelay);
          }
        } catch {
          await page.waitForTimeout(sectionDelay);
        }
      }
    }

    console.log(`\nTotal consecutive groups found: ${allGroups.length}`);

    // --- Save to MongoDB ---
    if (saveToDB && allGroups.length > 0) {
      await saveResults(allGroups);
      console.log(`Saved ${allGroups.length} groups to MongoDB`);
    }

    return { groups: allGroups, availability };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Try to click on a section in the seatmap.
 */
async function tryClickSection(page, section, sectionDesc) {
  // Strategy 1: Click on an area/polygon element with matching section info
  const strategies = [
    // Image map area
    `area[alt*="${sectionDesc}"]`,
    `area[title*="${sectionDesc}"]`,
    // SVG/canvas elements
    `[data-section-id="${section.id}"]`,
    `[data-section="${sectionDesc}"]`,
    // Generic clickable with section text
    `text="${sectionDesc}"`,
  ];

  for (const selector of strategies) {
    try {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
        await el.click({ timeout: 3000 });
        return true;
      }
    } catch {
      continue;
    }
  }

  // Strategy 2: Use hover_coords from section config to click at coordinates
  const sectionConfig = Object.values({}).length; // placeholder
  // For now, log that we couldn't click
  return false;
}

/**
 * Wait for a specific seatmap XML to be captured.
 */
async function waitForSeatmap(page, seatmapXmls, expectedCode, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (expectedCode && seatmapXmls.has(expectedCode)) return true;
    // Also check if any new seatmap was captured
    await page.waitForTimeout(500);
  }
  return false;
}

/**
 * Try to find a captured seatmap for a section by checking seatmap keys.
 */
function findCapturedSeatmap(seatmapXmls, section) {
  for (const key of seatmapXmls.keys()) {
    if (key.includes(section.sectionName) || key.includes(section.id)) {
      return key;
    }
  }
  return null;
}

/**
 * Save ConsecutiveGroup records to MongoDB.
 */
async function saveResults(groups) {
  const BATCH_SIZE = 100;
  for (let i = 0; i < groups.length; i += BATCH_SIZE) {
    const batch = groups.slice(i, i + BATCH_SIZE);
    await ConsecutiveGroup.insertMany(batch, { ordered: false }).catch((err) => {
      // Ignore duplicate key errors (code 11000)
      if (err.code !== 11000 && !err.message?.includes('duplicate key')) {
        throw err;
      }
      const inserted = err.insertedDocs?.length || batch.length - (err.writeErrors?.length || 0);
      console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${inserted} inserted, ${err.writeErrors?.length || 0} duplicates skipped`);
    });
  }
}

/**
 * Scrape using pre-captured XML strings (for testing or offline processing).
 * Skips browser automation entirely.
 *
 * @param {string} availabilityXml - Raw availability XML
 * @param {Map<string, string>} seatmapXmlsBySection - Map of sectionId → raw seatmap XML
 * @param {object} [options]
 * @returns {Promise<{groups: Array, availability: object}>}
 */
export async function scrapeFromXml(availabilityXml, seatmapXmlsBySection, options = {}) {
  const { saveToDB = false } = options;

  const availability = parseAvailability(availabilityXml);
  console.log(`Event: ${availability.event.name} @ ${availability.venue.name}`);

  const allGroups = [];

  for (const [sectionId, xml] of seatmapXmlsBySection) {
    const seatmapData = parseSeatmap(xml);
    const groups = buildConsecutiveGroups(availability, seatmapData, sectionId);
    allGroups.push(...groups);
    console.log(`  Section ${sectionId}: ${groups.length} consecutive group(s)`);
  }

  console.log(`Total consecutive groups: ${allGroups.length}`);

  if (saveToDB && allGroups.length > 0) {
    await saveResults(allGroups);
    console.log(`Saved ${allGroups.length} groups to MongoDB`);
  }

  return { groups: allGroups, availability };
}
