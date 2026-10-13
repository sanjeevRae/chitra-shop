import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

const ALLOWED_PATHS = new Set([
  'homepage/noticeBanners/items',
  'homepage/featuredProducts/items',
  'homepage/heroBanners/items',
  'categories',
  'collections',
  'herobanners',
]);

const SUPPORTED_ACTIONS = new Set(['notice', 'categories', 'collections', 'featured', 'hero', 'herobanners', 'product', 'products', 'tracking']);

// Reads the Meta Pixel row the admin dashboard owns: cms_items at
// path='settings' / item_id='meta-pixel', data = { pixelId, enabled }.
// Only these two public-safe fields are ever returned — nothing secret can
// leak through this endpoint (a future Conversions API token must never be
// stored in this row; it stays server-side only).
function toTrackingConfig(data: unknown): { pixelId: string; enabled: boolean } {
  const record = (data ?? {}) as Record<string, unknown>;
  return {
    pixelId: String(record.pixelId ?? '').trim(),
    enabled: record.enabled === true,
  };
}

function toProductNumber(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toTextList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  if (value == null) return [];
  const raw = String(value).trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(item => String(item).trim()).filter(Boolean);
  } catch {
    /* fall through to comma split */
  }
  return raw.split(',').map(item => item.trim()).filter(Boolean);
}

function mapProductRow(id: string, row: Record<string, unknown>) {
  const name = String(row.name ?? '').trim();
  const image = String(row.main_image_url ?? '').trim();
  const description = String(row.description ?? '').trim();
  const price = toProductNumber(row.price);
  const original =
    row.original_price == null || row.original_price === '' ? undefined : toProductNumber(row.original_price);
  const gallery = toTextList(row.gallery_images_url ?? row.gallery);
  const colors = toTextList(row.color ?? row.colors);
  const sizes = toTextList(row.size ?? row.sizes);
  return {
    id,
    name,
    price,
    originalPrice: original,
    image,
    images: gallery,
    description,
    rating: toProductNumber(row.rating),
    reviewCount: row.review_count == null ? 0 : toProductNumber(row.review_count),
    colors,
    sizes,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (!SUPPORTED_ACTIONS.has(action ?? '')) {
    return NextResponse.json({ error: 'Unsupported storefront action.' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Database-only product lookups — no hardcoded products, no fallbacks.
    if (action === 'product') {
      const id = String(searchParams.get('id') ?? '').trim();
      if (!id) return NextResponse.json({ error: 'Missing product id.' }, { status: 400 });
      const { data, error } = await supabase.from('product').select('*').eq('product_id', id).maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!data) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
      return NextResponse.json({ product: mapProductRow(id, data as Record<string, unknown>) });
    }

    if (action === 'products') {
      const limitRaw = Number(searchParams.get('limit') ?? 20);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 50) : 20;
      const { data, error } = await supabase
        .from('product')
        .select('*')
        .order('product_id', { ascending: true })
        .limit(limit);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const products = (data ?? []).map(row => {
        const record = row as Record<string, unknown>;
        return mapProductRow(String(record.product_id ?? ''), record);
      });
      return NextResponse.json({ products });
    }

    // Shop by Category reads from the dedicated `category` table
    // (id/name/text/image/enabled). Falls back to legacy cms_items
    // rows at path='categories' when the table does not exist yet.
    if (action === 'categories') {
      const { data, error } = await supabase
        .from('category')
        .select('id,name,text,image,enabled')
        .eq('enabled', true)
        .order('name', { ascending: true });
      if (!error) {
        return NextResponse.json({
          items: (data ?? [])
            .filter(row => String((row as Record<string, unknown>).image ?? '').trim())
            .map(row => {
              const record = row as Record<string, unknown>;
              return {
                id: String(record.id ?? ''),
                name: String(record.name ?? ''),
                text: String(record.text ?? ''),
                image: String(record.image ?? ''),
                enabled: record.enabled,
              };
            }),
        });
      }
      const legacyPath = searchParams.get('path') || 'categories';
      if (!ALLOWED_PATHS.has(legacyPath)) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const legacy = await supabase.from('cms_items').select('item_id,data').eq('path', legacyPath);
      if (legacy.error) return NextResponse.json({ error: legacy.error.message }, { status: 500 });
      return NextResponse.json({ items: (legacy.data ?? []).map(item => ({ id: item.item_id, ...(item.data ?? {}) })) });
    }

    // Public Meta Pixel config — no `path` required (placed before the path
    // guard on purpose). The browser fetches this at runtime so admin changes
    // apply on the next page load with no env edit or redeploy. Never errors:
    // a missing row / DB failure surfaces as "tracking off".
    if (action === 'tracking') {
      const { data, error } = await supabase
        .from('cms_items')
        .select('data')
        .eq('path', 'settings')
        .eq('item_id', 'meta-pixel')
        .maybeSingle();
      if (error || !data) return NextResponse.json({ pixelId: '', enabled: false });
      return NextResponse.json(toTrackingConfig((data as { data?: unknown }).data));
    }

    const path = searchParams.get('path');
    if (!path || !ALLOWED_PATHS.has(path)) {
      return NextResponse.json({ error: 'Unsupported storefront action.' }, { status: 400 });
    }

    // Homepage hero reads the dedicated `herobanner` table
    // (id/eyebrow/title/subtitle/image/button_label/button_href/tone/position/enabled).
    // Falls back to legacy cms_items rows when the table does not exist yet.
    if (action === 'hero' || action === 'herobanners' || path === 'herobanners' || path === 'homepage/heroBanners/items') {
      const { data, error } = await supabase
        .from('herobanner')
        .select('*')
        .eq('enabled', true)
        .order('position', { ascending: true })
        .order('id', { ascending: true });
      if (!error) {
        return NextResponse.json({
          items: (data ?? []).map(row => {
            const record = row as Record<string, unknown>;
            const slides = Array.isArray(record.slides)
              ? (record.slides as Record<string, unknown>[]).map(slide => ({
                  image: String(slide?.image ?? ''),
                  eyebrow: String(slide?.eyebrow ?? ''),
                  title: String(slide?.title ?? ''),
                  subtitle: String(slide?.subtitle ?? ''),
                  buttonLabel: String(slide?.buttonLabel ?? ''),
                  buttonHref: String(slide?.buttonHref ?? '/product'),
                })).filter(slide => slide.image || slide.title)
              : [];
            return {
              id: String(record.id ?? ''),
              eyebrow: String(record.eyebrow ?? ''),
              title: String(record.title ?? ''),
              subtitle: String(record.subtitle ?? ''),
              image: String(record.image ?? ''),
              buttonLabel: String(record.button_label ?? ''),
              buttonHref: String(record.button_href ?? '/product'),
              slides,
              tone: String(record.tone ?? ''),
              position: Number(record.position ?? 0),
              enabled: record.enabled,
            };
          }),
        });
      }
    }

    // Hot Deals reads the Collections CMS rows (title/badge/image/linkHref/enabled).
    if (action === 'collections' || path === 'collections') {
      const { data, error } = await supabase.from('cms_items').select('item_id,data').eq('path', 'collections');
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ items: (data ?? []).map(item => ({ id: item.item_id, ...(item.data ?? {}) })) });
    }

    const { data, error } = await supabase.from('cms_items').select('item_id,data').eq('path', path);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ items: (data ?? []).map(item => ({ id: item.item_id, ...(item.data ?? {}) })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Storefront request failed.' }, { status: 500 });
  }
}

