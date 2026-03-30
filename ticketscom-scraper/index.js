#!/usr/bin/env node

/**
 * CLI entry point for the tickets.com scraper.
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
  .name('ticketscom-scraper')
  .description('Scrape tickets.com event data into ConsecutiveGroup records')
  .version('1.0.0');

program
  .command('scrape <url>')
  .description('Scrape a tickets.com event URL')
  .option('--no-db', 'Skip saving to MongoDB')
  .option('--headed', 'Run browser in headed mode (visible)')
  .option('--delay <ms>', 'Delay between section fetches in ms', '1500')
  .action(async (url, opts) => {
    const saveToDB = opts.db !== false;
    const headless = !opts.headed;
    const sectionDelay = parseInt(opts.delay, 10);

    console.log(chalk.bold('\n🎫 tickets.com Scraper\n'));
    console.log(`URL: ${url}`);
    console.log(`Save to DB: ${saveToDB}`);
    console.log(`Headless: ${headless}`);
    console.log(`Section delay: ${sectionDelay}ms\n`);

    try {
      if (saveToDB) {
        await connectDB();
      }

      const startTime = Date.now();
      const { groups, availability } = await scrapeEvent(url, {
        headless,
        saveToDB,
        sectionDelay,
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log(chalk.bold('\n--- Results ---'));
      console.log(`Event: ${chalk.cyan(availability.event.name)}`);
      console.log(`Venue: ${chalk.cyan(availability.venue.name)}`);
      console.log(`Date: ${chalk.cyan(availability.event.date)}`);
      console.log(`Groups found: ${chalk.green(groups.length)}`);
      console.log(`Time: ${elapsed}s\n`);

      // Summary by section
      if (groups.length > 0) {
        const bySection = {};
        for (const g of groups) {
          const key = `${g.section} Row ${g.row}`;
          if (!bySection[key]) bySection[key] = [];
          bySection[key].push(g);
        }
        console.log(chalk.bold('By Section:'));
        for (const [key, sectionGroups] of Object.entries(bySection)) {
          const totalSeats = sectionGroups.reduce((s, g) => s + g.seatCount, 0);
          const price = sectionGroups[0].inventory.face_price;
          console.log(
            `  ${key}: ${totalSeats} seat(s) in ${sectionGroups.length} group(s) @ $${price} face`
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
