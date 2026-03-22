import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import { Order } from '@/models/orderModel';
import { ConsecutiveGroup } from '@/models/seatModel';

/* eslint-disable @typescript-eslint/no-explicit-any */

export const dynamic = 'force-dynamic';

/**
 * POST /api/orders/backfill-cost
 * One-time (or periodic) backfill of costSnapshot on existing orders.
 * Finds orders that have pos_inventory_id but no costSnapshot and links the cost.
 */
export async function POST(req: NextRequest) {
  await dbConnect();

  const body = await req.json().catch(() => ({}));
  const batchSize = Math.min(body.batchSize || 500, 2000);

  const orders = await Order.find(
    { pos_inventory_id: { $nin: [null, ''] }, 'costSnapshot.snapshotAt': null },
    { pos_inventory_id: 1 }
  )
    .limit(batchSize)
    .lean();

  if (orders.length === 0) {
    return NextResponse.json({ message: 'No orders to backfill', updated: 0, remaining: 0 });
  }

  // Batch-fetch all inventory IDs at once
  const invIds = orders.map((o: any) => parseInt(o.pos_inventory_id, 10)).filter((n: number) => !isNaN(n));
  const groups = await ConsecutiveGroup.find(
    { 'inventory.inventoryId': { $in: invIds } },
    { 'inventory.inventoryId': 1, 'inventory.cost': 1, 'inventory.taxed_cost': 1, 'inventory.face_price': 1, 'inventory.listPrice': 1 }
  ).lean();

  const costMap = new Map<number, any>();
  for (const g of groups as any[]) {
    if (g.inventory?.inventoryId != null) {
      costMap.set(g.inventory.inventoryId, g.inventory);
    }
  }

  const now = new Date();
  const ops: any[] = [];
  for (const o of orders as any[]) {
    const invId = parseInt(o.pos_inventory_id, 10);
    const inv = costMap.get(invId);
    if (inv) {
      ops.push({
        updateOne: {
          filter: { _id: o._id },
          update: {
            $set: {
              costSnapshot: {
                unitCost: inv.cost ?? null,
                taxedCost: inv.taxed_cost ?? null,
                facePrice: inv.face_price ?? null,
                listPriceAtOrder: inv.listPrice ?? null,
                snapshotAt: now,
              },
            },
          },
        },
      });
    }
  }

  if (ops.length > 0) {
    await Order.bulkWrite(ops);
  }

  // Check remaining
  const remaining = await Order.countDocuments(
    { pos_inventory_id: { $nin: [null, ''] }, 'costSnapshot.snapshotAt': null }
  );

  return NextResponse.json({
    message: `Backfilled ${ops.length} of ${orders.length} orders`,
    updated: ops.length,
    processed: orders.length,
    remaining,
  });
}
