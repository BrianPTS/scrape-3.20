'use server';
import dbConnect from '@/lib/dbConnect';
import { Event } from '@/models/eventModel';
import { getEventById } from '@/lib/ticketmaster';

interface SyncChange {
  mapping_id: string;
  event_name: string;
  previousDate: string;
  newDate: string;
  status: string | null;
}

export interface TmSyncStats {
  checked: number;
  dateUpdated: number;
  statusUpdated: number;
  notFound: number;
  errors: number;
  durationMs: number;
  changes: SyncChange[];
}

// Sleep helper for rate limiting
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Sync event dates from the Ticketmaster Discovery API.
 *
 * For each active event with a valid TM hex Event_ID, fetch the latest
 * event data from TM and update Event_DateTime if it has changed.
 * Captures status changes (canceled, postponed, rescheduled) as well.
 *
 * Throttled at ~5 req/sec to stay under TM Discovery API rate limits.
 */
export async function syncAllEventDatesFromTM(): Promise<TmSyncStats> {
  await dbConnect();
  const startTime = Date.now();

  const stats: TmSyncStats = {
    checked: 0,
    dateUpdated: 0,
    statusUpdated: 0,
    notFound: 0,
    errors: 0,
    durationMs: 0,
    changes: [],
  };

  // Fetch active events with a valid TM hex Event_ID.
  // Excludes tickets.com / AXS events (non-hex IDs).
  const events = await Event.find({
    Skip_Scraping: { $ne: true },
    Event_ID: { $regex: /^[0-9A-Fa-f]+$/ },
  })
    .select('_id mapping_id Event_ID Event_Name Event_DateTime tmStatus')
    .lean();

  console.log(`[TM Date Sync] Starting sync for ${events.length} events`);

  // Process in batches of 5 with 250ms between batches (~20 req/sec safe)
  const BATCH_SIZE = 5;
  const BATCH_DELAY_MS = 250;

  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (event: any) => {
        stats.checked++;
        try {
          const tmEvent = await getEventById(event.Event_ID);

          if (!tmEvent) {
            // 404 — event pulled from TM. Stop scraping and flag for human review.
            stats.notFound++;
            await Event.updateOne(
              { _id: event._id },
              {
                $set: {
                  Skip_Scraping: true,
                  tmStatus: 'not_found',
                  lastTmDateSync: new Date(),
                },
                $push: {
                  tmDateSyncHistory: {
                    syncedAt: new Date(),
                    previousDateTime: event.Event_DateTime,
                    newDateTime: null,
                    previousStatus: event.tmStatus || null,
                    newStatus: 'not_found',
                    source: 'daily-sync',
                  },
                },
              }
            );
            stats.changes.push({
              mapping_id: event.mapping_id,
              event_name: event.Event_Name,
              previousDate: event.Event_DateTime ? new Date(event.Event_DateTime).toISOString() : '',
              newDate: '',
              status: 'not_found',
            });
            console.warn(`[TM Date Sync] 404 — stopped scraping: ${event.Event_Name} (${event.Event_ID})`);
            return;
          }

          // Compare dates (tolerance: 1 minute to avoid noise from float precision)
          const tmDateTime = tmEvent.dateTime ? new Date(tmEvent.dateTime) : null;
          const currentDateTime = event.Event_DateTime ? new Date(event.Event_DateTime) : null;

          const dateChanged = tmDateTime && currentDateTime &&
            Math.abs(tmDateTime.getTime() - currentDateTime.getTime()) > 60_000;

          const statusChanged = !!tmEvent.status && event.tmStatus !== tmEvent.status;

          if (dateChanged || statusChanged) {
            const update: Record<string, any> = { lastTmDateSync: new Date() };
            if (dateChanged) {
              update.Event_DateTime = tmDateTime;
              // Pause scraping for 20 min when the date/time moves, so the
              // scraper doesn't build stale ConsecutiveGroups mid-transition.
              update.Skip_Scraping = true;
              update.autoResumeAt = new Date(Date.now() + 20 * 60 * 1000);
            }
            if (statusChanged) update.tmStatus = tmEvent.status;

            const historyEntry = {
              syncedAt: new Date(),
              previousDateTime: currentDateTime,
              newDateTime: tmDateTime,
              previousStatus: event.tmStatus || null,
              newStatus: tmEvent.status || null,
              source: 'daily-sync',
            };

            await Event.updateOne(
              { _id: event._id },
              { $set: update, $push: { tmDateSyncHistory: historyEntry } }
            );

            if (dateChanged) stats.dateUpdated++;
            if (statusChanged) stats.statusUpdated++;

            stats.changes.push({
              mapping_id: event.mapping_id,
              event_name: event.Event_Name,
              previousDate: currentDateTime ? currentDateTime.toISOString() : '',
              newDate: tmDateTime ? tmDateTime.toISOString() : '',
              status: tmEvent.status || null,
            });

            console.log(
              `[TM Date Sync] Updated ${event.Event_Name}: ${
                dateChanged ? `${currentDateTime?.toISOString()} → ${tmDateTime?.toISOString()}` : 'date unchanged'
              }${statusChanged ? ` | status: ${event.tmStatus || 'null'} → ${tmEvent.status}` : ''}`
            );
          } else {
            // No changes — just bump lastTmDateSync (no history entry)
            await Event.updateOne(
              { _id: event._id },
              { $set: { lastTmDateSync: new Date() } }
            );
          }
        } catch (err) {
          stats.errors++;
          console.error(
            `[TM Date Sync] Error syncing ${event.Event_Name} (${event.Event_ID}):`,
            (err as Error).message
          );
        }
      })
    );

    // Rate limit — wait between batches (except after the last one)
    if (i + BATCH_SIZE < events.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  stats.durationMs = Date.now() - startTime;
  console.log(
    `[TM Date Sync] Complete. Checked: ${stats.checked}, Date updated: ${stats.dateUpdated}, ` +
    `Status updated: ${stats.statusUpdated}, Not found: ${stats.notFound}, Errors: ${stats.errors}, ` +
    `Duration: ${stats.durationMs}ms`
  );

  return stats;
}

/**
 * Resume any events whose autoResumeAt timestamp has passed.
 *
 * Called every 5 minutes by the scheduler. Events paused by the sync job
 * (after a date change) are auto-resumed 20 minutes later.
 */
export async function autoResumeEvents(): Promise<{ resumed: number; resumedAt: Date }> {
  await dbConnect();
  const now = new Date();

  const result = await Event.updateMany(
    { autoResumeAt: { $ne: null, $lte: now } },
    { $set: { Skip_Scraping: false, autoResumeAt: null } }
  );

  if (result.modifiedCount > 0) {
    console.log(`[TM Date Sync] Auto-resumed ${result.modifiedCount} paused events`);
  }

  return { resumed: result.modifiedCount, resumedAt: now };
}
