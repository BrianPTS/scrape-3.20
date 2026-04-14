'use client';
import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock, Calendar, AlertTriangle, XCircle, RefreshCw, Loader2,
  TrendingUp, Zap, Pause,
} from 'lucide-react';

interface ChangeRecord {
  mapping_id: string;
  Event_ID: string;
  Event_Name: string;
  Venue?: string;
  currentEventDateTime?: string;
  currentStatus?: string;
  autoResumeAt?: string | null;
  Skip_Scraping?: boolean;
  syncedAt: string;
  previousDateTime?: string | null;
  newDateTime?: string | null;
  previousStatus?: string | null;
  newStatus?: string | null;
  source?: string;
  changeType: 'date_changed' | 'status_changed' | 'not_found' | 'other';
}

interface ChangeCounts {
  total: number;
  dateChanged: number;
  statusChanged: number;
  notFound: number;
}

function fmtDateTime(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function fmtRelative(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function DateChangesPage() {
  const [changes, setChanges] = useState<ChangeRecord[]>([]);
  const [counts, setCounts] = useState<ChangeCounts>({ total: 0, dateChanged: 0, statusChanged: 0, notFound: 0 });
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState(24);
  const [syncing, setSyncing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchChanges = useCallback(async (h: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/date-changes?hours=${h}`);
      const data = await res.json();
      if (data.success) {
        setChanges(data.changes);
        setCounts(data.counts);
      }
    } catch {
      console.error('Failed to fetch changes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchChanges(hours); }, [hours, fetchChanges]);

  const runSyncNow = async () => {
    setSyncing(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/ticketmaster-date-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run-now' }),
      });
      const data = await res.json();
      if (data.success && data.stats) {
        setFeedback(
          `Sync complete: ${data.stats.checked} checked, ${data.stats.dateUpdated} date changes, ` +
          `${data.stats.statusUpdated} status changes, ${data.stats.notFound} not found`
        );
        fetchChanges(hours);
      } else {
        setFeedback('Sync failed');
      }
    } catch {
      setFeedback('Sync error');
    } finally {
      setSyncing(false);
      setTimeout(() => setFeedback(null), 6000);
    }
  };

  const renderBadge = (type: ChangeRecord['changeType']) => {
    switch (type) {
      case 'date_changed':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full uppercase tracking-wide">
            <Calendar className="w-3 h-3" /> Date Change
          </span>
        );
      case 'status_changed':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full uppercase tracking-wide">
            <AlertTriangle className="w-3 h-3" /> Status
          </span>
        );
      case 'not_found':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full uppercase tracking-wide">
            <XCircle className="w-3 h-3" /> Not Found
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-slate-50 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full uppercase tracking-wide">
            Other
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50/30 p-4 md:p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Clock className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Event Date Changes</h1>
            <p className="text-sm text-slate-500">Ticketmaster sync history &mdash; reschedules, cancellations, and status updates</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={hours}
            onChange={(e) => setHours(parseInt(e.target.value, 10))}
            className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value={24}>Last 24 hours</option>
            <option value={72}>Last 3 days</option>
            <option value={168}>Last 7 days</option>
            <option value={720}>Last 30 days</option>
          </select>
          <button
            onClick={() => fetchChanges(hours)}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-200 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button
            onClick={runSyncNow}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 text-white text-sm font-semibold rounded-xl hover:shadow-lg hover:shadow-purple-500/25 transition-all disabled:opacity-50"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {syncing ? 'Running...' : 'Run Sync Now'}
          </button>
        </div>
      </div>

      {feedback && (
        <div className="mb-4 px-4 py-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-sm font-medium">
          {feedback}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-slate-400" />
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Changes</p>
          </div>
          <p className="text-3xl font-bold text-slate-800">{counts.total}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="w-4 h-4 text-amber-500" />
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Date Changes</p>
          </div>
          <p className="text-3xl font-bold text-amber-600">{counts.dateChanged}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-blue-500" />
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Status Changes</p>
          </div>
          <p className="text-3xl font-bold text-blue-600">{counts.statusChanged}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <XCircle className="w-4 h-4 text-red-500" />
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Not Found</p>
          </div>
          <p className="text-3xl font-bold text-red-600">{counts.notFound}</p>
        </div>
      </div>

      {/* Changes Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading changes...
          </div>
        ) : changes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Clock className="w-12 h-12 mb-4 text-slate-300" />
            <p className="text-lg font-semibold text-slate-500 mb-1">No changes detected</p>
            <p className="text-sm text-slate-400">No Ticketmaster date or status changes in the selected period.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">When</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Event</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Previous</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">New</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">State</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((c, idx) => {
                  const isDate = c.changeType === 'date_changed';
                  const isNotFound = c.changeType === 'not_found';
                  const prev = isDate ? fmtDateTime(c.previousDateTime) : (c.previousStatus || '—');
                  const next = isNotFound
                    ? '—'
                    : isDate ? fmtDateTime(c.newDateTime) : (c.newStatus || '—');

                  const isPausedNow = c.Skip_Scraping && c.autoResumeAt && new Date(c.autoResumeAt) > new Date();
                  const minutesLeft = isPausedNow && c.autoResumeAt
                    ? Math.max(0, Math.ceil((new Date(c.autoResumeAt).getTime() - Date.now()) / 60000))
                    : 0;

                  return (
                    <tr key={`${c.Event_ID}-${idx}`} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm text-slate-700">{fmtRelative(c.syncedAt)}</div>
                        <div className="text-xs text-slate-400">{fmtDateTime(c.syncedAt)}</div>
                      </td>
                      <td className="px-4 py-3">{renderBadge(c.changeType)}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">{c.Event_Name}</div>
                        {c.Venue && <div className="text-xs text-slate-400">{c.Venue}</div>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{prev}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{next}</td>
                      <td className="px-4 py-3">
                        {isNotFound ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                            <XCircle className="w-3.5 h-3.5" /> Stopped
                          </span>
                        ) : isPausedNow ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
                            <Pause className="w-3.5 h-3.5" /> Paused ({minutesLeft}m left)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
