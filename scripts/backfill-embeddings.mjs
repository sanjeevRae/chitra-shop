// One-time backfill: node scripts/backfill-embeddings.mjs
// Reads .env.local (service-role key, server-only), embeds every enabled
// product missing a vector with Xenova/all-MiniLM-L6-v2 (384d), and stores it
// in public.product.embedding. Run once after 0005, then on demand.
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });
loadDotenv({ path: '.env' });
import { createClient } from '@supabase/supabase-js';
import { pipeline } from '@xenova/transformers';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });
const BATCH = Number(process.env.EMBED_BATCH ?? 25);
const MAX_BATCHES = Number(process.env.EMBED_MAX_BATCHES ?? 400);

const textOf = (row) => [row.name, row.brand, row.category, row.tag,
  String(row.description ?? '').slice(0, 500)].filter(Boolean).join(' | ');

const pipe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
let updated = 0;
for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
  const { data, error } = await supabase.from('product')
    .select('product_id,name,brand,category,tag,description')
    .is('embedding', null).eq('enabled', true)
    .order('product_id', { ascending: true }).limit(BATCH);
  if (error) { console.error(error.message); process.exit(1); }
  if (!data || data.length === 0) break;
  for (const row of data) {
    const output = await pipe(textOf(row), { pooling: 'mean', normalize: true });
    const vector = Array.from(output.data);
    if (vector.length !== 384) continue;
    const { error: updateError } = await supabase.from('product')
      .update({ embedding: vector }).eq('product_id', row.product_id);
    if (!updateError) { updated += 1; process.stdout.write('.'); }
  }
  console.log(` batch ${batch + 1}: ${updated} embedded`);
  if (data.length < BATCH) break;
}
console.log(`Done. ${updated} products embedded.`);
