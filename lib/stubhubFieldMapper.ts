/**
 * Maps our internal CsvRow format to StubHub POS API request payloads.
 *
 * CsvRow → InventoryCreateRequest (for new listings)
 * CsvRow → InventoryUpdateRequest (for price/quantity changes)
 */

interface CsvRow {
  inventory_id: number;
  event_name: string;
  venue_name: string;
  event_date: string;
  event_id: string;
  quantity: number;
  section: string;
  row: string;
  seats: string;
  barcodes?: string;
  internal_notes?: string;
  public_notes?: string;
  tags?: string;
  list_price: number;
  face_price: number;
  taxed_cost: number;
  cost: number;
  hide_seats: 'Y' | 'N';
  in_hand: 'N';
  in_hand_date: string;
  instant_transfer?: 'Y' | 'N';
  files_available: 'Y' | 'N';
  split_type: 'CUSTOM' | 'DEFAULT' | 'NEVERLEAVEONE' | 'ANY';
  custom_split?: string;
  stock_type: string;
  zone: 'Y' | 'N';
  shown_quantity?: number;
  passthrough?: string;
}

// StubHub split type enum: Any=1, None=2, AvoidOne=3, AvoidOneAndThree=4, Pairs=5
function mapSplitType(csvSplit: string): string {
  switch (csvSplit) {
    case 'NEVERLEAVEONE': return 'AvoidOne';
    case 'DEFAULT': return 'Any';
    case 'ANY': return 'Any';
    case 'CUSTOM': return 'None';
    default: return 'Any';
  }
}

// StubHub delivery types: InApp, PDF, Paper, MemberCard, Wallet, Custom
function mapDeliveryType(stockType: string): string {
  switch (stockType) {
    case 'MOBILE_TRANSFER': return 'InApp';
    case 'ELECTRONIC': return 'PDF';
    case 'HARD': return 'Paper';
    case 'MOBILE_SCREENCAP': return 'InApp';
    case 'PAPERLESS': return 'InApp';
    case 'PAPERLESS_CARD': return 'MemberCard';
    case 'FLASH': return 'InApp';
    default: return 'InApp';
  }
}

function parseSeatRange(seats: string): { seatFrom?: string; seatTo?: string; seatList: string[] } {
  if (!seats) return { seatList: [] };
  const seatList = seats.split(',').map(s => s.trim()).filter(Boolean);
  if (seatList.length === 0) return { seatList: [] };
  return {
    seatFrom: seatList[0],
    seatTo: seatList[seatList.length - 1],
    seatList,
  };
}

function buildListingNotes(publicNotes?: string): any[] | undefined {
  if (!publicNotes) return undefined;
  return publicNotes.split(',').map(n => n.trim()).filter(Boolean).map(note => ({ note }));
}

function buildTags(tagString?: string): any[] | undefined {
  if (!tagString) return undefined;
  return tagString.split(',').map(t => t.trim()).filter(Boolean).map(name => ({
    name,
    values: ['true'],
    valueDataType: 'String',
  }));
}

/**
 * Map a CsvRow to a StubHub InventoryCreateRequest.
 * Requires stubhubEventId (viagogo event ID) to be resolved separately.
 */
export function mapToCreateRequest(row: CsvRow, stubhubEventId: number): any {
  const seatInfo = parseSeatRange(row.seats);

  return {
    event: { id: stubhubEventId },
    currencyCode: 'USD',
    unitCost: row.cost,
    faceValueCost: row.face_price || undefined,
    taxPaid: row.taxed_cost > row.cost ? row.taxed_cost - row.cost : undefined,
    deliveryType: mapDeliveryType(row.stock_type),
    inHandAt: row.in_hand_date || undefined,
    splitType: mapSplitType(row.split_type),
    maxDisplayQuantity: row.shown_quantity || row.quantity,
    seating: {
      section: row.section,
      row: row.row,
    },
    ticketCount: row.quantity,
    externalId: String(row.inventory_id),
    internalNotes: row.internal_notes || undefined,
    listingNotes: buildListingNotes(row.public_notes),
    tags: buildTags(row.tags),
    autoBroadcast: true,
  };
}

/**
 * Map a CsvRow to a StubHub InventoryUpdateRequest (price + broadcast update).
 * Only sends fields that can change between scrape cycles.
 */
export function mapToUpdateRequest(row: CsvRow): any {
  return {
    prices: [{
      marketplace: 'StubHub',
      listPrice: row.list_price,
    }],
    internalNotes: row.internal_notes || undefined,
    inHandAt: row.in_hand_date || undefined,
    splitType: mapSplitType(row.split_type),
    maxDisplayQuantity: row.shown_quantity || row.quantity,
    hideSeats: row.hide_seats === 'Y',
  };
}

/**
 * Map a CsvRow to a BulkInventoryCreateRequest item.
 */
export function mapToBulkCreateItem(row: CsvRow, stubhubEventId: number): any {
  const base = mapToCreateRequest(row, stubhubEventId);
  return base;
}

/**
 * Map a CsvRow to a BulkInventoryUpdateRequest item.
 */
export function mapToBulkUpdateItem(row: CsvRow, stubhubInventoryId: number): any {
  return {
    inventoryId: stubhubInventoryId,
    ...mapToUpdateRequest(row),
  };
}

/**
 * Map a StubHub inventory ID to a BulkInventoryDeleteRequest item.
 */
export function mapToBulkDeleteItem(stubhubInventoryId: number): any {
  return {
    inventoryId: stubhubInventoryId,
  };
}

export default {
  mapToCreateRequest,
  mapToUpdateRequest,
  mapToBulkCreateItem,
  mapToBulkUpdateItem,
  mapToBulkDeleteItem,
  mapSplitType,
  mapDeliveryType,
};
