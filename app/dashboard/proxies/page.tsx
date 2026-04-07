'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  SignalHigh, Upload, Trash2, Plus, X, Check, AlertCircle,
  Copy, Loader2, Save, RefreshCw,
} from 'lucide-react';

interface ProxyRecord {
  _id: string;
  ip: string;
  port: string;
  username: string;
  password: string;
  raw: string;
  active: boolean;
  createdAt: string;
}

export default function ProxiesPage() {
  const [proxies, setProxies] = useState<ProxyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [pasteText, setPasteText] = useState('');
  const [mode, setMode] = useState<'view' | 'add'>('view');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchProxies = useCallback(async () => {
    try {
      const res = await fetch('/api/proxies');
      const data = await res.json();
      if (data.success) setProxies(data.proxies);
    } catch {
      console.error('Failed to fetch proxies');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProxies(); }, [fetchProxies]);

  const showFeedback = (type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 5000);
  };

  // ── Clear All ──
  const clearAll = async () => {
    if (!confirm('Remove all proxies? The scraper will fall back to the default proxy list until you upload new ones.')) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/proxies', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearAll: true }),
      });
      const data = await res.json();
      if (data.success) {
        showFeedback('success', `Cleared ${data.deleted} proxies. Upload a new list to continue.`);
        setSelected(new Set());
        setProxies([]);
        setMode('add');
      }
    } catch {
      showFeedback('error', 'Failed to clear proxies');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Delete Selected ──
  const deleteSelected = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/proxies', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      const data = await res.json();
      if (data.success) {
        showFeedback('success', `Removed ${data.deleted} proxies`);
        setSelected(new Set());
        fetchProxies();
      }
    } catch {
      showFeedback('error', 'Failed to delete proxies');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Save Proxies (paste or file) ──
  const saveProxies = async (text: string) => {
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/proxies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxies: text }),
      });
      const data = await res.json();
      if (data.success) {
        showFeedback('success', `Saved ${data.added} proxies. Scraper will pick them up within 60 seconds.${data.skipped ? ` (${data.skipped} duplicates skipped)` : ''}`);
        setPasteText('');
        setMode('view');
        fetchProxies();
      } else {
        showFeedback('error', data.message || 'Failed to save proxies');
      }
    } catch {
      showFeedback('error', 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── File Upload ──
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (text) {
        setPasteText(text);
        setMode('add');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ── Clipboard ──
  const copyAll = () => {
    navigator.clipboard.writeText(proxies.map(p => p.raw).join('\n'));
    showFeedback('success', 'Copied all proxies to clipboard');
  };

  // ── Selection ──
  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    setSelected(selected.size === proxies.length ? new Set() : new Set(proxies.map(p => p._id)));
  };

  const lineCount = pasteText.split(/[\r\n]+/).filter(l => l.trim()).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50/30 p-4 md:p-8">
      {/* Feedback Toast */}
      {feedback && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-5 py-3 rounded-xl shadow-lg text-sm font-medium transition-all animate-in slide-in-from-right ${
          feedback.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {feedback.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {feedback.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <SignalHigh className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Proxy Management</h1>
            <p className="text-sm text-slate-500">
              {proxies.length > 0
                ? `${proxies.length} proxies active — scraper auto-syncs every 60 seconds`
                : 'No proxies loaded — upload a list to get started'}
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Total Proxies</p>
          <p className="text-3xl font-bold text-slate-800">{proxies.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Active</p>
          <p className="text-3xl font-bold text-emerald-600">{proxies.filter(p => p.active).length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Format</p>
          <p className="text-sm font-mono text-slate-500 mt-1">ip:port:username:password</p>
        </div>
      </div>

      {/* Action Bar */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-6 flex flex-wrap items-center gap-3">
        {mode === 'view' ? (
          <>
            <button
              onClick={() => setMode('add')}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 text-white text-sm font-semibold rounded-xl hover:shadow-lg hover:shadow-purple-500/25 transition-all"
            >
              <Plus className="w-4 h-4" /> Add Proxies
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-200 transition-all"
            >
              <Upload className="w-4 h-4" /> Upload File
            </button>
            <input ref={fileInputRef} type="file" accept=".txt,.csv" className="hidden" onChange={handleFileUpload} />
            {proxies.length > 0 && (
              <>
                <button
                  onClick={copyAll}
                  className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-200 transition-all"
                >
                  <Copy className="w-4 h-4" /> Copy All
                </button>
                <div className="flex-1" />
                {selected.size > 0 && (
                  <button
                    onClick={deleteSelected}
                    disabled={submitting}
                    className="flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 text-sm font-semibold rounded-xl hover:bg-red-100 transition-all disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" /> Delete Selected ({selected.size})
                  </button>
                )}
                <button
                  onClick={clearAll}
                  disabled={submitting}
                  className="flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 text-sm font-semibold rounded-xl hover:bg-red-100 transition-all disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" /> Clear All
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <button
              onClick={() => { setMode('view'); setPasteText(''); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-200 transition-all"
            >
              <X className="w-4 h-4" /> Cancel
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-200 transition-all"
            >
              <Upload className="w-4 h-4" /> Upload File
            </button>
            <input ref={fileInputRef} type="file" accept=".txt,.csv" className="hidden" onChange={handleFileUpload} />
            <div className="flex-1" />
            <button
              onClick={() => saveProxies(pasteText)}
              disabled={submitting || !pasteText.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 text-white text-sm font-semibold rounded-xl hover:shadow-lg hover:shadow-emerald-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {submitting ? 'Saving...' : 'Save Proxies'}
            </button>
          </>
        )}
      </div>

      {/* Add Mode: Paste Area */}
      {mode === 'add' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-700">Paste proxies below — one per line</p>
            <span className="text-xs text-slate-400 font-mono">{lineCount} {lineCount === 1 ? 'proxy' : 'proxies'} detected</span>
          </div>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={"142.173.171.45:7850:uP0ihwkQhJ:FxhkT0Veq1\n103.47.93.87:5432:myUser:myPass\n..."}
            rows={14}
            autoFocus
            className="w-full font-mono text-sm border border-slate-200 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none bg-slate-50 leading-relaxed"
          />
          <div className="flex items-center gap-2 mt-3">
            <div className="w-2 h-2 rounded-full bg-amber-400" />
            <p className="text-xs text-slate-500">After saving, the scraper picks up new proxies automatically within 60 seconds.</p>
          </div>
        </div>
      )}

      {/* Proxy Table (View Mode) */}
      {mode === 'view' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading proxies...
            </div>
          ) : proxies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <SignalHigh className="w-12 h-12 mb-4 text-slate-300" />
              <p className="text-lg font-semibold text-slate-500 mb-1">No proxies loaded</p>
              <p className="text-sm text-slate-400 mb-5">Add proxies by pasting them or uploading a .txt file</p>
              <button
                onClick={() => setMode('add')}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 text-white text-sm font-semibold rounded-xl hover:shadow-lg hover:shadow-purple-500/25 transition-all"
              >
                <Plus className="w-4 h-4" /> Add Proxies
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selected.size === proxies.length && proxies.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                      />
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">IP Address</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Port</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Username</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Password</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Added</th>
                  </tr>
                </thead>
                <tbody>
                  {proxies.map((proxy) => (
                    <tr
                      key={proxy._id}
                      className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${selected.has(proxy._id) ? 'bg-purple-50/50' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(proxy._id)}
                          onChange={() => toggleSelect(proxy._id)}
                          className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700">{proxy.ip}</td>
                      <td className="px-4 py-3 font-mono text-slate-700">{proxy.port}</td>
                      <td className="px-4 py-3 font-mono text-slate-500 text-xs">{proxy.username}</td>
                      <td className="px-4 py-3 font-mono text-slate-500 text-xs">{'•'.repeat(8)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {new Date(proxy.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
