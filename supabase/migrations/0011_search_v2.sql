-- 0011_search_v2.sql — powerful, relevant, reliable product search.
-- Run once in Supabase Dashboard > SQL Editor > New query > paste > Run.
-- Safe to re-run (idempotent). Table stays public.product; RLS stays enabled.
--
-- What this changes:
--   1. public.search_synonyms — DB-backed synonym/alias system with THREE
--      relationship strengths: 1 = direct synonym/alternative name,
--      2 = closely related product type, 3 = broader category. RLS enabled
--      with NO public policies (read only inside the SECURITY DEFINER search
--      function). Replaces the single-tier public.search_concepts table
--      (legacy rows migrate in as strength 2).
--   2. Query normalization helpers: case/whitespace/punctuation folding
--      (search_normalize) + naive plural handling (search_singular), applied
--      to both the query and the stored synonyms.
--   3. public.product.name_norm — punctuation-insensitive lowercase name so
--      "In-Ear Headphone" matches "in ear headphone"; trgm GIN index.
--   4. public.product.search_vector — weighted PostgreSQL full-text index
--      (name=A, brand/category/tag=B, description=C) with GIN index.
--   5. public.search_products_ranked — rewritten as multi-source retrieval
--      (10 sources x up to 150 candidates each): exact name, name prefix,
--      name contains/token, Levenshtein typo tolerance, direct aliases,
--      strong keywords + weighted FTS, closely related types, broader terms,
--      and the pgvector semantic tail. Candidates are fused with weighted
--      Reciprocal Rank Fusion (k=60), then ordered by explicit priority tier
--      (exact > prefix/token > direct alias > keyword/FTS > related >
--      broader/semantic). Same signature, return shape and grants — Header
--      autocomplete, /api/shop/products and search_products() keep working.
--   6. Existing pg_trgm + HNSW indexes kept; fuzzystrmatch added for typos.
--
-- After running this file: node scripts/backfill-embeddings.mjs fills
-- product.embedding (384d, Xenova/all-MiniLM-L6-v2, local, no API key).
-- search_text / name_norm / search_vector are backfilled inside this file.

create extension if not exists pg_trgm;
create extension if not exists vector;
create extension if not exists fuzzystrmatch;

-- 1) Query normalization helpers -----------------------------------------------
create or replace function public.search_normalize(p text)
returns text language sql immutable parallel safe as $$
  select nullif(left(trim(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', ' ', 'g')), 100), '')
$$;

-- Naive singular form used for word forms (earphones -> earphone,
-- batteries -> battery, shoes -> shoe). Lookup tries both forms.
create or replace function public.search_singular(p text)
returns text language sql immutable parallel safe as $$
  select case
    when p is null then null
    when p ~ 'ies$' and length(p) > 4 then left(p, length(p) - 3) || 'y'
    when p ~ '[^s]s$' and length(p) > 3 then left(p, length(p) - 1)
    else p
  end
$$;

create or replace function public.build_product_name_norm(p_name text)
returns text language sql immutable parallel safe as $$
  select public.search_normalize(p_name)
$$;

-- Internal helpers: not callable from PostgREST (search runs as definer).
revoke execute on function public.search_normalize(text) from public, anon, authenticated;
revoke execute on function public.search_singular(text) from public, anon, authenticated;
revoke execute on function public.build_product_name_norm(text) from public, anon, authenticated;
grant execute on function public.search_normalize(text) to service_role;
grant execute on function public.search_singular(text) to service_role;
grant execute on function public.build_product_name_norm(text) to service_role;

-- 2) product search columns -----------------------------------------------------
alter table public.product add column if not exists name_norm text;
alter table public.product add column if not exists search_vector tsvector;

create index if not exists product_name_norm_trgm_idx
  on public.product using gin (name_norm gin_trgm_ops);

create index if not exists product_search_vector_idx
  on public.product using gin (search_vector);

-- 3) one BEFORE trigger maintains search_text + name_norm + search_vector and
--    nulls the embedding only when semantic fields change (the admin save
--    path and scripts/backfill-embeddings.mjs regenerate it afterwards).
create or replace function public.product_search_text_trigger()
returns trigger language plpgsql as $fn$
begin
  NEW.search_text := public.build_product_search_text(
    NEW.name, NEW.brand, NEW.category, NEW.tag, NEW.description);
  NEW.name_norm := public.build_product_name_norm(NEW.name);
  NEW.search_vector :=
      setweight(to_tsvector('english', left(coalesce(NEW.name, ''), 300)), 'A')
   || setweight(to_tsvector('english', left(coalesce(concat_ws(' ', NEW.brand, NEW.category, NEW.tag), ''), 300)), 'B')
   || setweight(to_tsvector('english', left(coalesce(NEW.description, ''), 2000)), 'C');
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
end
$fn$;

drop trigger if exists product_search_text_tg on public.product;
create trigger product_search_text_tg before insert or update on public.product
  for each row execute function public.product_search_text_trigger();

-- Backfill for rows written before this migration (the trigger recomputes
-- every derived column from the NEW row values).
update public.product
set search_text = search_text
where search_text is null or name_norm is null or search_vector is null;

-- 4) synonym / alias system with relationship strengths -------------------------
create table if not exists public.search_synonyms (
  term       text not null,
  alias      text not null,
  strength   smallint not null check (strength between 1 and 3),
  updated_at timestamptz not null default now(),
  primary key (term, alias),
  check (term = public.search_normalize(term)),
  check (alias = public.search_normalize(alias))
);

alter table public.search_synonyms enable row level security;
-- No policies on purpose: browsers cannot read the map directly; the
-- SECURITY DEFINER search function reads it with owner rights.
revoke all on table public.search_synonyms from public, anon, authenticated;

-- Migrate legacy single-tier concept rows (strength 2 = related), then drop
-- the old table so there is exactly one synonym source of truth.
do $migrate$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'search_concepts'
  ) then
    insert into public.search_synonyms (term, alias, strength)
    select public.search_normalize(c.term), public.search_normalize(r.rel), 2
    from public.search_concepts c
    cross join lateral unnest(c.related) as r(rel)
    where public.search_normalize(c.term) is not null
      and public.search_normalize(r.rel) is not null
    on conflict (term, alias) do nothing;
    drop table public.search_concepts;
  end if;
end
$migrate$;

-- Curated seed. Every literal is already normalized (lowercase, single
-- spaces) to satisfy the check constraints. Plural query forms resolve via
-- search_singular, so keys are stored singular. Edit rows freely:
--   insert into public.search_synonyms values ('term','alias',1);
--   delete from public.search_synonyms where term='term' and alias='alias';
insert into public.search_synonyms (term, alias, strength)
select v.term, v.alias, v.strength
from (values
  -- audio: earphone family — direct aliases (1), related types (2), broader (3)
  ('earphone', 'earbud', 1),
  ('earphone', 'earpods', 1),
  ('earphone', 'in ear headphone', 1),
  ('earphone', 'tws', 1),
  ('earphone', 'headset', 2),
  ('earphone', 'neckband', 2),
  ('earphone', 'headphone', 3),
  ('earphone', 'audio', 3),
  ('earbud', 'earphone', 1),
  ('earbud', 'earpods', 1),
  ('earbud', 'tws', 1),
  ('earbud', 'true wireless', 1),
  ('earbud', 'headset', 2),
  ('earbud', 'neckband', 2),
  ('earbud', 'headphone', 3),
  ('earpods', 'earphone', 1),
  ('earpods', 'earbud', 1),
  ('earpods', 'in ear headphone', 1),
  ('earpods', 'headphone', 3),
  ('headphone', 'earphone', 2),
  ('headphone', 'earbud', 2),
  ('headphone', 'headset', 2),
  ('headphone', 'in ear headphone', 2),
  ('headphone', 'neckband', 2),
  ('headphone', 'audio', 3),
  ('headset', 'earphone', 2),
  ('headset', 'headphone', 2),
  ('headset', 'earbud', 2),
  ('neckband', 'headphone', 2),
  ('neckband', 'earphone', 2),
  ('in ear headphone', 'earphone', 1),
  ('in ear headphone', 'earbud', 1),
  ('in ear headphone', 'headphone', 2),
  ('tws', 'earbud', 1),
  ('tws', 'earphone', 1),
  -- lighting: light -> LED bulbs, lamps, fixtures
  ('light', 'led', 1),
  ('light', 'lighting', 1),
  ('light', 'bulb', 2),
  ('light', 'lamp', 2),
  ('light', 'tube light', 2),
  ('light', 'panel light', 2),
  ('light', 'night light', 2),
  ('light', 'torch', 2),
  ('light', 'lantern', 2),
  ('light', 'chandelier', 3),
  ('light', 'home decor', 3),
  ('lighting', 'light', 1),
  ('lighting', 'led', 1),
  ('lighting', 'bulb', 2),
  ('lighting', 'lamp', 2),
  ('lighting', 'tube light', 2),
  ('lighting', 'panel light', 2),
  ('bulb', 'led', 1),
  ('bulb', 'light', 2),
  ('bulb', 'lamp', 2),
  ('bulb', 'lighting', 2),
  ('bulb', 'filament', 2),
  ('bulb', 'tube light', 2),
  ('lamp', 'light', 1),
  ('lamp', 'bulb', 2),
  ('lamp', 'led', 2),
  ('lamp', 'lighting', 2),
  ('lamp', 'lantern', 2),
  ('lamp', 'torch', 2),
  ('led', 'light', 1),
  ('led', 'bulb', 2),
  ('led', 'lamp', 2),
  ('led', 'lighting', 2),
  ('torch', 'light', 2),
  ('torch', 'led', 2),
  ('torch', 'lantern', 2),
  ('lantern', 'light', 2),
  ('lantern', 'lamp', 2),
  ('lantern', 'torch', 2),
  ('tube light', 'light', 2),
  ('tube light', 'led', 2),
  ('tube light', 'bulb', 2),
  ('night light', 'light', 2),
  ('night light', 'lamp', 2)
) as v(term, alias, strength)
on conflict (term, alias) do update
  set strength = excluded.strength, updated_at = now();

-- phones
insert into public.search_synonyms (term, alias, strength)
select v.term, v.alias, v.strength
from (values
  ('phone', 'mobile', 1),
  ('phone', 'smartphone', 1),
  ('phone', 'cellphone', 1),
  ('phone', 'android', 2),
  ('phone', 'iphone', 2),
  ('phone', '5g', 2),
  ('mobile', 'phone', 1),
  ('mobile', 'smartphone', 1),
  ('mobile', 'cellphone', 1),
  ('mobile', 'android', 2),
  ('mobile', 'iphone', 2),
  ('mobile', '5g', 2),
  ('smartphone', 'phone', 1),
  ('smartphone', 'mobile', 1),
  ('smartphone', 'cellphone', 1),
  ('smartphone', 'android', 2),
  ('smartphone', 'iphone', 2),
  ('cellphone', 'phone', 1),
  ('cellphone', 'mobile', 1),
  ('cellphone', 'smartphone', 1),
  ('iphone', 'smartphone', 2),
  ('iphone', 'mobile', 2),
  ('iphone', 'apple', 2),
  ('iphone', 'ios', 2),
  ('android', 'smartphone', 2),
  ('android', 'phone', 2),
  ('android', 'mobile', 2),
  -- laptops
  ('laptop', 'notebook', 1),
  ('laptop', 'ultrabook', 2),
  ('laptop', 'macbook', 2),
  ('laptop', 'chromebook', 2),
  ('laptop', 'thinkpad', 2),
  ('laptop', 'gaming laptop', 2),
  ('laptop', 'computer', 3),
  ('laptop', 'pc', 3),
  ('notebook', 'laptop', 1),
  ('notebook', 'ultrabook', 2),
  ('notebook', 'chromebook', 2),
  ('ultrabook', 'laptop', 1),
  ('ultrabook', 'notebook', 2),
  ('macbook', 'laptop', 1),
  ('macbook', 'notebook', 2),
  ('macbook', 'apple', 2),
  ('chromebook', 'laptop', 2),
  ('chromebook', 'notebook', 2),
  ('gaming laptop', 'laptop', 1),
  ('gaming laptop', 'notebook', 2),
  -- footwear
  ('shoe', 'sneaker', 2),
  ('shoe', 'sandal', 2),
  ('shoe', 'slipper', 2),
  ('shoe', 'trainer', 2),
  ('shoe', 'floaters', 2),
  ('shoe', 'footwear', 3),
  ('sneaker', 'shoe', 2),
  ('sneaker', 'footwear', 3),
  ('sandal', 'shoe', 2),
  ('sandal', 'footwear', 3),
  ('slipper', 'shoe', 2),
  ('slipper', 'footwear', 3),
  ('footwear', 'shoe', 2),
  ('footwear', 'sneaker', 2),
  ('footwear', 'sandal', 2),
  ('footwear', 'slipper', 2)
) as v(term, alias, strength)
on conflict (term, alias) do update
  set strength = excluded.strength, updated_at = now();

-- 5) Hybrid ranked search — multi-source retrieval + weighted Reciprocal Rank
--    Fusion, then explicit priority tiers:
--      1 exact product-name match          5 closely related product types
--      2 name prefix / token / typo        6 broader terms + semantic tail
--      3 direct synonyms and aliases       4 other strong keyword/FTS matches
--    Each source retrieves up to 150 candidates BEFORE fusion; the final
--    limit is applied after ranking (cap 400).
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
with qv as (
  select nullif(public.search_normalize(search_query), '') as term,
         public.search_singular(public.search_normalize(search_query)) as sing,
         case
           when length(public.search_normalize(search_query)) <= 4 then 1
           when length(public.search_normalize(search_query)) <= 8 then 2
           else 3
         end as maxd
),
syn as (
  select coalesce(array_agg(alias) filter (where strength = 1), '{}') as a1,
         coalesce(array_agg(alias) filter (where strength = 2), '{}') as a2,
         coalesce(array_agg(alias) filter (where strength = 3), '{}') as a3
  from public.search_synonyms
  where term = coalesce((select term from qv), '')
     or term = coalesce((select sing from qv), '')
),
tsq as (
  select websearch_to_tsquery('english', coalesce((select term from qv), '')) as query
),
src as (
  -- (1) exact full-name match
  (select p.product_id as pid, 1 as tier, 1 as rnk, 1.0 as w
   from public.product p, qv
   where qv.term is not null and p.enabled = true
     and (p.name_norm = qv.term or p.name_norm = qv.sing)
   limit 150)
  union all
  -- (2a) name prefix
  (select p.product_id, 2, row_number() over (order by length(p.name_norm), p.product_id), 0.9
   from public.product p, qv
   where qv.term is not null and p.enabled = true
     and (p.name_norm like qv.term || '%' or p.name_norm like qv.sing || '%')
     and p.name_norm <> qv.term and p.name_norm <> qv.sing
   limit 150)
  union all
  -- (2b) name contains (token-level strong match)
  (select p.product_id, 2, row_number() over (
             order by strpos(p.name_norm, qv.term), p.product_id), 0.7
   from public.product p, qv
   where qv.term is not null and p.enabled = true
     and (strpos(p.name_norm, qv.term) > 0 or strpos(p.name_norm, qv.sing) > 0)
     and p.name_norm not like qv.term || '%'
     and p.name_norm not like qv.sing || '%'
   limit 150)
  union all
  -- (2c) typo-tolerant name match (Levenshtein over name words; only words
  --      within +/- maxd characters are even measured)
  (select p.product_id, 2, row_number() over (order by p.product_id), 0.5
   from public.product p, qv
   where qv.term is not null and p.enabled = true
     and length(qv.term) >= 4
     and strpos(p.name_norm, qv.term) = 0
     and strpos(p.name_norm, qv.sing) = 0
     and exists (
       select 1 from unnest(string_to_array(p.name_norm, ' ')) w
       where length(w) >= 3
         and length(w) between length(qv.term) - qv.maxd and length(qv.term) + qv.maxd
         and levenshtein_less_equal(w, qv.term, qv.maxd) <= qv.maxd
     )
   limit 150)
  union all
  -- (3) direct synonyms / alternative names (strength 1), name hits first
  (select p.product_id, 3, row_number() over (
             order by (exists (select 1 from unnest(syn.a1) a
                               where strpos(p.name_norm, a) > 0)) desc,
                      p.product_id), 1.0
   from public.product p, syn
   where p.enabled = true
     and exists (select 1 from unnest(syn.a1) a
                 where strpos(p.name_norm, a) > 0
                    or p.search_text like '%' || a || '%')
   limit 150)
  union all
  -- (4a) other strong keyword matches: brand / category / sku / search text
  (select p.product_id, 4, row_number() over (order by p.product_id), 0.6
   from public.product p, qv
   where qv.term is not null and p.enabled = true
     and (p.brand ilike '%' || qv.term || '%'
       or p.category ilike '%' || qv.term || '%'
       or p.sku ilike '%' || qv.term || '%'
       or p.search_text like '%' || qv.term || '%')
   limit 150)
  union all
  -- (4b) weighted full-text search (name=A, brand/category/tag=B, desc=C)
  (select p.product_id, 4, row_number() over (
             order by ts_rank_cd(p.search_vector, tsq.query) desc, p.product_id), 0.7
   from public.product p, tsq
   where p.enabled = true and p.search_vector @@ tsq.query
   limit 150)
  union all
  -- (5) closely related product types (strength 2)
  (select p.product_id, 5, row_number() over (
             order by (exists (select 1 from unnest(syn.a2) a
                               where strpos(p.name_norm, a) > 0)) desc,
                      p.product_id), 0.8
   from public.product p, syn
   where p.enabled = true
     and exists (select 1 from unnest(syn.a2) a
                 where strpos(p.name_norm, a) > 0
                    or p.search_text like '%' || a || '%')
   limit 150)
  union all
  -- (6a) broader category-related terms (strength 3)
  (select p.product_id, 6, row_number() over (
             order by (exists (select 1 from unnest(syn.a3) a
                               where strpos(p.name_norm, a) > 0)) desc,
                      p.product_id), 0.7
   from public.product p, syn
   where p.enabled = true
     and exists (select 1 from unnest(syn.a3) a
                 where strpos(p.name_norm, a) > 0
                    or p.search_text like '%' || a || '%')
   limit 150)
  union all
  -- (6b) semantic tail: cosine similarity >= 0.40 (distance <= 0.60). Needs
  --      product.embedding populated (scripts/backfill-embeddings.mjs).
  (select p.product_id, 6, row_number() over (order by p.embedding <=> query_embedding), 0.9
   from public.product p
   where query_embedding is not null
     and p.enabled = true
     and p.embedding is not null
     and (p.embedding <=> query_embedding) <= 0.6
   limit 150)
),
-- Weighted Reciprocal Rank Fusion: a product's tier is the best (lowest) tier
-- any source found it in; fused score sums w/(60+rank) across sources so
-- multi-source agreement wins ties inside a tier — generic semantic matches
-- can never outrank exact/prefix/alias results because they sit in tier 6.
fused as (
  select pid,
         min(tier) as tier,
         sum(w / (60.0 + rnk)) as score,
         count(*)::int as hits
  from src
  group by pid
),
ordered as (
  select pid, tier, score, hits,
         row_number() over (order by tier asc, score desc, hits desc, pid asc) as r
  from fused
)
select p.product_id, p.name, p.sku, p.category, p.brand, p.price, p.main_image_url
from ordered o
join public.product p on p.product_id = o.pid
where o.r <= least(greatest(coalesce(result_limit, 10), 1), 400)
order by o.r;
$$;

-- Backwards-compatible 10-row wrapper (Header fallback path).
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

-- Verify in the SQL Editor (expect direct matches first, then discovered
-- alternatives; typos like 'earfon' and 'laptap' should still hit):
--   select * from public.search_products_ranked('earphone', 10, null);
--   select * from public.search_products_ranked('light', 10, null);
--   select * from public.search_products_ranked('earfon', 10, null);
--   select count(*) from public.search_synonyms;




