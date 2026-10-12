// Server-only product embedding generator (Transformers.js, gte-small, 384d).
// Lazy-loaded so the Next.js build never bundles onnxruntime. Used by the
// embedding API route + the backfill script. No browser usage.
import type { SupabaseClient } from '@supabase/supabase-js';

type EmbeddingPipeline = (text: string, options?: Record<string, unknown>) => Promise<{ data: Float32Array | number[] }>;

let pipelinePromise: Promise<EmbeddingPipeline> | null = null;

async function getPipeline(): Promise<EmbeddingPipeline> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const mod = await import('@xenova/transformers');
      const pipeline = (mod as unknown as { pipeline: (task: string, model: string) => Promise<EmbeddingPipeline> }).pipeline;
      return pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    })();
  }
  return pipelinePromise;
}

export function buildSemanticText(row: {
  name?: unknown; brand?: unknown; category?: unknown; tag?: unknown; description?: unknown;
}): string {
  const parts = [
    String(row.name ?? '').trim(),
    String(row.brand ?? '').trim(),
    String(row.category ?? '').trim(),
    String(row.tag ?? '').trim(),
    String(row.description ?? '').trim().slice(0, 500),
  ].filter(Boolean);
  return parts.join(' | ');
}

export async function embedText(text: string): Promise<number[] | null> {
  const input = text.trim().slice(0, 1000);
  if (!input) return null;
  try {
    const pipe = await getPipeline();
    const output = await pipe(input, { pooling: 'mean', normalize: true });
    const vector = Array.from(output.data as Float32Array | number[]);
    return vector.length === 384 ? vector : null;
  } catch {
    return null;
  }
}

export async function backfillEmbeddings(
  supabase: SupabaseClient,
  options?: { batchSize?: number; maxBatches?: number },
): Promise<{ updated: number; batches: number }> {
  const batchSize = options?.batchSize ?? 25;
  const maxBatches = options?.maxBatches ?? 400;
  let updated = 0;
  let batches = 0;
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const { data, error } = await supabase
      .from('product')
      .select('product_id,name,brand,category,tag,description')
      .is('embedding', null)
      .eq('enabled', true)
      .order('product_id', { ascending: true })
      .limit(batchSize);
    if (error || !data || data.length === 0) break;
    batches += 1;
    for (const row of data as Record<string, unknown>[]) {
      const id = String(row.product_id ?? '').trim();
      if (!id) continue;
      const vector = await embedText(buildSemanticText(row));
      if (!vector) continue;
      const { error: updateError } = await supabase
        .from('product')
        .update({ embedding: vector })
        .eq('product_id', id);
      if (!updateError) updated += 1;
    }
    if (data.length < batchSize) break;
  }
  return { updated, batches };
}
