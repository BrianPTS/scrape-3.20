#!/usr/bin/env node

/**
 * CLI entry point for the AXS scraper.
 *
 * Usage:
 *   node index.js scrape <event-url>          # Scrape with browser
 *   node index.js scrape <event-url> --no-db  # Scrape without saving to MongoDB
 *   node index.js scrape <event-url> --headed # Scrape with visible browser
 */

import 'dotenv/config';
import { program } from 'commander';
import chalk from 'chalk';
import { scrapeEvent } from './scraper.js';
import { connectDB, disconnectDB } from './config/db.js';

program
  .name('axs-scraper')
  .description('Scrape AXS event data into ConsecutiveGroup records')
  .version('1.0.0');

program
  .command('scrape <url>')
  .description('Scrape an AXS event URL')
  .option('--no-db', 'Skip saving to MongoDB')
  .option('--headed', 'Run browser in headed mode (visible)')
  .option('--event-name <name>', 'Override event name')
  .option('--venue <venue>', 'Override venue name')
  .option('--event-date <date>', 'Override event date (ISO format)')
  .action(async (url, opts) => {
    const saveToDB = opts.db !== false;
    const headless = !opts.headed;

    console.log(chalk.bold('\n🎫 AXS Scraper\n'));
    console.log(`URL: ${url}`);
    console.log(`Save to DB: ${saveToDB}`);
    console.log(`Headless: ${headless}\n`);

    try {
      if (saveToDB) {
        await connectDB();
      }

      const startTime = Date.now();
      const { groups, inventory, pricing } = await scrapeEvent(url, {
        headless,
        saveToDB,
        eventName: opts.eventName || '',
        venue: opts.venue || '',
        eventDate: opts.eventDate || '',
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log(chalk.bold('\n--- Results ---'));
      console.log(`Event ID: ${chalk.cyan(inventory.eventId)}`);
      console.log(`Total seats: ${chalk.cyan(inventory.seats.length)}`);
      console.log(`Price levels: ${chalk.cyan(pricing.size)}`);
      console.log(`Groups found: ${chalk.green(groups.length)}`);
      console.log(`Time: ${elapsed}s\n`);

      // Summary by section
      if (groups.length > 0) {
        const bySection = {};
        for (const g of groups) {
          if (!bySection[g.section]) bySection[g.section] = { seats: 0, groups: 0, price: 0 };
          bySection[g.section].seats += g.seatCount;
          bySection[g.section].groups++;
          bySection[g.section].price = g.inventory.face_price;
        }
        console.log(chalk.bold('By Section:'));
        for (const [section, data] of Object.entries(bySection).sort((a, b) => a[0].localeCompare(b[0]))) {
          console.log(
            `  Section ${section}: ${data.seats} seat(s) in ${data.groups} group(s) @ $${data.price.toFixed(2)} face`
          );
        }
      }

      // Price level summary
      if (pricing.size > 0) {
        console.log(chalk.bold('\nPrice Levels:'));
        for (const [id, pl] of [...pricing].sort((a, b) => b[1].totalPrice - a[1].totalPrice)) {
          console.log(
            `  ${pl.label} (${id}): $${pl.totalPrice.toFixed(2)} total ($${pl.facePrice.toFixed(2)} face + $${pl.facilityFee.toFixed(2)} fee)`
          );
        }
      }
    } catch (err) {
      console.error(chalk.red(`Error: ${err.message}`));
      if (err.stack) console.error(err.stack);
      process.exitCode = 1;
    } finally {
      if (saveToDB) {
        await disconnectDB().catch(() => {});
      }
    }
  });

program.parse();
