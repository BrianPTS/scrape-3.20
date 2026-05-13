/**
 * StubHub POS API Client
 *
 * Wraps the StubHub Point-of-Sale external API (OpenAPI 3.0).
 * Handles authentication (Bearer JWT), Account-Id impersonation,
 * retry with exponential backoff, and rate limiting.
 *
 * Env vars:
 *   STUBHUB_POS_API_TOKEN   – JWT bearer token
 *   STUBHUB_POS_BASE_URL    – API base (default: https://sell.stubhub.com/sellerapi)
 *   STUBHUB_ACCOUNT_ID      – Seller account UUID for Account-Id header
 */

const BASE_URL = process.env.STUBHUB_POS_BASE_URL || 'https://sell.stubhub.com/sellerapi';
const API_TOKEN = process.env.STUBHUB_POS_API_TOKEN || '';
const ACCOUNT_ID = process.env.STUBHUB_ACCOUNT_ID || '';

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

interface StubHubError {
  code?: string;
  message?: string;
  errors?: Record<string, string[]>;
}

interface RequestOptions {
  method: string;
  path: string;
  body?: any;
  query?: Record<string, string | number | boolean | undefined>;
  timeout?: number;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildQueryString(params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return '';
  const parts: string[] = [];
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null && val !== '') {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(val))}`);
    }
  }
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

async function request<T = any>(opts: RequestOptions): Promise<T> {
  const url = `${BASE_URL}${opts.path}${buildQueryString(opts.query)}`;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${API_TOKEN}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  if (ACCOUNT_ID) {
    headers['Account-Id'] = ACCOUNT_ID;
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = opts.timeout || 30000;
      const timer = setTimeout(() => controller.abort(), timeout);

      const res = await fetch(url, {
        method: opts.method,
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10);
        console.warn(`[StubHub] Rate limited (429), waiting ${retryAfter}s`);
        await sleep(retryAfter * 1000);
        continue;
      }

      if (res.status === 204) return undefined as T;

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const err = data as StubHubError;
        const msg = err?.message || `HTTP ${res.status}`;
        if (res.status >= 500 && attempt < MAX_RETRIES) {
          console.warn(`[StubHub] Server error ${res.status}, retrying (${attempt + 1}/${MAX_RETRIES})`);
          await sleep(INITIAL_BACKOFF_MS * Math.pow(2, attempt));
          lastError = new Error(msg);
          continue;
        }
        const error = new Error(`[StubHub] ${opts.method} ${opts.path} → ${res.status}: ${msg}`) as any;
        error.status = res.status;
        error.stubhubError = err;
        throw error;
      }

      return data as T;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        lastError = new Error(`[StubHub] ${opts.method} ${opts.path} timed out`);
        if (attempt < MAX_RETRIES) {
          await sleep(INITIAL_BACKOFF_MS * Math.pow(2, attempt));
          continue;
        }
      }
      if (err.status) throw err;
      lastError = err;
      if (attempt < MAX_RETRIES) {
        await sleep(INITIAL_BACKOFF_MS * Math.pow(2, attempt));
        continue;
      }
    }
  }

  throw lastError || new Error(`[StubHub] ${opts.method} ${opts.path} failed after ${MAX_RETRIES} retries`);
}

// ── Inventory ──

export async function createInventory(payload: any) {
  return request({ method: 'POST', path: '/inventory', body: payload });
}

export async function updateInventory(inventoryId: number, payload: any) {
  return request({ method: 'PATCH', path: `/inventory/${inventoryId}`, body: payload });
}

export async function deleteInventory(inventoryId: number) {
  return request({ method: 'DELETE', path: `/inventory/${inventoryId}` });
}

export async function getInventoryById(inventoryId: number) {
  return request({ method: 'GET', path: `/inventory/${inventoryId}` });
}

export async function getInventoryByExternalId(externalId: string) {
  return request({ method: 'GET', path: `/inventory/external/${encodeURIComponent(externalId)}` });
}

export async function getMultipleByExternalId(externalId: string) {
  return request({ method: 'GET', path: `/inventory/externals/${encodeURIComponent(externalId)}` });
}

export async function getInventoryByEvent(eventId: number, params?: { section?: string; row?: string; seat?: string }) {
  return request({ method: 'GET', path: `/events/${eventId}/inventory`, query: params as any });
}

export async function searchInventory(params: Record<string, any>) {
  return request({ method: 'GET', path: '/inventory/search', query: params });
}

export async function exportInventory(params: {
  updatedDateSince?: string;
  pageSize?: number;
  paginationToken?: number;
  includePastEvents?: boolean;
}) {
  return request({ method: 'GET', path: '/inventory/export', query: params as any });
}

export async function updateInventoryPrices(inventoryId: number, prices: any[]) {
  return request({ method: 'PATCH', path: `/inventory/${inventoryId}/prices`, body: { prices } });
}

// ── Bulk ──

export async function bulkInventory(payload: any) {
  return request({ method: 'POST', path: '/inventory/bulk', body: payload, timeout: 120000 });
}

export async function getBulkStatus(bulkProcessingId: string) {
  return request({ method: 'GET', path: `/inventory/bulk/${bulkProcessingId}` });
}

// ── Events ──

export async function getEvent(params: { eventId?: number; eventMappingId?: string }) {
  return request({ method: 'GET', path: '/events', query: params as any });
}

// ── Sales / Invoices ──

export async function getInvoices(params: {
  updateDateSince?: string;
  paginationToken?: number;
  maxPageSize?: number;
}) {
  return request({ method: 'GET', path: '/invoices', query: params as any });
}

export async function getInvoiceById(invoiceId: number) {
  return request({ method: 'GET', path: `/invoices/${invoiceId}` });
}

// ── Accounts ──

export async function getAccounts() {
  return request({ method: 'GET', path: '/accounts' });
}

// ── Webhooks ──

export async function listWebhooks() {
  return request({ method: 'GET', path: '/webhooks' });
}

export async function createWebhook(payload: any) {
  return request({ method: 'POST', path: '/webhooks', body: payload });
}

export default {
  createInventory,
  updateInventory,
  deleteInventory,
  getInventoryById,
  getInventoryByExternalId,
  getMultipleByExternalId,
  getInventoryByEvent,
  searchInventory,
  exportInventory,
  updateInventoryPrices,
  bulkInventory,
  getBulkStatus,
  getEvent,
  getInvoices,
  getInvoiceById,
  getAccounts,
  listWebhooks,
  createWebhook,
};
