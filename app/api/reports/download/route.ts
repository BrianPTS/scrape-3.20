import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getReportData, ReportOrder } from '@/actions/reportActions';

export const dynamic = 'force-dynamic';

function escapeCsvField(value: string | number | null | undefined): string {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function orderToCsvRow(o: ReportOrder): string {
  return [
    o.order_id,
    escapeCsvField(o.event_name),
    escapeCsvField(o.venue),
    o.occurs_at ? new Date(o.occurs_at).toLocaleDateString('en-US', { timeZone: 'UTC' }) : '',
    escapeCsvField(o.section),
    o.row,
    o.low_seat ?? '',
    o.high_seat ?? '',
    o.quantity,
    o.unit_price.toFixed(2),
    o.total.toFixed(2),
    o.marketplace,
    o.status,
    o.order_date ? new Date(o.order_date).toLocaleDateString('en-US', { timeZone: 'UTC' }) : '',
    o.pricingStrategy,
    o.delivery,
  ].join(',');
}

export async function GET(request: NextRequest) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('dateFrom') || undefined;
    const dateTo = searchParams.get('dateTo') || undefined;
    const strategy = searchParams.get('strategy') || undefined;
    const status = searchParams.get('status') || undefined;

    const data = await getReportData(dateFrom, dateTo, strategy, status);

    const header = 'order_id,event_name,venue,event_date,section,row,low_seat,high_seat,quantity,unit_price,total,marketplace,status,order_date,pricing_strategy,delivery';
    const rows = data.orders.map(orderToCsvRow);
    const csv = [header, ...rows].join('\n');

    const filename = `pricing-report-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Report download error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
