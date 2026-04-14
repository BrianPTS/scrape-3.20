import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import { Event } from '@/models/eventModel';

/**
 * Returns aggregated TM date sync history across all events, filtered by
 * a rolling time window (default 24h).
 *
 * Query params:
 *   hours  — number of hours to look back (default 24)
 */
export async function GET(req: NextRequest) {
  try {
    await dbConnect();

    const url = new URL(req.url);
    const hours = parseInt(url.searchParams.get('hours') || '24', 10);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    // Unwind tmDateSyncHistory and keep only entries within the window
    const rawChanges = await Event.aggregate([
      { $match: { 'tmDateSyncHistory.syncedAt': { $gte: since } } },
      { $unwind: '$tmDateSyncHistory' },
      { $match: { 'tmDateSyncHistory.syncedAt': { $gte: since } } },
      {
        $project: {
          _id: 0,
          mapping_id: 1,
          Event_ID: 1,
          Event_Name: 1,
          Venue: 1,
          currentEventDateTime: '$Event_DateTime',
          currentStatus: '$tmStatus',
          autoResumeAt: 1,
          Skip_Scraping: 1,
          syncedAt: '$tmDateSyncHistory.syncedAt',
          previousDateTime: '$tmDateSyncHistory.previousDateTime',
          newDateTime: '$tmDateSyncHistory.newDateTime',
          previousStatus: '$tmDateSyncHistory.previousStatus',
          newStatus: '$tmDateSyncHistory.newStatus',
          source: '$tmDateSyncHistory.source',
        },
      },
      { $sort: { syncedAt: -1 } },
    ]);

    // Classify each row into a change type
    const changes = rawChanges.map((row: any) => {
      let changeType = 'other';

      if (row.newStatus === 'not_found') {
        changeType = 'not_found';
      } else if (
        row.previousDateTime &&
        row.newDateTime &&
        new Date(row.previousDateTime).getTime() !== new Date(row.newDateTime).getTime()
      ) {
        changeType = 'date_changed';
      } else if (row.newStatus && row.newStatus !== row.previousStatus) {
        changeType = 'status_changed';
      }

      return { ...row, changeType };
    });

    // Bucket counts for the stats cards
    const counts = {
      total: changes.length,
      dateChanged: changes.filter((c) => c.changeType === 'date_changed').length,
      statusChanged: changes.filter((c) => c.changeType === 'status_changed').length,
      notFound: changes.filter((c) => c.changeType === 'not_found').length,
    };

    return NextResponse.json({
      success: true,
      since,
      hours,
      counts,
      changes,
    });
  } catch (err) {
    console.error('[Date Changes API] Error:', (err as Error).message);
    return NextResponse.json(
      { success: false, message: (err as Error).message },
      { status: 500 }
    );
  }
}
