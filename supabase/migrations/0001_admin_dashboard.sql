-- Supabase Postgres schema for the Chitra admin dashboard.
-- Project: chitraeletronic / kbgshexjackuikkveohe (ap-southeast-1).
-- How to run: Supabase Dashboard > SQL Editor > New query > paste this file > Run.
--
-- PRODUCT TABLE: this project already has `public.product` (created with your own
-- CREATE TABLE: product_id, sku, name, description, category, brand, price,
-- specifications, variants, variant_prices, main_image_url, gallery_images_url,
-- color, size). This script does NOT recreate or alter its columns — it only
-- enables RLS, adds a read-only storefront policy, and adds a category index
-- (all statements are safe to re-run).
-- Optional admin-only columns live in supabase/migrations/0002_product_extend.sql.
--
-- This script also creates the support tables used by the admin dashboard:
-- `public.orders` and `public.cms_items`.

create table if not exists public.orders (
  id text primary key,
  user_id text,
  customer jsonb not null default '{}',
  items jsonb not null default '[]',
  subtotal numeric not null default 0,
  discount numeric not null default 0,
  delivery_fee numeric not null default 0,
  delivery_label text,
  total numeric not null default 0,
  payment_method text,
  status text not null default 'pending_cod',
  shipping_address jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Generic CMS documents. path mirrors the old Firestore paths such as
-- homepage/heroBanners/items, categories, and testimonials.
create table if not exists public.cms_items (
  path text not null,
  item_id text not null,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (path, item_id)
);

alter table public.product enable row level security;
alter table public.orders enable row level security;
alter table public.cms_items enable row level security;

-- Read-only public storefront access. Admin writes go through /api/admin with
-- SUPABASE_SERVICE_ROLE_KEY, avoiding exposure of privileged keys to the browser.
drop policy if exists "Storefront can read product" on public.product;
create policy "Storefront can read product" on public.product for select using (true);

drop policy if exists "Storefront can read CMS" on public.cms_items;
create policy "Storefront can read CMS" on public.cms_items for select using (true);

create index if not exists product_category_idx on public.product (category);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_created_idx on public.orders (created_at desc);
create index if not exists cms_items_path_idx on public.cms_items (path);
