'use client';

import { useCallback, useEffect, useState } from 'react';
import { initMetaPixel } from '@/lib/meta-pixel';

// Meta Ads / Tracking Settings — follows the CmsAdmin conventions: the
// dashboard hydrates the token from localStorage, this component skips the
// pre-hydration call, and all calls use the `x-admin-token` header.
export default function TrackingSettings({ token }: { token: string }) {
  const [pixelId, setPixelId] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [savedAt, setSavedAt] = useState('');

  const authHeaders = useCallback(
    () =>
      token
        ? { 'x-admin-token': token }
        : ({} as Record<string, string>),
    [token],
  );

  const load = useCallback(async () => {
    // token='' until the admin page hydrates it from localStorage — skip the
    // pre-hydration call so we don't fire a guaranteed 401 on first paint.
    if (!token) {
      setStatus('Sign in to load the current tracking settings.');
      return;
    }
    setBusy(true);
    setStatus('Loading current tracking settings...');
    try {
      const res = await fetch('/api/admin?action=tracking', { headers: authHeaders() });
      const data = (await res.json().catch(() => ({}))) as {
        pixelId?: unknown;
        enabled?: unknown;
        updatedAt?: unknown;
        error?: unknown;
      };
      if (!res.ok) {
        setStatus(String(data.error ?? 'Could not load tracking settings.'));
        return;
      }
      setPixelId(String(data.pixelId ?? ''));
      setEnabled(data.enabled === true);
      setSavedAt(typeof data.updatedAt === 'string' ? data.updatedAt : '');
      setStatus('');
    } catch {
      setStatus('Could not load tracking settings. Check your connection and retry.');
    } finally {
      setBusy(false);
    }
  }, [authHeaders, token]);

// eslint-disable-next-line react-hooks/set-state-in-effect -- copied: initial settings fetch once the dashboard token hydrates
  useEffect(() => { void load(); }, [load]);

  const configured = pixelId.trim().length > 0;
  const statusLabel = !configured ? 'Not configured' : enabled ? 'Active — tracking enabled' : 'Saved — tracking disabled';
  const statusTone = !configured
    ? 'bg-[#f1ede7] text-[#666]'
    : enabled
      ? 'bg-[#e9f7ee] text-[#1a7a3a]'
      : 'bg-[#fdf3e3] text-[#a3620a]';

  const save = async () => {
    const id = pixelId.trim();
    if (enabled && !/^\d{6,20}$/.test(id)) {
      setStatus('Enter a valid Meta Pixel ID (digits only) before enabling tracking.');
      return;
    }
    if (id && !/^\d{6,20}$/.test(id)) {
      setStatus('Enter a valid Meta Pixel ID (digits only).');
      return;
    }
    setBusy(true);
    setStatus('Saving settings...');
    try {
      const res = await fetch('/api/admin?action=tracking', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ pixelId: id, enabled }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: unknown; updatedAt?: unknown };
      if (!res.ok) {
        setStatus(String(data.error ?? 'Save failed.'));
        return;
      }
      setStatus('Saved. The storefront picks up the new Pixel ID on the next page load.');
      await load();
    } catch {
      setStatus('Save failed. Check your connection and retry.');
    } finally {
      setBusy(false);
    }
  };

  // Verifies the public delivery path end to end: fetches the exact URL the
  // storefront uses and compares it with what is saved here. No pixel code is
  // executed on the admin pages — tracking stays storefront-only.
  const verifyDelivery = async () => {
    setTesting(true);
    setStatus('Verifying what the storefront is serving...');
    try {
      const res = await fetch('/api/storefront?action=tracking', { cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as { pixelId?: unknown; enabled?: unknown };
      if (!res.ok) {
        setStatus('Verification failed: the storefront endpoint did not respond.');
        return;
      }
      const servedId = String(data.pixelId ?? '');
      const servedOn = data.enabled === true;
      if (servedId === pixelId.trim() && servedOn === enabled) {
        setStatus(
          servedId && servedOn
            ? `Verified: the storefront is serving Pixel ID ${servedId} with tracking on. Events appear in Meta Events Manager → Test events.`
            : 'Verified: the storefront is serving the saved settings (tracking is currently off, so no events are sent).',
        );
        return;
      }
      setStatus('Mismatch: the storefront is serving different settings. Save again, then reload this page.');
    } catch {
      setStatus('Verification failed. Check your connection and retry.');
    } finally {
      setTesting(false);
    }
  };

  // Sends a real custom event to Meta for the saved ID so the admin can watch
  // it arrive live in Events Manager → Test events. Explicit opt-in on this
  // page only — the admin dashboard otherwise never loads tracking code.
  const sendTestEvent = () => {
    const id = pixelId.trim();
    if (!/^\d{6,20}$/.test(id)) {
      setStatus('Enter a valid Meta Pixel ID first, then send a test event.');
      return;
    }
    const ok = initMetaPixel({ pixelId: id, enabled: true });
    if (!ok) {
      setStatus('Could not initialize the Pixel script in this browser.');
      return;
    }
    try {
      const fbq = (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq;
      fbq?.('trackCustom', 'MetaPixelAdminTest', { source: 'admin-dashboard' });
      setStatus(
        `Test event sent for Pixel ID ${id}. Open Meta Events Manager → Test events within a minute to see "MetaPixelAdminTest" arrive.`,
      );
    } catch {
      setStatus('Could not send the test event in this browser.');
    }
  };

  return (
    <section className="border border-[#e0dbd4] bg-white shadow-[0_18px_50px_rgba(0,0,0,0.06)]">
      <div className="border-b border-[#eee8e1] p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8f1f35]">Store settings</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Meta Ads / Tracking Settings</h2>
            <p className="mt-2 text-sm text-[#666666]">
              Connect your Meta Pixel so Facebook and Instagram ads can track visitors, product views,
              checkouts, and purchases.
            </p>
          </div>
          <span className={`inline-flex w-fit items-center gap-2 px-3 py-1.5 text-xs font-semibold ${statusTone}`}>
            <span className="inline-block h-2 w-2 rounded-full bg-current" aria-hidden="true" />
            {statusLabel}
          </span>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="border-b border-[#eee8e1] p-5 md:p-7 lg:border-b-0 lg:border-r">
          <label htmlFor="meta-pixel-id" className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#8f1f35]">
            Meta Pixel ID
          </label>
          <input
            id="meta-pixel-id"
            inputMode="numeric"
            autoComplete="off"
            placeholder="e.g. 123456789012345"
            value={pixelId}
            onChange={(event) => setPixelId(event.target.value.replace(/[^\d]/g, '').slice(0, 20))}
            disabled={busy}
            className="mt-3 w-full border border-[#ded8d0] bg-white px-3 py-2.5 text-sm font-normal tracking-normal text-[#111] outline-none transition focus:border-[#111111] disabled:opacity-60"
          />
          <p className="mt-2 text-xs font-normal normal-case text-[#777]">
            Digits only. Find it in Meta Events Manager → your data source → Settings → Pixel ID.
          </p>

          <div className="mt-6 flex items-center justify-between gap-4 border border-[#ebe6df] bg-[#faf8f5] p-4">
            <div>
              <p className="text-sm font-semibold text-[#111]">Enable tracking</p>
              <p className="mt-1 text-xs font-normal normal-case text-[#777]">
                When off, the Pixel never loads and no events are sent — even with an ID saved.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="Enable Meta Pixel tracking"
              onClick={() => setEnabled((current) => !current)}
              disabled={busy}
              className={`relative h-7 w-12 shrink-0 rounded-full transition ${enabled ? 'bg-[#1a7a3a]' : 'bg-[#cfc8bd]'} disabled:opacity-60`}
            >
              <span
                aria-hidden="true"
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${enabled ? 'left-[22px]' : 'left-0.5'}`}
              />
            </button>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              className="border border-[#111] bg-[#111] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#333] disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Save settings'}
            </button>
            <button
              type="button"
              onClick={() => void verifyDelivery()}
              disabled={busy || testing || !token}
              className="border border-[#ded8d0] bg-white px-6 py-2.5 text-sm font-semibold text-[#333] transition hover:border-[#111] disabled:opacity-60"
            >
              {testing ? 'Verifying…' : 'Verify storefront delivery'}
            </button>
            <button
              type="button"
              onClick={sendTestEvent}
              disabled={busy || !configured}
              className="border border-[#ded8d0] bg-[#faf8f5] px-6 py-2.5 text-sm font-semibold text-[#333] transition hover:border-[#111] disabled:opacity-60"
            >
              Send test event
            </button>
          </div>
          {status ? <p className="mt-4 text-sm font-normal normal-case text-[#333]">{status}</p> : null}
          {savedAt ? (
            <p className="mt-2 text-xs font-normal normal-case text-[#999]">
              Last saved {new Date(savedAt).toLocaleString('en-NP', { timeZone: 'Asia/Kathmandu' })}.
            </p>
          ) : null}
        </div>

        <aside className="p-5 md:p-7">
          <h3 className="text-base font-semibold text-[#111]">How to verify</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm font-normal normal-case text-[#555]">
            <li>Save a valid Pixel ID and turn tracking on.</li>
            <li>Use “Verify storefront delivery” to confirm the site serves it.</li>
            <li>Open Meta Events Manager → Test events, then browse the shop: PageView, ViewContent, AddToCart, InitiateCheckout, and Purchase stream in live.</li>
          </ol>
          <p className="mt-4 text-sm font-normal normal-case text-[#555]">
            Events Manager:{' '}
            <a
              href="https://business.facebook.com/events_manager2/list/pixel"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[#111] underline underline-offset-2 hover:text-[#8f1f35]"
            >
              business.facebook.com/events_manager2
            </a>
          </p>
          <p className="mt-3 text-xs font-normal normal-case leading-5 text-[#777]">
            The Pixel ID is public configuration (the browser must load it), so it is stored in the
            shared CMS settings row and served by a whitelisted public endpoint. Any future Meta
            Conversions API token must be kept server-side only — never add it here.
          </p>
        </aside>
      </div>
    </section>
  );
}

