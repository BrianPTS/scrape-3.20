import { NextRequest, NextResponse } from 'next/server';
import {
  getDynamicMarkupSettings,
  updateDynamicMarkupSettings,
  runDynamicMarkupCalc,
} from '@/actions/dynamicMarkupActions';
import { createErrorLog } from '@/actions/errorLogActions';

// ═══════════════════════════════════════════════════════════════════
// Singleton scheduler — persists across module re-evaluations via globalThis
// ═══════════════════════════════════════════════════════════════════

const GLOBAL_KEY = '__dynamicMarkupScheduler__';

interface SchedulerState {
  interval: NodeJS.Timeout | null;
  initialized: boolean;
  runningStartedAt: number;
  lastSkipLog: number;
}

const RUNNING_TIMEOUT_MS = 10 * 60 * 1000; // Force-reset after 10 min
const SKIP_LOG_INTERVAL_MS = 60 * 1000;

function getState(): SchedulerState {
  if (!(globalThis as Record<string, unknown>)[GLOBAL_KEY]) {
    (globalThis as Record<string, unknown>)[GLOBAL_KEY] = {
      interval: null,
      initialized: false,
      runningStartedAt: 0,
      lastSkipLog: 0,
    };
  }
  return (globalThis as Record<string, unknown>)[GLOBAL_KEY] as SchedulerState;
}

async function initializeScheduler() {
  const state = getState();
  if (state.initialized) return;
  state.initialized = true;

  try {
    const settings = await getDynamicMarkupSettings();
    if (settings.isEnabled) {
      await startScheduler();
    }
  } catch (error) {
    console.error('Failed to initialize dynamic markup scheduler:', error);
    state.initialized = false;
  }
}

async function startScheduler() {
  const state = getState();

  if (state.interval) {
    clearInterval(state.interval);
    state.interval = null;
  }

  try {
    const settings = await getDynamicMarkupSettings();
    const minutes = settings.scheduleIntervalMinutes || 1440;
    const intervalMs = minutes * 60 * 1000;

    console.log(`[Dynamic Markup] Starting scheduler — every ${minutes} minutes`);

    state.interval = setInterval(async () => {
      const now = Date.now();

      if (state.runningStartedAt > 0) {
        const elapsed = now - state.runningStartedAt;
        if (elapsed < RUNNING_TIMEOUT_MS) {
          if (now - state.lastSkipLog > SKIP_LOG_INTERVAL_MS) {
            console.log(`[Dynamic Markup] Previous run still in progress (${Math.round(elapsed / 1000)}s), skipping...`);
            state.lastSkipLog = now;
          }
          return;
        }
        console.warn(`[Dynamic Markup] Force-resetting stale running flag (stuck ${Math.round(elapsed / 1000)}s)`);
      }

      state.runningStartedAt = now;
      console.log('[Dynamic Markup] Scheduled run starting...');
      try {
        const result = await runDynamicMarkupCalc();
        console.log('[Dynamic Markup] Scheduled run complete:', JSON.stringify(result.stats).slice(0, 300));
      } catch (error) {
        console.error('[Dynamic Markup] Scheduler error:', error);
        await createErrorLog({
          errorType: 'DYNAMIC_MARKUP_SCHEDULER_ERROR',
          errorMessage: `Dynamic markup scheduler failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          stackTrace: error instanceof Error ? error.stack || '' : '',
          metadata: { schedulerIntervalMinutes: minutes },
        });
      } finally {
        state.runningStartedAt = 0;
      }
    }, intervalMs);

    const nextRun = new Date(Date.now() + intervalMs);
    if (!isNaN(nextRun.getTime())) {
      await updateDynamicMarkupSettings({ nextRunAt: nextRun });
    }
  } catch (error) {
    console.error('Failed to start dynamic markup scheduler:', error);
    throw error;
  }
}

function stopScheduler() {
  const state = getState();
  if (state.interval) {
    clearInterval(state.interval);
    state.interval = null;
    console.log('[Dynamic Markup] Scheduler stopped');
  }
}

// Initialize on module load
initializeScheduler();

// ═══════════════════════════════════════════════════════════════════
// HTTP handlers
// ═══════════════════════════════════════════════════════════════════

export async function GET() {
  try {
    const settings = await getDynamicMarkupSettings();
    const state = getState();

    return NextResponse.json({
      success: true,
      settings: {
        isEnabled: settings.isEnabled,
        scheduleIntervalMinutes: settings.scheduleIntervalMinutes,
        lastRunAt: settings.lastRunAt,
        nextRunAt: settings.nextRunAt,
        totalRuns: settings.totalRuns,
        lastRunStats: settings.lastRunStats,
        schedulerStatus: state.interval ? 'Running' : 'Stopped',
      },
    });
  } catch (error) {
    console.error('Error getting dynamic markup settings:', error);
    return NextResponse.json({ success: false, error: 'Failed to get settings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (!action || !['start', 'stop', 'run-now', 'update-settings'].includes(action)) {
      return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    }

    switch (action) {
      case 'start':
        await updateDynamicMarkupSettings({
          isEnabled: true,
          scheduleIntervalMinutes: typeof body.scheduleIntervalMinutes === 'number'
            ? Math.min(Math.max(body.scheduleIntervalMinutes, 60), 1440)
            : 1440,
        });
        await startScheduler();
        return NextResponse.json({ success: true, message: 'Dynamic markup scheduler started' });

      case 'stop':
        await updateDynamicMarkupSettings({ isEnabled: false });
        stopScheduler();
        return NextResponse.json({ success: true, message: 'Dynamic markup scheduler stopped' });

      case 'run-now': {
        const result = await runDynamicMarkupCalc();
        return NextResponse.json(result);
      }

      case 'update-settings': {
        const updates: Record<string, unknown> = {};
        if (typeof body.scheduleIntervalMinutes === 'number') {
          updates.scheduleIntervalMinutes = Math.min(Math.max(body.scheduleIntervalMinutes, 60), 1440);
        }
        if (typeof body.isEnabled === 'boolean') {
          updates.isEnabled = body.isEnabled;
        }
        if (Object.keys(updates).length > 0) {
          await updateDynamicMarkupSettings(updates as Parameters<typeof updateDynamicMarkupSettings>[0]);
        }
        if (body.isEnabled === true) {
          await startScheduler();
        } else if (body.isEnabled === false) {
          stopScheduler();
        }
        return NextResponse.json({ success: true, message: 'Settings updated' });
      }

      default:
        return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error in dynamic markup API:', error);
    return NextResponse.json({ success: false, error: 'Operation failed' }, { status: 500 });
  }
}
