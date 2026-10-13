import {
  PIXEL_CURRENCY,
  initMetaPixel,
  loadPixelConfig,
  trackMetaEvent,
  type MetaContentsItem,
} from './meta-pixel';

export type PendingPurchase = {
  orderId: string;
  total: number;
  contents: MetaContentsItem[];
  numItems: number;
};

const FIRED_KEY = 'chitra-meta-purchases';
const PENDING_KEY = 'chitra-meta-pending-purchase';

function readFiredOrderIds(): string[] {
  try {
    const raw = window.localStorage.getItem(FIRED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function markOrderFired(orderId: string): void {
  try {
    const ids = readFiredOrderIds().filter((id) => id !== orderId);
    ids.unshift(orderId);
    window.localStorage.setItem(FIRED_KEY, JSON.stringify(ids.slice(0, 30)));
  } catch {
    /* storage unavailable */
  }
}

// Remember a backend-confirmed order so Purchase fires on the
// order-confirmation surface. sessionStorage survives refresh in the same tab
// (so a refresh still sees it) but never leaks across tabs or sessions.
export function rememberPurchase(purchase: PendingPurchase): void {
  try {
    if (!purchase?.orderId) return;
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(purchase));
  } catch {
    /* storage unavailable */
  }
}

function readPendingPurchase(): PendingPurchase | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingPurchase>;
    if (!parsed || typeof parsed.orderId !== 'string' || !parsed.orderId) return null;
    return {
      orderId: parsed.orderId,
      total: Number(parsed.total ?? 0) || 0,
      contents: Array.isArray(parsed.contents) ? parsed.contents : [],
      numItems: Number(parsed.numItems ?? 0) || 0,
    };
  } catch {
    return null;
  }
}

function clearPendingPurchase(): void {
  try {
    window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* storage unavailable */
  }
}

// Fire Purchase exactly once per backend-confirmed order id (refresh/revisit
// safe via the fired-id list in localStorage; the order id doubles as the
// Meta eventID so a future Conversions API dedupes cleanly). Only payload
// facts from the backend order row are sent — never customer PII.
// In-flight guard: two concurrent firePendingPurchase() calls (React
// StrictMode double-effect in dev, or an inline confirmation racing a
// confirmation-page mount) can both pass the fired-check across the await gap
// before either marks the order. An order id already being recorded is
// skipped outright; the in-flight owner completes the single fire.
const firingOrderIds = new Set<string>();

export async function firePendingPurchase(): Promise<boolean> {
  try {
    const pending = readPendingPurchase();
    if (!pending) return false;
    if (firingOrderIds.has(pending.orderId)) return false;
    firingOrderIds.add(pending.orderId);
    try {
      const config = await loadPixelConfig();
      if (!initMetaPixel(config)) {
        clearPendingPurchase();
        return false;
      }
      if (readFiredOrderIds().includes(pending.orderId)) {
        clearPendingPurchase();
        return false;
      }
      markOrderFired(pending.orderId);
      trackMetaEvent(
        'Purchase',
        {
          content_ids: pending.contents.map((item) => item.id),
          content_type: 'product',
          contents: pending.contents,
          num_items: pending.numItems,
          value: pending.total,
          currency: PIXEL_CURRENCY,
        },
        { eventID: pending.orderId },
      );
      clearPendingPurchase();
      return true;
    } finally {
      firingOrderIds.delete(pending.orderId);
    }
  } catch {
    return false;
  }
}
