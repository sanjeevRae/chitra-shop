import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin, requireAdminSession } from '@/lib/supabase';
import {
  adminSessionExpiry,
  buildAdminSessionCookie,
  buildAdminSessionCookieClear,
  clearAdminLoginAttempts,
  isAdminLoginThrottled,
  newAdminSessionToken,
  recordAdminLoginAttempt,
  sha256Hex,
} from '@/lib/admin-auth';
import { emailCustomerId, verifyPassword } from '@/lib/customer-auth';
import type { Product } from '@/data/products';
import { parseDbReviews, parseDbSpecs } from '@/lib/product-fields';
import { buildSemanticText, embedText } from '@/lib/product-embeddings';
import { sendOrderStatusEmail } from '@/lib/order-emails';

// The Postgres table is `product` (singular), created by your own CREATE TABLE.
// The properties below marked optional are used when the columns exist
// (see supabase/migrations/0002_product_extend.sql) and safely ignored otherwise.
type ProductRow = {
  product_id: string;
  sku?: string | null;
  name: string;
  description?: string | null;
  information?: string | null;
  category?: string | null;
  brand?: string | null;
  price?: number | string | null;
  specifications?: unknown;
  reviews?: unknown;
  variants?: unknown;
  variant_prices?: unknown;
  main_image_url?: string | null;
  gallery_images_url?: string | null;
  color?: string | null;
  size?: string | null;
  original_price?: number | string | null;
  rating?: number | string | null;
  review_count?: number | string | null;
  stock?: number | string | null;
  tag?: string | null;
  link_href?: string | null;
  enabled?: boolean | null;
  featured_order?: number | string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  seo_keywords?: string[] | null;
  og_image?: string | null;
  canonical_path?: string | null;
};

type OrderRow = {
  id: string;
  customer: Record<string, unknown> | null;
  items: unknown[] | null;
  subtotal: number | string | null;
  discount: number | string | null;
  delivery_fee: number | string | null;
  delivery_label: string | null;
  total: number | string | null;
  payment_method: string | null;
  status: string | null;
  shipping_address: Record<string, string> | null;
  created_at: string | null;
  updated_at: string | null;
};

function getToken(request: Request): string | null {
  // Login cookie (HttpOnly, Path=/) first — powers the /admin page gate.
  const rawCookie = request.headers.get('cookie') ?? '';
  const match = /(?:^|;\s*)chitra-admin-session=([^;]*)/.exec(rawCookie);
  if (match) {
    try {
      const value = decodeURIComponent(match[1] ?? '').trim();
      if (value) return value;
    } catch {
      /* malformed cookie */
    }
  }
  const authorization = request.headers.get('authorization') ?? '';
  if (authorization.toLowerCase().startsWith('bearer ')) {
    const bearer = authorization.slice(7).trim();
    if (bearer) return bearer;
  }
  const headers = Object.fromEntries(request.headers.entries());
  return headers['x-admin-token'] ?? null;
}

/** Attach the same opaque admin session token as an HttpOnly login cookie.
 * Delegates to the shared builder in lib/admin-auth so /api/admin and
 * /api/customer set byte-identical cookies (name, Path=/, HttpOnly, 12h). */
function withAdminCookie(response: NextResponse, token: string, request: Request): NextResponse {
  const isSecure = new URL(request.url).protocol === 'https:';
  response.headers.set('Set-Cookie', buildAdminSessionCookie(token, isSecure));
  return response;
}

const PRODUCT_TABLE = 'product';
const CATEGORY_TABLE = 'category';

type CategoryRow = {
  id: string;
  name: string | null;
  text?: string | null;
  image?: string | null;
  enabled?: boolean | string | number | null;
};

const HEROBANNER_TABLE = 'herobanner';

type HeroBannerRow = {
  id: string;
  eyebrow?: string | null;
  title?: string | null;
  subtitle?: string | null;
  image?: string | null;
  button_label?: string | null;
  button_href?: string | null;
  slides?: unknown;
  tone?: string | null;
  position?: number | string | null;
  enabled?: boolean | string | number | null;
};

function rowToHeroBanner(row: HeroBannerRow) {
  const slides = Array.isArray(row.slides)
    ? (row.slides as Record<string, unknown>[]).map(slide => ({
        image: String(slide?.image ?? ''),
        eyebrow: String(slide?.eyebrow ?? ''),
        title: String(slide?.title ?? ''),
        subtitle: String(slide?.subtitle ?? ''),
        buttonLabel: String(slide?.buttonLabel ?? ''),
        buttonHref: String(slide?.buttonHref ?? '/product'),
      })).filter(slide => slide.image || slide.title)
    : [];
  return {
    id: String(row.id ?? ''),
    eyebrow: String(row.eyebrow ?? ''),
    title: String(row.title ?? ''),
    subtitle: String(row.subtitle ?? ''),
    image: String(row.image ?? ''),
    buttonLabel: String(row.button_label ?? ''),
    buttonHref: String(row.button_href ?? '/product'),
    slides,
    tone: String(row.tone ?? ''),
    position: Number(row.position ?? 0),
    enabled: categoryEnabled(row.enabled),
  };
}

// Writes a hero banner row, tolerating a missing table on older databases
// (falls back to the legacy cms_items rows at homepage/heroBanners/items).
// Also tolerates a database where the `slides` column from
// supabase/migrations/0006_herobanner.sql is not applied yet: the row is saved
// without slides and a warning is returned so the admin UI can explain why.
async function saveHeroBannerRow(
  supabase: SupabaseClient,
  row: { id: string; eyebrow: string; title: string; subtitle: string; image: string; buttonLabel: string; buttonHref: string; slides: { image: string; eyebrow: string; title: string; subtitle: string; buttonLabel: string; buttonHref: string }[]; tone: string; position: number; enabled: boolean },
): Promise<{ error: string | null; warning: string | null }> {
  const full: Record<string, unknown> = {
    id: row.id,
    eyebrow: row.eyebrow,
    title: row.title,
    subtitle: row.subtitle,
    image: row.image,
    button_label: row.buttonLabel,
    button_href: row.buttonHref || '/product',
    slides: row.slides,
    tone: row.tone,
    position: Number.isFinite(row.position) ? row.position : 0,
    enabled: row.enabled,
    updated_at: new Date().toISOString(),
  };
  const first = await supabase.from(HEROBANNER_TABLE).upsert(full, { onConflict: 'id' });
  if (!first.error) {
    revalidatePath('/');
    return { error: null, warning: null };
  }
  // `slides` may not exist yet (0006 migration pending) — PostgREST reports
  // PGRST204, or Postgres a passthrough 42703. Retry without that column so
  // the rest of the banner still saves, and tell the caller why.
  if (/\bslides\b/i.test(first.error.message)) {
    const legacy: Record<string, unknown> = { ...full };
    delete legacy.slides;
    const retry = await supabase.from(HEROBANNER_TABLE).upsert(legacy, { onConflict: 'id' });
    if (!retry.error) {
      revalidatePath('/');
      return {
        error: null,
        warning: 'hero slides were not saved — the herobanner.slides column is missing. Run supabase/migrations/0006_herobanner.sql in the Supabase SQL editor, then save again.',
      };
    }
    return { error: retry.error.message, warning: null };
  }
  return { error: first.error.message, warning: null };
}

function categoryEnabled(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.trim().toLowerCase() !== 'false';
  if (typeof value === 'number') return value !== 0;
  return true;
}

function rowToCategory(row: CategoryRow) {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    text: String(row.text ?? ''),
    image: String(row.image ?? ''),
    enabled: categoryEnabled(row.enabled),
  };
}

// Writes a category row, tolerating a missing `text` column on older tables.
async function saveCategoryRow(
  supabase: SupabaseClient,
  row: { id: string; name: string; text: string; image: string; enabled: boolean },
): Promise<string | null> {
  const full: Record<string, unknown> = {
    id: row.id,
    name: row.name,
    text: row.text,
    image: row.image,
    enabled: row.enabled,
    updated_at: new Date().toISOString(),
  };
  const first = await supabase.from(CATEGORY_TABLE).upsert(full, { onConflict: 'id' });
  if (!first.error) return null;
  if (/column "text"|column text of relation/i.test(first.error.message)) {
    const legacy: Record<string, unknown> = { ...full };
    delete legacy.text;
    const retry = await supabase.from(CATEGORY_TABLE).upsert(legacy, { onConflict: 'id' });
    if (!retry.error) return null;
    return retry.error.message;
  }
  return first.error.message;
}

function asText(value: unknown): string | undefined {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}

function asList(value: unknown): string[] | undefined {
  const raw = asText(value);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(item => String(item)).filter(Boolean);
  } catch {
    /* not JSON — fall through to comma split */
  }
  return raw.split(',').map(item => item.trim()).filter(Boolean);
}

function rowToProduct(row: ProductRow): Product {
  const color = asText(row.color);
  return {
    id: String(row.product_id),
    sku: asText(row.sku),
    brand: asText(row.brand),
    name: row.name,
    category: row.category ?? '',
    price: Number(row.price ?? 0),
    originalPrice: row.original_price == null ? undefined : Number(row.original_price),
    image: row.main_image_url ?? '',
    images: asList(row.gallery_images_url),
    description: row.description ?? '',
    information: asText(row.information),
    sizes: asList(row.size),
    colors: color ? [{ name: color, hex: '' }] : undefined,
    specifications: parseDbSpecs(row.specifications).length > 0 ? parseDbSpecs(row.specifications) : undefined,
    reviews: parseDbReviews(row.reviews).length > 0 ? parseDbReviews(row.reviews) : undefined,
    rating: Number(row.rating ?? 0),
    reviewCount: row.review_count == null ? undefined : Number(row.review_count),
    stock: row.stock == null ? undefined : Number(row.stock),
    tag: row.tag ?? undefined,
    linkHref: row.link_href ?? undefined,
    enabled: row.enabled ?? undefined,
    featuredOrder: row.featured_order == null ? undefined : Number(row.featured_order),
    seoTitle: row.seo_title ?? undefined,
    seoDescription: row.seo_description ?? undefined,
    seoKeywords: row.seo_keywords ?? undefined,
    ogImage: row.og_image ?? undefined,
    canonicalPath: row.canonical_path ?? undefined,
  };
}

function productToRow(product: Product) {
  const row: Record<string, unknown> = {
    product_id: product.id,
    name: product.name,
  };
  const put = (column: string, value: unknown) => {
    if (value !== undefined) row[column] = value;
  };
  put('description', product.description);
  put('information', product.information);
  put('category', product.category);
  put('brand', asText(product.brand));
  put('sku', asText(product.sku));
  put('price', product.price === undefined ? undefined : Number(product.price));
  put(
    'specifications',
    product.specifications?.length
      ? JSON.stringify(
          product.specifications
            .map(item => ({
              label: String(item?.label ?? '').trim(),
              value: String(item?.value ?? '').trim(),
            }))
            .filter(item => item.label || item.value),
        )
      : undefined,
  );
  put(
    'reviews',
    product.reviews?.length
      ? JSON.stringify(
          product.reviews
            .map(item => ({
              text: String(item?.text ?? '').trim(),
              name: String(item?.name ?? 'Verified buyer').trim() || 'Verified buyer',
              ...(String(item?.avatar ?? '').trim() ? { avatar: String(item?.avatar).trim() } : {}),
            }))
            .filter(item => item.text),
        )
      : undefined,
  );
  put('main_image_url', product.image);
  put('gallery_images_url', product.images ? JSON.stringify(product.images) : undefined);
  put('color', product.colors?.length ? product.colors.map(color => color.name).join(', ') : undefined);
  put('size', product.sizes?.length ? product.sizes.join(', ') : undefined);
  put('original_price', product.originalPrice);
  put('rating', product.rating);
  put('review_count', product.reviewCount);
  put('stock', product.stock);
  put('tag', product.tag);
  put('link_href', product.linkHref);
  put('enabled', product.enabled);
  put('featured_order', product.featuredOrder);
  put('seo_title', product.seoTitle);
  put('seo_description', product.seoDescription);
  put('seo_keywords', product.seoKeywords);
  put('og_image', product.ogImage);
  put('canonical_path', product.canonicalPath);
  return row;
}

// The BEFORE UPDATE trigger nulls `embedding` when semantic fields change
// (name/brand/category/tag/description); regenerate it right after each admin
// save with the local server-only model so semantic search stays fresh
// without re-running the backfill. Best effort: on failure the row keeps
// embedding = null and scripts/backfill-embeddings.mjs heals it later.
async function refreshProductEmbedding(supabase: SupabaseClient, productId: string): Promise<void> {
  if (!productId) return;
  try {
    const { data } = await supabase
      .from(PRODUCT_TABLE)
      .select('name,brand,category,tag,description')
      .eq('product_id', productId)
      .maybeSingle();
    if (!data) return;
    const vector = await embedText(buildSemanticText(data as Record<string, unknown>));
    if (!vector) return;
    await supabase.from(PRODUCT_TABLE).update({ embedding: vector }).eq('product_id', productId);
  } catch {
    // Leave embedding null; the backfill script regenerates it later.
  }
}

// Writes a product row, tolerating columns that do not exist on the `product`
// table by dropping the column named in the Postgres error and retrying.
async function saveProductRow(supabase: SupabaseClient, product: Product): Promise<string | null> {
  const working: Record<string, unknown> = productToRow(product);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const { error } = await supabase.from(PRODUCT_TABLE).upsert(working, { onConflict: 'product_id' });
    if (!error) {
      await refreshProductEmbedding(supabase, String(working.product_id ?? ''));
      return null;
    }
    const message = String(error.message ?? '');
    const match = /column "([^"]+)"/i.exec(message) ?? /'([^']+)' column/i.exec(message) ?? /column (\S+) of relation/i.exec(message);
    const column = match?.[1];
    if (column && column in working) {
      delete working[column];
      continue;
    }
    return error.message;
  }
  return 'Could not save product row.';
}

function adminUser(value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const customer = value as Record<string, unknown>;
    if (customer.user && typeof customer.user === 'object') return customer.user;
    return customer;
  }
  return value ?? null;
}

function orderToAdmin(row: OrderRow) {
  return {
    id: row.id,
    user: adminUser(row.customer),
    items: row.items ?? [],
    subtotal: Number(row.subtotal ?? 0),
    discount: Number(row.discount ?? 0),
    deliveryFee: Number(row.delivery_fee ?? 0),
    deliveryLabel: row.delivery_label,
    total: Number(row.total ?? 0),
    paymentMethod: row.payment_method,
    status: row.status,
    shippingAddress: row.shipping_address,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const gate = await requireAdminSession(getSupabaseAdmin(), getToken(request));
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 401 });

  try {
    const supabase = getSupabaseAdmin();

    if (action === 'products') {
      // Paginated: PostgREST caps every query at 1,000 rows by default and
      // this table has 8,413+ rows. Page with .range(from, to) + exact count
      // so the admin UI can walk the whole catalog (?page=&perPage=).
      const rawPage = Number(searchParams.get('page') ?? 1);
      const rawPerPage = Number(searchParams.get('perPage') ?? searchParams.get('limit') ?? 100);
      const page = Number.isFinite(rawPage) ? Math.max(Math.floor(rawPage), 1) : 1;
      const perPage = Number.isFinite(rawPerPage) ? Math.min(Math.max(Math.floor(rawPerPage), 1), 500) : 100;
      const from = (page - 1) * perPage;
      const to = from + perPage - 1;
      const { data, error, count } = await supabase
        .from(PRODUCT_TABLE)
        .select('*', { count: 'exact' })
        .order('product_id', { ascending: true })
        .range(from, to);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const total = typeof count === 'number' ? count : from + (data as ProductRow[]).length;
      return NextResponse.json({
        products: (data as ProductRow[]).map(rowToProduct),
        total,
        page,
        perPage,
        hasMore: from + (data as ProductRow[]).length < total,
      });
    }

    if (action === 'orders') {
      const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ orders: (data as OrderRow[]).map(orderToAdmin) });
    }

    if (action === 'cms') {
      const path = searchParams.get('path');
      if (!path) return NextResponse.json({ error: 'Missing cms path.' }, { status: 400 });
      // Categories live in the dedicated `category` table — serve it here so the
      // admin editor and the storefront read the same source.
      if (path === 'categories') {
        const { data, error } = await supabase.from(CATEGORY_TABLE).select('*').order('name', { ascending: true });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ items: ((data ?? []) as CategoryRow[]).map(rowToCategory) });
      }

      if (path === 'herobanners') {
        const { data, error } = await supabase
          .from(HEROBANNER_TABLE)
          .select('*')
          .order('position', { ascending: true })
          .order('id', { ascending: true });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ items: ((data ?? []) as HeroBannerRow[]).map(rowToHeroBanner) });
      }
      const { data, error } = await supabase.from('cms_items').select('item_id,data').eq('path', path);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ items: (data ?? []).map(item => ({ id: item.item_id, ...(item.data ?? {}) })) });
    }

    return NextResponse.json({ error: 'Unsupported admin action.' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Admin request failed.' }, { status: 500 });
  }
}

type AdminAuthPayload = { email?: string; password?: string; name?: string };

function authError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// Friendly message when 0010_admin_login.sql has not been applied yet.
function migrationHint(error: { message?: string } | null): string | null {
  const message = error?.message ?? '';
  if (message.includes('admin_sessions') || message.includes('customers_method_check')) {
    return 'Database migration missing. Run supabase/migrations/0010_admin_login.sql in the Supabase SQL Editor.';
  }
  return null;
}

// POST ?action=login — email + password, role must be 'admin'.
async function adminLogin(request: Request) {
  const supabase = getSupabaseAdmin();
  const payload = (await request.json().catch(() => ({}))) as AdminAuthPayload;
  const email = String(payload.email ?? '').trim().toLowerCase();
  const password = String(payload.password ?? '');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return authError('Enter a valid email address.');
  if (!password) return authError('Enter your password.');
  if (isAdminLoginThrottled(email)) {
    return authError('Too many attempts. Please wait 10 minutes and try again.', 429);
  }

  const id = emailCustomerId(email);
  const { data: admin, error } = await supabase
    .from('customers')
    .select('id,role,name,email,password_hash')
    .eq('id', id)
    .maybeSingle();
  if (error) return authError(migrationHint(error) ?? error.message, 500);

  // One generic message for unknown email, non-admin account, or wrong
  // password — never reveals which of the three happened.
  if (!admin || admin.role !== 'admin' || !verifyPassword(password, admin.password_hash)) {
    recordAdminLoginAttempt(email);
    return authError('Invalid email or password.', 401);
  }

  clearAdminLoginAttempts(email);
  const token = newAdminSessionToken(admin.id);
  const { error: sessionError } = await supabase.from('admin_sessions').insert({
    id: token,
    customer_id: admin.id,
    secret_hash: sha256Hex(token.slice(token.lastIndexOf('.') + 1)),
    expires_at: adminSessionExpiry(),
  });
  if (sessionError) return authError(migrationHint(sessionError) ?? sessionError.message, 500);

  const response = NextResponse.json({
    admin: { id: admin.id, name: admin.name ?? '', email: admin.email ?? '' },
    token,
  });
  // Same opaque session as an HttpOnly cookie: /admin's server gate reads
  // exactly this value and re-checks role='admin' from customers. Path=/ so
  // the browser actually stores it on /api/admin and sends it to /admin;
  // HttpOnly keeps it away from JS (XSS-safe).
  return withAdminCookie(response, token, request);
}

// POST ?action=logout — revoke the current admin session (idempotent).
async function adminLogout(request: Request) {
  const token = getToken(request);
  if (token) {
    const { error } = await getSupabaseAdmin().from('admin_sessions').delete().eq('id', token);
    if (error) return authError(error.message, 500);
  }
  // Expire the HttpOnly login cookie (same Path=/ the login set) so the
  // /admin gate 404s immediately.
  const isSecure = new URL(request.url).protocol === 'https:';
  const response = NextResponse.json({ ok: true });
  response.headers.set('Set-Cookie', buildAdminSessionCookieClear(isSecure));
  return response;
}

// POST ?action=me — validate the stored session and return the admin profile.
async function adminMe(request: Request) {
  const supabase = getSupabaseAdmin();
  const gate = await requireAdminSession(supabase, getToken(request));
  if (!gate.ok) return authError(gate.error, 401);
  const { data, error } = await supabase
    .from('customers')
    .select('id,name,email')
    .eq('id', gate.adminId)
    .eq('role', 'admin')
    .maybeSingle();
  if (error) return authError(error.message, 500);
  if (!data) return authError('Unauthorized.', 401);
  return NextResponse.json({ admin: { id: data.id, name: data.name ?? '', email: data.email ?? '' } });
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  // Public auth actions - handled BEFORE the session gate.
  if (action === 'login') return adminLogin(request);
  if (action === 'logout') return adminLogout(request);
  if (action === 'me') return adminMe(request);

  const gate = await requireAdminSession(getSupabaseAdmin(), getToken(request));
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 401 });

  if (action !== 'products' && action !== 'seed') {
    return NextResponse.json({ error: 'Unsupported admin action.' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    if (action === 'seed') {
      return NextResponse.json({
        ok: true,
        uploadedAssets: 0,
        counts: {},
        message: 'Seed is inert: Supabase Postgres is now the source of truth. Populate products/orders/cms_items directly (see supabase/migrations/0001_admin_dashboard.sql).',
      });
    }

    const product = (await request.json()) as Product;
    if (!product?.id || !product?.name?.trim()) {
      return NextResponse.json({ error: 'Product ID and name are required.' }, { status: 400 });
    }
    const message = await saveProductRow(supabase, product);
    if (message) return NextResponse.json({ error: message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Admin request failed.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const gate = await requireAdminSession(getSupabaseAdmin(), getToken(request));
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 401 });

  try {
    const supabase = getSupabaseAdmin();
    const body = await request.json();

    if (action === 'products') {
      const product = body as Product;
      if (!product?.id) return NextResponse.json({ error: 'Product ID is required.' }, { status: 400 });
      const message = await saveProductRow(supabase, product);
      if (message) return NextResponse.json({ error: message }, { status: 500 });
      // Live sync: bust cached copies so /product/xxx shows the new
      // description + specs on the very next visit, no manual step.
      revalidatePath(`/product/${String(product.id)}`);
      revalidatePath('/shop');
      revalidatePath('/');
      return NextResponse.json({ ok: true });
    }

    if (action === 'cms') {
      const path = String(body?.path ?? '');
      const id = String(body?.id ?? '');
      if (!path || !id) return NextResponse.json({ error: 'CMS path and ID are required.' }, { status: 400 });

      if (path === 'herobanners') {
        const payload = body.data ?? {};
        // Only the hero-main slot rotates offer slides; other slots never store them.
        const slides = id === 'hero-main' && Array.isArray(payload.slides)
          ? (payload.slides as Record<string, unknown>[]).map(slide => ({
              image: String(slide?.image ?? ''),
              eyebrow: String(slide?.eyebrow ?? ''),
              title: String(slide?.title ?? ''),
              subtitle: String(slide?.subtitle ?? ''),
              buttonLabel: String(slide?.buttonLabel ?? ''),
              buttonHref: String(slide?.buttonHref ?? '/product'),
            })).filter(slide => slide.image || slide.title)
          : [];
        const result = await saveHeroBannerRow(supabase, {
          id,
          eyebrow: String(payload.eyebrow ?? ''),
          title: String(payload.title ?? ''),
          subtitle: String(payload.subtitle ?? payload.description ?? ''),
          image: String(payload.image ?? ''),
          buttonLabel: String(payload.buttonLabel ?? payload.primaryLabel ?? ''),
          buttonHref: String(payload.buttonHref ?? payload.primaryHref ?? '/product'),
          slides,
          tone: String(payload.tone ?? ''),
          position: Number(payload.position ?? 0),
          enabled: categoryEnabled(payload.enabled),
        });
        if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });
        return NextResponse.json(result.warning ? { ok: true, warning: result.warning } : { ok: true });
      }
      // Categories live in the dedicated `category` table — sync admin edits there
      // so the storefront slider updates on the next load.
      if (path === 'categories') {
        const form = (body?.data ?? {}) as Record<string, unknown>;
        const message = await saveCategoryRow(supabase, {
          id,
          name: String(form.name ?? '').trim(),
          text: String(form.text ?? ''),
          image: String(form.image ?? ''),
          enabled: categoryEnabled(form.enabled),
        });
        if (message) return NextResponse.json({ error: message }, { status: 500 });
        revalidatePath('/');
        return NextResponse.json({ ok: true });
      }
      const { error } = await supabase.from('cms_items').upsert(
        { path, item_id: id, data: body?.data ?? {}, updated_at: new Date().toISOString() },
        { onConflict: 'path,item_id' },
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unsupported admin action.' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Admin request failed.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const gate = await requireAdminSession(getSupabaseAdmin(), getToken(request));
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 401 });

  try {
    const supabase = getSupabaseAdmin();

    if (action === 'products') {
      const id = searchParams.get('id');
      if (!id) return NextResponse.json({ error: 'Product ID is required.' }, { status: 400 });
      const { error } = await supabase.from(PRODUCT_TABLE).delete().eq('product_id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (action === 'cms') {
      const path = searchParams.get('path');
      const id = searchParams.get('id');
      if (!path || !id) return NextResponse.json({ error: 'CMS path and ID are required.' }, { status: 400 });
      // Categories live in the dedicated `category` table — delete there too.
      if (path === 'categories') {
        const { error } = await supabase.from(CATEGORY_TABLE).delete().eq('id', id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        revalidatePath('/');
        return NextResponse.json({ ok: true });
      }
      if (path === 'herobanners') {
        const { error } = await supabase.from(HEROBANNER_TABLE).delete().eq('id', id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        revalidatePath('/');
        return NextResponse.json({ ok: true });
      }
      const { error } = await supabase.from('cms_items').delete().eq('path', path).eq('item_id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unsupported admin action.' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Admin request failed.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const gate = await requireAdminSession(getSupabaseAdmin(), getToken(request));
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 401 });

  try {
    const supabase = getSupabaseAdmin();

    if (action === 'orders') {
      const body = await request.json();
      const id = String(body?.id ?? '');
      const status = String(body?.status ?? '');
      if (!id || !status) return NextResponse.json({ error: 'Order ID and status are required.' }, { status: 400 });

      // Capture the previous status + customer before overwriting, so we only
      // email when the status genuinely changes (not on every save).
      const { data: previous } = await supabase
        .from('orders')
        .select('status, customer, items, total')
        .eq('id', id)
        .single();

      const { data, error } = await supabase
        .from('orders')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const order = orderToAdmin(data as OrderRow);

      // Notify the customer by email when the status actually changed.
      // Fire-and-forget (never throws); the update response is already 200.
      if (previous?.status !== status) {
        void sendOrderStatusEmail(data as OrderRow, status);
      }

      return NextResponse.json({ order });
    }

    return NextResponse.json({ error: 'Unsupported admin action.' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Admin request failed.' }, { status: 500 });
  }
}

