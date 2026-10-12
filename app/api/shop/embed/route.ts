// POST /api/shop/embed { q } -> { embedding: number[] | null }
// Server-side query embedding (Transformers.js gte-small, 384d). Tiny in,
// 384 floats out. The browser NEVER embeds; product vectors are precomputed
// by scripts/backfill-embeddings.mjs. If the model cannot load, returns null
// and callers fall back to keyword + concept search (never an error).
import { NextResponse } from 'next/server';
import { embedText } from '@/lib/product-embeddings';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const q = String(body?.q ?? '').trim().slice(0, 200);
    if (q.length < 3) return NextResponse.json({ embedding: null });
    const embedding = await embedText(q);
    return NextResponse.json({ embedding });
  } catch {
    return NextResponse.json({ embedding: null });
  }
}
