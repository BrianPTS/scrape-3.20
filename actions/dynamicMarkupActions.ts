'use server';

import dbConnect from '@/lib/dbConnect';
import { Event } from '@/models/eventModel';
import { Order } from '@/models/orderModel';
import { DynamicMarkupSettings } from '@/models/dynamicMarkupSettingsModel';
import { computeFullMarkup } from '@/lib/dynamicMarkup';

// ── Settings CRUD ───────────────────────────────────────────────────

export async function getDynamicMarkupSettings() {
  await dbConnect();
  const settings = await DynamicMarkupSettings.findOne().lean();
  if (!settings) {
    const created = await DynamicMarkupSettings.create({
      isEnabled: false,
      scheduleIntervalMinutes: 1440,
    });
    return JSON.parse(JSON.stringify(created));
  }
  return JSON.parse(JSON.stringify(settings));
}

export async function updateDynamicMarkupSettings(updates: {
  isEnabled?: boolean;
  scheduleIntervalMinutes?: number;
  lastRunAt?: Date;
  nextRunAt?: Date;
  totalRuns?: number;
  lastRunStats?: {
    eventsProcessed: number;
    eventsUpdated: number;
    errors: string[];
    durationMs: number;
  };
}) {
  await dbConnect();
  const result = await DynamicMarkupSettings.findOneAndUpdate(
    {},
    { ...updates, updatedAt: new Date() },
    { new: true, upsert: true },
  ).lean();
  return JSON.parse(JSON.stringify(result));
}

// ── Core engine ─────────────────────────────────────────────────────

export async function runDynamicMarkupCalc() {
  await dbConnect();
  const startTime = Date.now();
  const errors: string[] = [];
  let eventsProcessed = 0;
  let eventsUpdated = 0;

  try {
    // Find all active events with dynamic pricing enabled
    const events = await Event.find(
      { dynamicPricingEnabled: true, Skip_Scraping: false },
      {
        _id: 1,
        mapping_id: 1,
        Event_DateTime: 1,
        Availability_Percentage: 1,
        calculatedMarkup: 1,
        markupFactors: 1,
        roiFloor: 1,
        roiCeiling: 1,
      },
    ).lean();

    if (events.length === 0) {
      const stats = { eventsProcessed: 0, eventsUpdated: 0, errors: [], durationMs: Date.now() - startTime };
      await updateDynamicMarkupSettings({
        lastRunAt: new Date(),
        lastRunStats: stats,
        totalRuns: (await getDynamicMarkupSettings()).totalRuns + 1,
      });
      return { success: true, message: 'No events with dynamic pricing enabled', stats };
    }

    // Batch-fetch the most recent order per event using aggregation
    const eventIds = events.map((e) => e._id);
    const recentOrders = await Order.aggregate([
      { $match: { portalEventId: { $in: eventIds } } },
      { $sort: { order_date: -1 } },
      { $group: { _id: '$portalEventId', lastOrderDate: { $first: '$order_date' } } },
    ]);
    const orderMap = new Map<string, Date>();
    for (const o of recentOrders) {
      orderMap.set(String(o._id), o.lastOrderDate);
    }

    // Process in bulk-write batches of 100
    const BATCH_SIZE = 100;
    const bulkOps: Array<{
      updateOne: {
        filter: { _id: unknown };
        update: { $set: Record<string, unknown> };
      };
    }> = [];

    for (const event of events) {
      eventsProcessed++;
      try {
        const lastOrderDate = orderMap.get(String(event._id)) || null;
        const { markup, factors } = computeFullMarkup({
          availabilityPct: event.Availability_Percentage,
          lastOrderDate,
          eventDateTime: event.Event_DateTime,
          roiCeiling: event.roiCeiling,
          roiFloor: event.roiFloor,
        });

        // Only update if markup actually changed
        if (event.calculatedMarkup !== markup ||
            event.markupFactors?.availability !== factors.availability ||
            event.markupFactors?.orderVelocity !== factors.orderVelocity ||
            event.markupFactors?.timeToEvent !== factors.timeToEvent) {
          bulkOps.push({
            updateOne: {
              filter: { _id: event._id },
              update: {
                $set: {
                  calculatedMarkup: markup,
                  markupFactors: factors,
                  lastMarkupCalcAt: new Date(),
                },
              },
            },
          });
          eventsUpdated++;
        }
      } catch (err) {
        errors.push(`Event ${event.mapping_id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }

      // Flush batch
      if (bulkOps.length >= BATCH_SIZE) {
        await Event.bulkWrite(bulkOps);
        bulkOps.length = 0;
      }
    }

    // Flush remaining
    if (bulkOps.length > 0) {
      await Event.bulkWrite(bulkOps);
    }

    const durationMs = Date.now() - startTime;
    const stats = { eventsProcessed, eventsUpdated, errors, durationMs };

    await updateDynamicMarkupSettings({
      lastRunAt: new Date(),
      lastRunStats: stats,
      totalRuns: (await getDynamicMarkupSettings()).totalRuns + 1,
    });

    console.log(`[Dynamic Markup] Done: ${eventsUpdated}/${eventsProcessed} events updated in ${durationMs}ms`);
    return { success: true, stats };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const msg = error instanceof Error ? error.message : 'Unknown error';
    errors.push(msg);
    console.error('[Dynamic Markup] Fatal error:', error);
    return { success: false, error: msg, stats: { eventsProcessed, eventsUpdated, errors, durationMs } };
  }
}
