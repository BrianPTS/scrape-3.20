'use server';

import { unstable_noStore as noStore } from 'next/cache';
import dbConnect from '@/lib/dbConnect';
import { Order } from '@/models/orderModel';
import { Event } from '@/models/eventModel';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ReportOrder {
  order_id: string;
  event_name: string;
  venue: string;
  occurs_at: string | null;
  section: string;
  row: string;
  low_seat: number | null;
  high_seat: number | null;
  quantity: number;
  unit_price: number;
  total: number;
  marketplace: string;
  status: string;
  order_date: string | null;
  pricingStrategy: string;
  delivery: string;
  cost: number | null;
  profit: number | null;
  profitPct: number | null;
}

export interface StrategySummary {
  strategy: string;
  orderCount: number;
  totalRevenue: number;
  totalTickets: number;
  avgUnitPrice: number;
  avgProfit: number | null;
}

export interface ReportData {
  orders: ReportOrder[];
  summaries: StrategySummary[];
  totalOrders: number;
  dateRange: { from: string; to: string };
}

const SELL_FEE_PCT = 0.08;

export async function getReportData(
  dateFrom?: string,
  dateTo?: string,
  strategyFilter?: string,
  statusFilter?: string,
): Promise<ReportData> {
  noStore();
  await dbConnect();

  const query: Record<string, any> = {};

  if (dateFrom || dateTo) {
    query.order_date = {};
    if (dateFrom) query.order_date.$gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      query.order_date.$lte = end;
    }
  }

  if (strategyFilter && strategyFilter !== 'all') {
    query.pricingStrategy = strategyFilter;
  }

  if (statusFilter && statusFilter !== 'all') {
    if (statusFilter === 'sold') {
      query.status = { $in: ['confirmed', 'confirmed_delay', 'delivered'] };
    } else {
      query.status = statusFilter;
    }
  }

  const rawOrders = await Order.find(query)
    .sort({ order_date: -1 })
    .limit(5000)
    .lean();

  // Look up event cost data for profit calculation
  // Build a map of pos_event_id -> event pricing details
  const posEventIds = [...new Set(rawOrders.map((o: any) => o.pos_event_id).filter(Boolean))];
  const portalEventIds = [...new Set(rawOrders.map((o: any) => o.portalEventId).filter(Boolean))];

  // If pricingStrategy is null on orders, backfill from event
  const eventMap = new Map<string, any>();
  if (portalEventIds.length > 0) {
    const events = await Event.find(
      { _id: { $in: portalEventIds } },
      { pricingStrategy: 1, mapping_id: 1 }
    ).lean();
    for (const ev of events) {
      eventMap.set(String(ev._id), ev);
    }
  }

  const orders: ReportOrder[] = rawOrders.map((o: any) => {
    const strategy = o.pricingStrategy
      || (o.portalEventId && eventMap.get(String(o.portalEventId))?.pricingStrategy)
      || 'unknown';

    const unitPrice = o.unit_price || 0;
    const qty = o.quantity || 0;
    const total = o.total || (unitPrice * qty);
    // Revenue after platform sell fee
    const netRevenue = total * (1 - SELL_FEE_PCT);
    // We don't have per-order cost in the order model yet, so profit is estimated
    // For now, cost = null means we can't compute profit
    const cost: number | null = null;
    const profit = cost !== null ? netRevenue - cost : null;
    const profitPct = cost !== null && cost > 0 ? ((netRevenue - cost) / cost) * 100 : null;

    return {
      order_id: o.order_id,
      event_name: o.event_name || '',
      venue: o.venue || '',
      occurs_at: o.occurs_at ? new Date(o.occurs_at).toISOString() : null,
      section: o.section || '',
      row: o.row || '',
      low_seat: o.low_seat ?? null,
      high_seat: o.high_seat ?? null,
      quantity: qty,
      unit_price: unitPrice,
      total,
      marketplace: o.marketplace || '',
      status: o.status || '',
      order_date: o.order_date ? new Date(o.order_date).toISOString() : null,
      pricingStrategy: strategy,
      delivery: o.delivery || '',
      cost,
      profit,
      profitPct,
    };
  });

  // Build strategy summaries
  const stratMap = new Map<string, { count: number; revenue: number; tickets: number; prices: number[] }>();
  for (const o of orders) {
    const s = o.pricingStrategy || 'unknown';
    const entry = stratMap.get(s) || { count: 0, revenue: 0, tickets: 0, prices: [] };
    entry.count++;
    entry.revenue += o.total;
    entry.tickets += o.quantity;
    entry.prices.push(o.unit_price);
    stratMap.set(s, entry);
  }

  const summaries: StrategySummary[] = [...stratMap.entries()].map(([strategy, data]) => ({
    strategy,
    orderCount: data.count,
    totalRevenue: Math.round(data.revenue * 100) / 100,
    totalTickets: data.tickets,
    avgUnitPrice: data.prices.length > 0
      ? Math.round((data.prices.reduce((a, b) => a + b, 0) / data.prices.length) * 100) / 100
      : 0,
    avgProfit: null, // Will be available once cost tracking is added
  }));

  // Determine actual date range from results
  const dates = orders.filter(o => o.order_date).map(o => new Date(o.order_date!).getTime());
  const from = dates.length > 0 ? new Date(Math.min(...dates)).toISOString().slice(0, 10) : '';
  const to = dates.length > 0 ? new Date(Math.max(...dates)).toISOString().slice(0, 10) : '';

  return JSON.parse(JSON.stringify({
    orders,
    summaries,
    totalOrders: orders.length,
    dateRange: { from, to },
  }));
}
