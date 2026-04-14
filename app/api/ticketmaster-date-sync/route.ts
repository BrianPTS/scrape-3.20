/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { syncAllEventDatesFromTM, type TmSyncStats } from '@/actions/ticketmasterSyncActions';

// ═══════════════════════════════════════════════════════════════════
// Daily Ticketmaster Event Date Sync Scheduler
//
// Runs every 24 hours to check every active TM event against the
// Discovery API and update our stored Event_DateTime if TM has moved
// the event. Uses globalThis state to survive Next.js module re-eval.
// ═══════════════════════════════════════════════════════════════════

const TM_SYNC_KEY = '__tmDateSyncScheduler__';
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface TmSyncState {
  interval: NodeJS.Timeout | null;
  initialized: boolean;
  running: boolean;
  lastRun: Date | null;
  lastStats: TmSyncStats | null;
  startedAt: Date | null;
}

function getTmSyncState(): TmSyncState {
  if (!(globalThis as Record<string, unknown>)[TM_SYNC_KEY]) {
    (globalThis as Record<string, unknown>)[TM_SYNC_KEY] = {
      interval: null,
      initialized: false,
      running: false,
      lastRun: null,
      lastStats: null,
      startedAt: null,
    };
  }
  return (globalThis as Record<string, unknown>)[TM_SYNC_KEY] as TmSyncState;
}

async function runSync(): Promise<TmSyncStats | null> {
  const state = getTmSyncState();
  if (state.running) {
    console.log('[TM Date Sync] Skipping — already running');
    return null;
  }

  state.running = true;
  try {
    const stats = await syncAllEventDatesFromTM();
    state.lastRun = new Date();
    state.lastStats = stats;
    return stats;
  } catch (err) {
    console.error('[TM Date Sync] Failed:', (err as Error).message);
    return null;
  } finally {
    state.running = false;
  }
}

function startScheduler() {
  const state = getTmSyncState();
  if (state.interval) return;

  state.interval = setInterval(() => {
    runSync().catch((err) => {
      console.error('[TM Date Sync] Unhandled error in interval:', err);
    });
  }, SYNC_INTERVAL_MS);

  state.startedAt = new Date();
  console.log(`[TM Date Sync] Scheduler started — runs every ${SYNC_INTERVAL_MS / 1000 / 60 / 60}h`);
}

function stopScheduler() {
  const state = getTmSyncState();
  if (state.interval) {
    clearInterval(state.interval);
    state.interval = null;
    state.startedAt = null;
    console.log('[TM Date Sync] Scheduler stopped');
  }
}

// Auto-initialize on module load
(function initialize() {
  const state = getTmSyncState();
  if (state.initialized) return;
  state.initialized = true;
  startScheduler();
})();

// ─────────────────────────────────────────────────────────────────────
// GET — return scheduler status
// ─────────────────────────────────────────────────────────────────────
export async function GET() {
  const state = getTmSyncState();
  return NextResponse.json({
    running: state.interval !== null,
    currentlyExecuting: state.running,
    startedAt: state.startedAt,
    lastRun: state.lastRun,
    lastStats: state.lastStats,
    intervalHours: SYNC_INTERVAL_MS / 1000 / 60 / 60,
  });
}

// ─────────────────────────────────────────────────────────────────────
// POST — manual control: run-now | start | stop
// ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body?.action as string;

    if (action === 'run-now') {
      const stats = await runSync();
      return NextResponse.json({ success: true, stats });
    }

    if (action === 'start') {
      startScheduler();
      return NextResponse.json({ success: true, message: 'Scheduler started' });
    }

    if (action === 'stop') {
      stopScheduler();
      return NextResponse.json({ success: true, message: 'Scheduler stopped' });
    }

    return NextResponse.json(
      { success: false, message: 'Unknown action. Use: run-now | start | stop' },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      { success: false, message: (err as Error).message },
      { status: 500 }
    );
  }
}
