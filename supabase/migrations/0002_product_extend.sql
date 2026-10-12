-- Fix: "Could not find the 'information' column of 'product' in the schema cache".
-- Your base CREATE TABLE has no `information` column and 0002 adds it, so run
-- this if you never ran 0002. Safe to re-run (IF NOT EXISTS). After running,
-- reload the PostgREST schema cache: Supabase Dashboard > Settings > API >
-- "Reload schema" (or wait ~1 min), then retry the admin product save.

-- Full OPTIONAL extension for an existing `product` table.
-- Run once in Supabase Dashboard > SQL Editor if you want the admin dashboard to
-- store every field it edits (SEO, stock, rating, tag, enabled, etc.).
-- Columns that already exist are skipped, so this is safe to re-run.
--
-- Your base table already has: product_id, sku, name, description, category,
-- brand, price, specifications, variants, variant_prices, main_image_url,
-- gallery_images_url, color, size.

alter table public.product add column if not exists original_price numeric;
alter table public.product add column if not exists rating numeric default 0;
alter table public.product add column if not exists review_count numeric;
alter table public.product add column if not exists stock integer default 0;
alter table public.product add column if not exists information text;
alter table public.product add column if not exists reviews jsonb default '[]';
alter table public.product add column if not exists tag text;
alter table public.product add column if not exists link_href text;
alter table public.product add column if not exists enabled boolean default true;
alter table public.product add column if not exists featured_order numeric;
alter table public.product add column if not exists seo_title text;
alter table public.product add column if not exists seo_description text;
alter table public.product add column if not exists seo_keywords text[] default '{}';
alter table public.product add column if not exists og_image text;
alter table public.product add column if not exists canonical_path text;
alter table public.product add column if not exists updated_at timestamptz default now();

-- Public storefront read access. Admin writes go through /api/admin with the
-- service-role key (bypasses RLS), so no write policy is needed here.
alter table public.product enable row level security;
drop policy if exists "Storefront can read product" on public.product;
create policy "Storefront can read product" on public.product for select using (true);

create index if not exists product_category_idx on public.product (category);
