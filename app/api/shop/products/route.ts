// GET /api/shop/products?limit=42&cursor=<product_id>&category=<slug>&search=<term>
// Infinite-scroll catalog over the existing `public.product` table.
//
// Performance: keyset pagination on the indexed `product_id` (no OFFSET, no
// ORDER BY RANDOM). An optional `category` filter is applied at the database
// level (indexed `product.category` column, see product_category_idx) before
// pagination, so filtered pages stay cheap. An optional `search` term runs
// the hybrid `search_products_ranked` RPC (10-source RRF fusion: keyword,
// synonyms, weighted FTS, typo tolerance + optional vector tail, see
// 0011_search_v2.sql) at the database level — the browser never downloads the catalog. The RPC returns ranked ids; the
// route hydrates the current page slice with one narrow PK lookup.
// Each request selects only the narrow card columns and returns
// a cursor + hasMore.
// Lean card shape only: { id, name, price, originalPrice, image, href }.
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { embedText } from '@/lib/product-embeddings';
import { fetchQueryExpansions } from '@/lib/groq-expansions';

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

function mapCardRow(id: string, row: Record<string, unknown>): CardProduct {
  const price = toProductNumber(row.price);
  const originalRaw = row.original_price;
  const original = originalRaw == null || originalRaw === '' ? NaN : toProductNumber(originalRaw);
  return {
    id,
    name: String(row.name ?? '').trim(),
    price,
    originalPrice: Number.isFinite(original) && original > 0 ? original : undefined,
    image: String(row.main_image_url ?? '').trim(),
    href: `/product/${encodeURIComponent(id)}`,
  };
}

// Server-side query embedding cache (local model, 384d — see
// lib/product-embeddings). Promises are cached so concurrent pages and
// infinite-scroll requests embed each term exactly once; capped at 30 terms.
const queryEmbeddingCache = new Map<string, Promise<number[] | null>>();

async function cachedQueryEmbedding(term: string): Promise<number[] | null> {
  const key = term.trim().toLowerCase().slice(0, 200);
  if (key.length < 3) return null;
  let pending = queryEmbeddingCache.get(key);
  if (!pending) {
    pending = embedText(key).catch(() => null);
    queryEmbeddingCache.set(key, pending);
    if (queryEmbeddingCache.size > 30) {
      const oldest = queryEmbeddingCache.keys().next().value;
      if (oldest) queryEmbeddingCache.delete(oldest);
    }
  }
  return pending;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitRaw = Number(searchParams.get('limit') ?? 42);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 60) : 42;
  const cursor = String(searchParams.get('cursor') ?? '').trim();
  const category = String(searchParams.get('category') ?? '').trim();
  const search = String(searchParams.get('search') ?? '').trim();
  // `ids` hydrates cart lines: narrow PK lookup of specific products
  // (used by the store's cartProducts sync — never loads the catalog).
  const ids = String(searchParams.get('ids') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 60);

  try {
    const supabase = getSupabaseAdmin();
    if (ids.length > 0) {
      const { data, error } = await supabase
        .from('product')
        .select('product_id,name,price,original_price,main_image_url')
        .in('product_id', ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const products = ((data ?? []) as Record<string, unknown>[])
        .map(row => mapCardRow(String(row.product_id ?? '').trim(), row))
        .filter(item => item.id && item.name);
      return NextResponse.json({ products, nextCursor: null, hasMore: false });
    }
    // Full-text path: hybrid ranked RPC (keyword + concepts always, vector
    // tail when product embeddings exist). Paginate the ranked id list in
    // memory (tiny) and hydrate the slice with one narrow PK lookup.
    if (search) {
      // Deep candidate list: the RPC fuses 10 sources server-side and applies
      // the final limit only AFTER ranking. The semantic tail comes from a
      // server-side, per-term-cached query embedding (local model — the browser
      // never embeds). Groq expansions (server-only, memory -> DB -> API,
      // 4s timeout) enrich the synonym candidates; on any failure the search
      // silently degrades to keyword + DB synonyms + vector search.
      const searchLimit = Math.min(300, Math.max(limit * 6, 60));
      const [embedding, expansions] = await Promise.all([
        cachedQueryEmbedding(search),
        fetchQueryExpansions(supabase, search),
      ]);
      const baseArgs: Record<string, unknown> = {
        search_query: search,
        result_limit: searchLimit,
        ...(embedding ? { query_embedding: embedding } : {}),
      };
      let { data, error } = await supabase.rpc('search_products_ranked', {
        ...baseArgs,
        ...(expansions ? { expansions } : {}),
      });
      if (error && expansions) {
        // 0012_search_groq.sql not applied yet (unknown parameter) -> retry
        // without expansions so search never breaks.
        ({ data, error } = await supabase.rpc('search_products_ranked', baseArgs));
      }
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const ranked = ((data ?? []) as Record<string, unknown>[])
        .map(row => mapCardRow(String(row.product_id ?? '').trim(), row))
        .filter(item => item.id && item.name);
      const start = cursor ? ranked.findIndex(item => item.id === cursor) + 1 : 0;
      const from = start < 0 ? ranked.length : start;
      const page = ranked.slice(from, from + limit);
      const lastIndex = from + page.length;
      return NextResponse.json({
        products: page,
        nextCursor: lastIndex < ranked.length && page.length > 0 ? page[page.length - 1].id : null,
        hasMore: lastIndex < ranked.length,
      });
    }
    // The URL carries the category *id* (e.g. ?category=batteries) but
    // `product.category` may store the display name (e.g. "Batteries").
    // Resolve the id -> name via the `category` table, then match either,
    // case-insensitively, so both conventions work.
    let categoryNames: string[] = [];
    if (category) {
      const { data } = await supabase.from('category').select('id,name').eq('id', category).maybeSingle();
      const row = (data ?? null) as { id?: unknown; name?: unknown } | null;
      const names = [category, row?.name == null ? '' : String(row.name)];
      categoryNames = [...new Set(names.map(name => name.trim()).filter(Boolean))];
    }
    // Narrow select: only what the card needs. `gt` on the PK keeps every
    // page a cheap indexed range scan — stable even with ID gaps.
    // The category filter (existing `product.category` column) is applied
    // here at the database level, before pagination.
    let query = supabase
      .from('product')
      .select('product_id,name,price,original_price,main_image_url')
      .order('product_id', { ascending: true })
      .limit(limit + 1);
    if (categoryNames.length > 0) {
      // ILIKE has no regex alternation: use exact case-insensitive matches.
      const clauses = categoryNames.map(name => `category.ilike.${name.replace(/[%\\,]/g, '')}`);
      query = query.or(clauses.join(','));
    }
    if (cursor) query = query.gt('product_id', cursor);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []) as Record<string, unknown>[];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const products = page
      .map(row => mapCardRow(String(row.product_id ?? '').trim(), row))
      .filter(item => item.id && item.name);
    const nextCursor = products.length > 0 ? products[products.length - 1].id : null;
    return NextResponse.json({ products, nextCursor, hasMore });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Shop request failed.' }, { status: 500 });
  }
}
