// Client-side Meta Pixel (Facebook Pixel) plumbing for Chitra Shop.
// ---------------------------------------------------------------------------
// Config (pixel ID + enabled flag) is fetched at RUNTIME from
// GET /api/storefront?action=tracking, which reads the `settings` /
// `meta-pixel` row of public.cms_items that the admin dashboard owns. Nothing
// here is hardcoded: changing the ID in the dashboard applies on the next
// page load with no code change, env edit, or redeploy.
//
// Events fired before connect.facebook.net finishes loading are absorbed by
// the fbq queue stub, and every helper is a safe no-op until the pixel is
// initialized — components can fire events unconditionally without races.
//
// Privacy: only catalog/order facts (ids, names, prices, quantities, totals,
// currency) are ever sent to Meta. No customer names, emails, phones,
// addresses, payment details, or secrets leave the browser.

export const PIXEL_CURRENCY = 'NPR';

export type TrackingConfig = { pixelId: string; enabled: boolean };

export type MetaContentsItem = { id: string; quantity: number; item_price: number };

export type MetaEventData = {
  content_ids?: string[];
  content_type?: string;
  content_name?: string;
  content_category?: string;
  contents?: MetaContentsItem[];
  num_items?: number;
  value?: number;
  currency?: string;
  payment_type?: string;
  [key: string]: unknown;
};

// Meta Pixel IDs are numeric (typically 15-16 digits). Keep the window wide
// enough for future lengths but strict enough to block injection via the ID.
const PIXEL_ID_RE = /^\d{6,20}$/;

export function isValidPixelId(id: string): boolean {
  return PIXEL_ID_RE.test(String(id ?? '').trim());
}

type FbqCommand = {
  (command: 'init', pixelId: string): void;
  (command: 'track', event: string, data?: MetaEventData, options?: { eventID?: string }): void;
  (command: 'trackCustom', event: string, data?: MetaEventData): void;
  queue: unknown[][];
  callMethod?: (...args: unknown[]) => void;
};

function getFbq(): FbqCommand | null {
  if (typeof window === 'undefined') return null;
  const fbq = (window as unknown as { fbq?: FbqCommand }).fbq;
  return typeof fbq === 'function' ? fbq : null;
}

// Module state (client bundle only, resets on full page load).
let initializedPixelId = '';
let configPromise: Promise<TrackingConfig> | null = null;
let lastPageViewPath = '';

function fetchConfig(): Promise<TrackingConfig> {
  const fallback: TrackingConfig = { pixelId: '', enabled: false };
  return fetch('/api/storefront?action=tracking', { cache: 'no-store' })
    .then((res) => (res.ok ? res.json().catch(() => ({})) : {}))
    .then((data) => {
      const record = (data ?? {}) as Record<string, unknown>;
      return { pixelId: String(record.pixelId ?? '').trim(), enabled: record.enabled === true };
    })
    .catch(() => fallback);
}

// Single-flight fetch of the tracking config; always resolves (missing row,
// unreachable DB, or tracking off surface as "do not track").
export function loadPixelConfig(): Promise<TrackingConfig> {
  if (typeof window === 'undefined') return Promise.resolve({ pixelId: '', enabled: false });
  if (!configPromise) configPromise = fetchConfig();
  return configPromise;
}

// Installs the fbq queue stub + connect.facebook.net script (idempotent) and
// runs fbq('init') once per pixel ID. True only when the ID is configured,
// enabled, and fbq is ready to accept events.
export function initMetaPixel(config: TrackingConfig): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  const pixelId = String(config?.pixelId ?? '').trim();
  if (!config?.enabled || !isValidPixelId(pixelId)) return false;
  if (initializedPixelId === pixelId) return getFbq() !== null;

  const w = window as unknown as Record<string, unknown>;
  if (typeof w.fbq !== 'function') {
    // Standard Meta Pixel stub: queues calls until fbevents.js loads.
    const stub = function (...args: unknown[]) {
      const fn = stub as unknown as FbqCommand;
      if (typeof fn.callMethod === 'function') fn.callMethod(...args);
      else fn.queue.push(args);
    } as unknown as FbqCommand;
    stub.queue = [];
    w.fbq = stub;
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);
  }
  const fbq = getFbq();
  if (!fbq) return false;
  try {
    fbq('init', pixelId);
  } catch {
    return false;
  }
  initializedPixelId = pixelId;
  return true;
}

export function isMetaPixelReady(): boolean {
  return initializedPixelId !== '' && getFbq() !== null;
}

// Fire a Meta standard/custom event. Safe to call anywhere: silently drops
// when the pixel is not initialized (never throws, never breaks shopping).
export function trackMetaEvent(
  event: string,
  data?: MetaEventData,
  options?: { eventID?: string },
): void {
  try {
    const fbq = getFbq();
    if (!fbq || !isMetaPixelReady()) return;
    if (options?.eventID) fbq('track', event, data ?? {}, { eventID: options.eventID });
    else fbq('track', event, data ?? {});
  } catch {
    /* tracking must never break shopping */
  }
}

// PageView for the current path — exactly once per pathname (StrictMode
// double-invoke safe; already-recorded revisits are skipped).
export function trackPageViewOnce(pathname: string): void {
  const path = String(pathname || '/');
  if (lastPageViewPath === path) return;
  lastPageViewPath = path;
  trackMetaEvent('PageView');
}
