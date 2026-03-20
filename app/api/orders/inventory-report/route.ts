import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import { Order } from '@/models/orderModel';

/* eslint-disable @typescript-eslint/no-explicit-any */

export const dynamic = 'force-dynamic';

/**
 * GET /api/orders/inventory-report
 *
 * Downloads a CSV report of all orders that have an inventory snapshot.
 * Query params:
 *   - from: ISO date string (order_date >= from)
 *   - to:   ISO date string (order_date <= to)
 *   - format: 'csv' (default) or 'json'
 */
export async function GET(request: NextRequest) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const format = searchParams.get('format') || 'csv';

    const query: Record<string, any> = {
      'inventorySnapshot.snapshotAt': { $ne: null },
    };
    if (from || to) {
      query.order_date = {};
      if (from) query.order_date.$gte = new Date(from);
      if (to) query.order_date.$lte = new Date(to);
    }

    const orders = await Order.find(query)
      .sort({ order_date: -1 })
      .select({
        order_id: 1, event_name: 1, venue: 1, occurs_at: 1,
        section: 1, row: 1, quantity: 1, total: 1, unit_price: 1,
        marketplace: 1, status: 1, order_date: 1,
        inventorySnapshot: 1,
      })
      .lean();

    if (format === 'json') {
      return NextResponse.json({ orders, count: orders.length });
    }

    // Build CSV
    const headers = [
      'Order ID', 'Event Name', 'Venue', 'Event Date',
      'Section', 'Row', 'Qty', 'Unit Price', 'Total',
      'Marketplace', 'Status', 'Order Date',
      'Event Avail %', 'Event Available Seats', 'Event Venue Capacity',
      'Section Share %', 'Section Available Seats', 'Section Total Inventory',
      'Snapshot Time',
    ];

    const csvRows = [headers.join(',')];
    for (const o of orders as any[]) {
      const snap = o.inventorySnapshot || {};
      const row = [
        escapeCsv(o.order_id),
        escapeCsv(o.event_name),
        escapeCsv(o.venue),
        o.occurs_at ? new Date(o.occurs_at).toISOString().slice(0, 10) : '',
        escapeCsv(o.section),
        escapeCsv(o.row),
        o.quantity ?? '',
        o.unit_price?.toFixed(2) ?? '',
        o.total?.toFixed(2) ?? '',
        escapeCsv(o.marketplace),
        o.status ?? '',
        o.order_date ? new Date(o.order_date).toISOString() : '',
        snap.eventAvailabilityPct ?? '',
        snap.eventAvailableSeats ?? '',
        snap.eventVenueCapacity ?? '',
        snap.sectionAvailabilityPct ?? '',
        snap.sectionAvailableSeats ?? '',
        snap.sectionTotalCapacity ?? '',
        snap.snapshotAt ? new Date(snap.snapshotAt).toISOString() : '',
      ];
      csvRows.push(row.join(','));
    }

    const csv = csvRows.join('\n');
    const now = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="order-inventory-report-${now}.csv"`,
      },
    });
  } catch (error) {
    console.error('Inventory report error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

function escapeCsv(val: any): string {
  if (val == null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
