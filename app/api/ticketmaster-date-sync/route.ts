/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import {
  syncAllEventDatesFromTM,
  autoResumeEvents,
  type TmSyncStats,
} from '@/actions/ticketmasterSyncActions';

// ═══════════════════════════════════════════════════════════════════
// Daily Ticketmaster Event Date Sync Scheduler
//
// Runs every 24 hours to check every active TM event against the
// Discovery API and update our stored Event_DateTime if TM has moved
// the event. Uses globalThis state to survive Next.js module re-eval.
//
// Also runs a resume check every 5 minutes to un-pause events whose
// autoResumeAt timestamp has passed (20-min cooldown after a date change).
// ═══════════════════════════════════════════════════════════════════

const TM_SYNC_KEY = '__tmDateSyncScheduler__';
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const RESUME_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface TmSyncState {
  syncInterval: NodeJS.Timeout | null;
  resumeInterval: NodeJS.Timeout | null;
  initialized: boolean;
  running: boolean;
  lastRun: Date | null;
  lastStats: TmSyncStats | null;
  lastResumeCheck: Date | null;
  lastResumedCount: number;
  startedAt: Date | null;
}

function getTmSyncState(): TmSyncState {
  if (!(globalThis as Record<string, unknown>)[TM_SYNC_KEY]) {
    (globalThis as Record<string, unknown>)[TM_SYNC_KEY] = {
      syncInterval: null,
      resumeInterval: null,
      initialized: false,
      running: false,
      lastRun: null,
      lastStats: null,
      lastResumeCheck: null,
      lastResumedCount: 0,
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

async function runResumeCheck(): Promise<void> {
  const state = getTmSyncState();
  try {
    const result = await autoResumeEvents();
    state.lastResumeCheck = result.resumedAt;
    state.lastResumedCount = result.resumed;
  } catch (err) {
    console.error('[TM Date Sync] Resume check failed:', (err as Error).message);
  }
}

function startScheduler() {
  const state = getTmSyncState();
  if (state.syncInterval) return;

  // 24h full sync
  state.syncInterval = setInterval(() => {
    runSync().catch((err) => {
      console.error('[TM Date Sync] Unhandled error in sync interval:', err);
    });
  }, SYNC_INTERVAL_MS);

  // 5-min resume check
  state.resumeInterval = setInterval(() => {
    runResumeCheck().catch((err) => {
      console.error('[TM Date Sync] Unhandled error in resume interval:', err);
    });
  }, RESUME_CHECK_INTERVAL_MS);

  state.startedAt = new Date();
  console.log(
    `[TM Date Sync] Scheduler started — sync every ${SYNC_INTERVAL_MS / 1000 / 60 / 60}h, ` +
    `resume check every ${RESUME_CHECK_INTERVAL_MS / 1000 / 60}min`
  );
}

function stopScheduler() {
  const state = getTmSyncState();
  if (state.syncInterval) {
    clearInterval(state.syncInterval);
    state.syncInterval = null;
  }
  if (state.resumeInterval) {
    clearInterval(state.resumeInterval);
    state.resumeInterval = null;
  }
  state.startedAt = null;
  console.log('[TM Date Sync] Scheduler stopped');
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
    running: state.syncInterval !== null,
    currentlyExecuting: state.running,
    startedAt: state.startedAt,
    lastRun: state.lastRun,
    lastStats: state.lastStats,
    lastResumeCheck: state.lastResumeCheck,
    lastResumedCount: state.lastResumedCount,
    intervalHours: SYNC_INTERVAL_MS / 1000 / 60 / 60,
    resumeCheckMinutes: RESUME_CHECK_INTERVAL_MS / 1000 / 60,
  });
}

// ─────────────────────────────────────────────────────────────────────
// POST — manual control: run-now | start | stop | resume-check
// ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body?.action as string;

    if (action === 'run-now') {
      const stats = await runSync();
      return NextResponse.json({ success: true, stats });
    }

    if (action === 'resume-check') {
      await runResumeCheck();
      const state = getTmSyncState();
      return NextResponse.json({
        success: true,
        resumed: state.lastResumedCount,
        at: state.lastResumeCheck,
      });
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
      { success: false, message: 'Unknown action. Use: run-now | resume-check | start | stop' },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      { success: false, message: (err as Error).message },
      { status: 500 }
    );
  }
}
