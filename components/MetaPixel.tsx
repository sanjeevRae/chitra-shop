'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  dropQueuedEvents,
  flushQueuedEvents,
  initMetaPixel,
  loadPixelConfig,
  trackPageViewOnce,
} from '@/lib/meta-pixel';

// Site-wide Meta Pixel loader. Fetches the pixel config once per page load
// from GET /api/storefront?action=tracking, initializes fbq only when an ID
// is configured + tracking is enabled, then records exactly one PageView per
// client-side navigation. Mount once (components/SiteChrome, storefront only
// — admin pages deliberately never load the pixel).
export default function MetaPixel() {
  const pathname = usePathname();
  const pathRef = useRef(pathname ?? '/');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const config = await loadPixelConfig();
        if (cancelled) return;
        if (initMetaPixel(config)) {
          // Meta's base-snippet order, in one tick: fbq('init', ID) happened
          // inside initMetaPixel, then PageView, then any events that fired
          // while the config was still loading. The [ready, pathname] effect
          // below re-runs this idempotently (path already recorded).
          trackPageViewOnce(pathRef.current);
          flushQueuedEvents();
          setReady(true);
        } else {
          dropQueuedEvents();
        }
      } catch {
        /* offline / unreachable — pixel stays off */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    pathRef.current = pathname ?? '/';
  });

  useEffect(() => {
    if (!ready) return;
    trackPageViewOnce(pathRef.current);
  }, [ready, pathname]);

  return null;
}
