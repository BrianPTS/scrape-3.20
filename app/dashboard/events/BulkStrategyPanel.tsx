'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, BarChart3 } from 'lucide-react';
import { bulkSetPricingStrategy } from '@/actions/eventActions';

const STRATEGIES = [
  { value: 'dynamic' as const, label: 'Dynamic', desc: 'Auto-adjusts ROI based on market signals', color: 'bg-violet-100 text-violet-700 border-violet-200' },
  { value: 'static' as const, label: 'Static', desc: 'Fixed markup — no auto-adjustments', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'manual' as const, label: 'Manual', desc: 'Exact list price per event', color: 'bg-amber-100 text-amber-700 border-amber-200' },
];

interface BulkStrategyPanelProps {
  events: Array<{ _id: string; Event_Name: string; pricingStrategy?: string }>;
}

export default function BulkStrategyPanel({ events }: BulkStrategyPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [fromStrategy, setFromStrategy] = useState<string>('all');
  const [toStrategy, setToStrategy] = useState<'dynamic' | 'static' | 'manual'>('dynamic');
  const [result, setResult] = useState<string | null>(null);

  // Count events by strategy
  const counts = { dynamic: 0, static: 0, manual: 0, unknown: 0 };
  for (const e of events) {
    const s = e.pricingStrategy || 'dynamic';
    if (s in counts) counts[s as keyof typeof counts]++;
    else counts.unknown++;
  }

  // Get affected event IDs
  const affectedIds = events
    .filter(e => fromStrategy === 'all' || (e.pricingStrategy || 'dynamic') === fromStrategy)
    .map(e => e._id);

  const handleApply = () => {
    if (affectedIds.length === 0) return;
    startTransition(async () => {
      const res = await bulkSetPricingStrategy(affectedIds, toStrategy);
      if (res.success) {
        setResult(`Updated ${res.modifiedCount} events to ${toStrategy}`);
        router.refresh();
      } else {
        setResult(`Error: ${res.error}`);
      }
    });
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm"
      >
        <BarChart3 size={12} />
        Strategy A/B
        <span className="ml-1 text-[10px] text-slate-400">
          D:{counts.dynamic} S:{counts.static} M:{counts.manual}
        </span>
      </button>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-indigo-500" />
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Bulk Strategy Assignment</p>
        </div>
        <button onClick={() => { setIsOpen(false); setResult(null); }} className="text-xs text-slate-400 hover:text-slate-600">Close</button>
      </div>

      {/* Current distribution */}
      <div className="flex gap-2">
        {STRATEGIES.map(s => (
          <div key={s.value} className={`flex-1 rounded-lg border px-3 py-2 text-center ${s.color}`}>
            <p className="text-lg font-bold">{counts[s.value]}</p>
            <p className="text-[10px] font-semibold uppercase">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Assignment controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase">Move from</label>
          <select
            value={fromStrategy}
            onChange={e => setFromStrategy(e.target.value)}
            className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
          >
            <option value="all">All ({events.length})</option>
            <option value="dynamic">Dynamic ({counts.dynamic})</option>
            <option value="static">Static ({counts.static})</option>
            <option value="manual">Manual ({counts.manual})</option>
          </select>
        </div>

        <span className="text-slate-300 text-sm font-bold">→</span>

        <div className="flex items-center gap-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase">To</label>
          <select
            value={toStrategy}
            onChange={e => setToStrategy(e.target.value as any)}
            className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
          >
            {STRATEGIES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleApply}
          disabled={isPending || affectedIds.length === 0}
          className="px-4 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
        >
          {isPending ? 'Applying...' : `Apply to ${affectedIds.length} events`}
        </button>
      </div>

      {/* Quick A/B split */}
      <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
        <span className="text-[10px] text-slate-400 font-semibold">Quick split:</span>
        <button
          onClick={() => {
            // Split active events 50/50 between dynamic and static
            const half = Math.ceil(events.length / 2);
            const dynamicIds = events.slice(0, half).map(e => e._id);
            const staticIds = events.slice(half).map(e => e._id);
            startTransition(async () => {
              await bulkSetPricingStrategy(dynamicIds, 'dynamic');
              await bulkSetPricingStrategy(staticIds, 'static');
              setResult(`Split: ${dynamicIds.length} → Dynamic, ${staticIds.length} → Static`);
              router.refresh();
            });
          }}
          disabled={isPending}
          className="px-3 py-1 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50 transition-colors"
        >
          50/50 Dynamic vs Static
        </button>
        <button
          onClick={() => {
            startTransition(async () => {
              await bulkSetPricingStrategy(events.map(e => e._id), 'dynamic');
              setResult(`All ${events.length} events → Dynamic`);
              router.refresh();
            });
          }}
          disabled={isPending}
          className="px-3 py-1 rounded-lg text-[10px] font-bold bg-violet-100 text-violet-700 hover:bg-violet-200 disabled:opacity-50 transition-colors"
        >
          All Dynamic
        </button>
        <button
          onClick={() => {
            startTransition(async () => {
              await bulkSetPricingStrategy(events.map(e => e._id), 'static');
              setResult(`All ${events.length} events → Static`);
              router.refresh();
            });
          }}
          disabled={isPending}
          className="px-3 py-1 rounded-lg text-[10px] font-bold bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50 transition-colors"
        >
          All Static
        </button>
      </div>

      {result && (
        <p className={`text-xs font-semibold ${result.startsWith('Error') ? 'text-red-600' : 'text-emerald-600'}`}>
          {result}
        </p>
      )}
    </div>
  );
}
