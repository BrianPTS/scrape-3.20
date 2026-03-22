'use client';

import React, { useState, useTransition, useCallback } from 'react';
import { Download, FileText, Filter, TrendingUp } from 'lucide-react';
import { getReportData, ReportData, ReportOrder, StrategySummary } from '@/actions/reportActions';

const STRATEGY_LABELS: Record<string, string> = {
  dynamic: 'Dynamic',
  static: 'Static',
  manual: 'Manual',
  unknown: 'Unknown',
};

const STRATEGY_COLORS: Record<string, string> = {
  dynamic: 'bg-emerald-100 text-emerald-700',
  static: 'bg-blue-100 text-blue-700',
  manual: 'bg-amber-100 text-amber-700',
  unknown: 'bg-gray-100 text-gray-500',
};

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'sold', label: 'Sold (confirmed/delivered)' },
  { value: 'invoiced', label: 'Invoiced' },
  { value: 'pending', label: 'Pending' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'problem', label: 'Problem' },
];

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export default function ReportsClient() {
  const [isPending, startTransition] = useTransition();
  const [data, setData] = useState<ReportData | null>(null);

  // Filters
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [strategy, setStrategy] = useState('all');
  const [status, setStatus] = useState('sold');

  const loadReport = useCallback(() => {
    startTransition(async () => {
      const result = await getReportData(
        dateFrom || undefined,
        dateTo || undefined,
        strategy || undefined,
        status || undefined,
      );
      setData(result);
    });
  }, [dateFrom, dateTo, strategy, status]);

  const downloadUrl = `/api/reports/download?dateFrom=${dateFrom}&dateTo=${dateTo}&strategy=${strategy}&status=${status}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-md shadow-purple-200">
              <FileText className="w-4 h-4 text-white" />
            </span>
            Pricing Strategy Report
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">Compare order performance across pricing strategies</p>
        </div>
        {data && data.orders.length > 0 && (
          <a
            href={downloadUrl}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-colors"
          >
            <Download size={14} />
            Download CSV
          </a>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} className="text-slate-400" />
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Filters</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Strategy</label>
            <select value={strategy} onChange={e => setStrategy(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white">
              <option value="all">All Strategies</option>
              <option value="dynamic">Dynamic</option>
              <option value="static">Static</option>
              <option value="manual">Manual</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white">
              {STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={loadReport}
              disabled={isPending}
              className="w-full px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
            >
              {isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Loading...
                </span>
              ) : 'Generate Report'}
            </button>
          </div>
        </div>
      </div>

      {/* Strategy Summary Cards */}
      {data && data.summaries.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {data.summaries.map((s: StrategySummary) => (
            <div key={s.strategy} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${STRATEGY_COLORS[s.strategy] || STRATEGY_COLORS.unknown}`}>
                  {STRATEGY_LABELS[s.strategy] || s.strategy}
                </span>
                <TrendingUp size={14} className="text-slate-300" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Orders</p>
                  <p className="text-lg font-bold text-slate-800">{s.orderCount}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Tickets</p>
                  <p className="text-lg font-bold text-slate-800">{s.totalTickets}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Revenue</p>
                  <p className="text-lg font-bold text-slate-800">{formatCurrency(s.totalRevenue)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Avg $/Ticket</p>
                  <p className="text-lg font-bold text-slate-800">{formatCurrency(s.avgUnitPrice)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Total Profit</p>
                  <p className={`text-lg font-bold ${s.totalProfit != null ? (s.totalProfit >= 0 ? 'text-emerald-700' : 'text-red-600') : 'text-slate-400'}`}>
                    {s.totalProfit != null ? formatCurrency(s.totalProfit) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Avg ROI</p>
                  <p className={`text-lg font-bold ${s.avgROIPct != null ? (s.avgROIPct >= 0 ? 'text-emerald-700' : 'text-red-600') : 'text-slate-400'}`}>
                    {s.avgROIPct != null ? `${s.avgROIPct.toFixed(1)}%` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Total Cost</p>
                  <p className="text-lg font-bold text-slate-800">
                    {s.totalCost != null ? formatCurrency(s.totalCost) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Sell-Through</p>
                  <p className={`text-lg font-bold ${s.sellThroughPct != null ? (s.sellThroughPct >= 50 ? 'text-emerald-700' : s.sellThroughPct >= 20 ? 'text-amber-600' : 'text-red-600') : 'text-slate-400'}`}>
                    {s.sellThroughPct != null ? `${s.sellThroughPct}%` : '—'}
                  </p>
                  {s.activeListings > 0 && (
                    <p className="text-[9px] text-slate-400">{s.activeListings.toLocaleString()} listings</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Order Detail Table */}
      {data && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <p className="text-sm font-bold text-slate-800">{data.totalOrders} Orders</p>
            {data.dateRange.from && (
              <p className="text-xs text-slate-400">{data.dateRange.from} to {data.dateRange.to}</p>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Order ID</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Event</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Event Date</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Section</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Row</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Seats</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider">Qty</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider">Unit Price</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cost</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider">Profit</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider">ROI</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Marketplace</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Strategy</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Order Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.orders.map((o: ReportOrder) => (
                  <tr key={o.order_id} className="hover:bg-slate-25 transition-colors">
                    <td className="px-4 py-2 text-xs font-mono text-slate-600">{o.order_id}</td>
                    <td className="px-4 py-2 text-xs text-slate-800 max-w-[200px] truncate">{o.event_name}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">{formatDate(o.occurs_at)}</td>
                    <td className="px-4 py-2 text-xs text-slate-600">{o.section}</td>
                    <td className="px-4 py-2 text-xs text-slate-600">{o.row}</td>
                    <td className="px-4 py-2 text-xs text-slate-600">
                      {o.low_seat && o.high_seat ? `${o.low_seat}-${o.high_seat}` : '-'}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-800 text-right font-medium">{o.quantity}</td>
                    <td className="px-4 py-2 text-xs text-slate-800 text-right font-medium">{formatCurrency(o.unit_price)}</td>
                    <td className="px-4 py-2 text-xs text-slate-800 text-right font-bold">{formatCurrency(o.total)}</td>
                    <td className="px-4 py-2 text-xs text-slate-600 text-right">{o.cost != null ? formatCurrency(o.cost) : '—'}</td>
                    <td className={`px-4 py-2 text-xs text-right font-semibold ${o.profit != null ? (o.profit >= 0 ? 'text-emerald-700' : 'text-red-600') : 'text-slate-400'}`}>
                      {o.profit != null ? formatCurrency(o.profit) : '—'}
                    </td>
                    <td className={`px-4 py-2 text-xs text-right font-semibold ${o.profitPct != null ? (o.profitPct >= 0 ? 'text-emerald-700' : 'text-red-600') : 'text-slate-400'}`}>
                      {o.profitPct != null ? `${o.profitPct.toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">{o.marketplace}</td>
                    <td className="px-4 py-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        o.status === 'delivered' ? 'bg-green-100 text-green-700' :
                        o.status === 'confirmed' || o.status === 'confirmed_delay' ? 'bg-blue-100 text-blue-700' :
                        o.status === 'rejected' ? 'bg-red-100 text-red-700' :
                        o.status === 'problem' ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STRATEGY_COLORS[o.pricingStrategy] || STRATEGY_COLORS.unknown}`}>
                        {STRATEGY_LABELS[o.pricingStrategy] || o.pricingStrategy}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">{formatDate(o.order_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.orders.length === 0 && (
              <div className="py-12 text-center text-sm text-slate-400">
                No orders found matching your filters.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!data && !isPending && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
          <FileText size={40} className="mx-auto text-slate-200 mb-3" />
          <p className="text-sm text-slate-500 mb-1">Select your filters and click Generate Report</p>
          <p className="text-xs text-slate-400">Compare Dynamic vs Static vs Manual pricing strategies</p>
        </div>
      )}
    </div>
  );
}
