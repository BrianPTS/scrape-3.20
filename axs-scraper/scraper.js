/**
 * Main scraper orchestrator for AXS.
 *
 * Uses Patchright (Playwright fork with anti-detection) to:
 * 1. Navigate to an AXS event page
 * 2. Intercept the inventory JSON response (seats + availability)
 * 3. Intercept the pricing JSON response (price levels + fees)
 * 4. Build ConsecutiveGroup records from the combined data
 *
 * Simpler than tickets.com — only 2 JSON responses to capture,
 * no per-section clicking needed.
 */

import { chromium } from 'patchright';
import { parseInventory, filterAvailableSeats, parsePricing } from './helpers/parser.js';
import { buildConsecutiveGroups } from './helpers/groups.js';
import { ConsecutiveGroup } from './models/ConsecutiveGroup.js';

/**
 * Scrape a single event from AXS.
 *
 * @param {string} eventUrl - Full AXS event URL (e.g., tix.axs.com/...)
 * @param {object} [options]
 * @param {boolean} [options.headless=true]
 * @param {boolean} [options.saveToDB=true]
 * @param {string} [options.eventName] - Override event name (can't always extract from page)
 * @param {string} [options.venue] - Override venue name
 * @param {string} [options.eventDate] - Override event date
 * @returns {Promise<{groups: Array, inventory: object, pricing: Map}>}
 */
export async function scrapeEvent(eventUrl, options = {}) {
  const {
    headless = true,
    saveToDB = true,
    eventName = '',
    venue = '',
    eventDate = '',
  } = options;

  let browser;
  let inventoryData = null;
  let pricingData = null;

  let inventoryResolve;
  let pricingResolve;
  const inventoryPromise = new Promise((resolve) => { inventoryResolve = resolve; });
  const pricingPromise = new Promise((resolve) => { pricingResolve = resolve; });

  try {
    browser = await chromium.launch({ headless });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    // --- Intercept JSON responses ---
    page.on('response', async (response) => {
      const url = response.url();

      try {
        // Inventory endpoint: POST /offer/search
        if (url.includes('/offer/search') && !inventoryData) {
          const text = await response.text();
          try {
            const json = JSON.parse(text);
            if (json.offers) {
              inventoryData = json;
              console.log(`  ✓ Captured inventory JSON (${json.offers?.length || 0} offers)`);
              inventoryResolve(json);
            }
          } catch { /* not JSON, skip */ }
          return;
        }

        // Pricing endpoint: GET /price
        if (url.includes('/price') && !pricingData) {
          const text = await response.text();
          try {
            const json = JSON.parse(text);
            if (json.offerPrices) {
              pricingData = json;
              console.log(`  ✓ Captured pricing JSON (${json.offerPrices?.length || 0} offer prices)`);
              pricingResolve(json);
            }
          } catch { /* not JSON, skip */ }
        }
      } catch {
        // Response may have been destroyed, ignore
      }
    });

    // --- Navigate to event ---
    console.log(`Navigating to: ${eventUrl}`);
    await page.goto(eventUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait for both responses
    console.log('Waiting for inventory and pricing data...');
    const timeout = (promise, ms, label) =>
      Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout waiting for ${label}`)), ms)
        ),
      ]);

    await Promise.all([
      timeout(inventoryPromise, 30000, 'inventory JSON'),
      timeout(pricingPromise, 30000, 'pricing JSON'),
    ]);

    // --- Try to extract event metadata from page ---
    let resolvedEventName = eventName;
    let resolvedVenue = venue;
    let resolvedEventDate = eventDate;

    if (!resolvedEventName || !resolvedVenue) {
      try {
        // Try extracting from the page title or meta tags
        const pageTitle = await page.title();
        if (!resolvedEventName && pageTitle) {
          resolvedEventName = pageTitle.replace(/ \| AXS$/i, '').trim();
        }
      } catch { /* ignore */ }
    }

    // --- Parse data ---
    const inventory = parseInventory(inventoryData);
    const availableSeats = filterAvailableSeats(inventory.seats);
    const priceLevels = parsePricing(pricingData);

    console.log(
      `Event ID: ${inventory.eventId}\n` +
      `Total seats in response: ${inventory.seats.length}\n` +
      `Available standard seats: ${availableSeats.length}\n` +
      `Price levels: ${priceLevels.size}`
    );

    // --- Build consecutive groups ---
    const eventMeta = {
      eventId: inventory.eventId,
      eventName: resolvedEventName,
      venue: resolvedVenue,
      eventDate: resolvedEventDate || new Date(),
    };

    const groups = buildConsecutiveGroups(availableSeats, priceLevels, eventMeta);
    console.log(`\nConsecutive groups found: ${groups.length}`);

    // --- Save to MongoDB ---
    if (saveToDB && groups.length > 0) {
      await saveResults(groups);
      console.log(`Saved ${groups.length} groups to MongoDB`);
    }

    return { groups, inventory, pricing: priceLevels };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Save ConsecutiveGroup records to MongoDB.
 */
async function saveResults(groups) {
  const BATCH_SIZE = 100;
  for (let i = 0; i < groups.length; i += BATCH_SIZE) {
    const batch = groups.slice(i, i + BATCH_SIZE);
    await ConsecutiveGroup.insertMany(batch, { ordered: false }).catch((err) => {
      if (err.code !== 11000 && !err.message?.includes('duplicate key')) {
        throw err;
      }
      const inserted = batch.length - (err.writeErrors?.length || 0);
      console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${inserted} inserted, ${err.writeErrors?.length || 0} duplicates skipped`);
    });
  }
}

/**
 * Scrape using pre-captured JSON data (for testing or offline processing).
 * Skips browser automation entirely.
 *
 * @param {object} inventoryJson - Raw inventory JSON
 * @param {object} pricingJson - Raw pricing JSON
 * @param {object} eventMeta - { eventId, eventName, venue, eventDate }
 * @param {object} [options]
 * @returns {Promise<{groups: Array, inventory: object, pricing: Map}>}
 */
export async function scrapeFromJson(inventoryJson, pricingJson, eventMeta, options = {}) {
  const { saveToDB = false } = options;

  const inventory = parseInventory(inventoryJson);
  const availableSeats = filterAvailableSeats(inventory.seats);
  const priceLevels = parsePricing(pricingJson);

  console.log(
    `Event: ${eventMeta.eventName || inventory.eventId}\n` +
    `Available seats: ${availableSeats.length}, Price levels: ${priceLevels.size}`
  );

  const groups = buildConsecutiveGroups(availableSeats, priceLevels, eventMeta);
  console.log(`Consecutive groups: ${groups.length}`);

  if (saveToDB && groups.length > 0) {
    await saveResults(groups);
    console.log(`Saved ${groups.length} groups to MongoDB`);
  }

  return { groups, inventory, pricing: priceLevels };
}
