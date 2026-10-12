import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Browser-safe Supabase client (anon key only — never the service-role key).
// Reused by the header autocomplete. Singleton: one client, one connection pool.
let browserClient: SupabaseClient | null = null;

function getBrowserClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  browserClient ??= createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return browserClient;
}

export type SearchSuggestion = {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  image: string;
  href: string;
};

export const MIN_SEARCH_LENGTH = 3;
export const SEARCH_DEBOUNCE_MS = 300;
const SUGGESTION_LIMIT = 10;
// Small in-memory cache: recent terms only, tiny rows, no 8k-product storage.
const suggestionCache = new Map<string, SearchSuggestion[]>();
const MAX_CACHE_TERMS = 30;

function mapSuggestionRow(row: Record<string, unknown>): SearchSuggestion | null {
  const id = String(row.product_id ?? '').trim();
  const name = String(row.name ?? '').trim();
  if (!id || !name) return null;
  const originalRaw = row.original_price;
  const original = originalRaw == null || originalRaw === '' ? NaN : Number(originalRaw);
  return {
    id,
    name,
    price: Number(row.price ?? 0),
    originalPrice: Number.isFinite(original) && original > 0 ? original : undefined,
    image: String(row.main_image_url ?? '').trim(),
    href: `/product/${encodeURIComponent(id)}`,
  };
}

export async function fetchQueryEmbedding(term: string): Promise<number[] | null> {
  const query = term.trim().slice(0, 200);
  if (query.length < MIN_SEARCH_LENGTH) return null;
  try {
    const res = await fetch('/api/shop/embed', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: query }),
    });
    const data = await res.json().catch(() => ({}));
    const vector = (data as { embedding?: unknown }).embedding;
    if (!Array.isArray(vector) || vector.length !== 384) return null;
    return vector as number[];
  } catch {
    return null;
  }
}

/**
 * Hybrid path: keyword + concept expansion always run server-side; when a
 * query embedding is available it is passed to search_products_ranked for the
 * semantic tail. Exact-name matches dominate by SQL ranking tiers.
 * Returns cached rows for repeat terms. Resolves null when the term is too
 * short or the backend is unreachable (caller hides the dropdown).
 */
export async function fetchSearchSuggestions(term: string): Promise<SearchSuggestion[] | null> {
  const query = term.trim();
  if (query.length < MIN_SEARCH_LENGTH) return null;
  const key = query.toLowerCase();
  const cached = suggestionCache.get(key);
  if (cached) return cached;
  const supabase = getBrowserClient();
  if (!supabase) return null;
  // Best effort: query embedding adds the semantic tail; keyword + concepts
  // always run even when the model is unavailable (null embedding).
  const embedding = await fetchQueryEmbedding(query);
  const { data, error } = embedding
    ? await supabase.rpc('search_products_ranked', { search_query: query, result_limit: SUGGESTION_LIMIT, query_embedding: embedding })
    : await supabase.rpc('search_products', { search_query: query });
  if (error || !Array.isArray(data)) return null;
  const suggestions = (data as Record<string, unknown>[])
    .map(mapSuggestionRow)
    .filter((item): item is SearchSuggestion => item !== null)
    .slice(0, SUGGESTION_LIMIT);
  suggestionCache.set(key, suggestions);
  if (suggestionCache.size > MAX_CACHE_TERMS) {
    const oldest = suggestionCache.keys().next().value;
    if (oldest) suggestionCache.delete(oldest);
  }
  return suggestions;
}
