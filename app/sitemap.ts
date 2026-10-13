import type { MetadataRoute } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase';

// Same resolution order as app/layout.tsx — keeps sitemap URLs aligned with
// metadataBase so every entry resolves to the same origin as our OG tags.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://shop.chitratech.com.np').replace(/\/$/, '');

// Regenerate hourly so newly added products land in the sitemap without a
// redeploy, without hammering Supabase on every request.
export const revalidate = 3600;

const BATCH_SIZE = 1000; // PostgREST hard-caps a single page at 1000 rows.
const MAX_PRODUCTS = 10000;

// Public, crawl-worthy pages only. Admin (404s without a session) and the
// logged-in / transactional flows are excluded and also disallowed in robots.txt.
const STATIC_PAGES: MetadataRoute.Sitemap = [
  { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1 },
  { url: `${SITE_URL}/product`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE_URL}/shop/flash-sell`, changeFrequency: 'daily', priority: 0.7 },
  { url: `${SITE_URL}/shop/just-for-you`, changeFrequency: 'daily', priority: 0.6 },
  { url: `${SITE_URL}/shipping-policy`, changeFrequency: 'yearly', priority: 0.3 },
  { url: `${SITE_URL}/refund-policy`, changeFrequency: 'yearly', priority: 0.3 },
  { url: `${SITE_URL}/terms-of-service`, changeFrequency: 'yearly', priority: 0.3 },
];

// Walks public.product in 1000-row pages and turns each product_id into a
// /product/<id> URL. Never throws: if Supabase is unreachable or env vars are
// missing at build time we simply ship the static pages, so /sitemap.xml always
// renders. Only `product_id` is selected — the table is wide (embedding vector,
// search_vector) and none of that belongs in a sitemap.
async function getProductUrls(): Promise<MetadataRoute.Sitemap> {
  try {
    const supabase = getSupabaseAdmin();
    const urls: MetadataRoute.Sitemap = [];

    for (let offset = 0; offset < MAX_PRODUCTS; offset += BATCH_SIZE) {
      const { data, error } = await supabase
        .from('product')
        .select('product_id')
        .order('product_id', { ascending: true })
        .range(offset, offset + BATCH_SIZE - 1);

      if (error || !data || data.length === 0) break;

      const rows = data as unknown as Array<{ product_id: string | number | null }>;
      for (const row of rows) {
        const id = String(row.product_id ?? '').trim();
        if (!id) continue;
        urls.push({
          url: `${SITE_URL}/product/${encodeURIComponent(id)}`,
          changeFrequency: 'weekly',
          priority: 0.8,
        });
      }

      if (data.length < BATCH_SIZE) break;
    }

    return urls;
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await getProductUrls();
  return [...STATIC_PAGES, ...products];
}
