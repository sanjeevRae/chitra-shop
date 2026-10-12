-- 0005: hybrid ecommerce search = keyword backbone (kept) + concept expansion
-- (intent: light -> LED bulb/lamp/lighting) + pgvector-ready semantic columns.
--
-- Run once in Supabase Dashboard > SQL Editor. Safe to re-run.
-- Table is public.product (product_id PK). RLS stays enabled.
create extension if not exists pg_trgm;
create extension if not exists vector;
-- Materialized searchable text (name/brand/category/tag + description head)
-- plus a pgvector slot for product embeddings (384 dims, gte-small).
alter table public.product add column if not exists search_text text;
alter table public.product add column if not exists embedding vector(384);

create index if not exists product_search_text_trgm_idx
  on public.product using gin (search_text gin_trgm_ops);

create index if not exists product_embedding_hnsw_idx
  on public.product using hnsw (embedding vector_cosine_ops);

create or replace function public.build_product_search_text(
  p_name text, p_brand text, p_category text, p_tag text, p_description text
) returns text language sql immutable as $$
  select lower(trim(concat_ws(' | ',
    nullif(trim(coalesce(p_name, '')), ''),
    nullif(trim(coalesce(p_brand, '')), ''),
    nullif(trim(coalesce(p_category, '')), ''),
    nullif(trim(coalesce(p_tag, '')), ''),
    nullif(left(trim(coalesce(p_description, '')), 500), '')
  )));
$$;

-- Keeps search_text fresh on every write; marks embedding stale (null) only
-- when the semantic fields change so the backfill script can regenerate it.
create or replace function public.product_search_text_trigger()
returns trigger language plpgsql as $$
begin
  NEW.search_text := public.build_product_search_text(
    NEW.name, NEW.brand, NEW.category, NEW.tag, NEW.description);
  if TG_OP = 'UPDATE' and (
    NEW.name is distinct from OLD.name
    or NEW.brand is distinct from OLD.brand
    or NEW.category is distinct from OLD.category
    or NEW.description is distinct from OLD.description
    or NEW.tag is distinct from OLD.tag
  ) then
    NEW.embedding := null;
  end if;
  return NEW;
end $$;

drop trigger if exists product_search_text_tg on public.product;
create trigger product_search_text_tg before insert or update on public.product
  for each row execute function public.product_search_text_trigger();

update public.product
set search_text = public.build_product_search_text(name, brand, category, tag, description)
where search_text is null;
-- Concept map: intent terms -> related product vocabulary. Curated, tiny,
-- editable. Row 1 wins on query match; related terms expand the WHERE clause.
create table if not exists public.search_concepts (
  term text primary key,
  related text[] not null default '{}'
);

insert into public.search_concepts (term, related) values
  ('light', array['led','bulb','lamp','lighting','ceiling','chandelier','torch','lantern','tube light','panel light']),
  ('lighting', array['led','bulb','lamp','light','ceiling','panel','chandelier']),
  ('bulb', array['led','light','lamp','lighting','filament']),
  ('lamp', array['led','light','bulb','lighting','lantern','torch','desk lamp','table lamp']),
  ('phone', array['smartphone','mobile','iphone','android','cellphone','5g']);
insert into public.search_concepts (term, related) values
  ('mobile', array['smartphone','phone','iphone','android','5g']),
  ('smartphone', array['phone','mobile','iphone','android','5g']),
  ('iphone', array['apple','ios','smartphone','mobile']),
  ('laptop', array['notebook','ultrabook','macbook','chromebook','thinkpad','computer']),
  ('computer', array['laptop','desktop','pc','notebook','monitor','cpu']),
  ('headphone', array['earphone','earbuds','headset','audio','speaker']),
  ('shoe', array['shoes','sneaker','sneakers','footwear','boots','running']),
  ('shirt', array['t-shirt','tshirt','polo','kurta','top','tee']),
  ('watch', array['smartwatch','smart watch','clock','fitness band']),
  ('camera', array['dslr','mirrorless','gopro','webcam','cctv','lens']),
  ('tv', array['television','smart tv','led tv','monitor','display']),
  ('battery', array['batteries','power bank','charger','cell','ups','inverter']),
  ('charger', array['charging','adapter','cable','power bank','battery']),
  ('speaker', array['soundbar','woofer','bluetooth speaker','audio','home theatre']),
  ('router', array['wifi','modem','networking','mesh'])
on conflict (term) do update set related = excluded.related;
-- Hybrid ranked search: keyword tiers dominate, concept expansion discovers
-- related stock (light -> LED bulb/lamp), optional vector similarity adds the
-- semantic tail. Exact-name matches always outrank semantics.
create or replace function public.search_products_ranked(
  search_query text,
  result_limit int default 10,
  query_embedding vector(384) default null
)
returns table (
  product_id varchar(100),
  name varchar(255),
  sku varchar(100),
  category varchar(255),
  brand varchar(255),
  price numeric(12,2),
  main_image_url text
)
language sql stable security definer set search_path = public as $$
  with q as (
    select nullif(trim(coalesce(search_query, '')), '') as term
  ),
  concepts as (
    select coalesce((select related from public.search_concepts
      where term = lower((select term from q)) limit 1), '{}') as rel
  )
  select p.product_id, p.name, p.sku, p.category, p.brand, p.price, p.main_image_url
  from public.product p, q, concepts
  where q.term is not null
    and p.enabled = true
    and (
      p.name ilike q.term || '%'
      or p.name ilike '%' || q.term || '%'
      or p.brand ilike '%' || q.term || '%'
      or p.category ilike '%' || q.term || '%'
      or p.sku ilike '%' || q.term || '%'
      or coalesce(p.search_text, '') ilike '%' || q.term || '%'
      or p.name % q.term
      or exists (select 1 from unnest(concepts.rel) r
          where coalesce(p.search_text, '') ilike '%' || r || '%')
      or (query_embedding is not null and p.embedding is not null
          and (1 - (p.embedding <=> query_embedding)) >= 0.35)
    )
  order by
    case
      when p.name ilike q.term then 1
      when p.name ilike q.term || '%' then 2
      when p.name ilike '%' || q.term || '%' then 3
      when p.brand ilike '%' || q.term || '%' then 4
      when p.category ilike '%' || q.term || '%' then 5
      when p.sku ilike '%' || q.term || '%' then 6
      else 7
    end,
    case when query_embedding is not null and p.embedding is not null
      then (1 - (p.embedding <=> query_embedding)) else -1 end desc,
    greatest(similarity(coalesce(p.name, ''), q.term),
             similarity(coalesce(p.brand, ''), q.term)) desc,
    p.product_id
  limit greatest(1, least(coalesce(result_limit, 10), 50));
$$;

-- Backwards compatible: existing callers (header, /product API) keep working.
-- Now routes through the hybrid ranker (no embedding -> keyword + concepts).
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
language sql stable security definer set search_path = public as $$
  select * from public.search_products_ranked(search_query, 10, null);
$$;

grant execute on function public.search_products_ranked(text, int, vector(384)) to anon, authenticated;
grant execute on function public.search_products(text) to anon, authenticated;


