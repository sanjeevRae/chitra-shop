// Server-only Groq query expansion (model: GROQ_MODEL, default
// openai/gpt-oss-120b) — QUERY UNDERSTANDING only: grouped search terms as
// compact JSON, never product records; PostgreSQL returns all catalog rows.
//
// Layers (first hit wins, so Groq is never called repeatedly for a term):
//   1. in-process promise cache (dedupes concurrent requests, survives
//      within a warm server instance),
//   2. public.search_query_expansions table (migration 0012; service-role
//      only, shared across instances and cold starts),
//   3. Groq API — 4s timeout; any failure (timeout/429/5xx/bad key/malformed
//      JSON) resolves to null and search falls back to DB synonyms + FTS +
//      MiniLM vector results.
// The Header autocomplete never calls this (no Groq while users type); only
// the committed /product search page does, once per term.
import type { SupabaseClient } from '@supabase/supabase-js';

export type QueryExpansions = {
  direct: string[];
  related: string[];
  broader: string[];
};

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const TIMEOUT_MS = 4000;
const MAX_TERMS_PER_GROUP = 6;
const MAX_TERM_LENGTH = 40;
const MEMORY_CACHE_MAX = 100;

const SYSTEM_PROMPT = [
  'You expand ecommerce search queries into product search terms.',
  'Reply with ONLY compact JSON in this exact shape: {"direct":[],"related":[],"broader":[]}.',
  'direct = direct synonyms and alternative names (max 6).',
  'related = closely related product types (max 6).',
  'broader = broader category words (max 4).',
  'All lowercase, 1-3 words per item, no sentences, no explanations, no invented products or brands.',
  'If the query is not a product concept, return the shape with all empty arrays.',
].join(' ');

const memoryCache = new Map<string, Promise<QueryExpansions | null>>();

// Mirrors public.search_normalize(): lowercase, fold non-alphanumerics to
// single spaces, trim, cap at 100 — so the cache key matches the DB and the
// SQL side can skip re-validating what we send.
function normalizeTerm(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, 100);
}

function sanitizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const raw of value) {
    const text = normalizeTerm(String(raw ?? '')).slice(0, MAX_TERM_LENGTH);
    if (text.length >= 2 && /[a-z]/.test(text) && !out.includes(text)) out.push(text);
    if (out.length >= MAX_TERMS_PER_GROUP) break;
  }
  return out;
}

export function sanitizeExpansions(value: unknown): QueryExpansions | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const out: QueryExpansions = {
    direct: sanitizeList(record.direct),
    related: sanitizeList(record.related),
    broader: sanitizeList(record.broader),
  };
  return out.direct.length + out.related.length + out.broader.length > 0 ? out : null;
}

// Tolerant parse: strip code fences if present and take the outermost object.
function extractJsonObject(content: string): unknown {
  const cleaned = content.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function callGroq(term: string): Promise<QueryExpansions | null> {
  const key = process.env.GROQ_API_KEY?.trim();
  const model = process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b';
  if (!key || !/[a-z]/.test(term)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.2,
        // gpt-oss models reason first: without a generous budget + low effort
        // the answer can be starved to an empty string.
        max_tokens: 1200,
        reasoning_effort: 'low',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: term },
        ],
      }),
    });
    if (!res.ok) return null; // includes 429 rate limit -> DB-only fallback
    const data = (await res.json().catch(() => ({}))) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = String(data.choices?.[0]?.message?.content ?? '');
    return sanitizeExpansions(extractJsonObject(content));
  } catch {
    return null; // timeout / network failure -> DB-only fallback
  } finally {
    clearTimeout(timer);
  }
}

async function loadExpansions(supabase: SupabaseClient, key: string): Promise<QueryExpansions | null> {
  try {
    const { data, error } = await supabase
      .from('search_query_expansions')
      .select('expansions')
      .eq('term', key)
      .maybeSingle();
    if (!error) {
      const cached = sanitizeExpansions((data as { expansions?: unknown } | null)?.expansions);
      if (cached) return cached;
    }
  } catch {
    // Table missing (0012 pending) or read failed -> fall through to Groq.
  }
  const fresh = await callGroq(key);
  if (fresh) {
    try {
      await supabase.from('search_query_expansions').upsert({ term: key, expansions: fresh });
    } catch {
      // Cache write is best-effort; the in-memory promise still serves this instance.
    }
  }
  return fresh;
}

/** Memory -> DB -> Groq. Resolves null on any failure (plain DB search). */
export async function fetchQueryExpansions(
  supabase: SupabaseClient,
  term: string,
): Promise<QueryExpansions | null> {
  const key = normalizeTerm(term);
  if (key.length < 3) return null;
  let pending = memoryCache.get(key);
  if (!pending) {
    pending = loadExpansions(supabase, key);
    memoryCache.set(key, pending);
    if (memoryCache.size > MEMORY_CACHE_MAX) {
      const oldest = memoryCache.keys().next().value;
      if (oldest) memoryCache.delete(oldest);
    }
  }
  return pending;
}

