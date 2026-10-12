import { notFound } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { Product } from '@/lib/products';
import { parseDbReviews, parseDbSpecs } from '@/lib/product-fields';
import ProductDetail from './ProductDetail';

// Database-only: no hardcoded /product/1 or static params.
// Unknown IDs render the Next.js 404 (notFound) instead of a placeholder.
export async function generateStaticParams() {
  return [];
}

export const dynamicParams = true;

// Admin edits must hit /product/xxx immediately: never statically cache the
// detail page, always render it live from Supabase on each request.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

function toReviewList(value: unknown): { text: string; name: string; avatar?: string }[] {
  return parseDbReviews(value);
}

function supabaseRowToProduct(id: string, row: Record<string, unknown>): Product {
  const dbText = (value: unknown): string => String(value ?? '').trim();
  // Unpack plain text or JSONB (string | string[] | object) into display text.
  const dbRichText = (value: unknown): string => {
    if (value == null) return '';
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) {
      return value.map(dbRichText).filter(Boolean).join('\n');
    }
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const preferred =
        record.text ?? record.detail ?? record.value ?? record.content ?? record.description;
      if (typeof preferred === 'string' && preferred.trim()) return preferred.trim();
      return Object.values(record).map(dbRichText).filter(Boolean).join('\n');
    }
    return String(value).trim();
  };
  const colors = toTextList(row.color ?? row.colors);
  const sizes = toTextList(row.size ?? row.sizes);
  const stock = row.stock == null || row.stock === '' ? 0 : toProductNumber(row.stock);
  const specifications = parseDbSpecs(row.specifications);
  const gallery = toTextList(row.gallery_images_url ?? row.gallery);
  const name = dbText(row.name);
  const image = dbText(row.main_image_url);
  // Exact contract: Specification tab <- product.specifications.
  // Description <p> + Information tab <- description, then the information
  // column, then seo_description (populated for every product), then a line
  // built from the row's own name/brand/category — never blank, no hardcode.
  const detailed =
    [row.description, row.information].map(dbRichText).find(text => text) ||
    dbRichText(row.seo_description);
  const brandText = dbText(row.brand);
  const categoryText = dbText(row.category);
  const generatedLine = [
    name,
    brandText && brandText.toUpperCase() !== 'NO BRAND' ? `by ${brandText}` : '',
    categoryText ? `in the ${categoryText} range` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const description = detailed || generatedLine;
  const price = toProductNumber(row.price);
  return {
    id,
    name,
    price,
    priceStr: `$${price.toFixed(2)}`,
    image,
    images: gallery.length > 0 ? gallery : undefined,
    description,
    rating: toProductNumber(row.rating),
    reviewCount: row.review_count == null ? 0 : toProductNumber(row.review_count),
    originalPrice: row.original_price == null || row.original_price === '' ? undefined : toProductNumber(row.original_price),
    originalPriceStr:
      row.original_price == null || row.original_price === ''
        ? undefined
        : `$${toProductNumber(row.original_price).toFixed(2)}`,
    colors: colors.length > 0 ? colors : undefined,
    sizes: sizes.length > 0 ? sizes : undefined,
    stock,
    specifications: specifications.length > 0 ? specifications : undefined,
    information: description || undefined,
    reviews: toReviewList(row.reviews),
  };
}

async function getLiveProduct(id: string): Promise<Product | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('product').select('*').eq('product_id', id).maybeSingle();
    if (error || !data) return null;
    const row = data as Record<string, unknown>;

    // Live customer reviews from the reviews table (newest first). This is the
    // real source; the product.reviews JSONB column is only a fallback for
    // admin-entered testimonials when no live reviews exist yet.
    const { data: reviewRows } = await supabase
      .from('reviews')
      .select('rating, text, user_name, user_photo, created_at')
      .eq('product_id', id)
      .order('created_at', { ascending: false });
    const liveReviews = (reviewRows ?? [])
      .map(item => ({
        text: String(item.text ?? '').trim(),
        name: String(item.user_name ?? '').trim() || 'Verified buyer',
        avatar: String(item.user_photo ?? '').trim() || undefined,
        rating: Number(item.rating ?? 0) || undefined,
      }))
      .filter(item => item.text);

    const base = supabaseRowToProduct(id, row);
    // Prefer live reviews; fall back to the admin-entered JSONB reviews column.
    const reviews = liveReviews.length > 0 ? liveReviews : base.reviews ?? [];
    // Headline rating + count come from the live reviews when present,
    // otherwise fall back to the stored product.rating / review_count columns.
    const rated = liveReviews
      .map(item => item.rating)
      .filter((n): n is number => typeof n === 'number' && n > 0);
    const rating =
      rated.length > 0
        ? Math.round((rated.reduce((sum, n) => sum + n, 0) / rated.length) * 10) / 10
        : base.rating;
    const reviewCount = liveReviews.length > 0 ? liveReviews.length : base.reviewCount;

    return { ...base, reviews, rating, reviewCount };
  } catch {
    /* database unreachable — treat as missing so the route 404s */
  }
  return null;
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getLiveProduct(id);
  if (!product) notFound();

  return <ProductDetail key={id} product={product} />;
}
