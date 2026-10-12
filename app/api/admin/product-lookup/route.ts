import { NextResponse } from 'next/server';
import { getSupabaseAdmin, requireAdminSession } from '@/lib/supabase';

type CatalogOption = {
  id: string;
  name: string;
  image: string;
  price?: number;
};

function toProductNumber(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

// GET /api/admin/product-lookup?search=<term>&limit=10
// Admin CMS picker: token-gated, database-level search over `public.product`
// (exact product_id match first, then trigram-ranked RPC for longer names,
// then ILIKE on product_id/name/sku/brand/category). Lean rows only —
// never downloads the catalog.
export async function GET(request: Request) {
  const headers = Object.fromEntries(request.headers.entries());
  const token = headers['x-admin-token'] ?? null;
  const supabase = getSupabaseAdmin();
  const gate = await requireAdminSession(supabase, token);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const search = String(searchParams.get('search') ?? '').trim();
  const rawLimit = Number(searchParams.get('limit') ?? 12);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 25) : 12;

  try {
    const escapeLike = (value: string) => value.replace(/[%_\\]/g, (char) => `\\${char}`);
    const mapRows = (rows: Record<string, unknown>[]): CatalogOption[] =>
      rows
        .map((row) => {
          const id = String(row.product_id ?? '').trim();
          const name = String(row.name ?? '').trim();
          return { id, name, image: String(row.main_image_url ?? '').trim(), price: toProductNumber(row.price) };
        })
        .filter((item) => item.id && item.name);

    if (!search) {
      const { data, error } = await supabase
        .from('product')
        .select('product_id,name,price,main_image_url')
        .order('product_id', { ascending: true })
        .limit(limit);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ products: mapRows((data ?? []) as Record<string, unknown>[]) });
    }

    // Product (select from catalog): an exact ID match wins immediately.
    {
      const { data, error } = await supabase
        .from('product')
        .select('product_id,name,price,main_image_url')
        .eq('product_id', search)
        .limit(1);
      if (!error) {
        const exact = mapRows((data ?? []) as Record<string, unknown>[]);
        if (exact.length > 0) return NextResponse.json({ products: exact });
      }
    }

    if (search.length >= 3) {
      const { data, error } = await supabase.rpc('search_products_ranked', {
        search_query: search,
        result_limit: Math.min(limit, 25),
      });
      if (!error) {
        return NextResponse.json({ products: mapRows((data ?? []) as Record<string, unknown>[]).slice(0, limit) });
      }
    }

    const pattern = `%${escapeLike(search)}%`;
    const or = [
      `name.ilike.${pattern}`,
      `brand.ilike.${pattern}`,
      `category.ilike.${pattern}`,
      `sku.ilike.${pattern}`,
      `product_id.ilike.${pattern}`,
    ].join(',');
    const { data, error } = await supabase
      .from('product')
      .select('product_id,name,price,main_image_url')
      .or(or)
      .order('product_id', { ascending: true })
      .limit(limit);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ products: mapRows((data ?? []) as Record<string, unknown>[]) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Product lookup failed.' },
      { status: 500 },
    );
  }
}