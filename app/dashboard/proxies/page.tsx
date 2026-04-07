'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  SignalHigh, Upload, Trash2, Plus, X, Check, AlertCircle,
  Copy, ToggleLeft, ToggleRight, FileText, Loader2,
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
  const [showPasteModal, setShowPasteModal] = useState(false);
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
    setTimeout(() => setFeedback(null), 4000);
  };

  const addProxies = async (text: string) => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/proxies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxies: text }),
      });
      const data = await res.json();
      if (data.success) {
        showFeedback('success', `Added ${data.added} proxies${data.skipped ? `, ${data.skipped} duplicates skipped` : ''}`);
        setPasteText('');
        setShowPasteModal(false);
        fetchProxies();
      } else {
        showFeedback('error', data.message || 'Failed to add proxies');
      }
    } catch {
      showFeedback('error', 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (text) addProxies(text);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    try {
      const res = await fetch('/api/proxies', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      const data = await res.json();
      if (data.success) {
        showFeedback('success', `Deleted ${data.deleted} proxies`);
        setSelected(new Set());
        fetchProxies();
      }
    } catch {
      showFeedback('error', 'Failed to delete proxies');
    }
  };

  const clearAll = async () => {
    if (!confirm('Delete ALL proxies? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/proxies', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearAll: true }),
      });
      const data = await res.json();
      if (data.success) {
        showFeedback('success', `Cleared ${data.deleted} proxies`);
        setSelected(new Set());
        fetchProxies();
      }
    } catch {
      showFeedback('error', 'Failed to clear proxies');
    }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === proxies.length) setSelected(new Set());
    else setSelected(new Set(proxies.map(p => p._id)));
  };

  const copyToClipboard = () => {
    const text = proxies.map(p => p.raw).join('\n');
    navigator.clipboard.writeText(text);
    showFeedback('success', 'Copied all proxies to clipboard');
  };

  const activeCount = proxies.filter(p => p.active).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50/30 p-4 md:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <SignalHigh className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Proxy Management</h1>
            <p className="text-sm text-slate-500">Upload and manage proxy servers for scraping</p>
          </div>
        </div>
      </div>

      {/* Feedback Toast */}
      {feedback && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          feedback.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {feedback.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {feedback.msg}
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Total Proxies</p>
          <p className="text-3xl font-bold text-slate-800">{proxies.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Active</p>
          <p className="text-3xl font-bold text-emerald-600">{activeCount}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Inactive</p>
          <p className="text-3xl font-bold text-slate-400">{proxies.length - activeCount}</p>
        </div>
      </div>

      {/* Action Bar */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-6 flex flex-wrap items-center gap-3">
        <button
          onClick={() => setShowPasteModal(true)}
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
              onClick={copyToClipboard}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-200 transition-all"
            >
              <Copy className="w-4 h-4" /> Copy All
            </button>
            <div className="flex-1" />
            {selected.size > 0 && (
              <button
                onClick={deleteSelected}
                className="flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 text-sm font-semibold rounded-xl hover:bg-red-100 transition-all"
              >
                <Trash2 className="w-4 h-4" /> Delete Selected ({selected.size})
              </button>
            )}
            <button
              onClick={clearAll}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 text-sm font-semibold rounded-xl hover:bg-red-100 transition-all"
            >
              <Trash2 className="w-4 h-4" /> Clear All
            </button>
          </>
        )}
      </div>

      {/* Proxy Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading proxies...
          </div>
        ) : proxies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <SignalHigh className="w-12 h-12 mb-4 text-slate-300" />
            <p className="text-lg font-semibold text-slate-500 mb-1">No proxies yet</p>
            <p className="text-sm text-slate-400 mb-4">Add proxies by pasting them or uploading a file</p>
            <p className="text-xs text-slate-400 font-mono bg-slate-50 px-3 py-1.5 rounded-lg">Format: ip:port:username:password</p>
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
                      {proxy.active ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold bg-slate-50 text-slate-400 border border-slate-200 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300" /> Inactive
                        </span>
                      )}
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

      {/* Paste Modal */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-purple-500" />
                <h2 className="text-lg font-bold text-slate-800">Add Proxies</h2>
              </div>
              <button onClick={() => setShowPasteModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-500 mb-3">Paste proxies below, one per line. Format: <span className="font-mono text-purple-600">ip:port:username:password</span></p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={"142.173.171.45:7850:uP0ihwkQhJ:FxhkT0Veq1\n103.47.93.87:5432:myUser:myPass"}
                rows={10}
                className="w-full font-mono text-sm border border-slate-200 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none bg-slate-50"
              />
              <p className="text-xs text-slate-400 mt-2">
                {pasteText.split(/[\r\n]+/).filter(l => l.trim()).length} lines detected
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
              <button
                onClick={() => setShowPasteModal(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 rounded-xl hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => addProxies(pasteText)}
                disabled={submitting || !pasteText.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 text-white text-sm font-semibold rounded-xl hover:shadow-lg hover:shadow-purple-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {submitting ? 'Adding...' : 'Add Proxies'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
