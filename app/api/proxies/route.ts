import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import { Proxy } from '../../../models/proxyModel.js';

// Parse "ip:port:username:password" into object
function parseProxy(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':');
  if (parts.length !== 4) return null;
  const [ip, port, username, password] = parts;
  if (!ip || !port || !username || !password) return null;
  return { ip, port, username, password, raw: trimmed };
}

// GET — list all proxies
export async function GET() {
  try {
    await dbConnect();
    const proxies = await Proxy.find({}).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ success: true, proxies });
  } catch (error) {
    console.error('Error fetching proxies:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch proxies' }, { status: 500 });
  }
}

// POST — add proxies (accepts { proxies: "line\nline\n..." } or { proxies: ["line","line"] })
export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const body = await req.json();
    let lines: string[] = [];

    if (Array.isArray(body.proxies)) {
      lines = body.proxies;
    } else if (typeof body.proxies === 'string') {
      lines = body.proxies.split(/[\r\n]+/);
    } else {
      return NextResponse.json({ success: false, message: 'Invalid input. Send { proxies: "ip:port:user:pass\\n..." }' }, { status: 400 });
    }

    const parsed = lines.map(parseProxy).filter(Boolean);
    if (parsed.length === 0) {
      return NextResponse.json({ success: false, message: 'No valid proxies found. Format: ip:port:username:password' }, { status: 400 });
    }

    // Bulk insert, skip duplicates
    let added = 0;
    let skipped = 0;
    for (const proxy of parsed) {
      try {
        const result = await Proxy.updateOne(
          { ip: proxy!.ip, port: proxy!.port },
          { $setOnInsert: proxy },
          { upsert: true }
        );
        if (result.upsertedCount > 0) added++;
        else skipped++;
      } catch {
        skipped++;
      }
    }

    return NextResponse.json({ success: true, added, skipped, total: parsed.length });
  } catch (error) {
    console.error('Error adding proxies:', error);
    return NextResponse.json({ success: false, message: 'Failed to add proxies' }, { status: 500 });
  }
}

// DELETE — remove proxies by IDs or clear all
export async function DELETE(req: NextRequest) {
  try {
    await dbConnect();
    const body = await req.json();

    if (body.clearAll === true) {
      const result = await Proxy.deleteMany({});
      return NextResponse.json({ success: true, deleted: result.deletedCount });
    }

    if (Array.isArray(body.ids) && body.ids.length > 0) {
      const result = await Proxy.deleteMany({ _id: { $in: body.ids } });
      return NextResponse.json({ success: true, deleted: result.deletedCount });
    }

    return NextResponse.json({ success: false, message: 'Send { ids: [...] } or { clearAll: true }' }, { status: 400 });
  } catch (error) {
    console.error('Error deleting proxies:', error);
    return NextResponse.json({ success: false, message: 'Failed to delete proxies' }, { status: 500 });
  }
}
