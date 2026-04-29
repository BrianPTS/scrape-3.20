'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { Filter, Plus, X, AlertCircle } from 'lucide-react';
import {
  getDescriptionExclusions,
  addDescriptionExclusion,
  removeDescriptionExclusion,
} from '../../../actions/descriptionExclusionActions';

export default function DescriptionExclusionsCard() {
  const [exclusions, setExclusions] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    (async () => {
      const r = await getDescriptionExclusions();
      if (r.success) setExclusions(r.exclusions);
      else setError(r.error || 'Failed to load');
      setLoading(false);
    })();
  }, []);

  const handleAdd = () => {
    const term = input.trim();
    if (!term) return;
    setError(null);
    startTransition(async () => {
      const r = await addDescriptionExclusion(term);
      if (r.success) {
        setExclusions(r.exclusions);
        setInput('');
      } else {
        setError(r.error || 'Failed to add');
      }
    });
  };

  const handleRemove = (term: string) => {
    setError(null);
    startTransition(async () => {
      const r = await removeDescriptionExclusion(term);
      if (r.success) setExclusions(r.exclusions);
      else setError(r.error || 'Failed to remove');
    });
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow duration-200">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
        <div className="w-8 h-8 bg-gradient-to-br from-rose-500 to-rose-600 rounded-lg flex items-center justify-center">
          <Filter className="w-4 h-4 text-white" />
        </div>
        <h3 className="text-lg font-semibold text-slate-800">Description Exclusions</h3>
        <span className="ml-auto text-[11px] text-slate-400">
          {loading ? '…' : `${exclusions.length} active`}
        </span>
      </div>

      <div className="p-5 space-y-4">
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Offers whose name or description contains any of these terms (case-insensitive substring match) are dropped before reaching the CSV.
          The play scraper refreshes this list every 60 seconds — no restart needed.
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            placeholder="e.g. Summer of Live Promotion"
            disabled={isPending}
            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-400 disabled:bg-slate-50"
          />
          <button
            onClick={handleAdd}
            disabled={isPending || !input.trim()}
            className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="text-xs text-slate-400">Loading…</div>
        ) : exclusions.length === 0 ? (
          <div className="text-xs text-slate-400 italic">No exclusions configured.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {exclusions.map((term) => (
              <span
                key={term}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-700 text-xs font-medium rounded-full border border-rose-200"
              >
                {term}
                <button
                  onClick={() => handleRemove(term)}
                  disabled={isPending}
                  aria-label={`Remove ${term}`}
                  className="hover:bg-rose-200 rounded-full p-0.5 transition-colors disabled:opacity-50"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
