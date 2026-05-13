'use server';

/**
 * StubHub Inventory Sync Engine
 *
 * Replaces the Automatiq/Sync CSV upload with direct StubHub POS API calls.
 * Uses diff-based sync: compares our listings against what's live on StubHub,
 * then creates/updates/deletes via the bulk endpoint.
 */

import dbConnect from '@/lib/dbConnect';
import { Event } from '@/models/eventModel';
import * as stubhub from '@/lib/stubhubPosClient';
import { mapToCreateRequest, mapToUpdateRequest, mapToBulkCreateItem, mapToBulkUpdateItem, mapToBulkDeleteItem } from '@/lib/stubhubFieldMapper';

// ── Event ID Resolution ──

interface EventIdCache {
  [mappingId: string]: number; // our mapping_id → stubhub event.id (viagogo)
}

async function resolveStubHubEventId(mappingId: string, eventName: string, venueName: string, eventDate: string): Promise<number | null> {
  await dbConnect();

  // Check DB cache first
  const event = await Event.findOne({ mapping_id: mappingId }, { stubhubEventId: 1 }).lean() as any;
  if (event?.stubhubEventId) return event.stubhubEventId;

  // Try to resolve via StubHub API using event mapping
  try {
    const result = await stubhub.getEvent({ eventMappingId: mappingId });
    if (result?.event?.id) {
      // Cache it on our Event doc
      await Event.updateOne({ mapping_id: mappingId }, { $set: { stubhubEventId: result.event.id } });
      return result.event.id;
    }
  } catch (err: any) {
    if (err.status !== 400 && err.status !== 404) {
      console.error(`[StubHub] Event resolution failed for ${mappingId}: ${err.message}`);
    }
  }

  // Try to create unmapped event via inventory create (StubHub auto-creates event mappings)
  console.warn(`[StubHub] No event mapping found for ${mappingId} (${eventName}). Will use eventMapping on first listing create.`);
  return null;
}

// ── Sync Engine ──

interface SyncResult {
  success: boolean;
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  errors: string[];
  duration: number;
}

/**
 * Sync all active inventory to StubHub.
 * Takes the same CsvRow[] that the CSV generator produces.
 */
export async function syncInventoryToStubHub(rows: any[]): Promise<SyncResult> {
  const startTime = Date.now();
  const result: SyncResult = {
    success: false,
    created: 0,
    updated: 0,
    deleted: 0,
    skipped: 0,
    errors: [],
    duration: 0,
  };

  if (!process.env.STUBHUB_POS_API_TOKEN) {
    result.errors.push('STUBHUB_POS_API_TOKEN not configured');
    result.duration = Date.now() - startTime;
    return result;
  }

  if (rows.length === 0) {
    result.success = true;
    result.duration = Date.now() - startTime;
    return result;
  }

  try {
    // Step 1: Group rows by event (mapping_id)
    const eventGroups = new Map<string, any[]>();
    for (const row of rows) {
      const mid = row.event_id || '';
      if (!eventGroups.has(mid)) eventGroups.set(mid, []);
      eventGroups.get(mid)!.push(row);
    }

    console.log(`[StubHub Sync] ${rows.length} listings across ${eventGroups.size} events`);

    // Step 2: Fetch current StubHub inventory (for diff)
    const stubhubInventory = new Map<string, any>(); // externalId → StubHub listing
    try {
      let paginationToken: number | undefined;
      let page = 0;
      do {
        const exported: any = await stubhub.exportInventory({
          pageSize: 5000,
          paginationToken,
        });
        if (exported?.inventory) {
          for (const listing of exported.inventory) {
            if (listing.externalId) {
              stubhubInventory.set(listing.externalId, listing);
            }
          }
        }
        paginationToken = exported?.paginationToken;
        page++;
      } while (paginationToken && page < 100);
      console.log(`[StubHub Sync] Fetched ${stubhubInventory.size} existing listings from StubHub`);
    } catch (err: any) {
      console.error(`[StubHub Sync] Failed to fetch existing inventory: ${err.message}`);
      result.errors.push(`Export fetch failed: ${err.message}`);
    }

    // Step 3: Resolve event IDs and build diff
    const creates: any[] = [];
    const updates: any[] = [];
    const ourExternalIds = new Set<string>();

    for (const [mappingId, eventRows] of eventGroups) {
      const sample = eventRows[0];
      const stubhubEventId = await resolveStubHubEventId(
        mappingId,
        sample.event_name,
        sample.venue_name,
        sample.event_date
      );

      for (const row of eventRows) {
        const externalId = String(row.inventory_id);
        ourExternalIds.add(externalId);

        const existing = stubhubInventory.get(externalId);

        if (!existing) {
          // New listing — create
          if (stubhubEventId) {
            creates.push(mapToBulkCreateItem(row, stubhubEventId));
          } else {
            // Use eventMapping for auto-creation
            creates.push({
              ...mapToBulkCreateItem(row, 0),
              event: undefined,
              eventMapping: {
                eventName: row.event_name,
                eventDate: row.event_date,
                venueName: row.venue_name,
              },
            });
          }
        } else {
          // Existing listing — check if price changed
          const currentPrice = existing.listingPricesByMarketplace?.[0]?.listPrice
            || existing.unitCost || 0;
          const newPrice = row.list_price;
          const priceChanged = Math.abs(currentPrice - newPrice) > 0.01;
          const qtyChanged = existing.availableQuantity !== row.quantity;

          if (priceChanged || qtyChanged) {
            updates.push({
              inventoryId: existing.id,
              ...mapToUpdateRequest(row),
            });
          }
        }
      }
    }

    // Step 4: Find listings to delete (on StubHub but not in our data)
    const deletes: any[] = [];
    for (const [externalId, listing] of stubhubInventory) {
      if (!ourExternalIds.has(externalId)) {
        deletes.push({ inventoryId: listing.id });
      }
    }

    console.log(`[StubHub Sync] Diff: ${creates.length} creates, ${updates.length} updates, ${deletes.length} deletes`);

    // Step 5: Execute via bulk endpoint (chunked)
    const CHUNK_SIZE = 200;

    // Process creates in chunks
    for (let i = 0; i < creates.length; i += CHUNK_SIZE) {
      const chunk = creates.slice(i, i + CHUNK_SIZE);
      try {
        const bulkId = crypto.randomUUID();
        const bulkResult: any = await stubhub.bulkInventory({
          bulkProcessingId: bulkId,
          createRequests: chunk,
        });

        // Poll for completion
        if (bulkResult) {
          const completed = bulkResult.completed?.length || 0;
          const failed = bulkResult.failed?.length || 0;
          result.created += completed;
          if (failed > 0) {
            for (const f of (bulkResult.failed || [])) {
              result.errors.push(`Create failed: ${f.error?.message || 'unknown'}`);
            }
          }
        }
      } catch (err: any) {
        result.errors.push(`Bulk create chunk failed: ${err.message}`);
      }
    }

    // Process updates in chunks
    for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
      const chunk = updates.slice(i, i + CHUNK_SIZE);
      try {
        const bulkId = crypto.randomUUID();
        const bulkResult: any = await stubhub.bulkInventory({
          bulkProcessingId: bulkId,
          updateRequests: chunk,
        });

        if (bulkResult) {
          const completed = bulkResult.completed?.length || 0;
          const failed = bulkResult.failed?.length || 0;
          result.updated += completed;
          if (failed > 0) {
            for (const f of (bulkResult.failed || [])) {
              result.errors.push(`Update failed: ${f.error?.message || 'unknown'}`);
            }
          }
        }
      } catch (err: any) {
        result.errors.push(`Bulk update chunk failed: ${err.message}`);
      }
    }

    // Process deletes in chunks
    for (let i = 0; i < deletes.length; i += CHUNK_SIZE) {
      const chunk = deletes.slice(i, i + CHUNK_SIZE);
      try {
        const bulkId = crypto.randomUUID();
        const bulkResult: any = await stubhub.bulkInventory({
          bulkProcessingId: bulkId,
          deleteRequests: chunk,
        });

        if (bulkResult) {
          result.deleted += (bulkResult.completed?.length || 0);
        }
      } catch (err: any) {
        result.errors.push(`Bulk delete chunk failed: ${err.message}`);
      }
    }

    result.success = result.errors.length === 0;
    result.duration = Date.now() - startTime;

    console.log(
      `[StubHub Sync] Complete in ${result.duration}ms: ` +
      `${result.created}C ${result.updated}U ${result.deleted}D ${result.errors.length} errors`
    );

    return result;
  } catch (err: any) {
    result.errors.push(`Sync failed: ${err.message}`);
    result.duration = Date.now() - startTime;
    return result;
  }
}
