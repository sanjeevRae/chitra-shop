// GET /api/shop/just-for-you?limit=12&seed=<opaque>&cursor=<offset>
// Random "Just For You" feed over the existing `public.product` table.
//
// Randomization without ORDER BY RANDOM(): fetch only the narrow eligibility
// columns (indexed/cheap), shuffle the IDs in memory with a seeded PRNG, then
// fetch full rows for the current slice via a single PK `IN` lookup. The
// client keeps `seed` for the visit and passes `cursor` (offset) for View More,
// so pages never repeat within a session.
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase';

type CardProduct = {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  image: string;
  href: string;
};

function toProductNumber(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (state >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithSeed<T>(items: T[], seed: string): T[] {
  const next = [...items];
  const rand = mulberry32(hashSeed(seed));
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function mapCardRow(id: string, row: Record<string, unknown>): CardProduct {
  const price = toProductNumber(row.price);
  const original =
    row.original_price == null || row.original_price === ''
      ? undefined
      : toProductNumber(row.original_price);
  return {
    id,
    name: String(row.name ?? '').trim(),
    price,
    originalPrice: original,
    image: String(row.main_image_url ?? '').trim(),
    href: `/product/${id}`,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitRaw = Number(searchParams.get('limit') ?? 12);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 24) : 12;
  const cursorRaw = Number(searchParams.get('cursor') ?? 0);
  const offset = Number.isFinite(cursorRaw) ? Math.max(Math.floor(cursorRaw), 0) : 0;
  const seed = String(searchParams.get('seed') ?? '').trim() || randomUUID();

  try {
    const supabase = getSupabaseAdmin();

    // Narrow eligibility scan (cheap columns only). `enabled` is optional —
    // retry without it when the column does not exist yet.
    let idRows: Record<string, unknown>[] | null = null;
    const first = await supabase
      .from('product')
      .select('product_id,name,main_image_url,enabled')
      .order('product_id', { ascending: true })
      .limit(5000);
    if (first.error && /enabled/i.test(first.error.message)) {
      const fallback = await supabase
        .from('product')
        .select('product_id,name,main_image_url')
        .order('product_id', { ascending: true })
        .limit(5000);
      if (fallback.error) return NextResponse.json({ error: fallback.error.message }, { status: 500 });
      idRows = (fallback.data ?? []) as Record<string, unknown>[];
    } else if (first.error) {
      return NextResponse.json({ error: first.error.message }, { status: 500 });
    } else {
      idRows = (first.data ?? []) as Record<string, unknown>[];
    }

    const eligibleIds = (idRows ?? [])
      .filter(row => String(row.name ?? '').trim() !== '')
      .filter(row => String(row.main_image_url ?? '').trim() !== '')
      .filter(row => !('enabled' in row) || (row as { enabled?: unknown }).enabled !== false)
      .map(row => String(row.product_id ?? '').trim())
      .filter(Boolean);

    if (eligibleIds.length === 0) {
      return NextResponse.json({ products: [], seed, nextCursor: null, hasMore: false, total: 0 });
    }

    const ordered = shuffleWithSeed(eligibleIds, seed);
    const slice = ordered.slice(offset, offset + limit);

    let products: CardProduct[] = [];
    if (slice.length > 0) {
      const { data, error } = await supabase.from('product').select('*').in('product_id', slice);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const byId = new Map(
        ((data ?? []) as Record<string, unknown>[]).map(row => [String(row.product_id ?? ''), row]),
      );
      // Preserve the shuffled order; skip rows that vanished between queries.
      products = slice
        .map(id => {
          const row = byId.get(id);
          return row ? mapCardRow(id, row) : null;
        })
        .filter((item): item is CardProduct => item !== null)
        .filter(item => item.name !== '' && item.image !== '');
    }

    const nextOffset = offset + slice.length;
    const hasMore = nextOffset < ordered.length;
    return NextResponse.json({
      products,
      seed,
      nextCursor: hasMore ? String(nextOffset) : null,
      hasMore,
      total: ordered.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Just-for-you request failed.' },
      { status: 500 },
    );
  }
}
