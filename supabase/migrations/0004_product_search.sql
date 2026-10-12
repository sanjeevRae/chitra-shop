-- Fast DB-side product search for 8,000+ rows.
-- Run once in Supabase Dashboard > SQL Editor > New query > paste > Run.
-- Table is public.product (product_id PK). Safe to re-run.
--
-- Architecture: pg_trgm + GIN indexes on name/brand/category/sku,
-- one SECURITY DEFINER RPC returning max 10 lean rows. RLS stays enabled;
-- the function runs with the owner's rights and only exposes the 7 small
-- card columns below (no description/specs/variants/gallery/seo blobs).

create extension if not exists pg_trgm;

create index if not exists product_name_trgm_idx
  on public.product using gin (name gin_trgm_ops);

create index if not exists product_brand_trgm_idx
  on public.product using gin (brand gin_trgm_ops);

create index if not exists product_category_trgm_idx
  on public.product using gin (category gin_trgm_ops);

create index if not exists product_sku_trgm_idx
  on public.product using gin (sku gin_trgm_ops);

-- Ranking: 1) name starts-with, 2) name contains, 3) brand contains,
-- 4) category contains, 5) sku contains, 6) trigram similarity fallback.
-- Only enabled rows. Partial + typo-tolerant via pg_trgm.
create or replace function public.search_products(search_query text)
returns table (
  product_id varchar(100),
  name varchar(255),
  sku varchar(100),
  category varchar(255),
  brand varchar(255),
  price numeric(12,2),
  main_image_url text
)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select nullif(trim(coalesce(search_query, '')), '') as term
  )
  select
    p.product_id,
    p.name,
    p.sku,
    p.category,
    p.brand,
    p.price,
    p.main_image_url
  from public.product p, q
  where q.term is not null
    and p.enabled = true
    and (
      p.name ilike q.term || '%'
      or p.name ilike '%' || q.term || '%'
      or p.brand ilike '%' || q.term || '%'
      or p.category ilike '%' || q.term || '%'
      or p.sku ilike '%' || q.term || '%'
      or p.name % q.term
      or p.brand % q.term
    )
  order by
    case
      when p.name ilike q.term || '%' then 1
      when p.name ilike '%' || q.term || '%' then 2
      when p.brand ilike '%' || q.term || '%' then 3
      when p.category ilike '%' || q.term || '%' then 4
      when p.sku ilike '%' || q.term || '%' then 5
      else 6
    end,
    greatest(similarity(coalesce(p.name, ''), q.term), similarity(coalesce(p.brand, ''), q.term)) desc,
    p.product_id
  limit 10;
$$;

-- Minimum permission: anonymous + authenticated storefront roles may call it.
-- No service-role key in the browser; RLS on public.product stays enabled.
grant execute on function public.search_products(text) to anon, authenticated;

-- Verify (expect <= 10 rows each):
-- select * from public.search_products('iphone');
-- select * from public.search_products('iphon');
-- select * from public.search_products('sony');
-- select * from public.search_products('headphone');
