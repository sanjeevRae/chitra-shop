// search_tests.sql — run AFTER 0011_search_v2.sql in Supabase SQL Editor.
-- Required checks: direct matches first, discovered alternatives, semantic
-- tail, typo tolerance, autocomplete <= 10 rows, reasonable latency.
-- (Semantic rows additionally need scripts/backfill-embeddings.mjs to finish;
--  verify the tail end-to-end via /api/shop/products?search=...)

-- 1) The required query set. For each: expect direct name matches in the
--    first rows, then discovered alternatives (aliases/related/broader/semantic).
select 'earphone' as q, * from public.search_products_ranked('earphone', 10, null);
select 'earbuds' as q, * from public.search_products_ranked('earbuds', 10, null);
select 'headphones' as q, * from public.search_products_ranked('headphones', 10, null);
select 'light' as q, * from public.search_products_ranked('light', 10, null);
select 'bulb' as q, * from public.search_products_ranked('bulb', 10, null);
select 'phone' as q, * from public.search_products_ranked('phone', 10, null);
select 'mobile' as q, * from public.search_products_ranked('mobile', 10, null);
select 'iphone' as q, * from public.search_products_ranked('iphone', 10, null);
select 'laptop' as q, * from public.search_products_ranked('laptop', 10, null);
select 'shoe' as q, * from public.search_products_ranked('shoe', 10, null);
select 'headphone' as q, * from public.search_products_ranked('headphone', 10, null);
select 'sony' as q, * from public.search_products_ranked('sony', 10, null);

-- 2) Typo tolerance (Levenshtein source). Expect the intended products.
select 'earfon' as q, * from public.search_products_ranked('earfon', 10, null);
select 'laptap' as q, * from public.search_products_ranked('laptap', 10, null);
select 'smatphone' as q, * from public.search_products_ranked('smatphone', 10, null);
select 'sonny' as q, * from public.search_products_ranked('sonny', 10, null);

-- 3) Autocomplete cap: must always be <= 10 rows (Header passes result_limit=10).
select count(*) as autocomplete_rows
from public.search_products_ranked('earphone', 10, null);

-- 4) Maintenance views.
select term, alias, strength from public.search_synonyms order by term, strength;
select count(*) as products_missing_search_vector from public.product where search_vector is null;
select count(*) as products_missing_name_norm from public.product where name_norm is null;
select count(*) as products_missing_embedding from public.product where embedding is null;

-- 5) Groq expansion path (after 0012_search_groq.sql): DB synonyms alone vs
--    DB synonyms + supplied expansion groups. Expect direct aliases (tier 3)
--    above related (tier 5) and broader/semantic (tier 6) in both.
select 'db-only' as mode, * from public.search_products_ranked('earphone', 10, null, null);
select 'groq-expanded' as mode, * from public.search_products_ranked(
  'earphone', 10, null,
  '{"direct":["earbud","earpods","in ear headphone"],"related":["headset","tws"],"broader":["headphone"]}'::jsonb);

-- 6) Expansion cache (populated by the app, service-role only; browsers get 0 rows):
select term, expansions, created_at from public.search_query_expansions order by created_at desc limit 20;

