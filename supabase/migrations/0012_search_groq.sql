-- 0012_search_groq.sql — Option 1: keep MiniLM vectors + pgvector indexes,
-- add Groq (openai/gpt-oss-120b) QUERY UNDERSTANDING on top.
-- Run AFTER 0011_search_v2.sql in Supabase SQL Editor. Safe to re-run.
--
-- Groq returns grouped expansion terms {direct, related, broader} as compact
-- JSON — NEVER product records. PostgreSQL stays the only source of catalog
-- rows. Expansions are cached in public.search_query_expansions (service-role
-- only) so Groq is not called repeatedly per term; timeouts, rate limits and
-- API failures fall back to DB synonyms + weighted FTS + MiniLM search.
--
-- Changes:
--   1. public.search_query_expansions — server-side expansion cache table
--      (RLS on, no public policies; only service-role API routes touch it).
--   2. search_products_ranked gains optional `expansions jsonb` merged into
--      the synonym pipeline at strengths 1/2/3, so Groq DIRECT terms rank in
--      the same tier as DB direct synonyms (tier 3) — always above broader
--      (tier 6) and semantic (tier 6) matches. Signature gains one parameter;
--      old 3-arg overload is dropped (PostgREST fills the defaults).
--   3. Typo source now orders by best Levenshtein distance (was arbitrary).
--   4. PostgREST schema reload notified.
--
-- Credentials stay server-side: GROQ_API_KEY in .env.local, never NEXT_PUBLIC_.

create table if not exists public.search_query_expansions (
  term       text primary key,
  expansions jsonb not null,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(expansions) = 'object')
);

alter table public.search_query_expansions enable row level security;
revoke all on table public.search_query_expansions from public, anon, authenticated;

create or replace function public.search_products_ranked(
  search_query text,
  result_limit int default 10,
  query_embedding vector(384) default null,
  expansions jsonb default null
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
ex as (
  select case when expansions is null or jsonb_typeof(expansions) <> 'object'
              then '{}'::jsonb else expansions end as e
),
terms as (
  select public.search_normalize(u.alias) as alias, u.strength
  from (
    -- DB synonyms for the (normalized / singular) query
    select s.alias, s.strength
    from public.search_synonyms s
    where s.term = coalesce((select term from qv), '')
       or s.term = coalesce((select sing from qv), '')
    union all
    -- Groq expansion groups -> the same three strengths
    select t.val, 1 from ex, jsonb_array_elements_text(
      case when jsonb_typeof(ex.e -> 'direct') = 'array'
           then ex.e -> 'direct' else '[]'::jsonb end) as t(val)
    union all
    select t.val, 2 from ex, jsonb_array_elements_text(
      case when jsonb_typeof(ex.e -> 'related') = 'array'
           then ex.e -> 'related' else '[]'::jsonb end) as t(val)
    union all
    select t.val, 3 from ex, jsonb_array_elements_text(
      case when jsonb_typeof(ex.e -> 'broader') = 'array'
           then ex.e -> 'broader' else '[]'::jsonb end) as t(val)
  ) u
),
syn as (
  select coalesce(array_agg(alias) filter (where strength = 1), '{}') as a1,
         coalesce(array_agg(alias) filter (where strength = 2), '{}') as a2,
         coalesce(array_agg(alias) filter (where strength = 3), '{}') as a3
  from terms
  where alias is not null
    and length(alias) between 2 and 60
    and alias ~ '[a-z]'
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
  -- (2c) typo-tolerant name match — best Levenshtein distance per name first
  --      (only words within +/- maxd characters are even measured)
  (select p.product_id, 2, row_number() over (order by d.dist, p.product_id), 0.5
   from (
     select p2.product_id, min(levenshtein_less_equal(w.word, qv.term, qv.maxd)) as dist
     from public.product p2, qv
     cross join lateral unnest(string_to_array(p2.name_norm, ' ')) as w(word)
     where p2.enabled = true
       and length(qv.term) >= 4
       and strpos(p2.name_norm, qv.term) = 0
       and strpos(p2.name_norm, qv.sing) = 0
       and length(w.word) >= 3
       and length(w.word) between length(qv.term) - qv.maxd and length(qv.term) + qv.maxd
       and levenshtein_less_equal(w.word, qv.term, qv.maxd) <= qv.maxd
     group by p2.product_id
   ) d
   join public.product p on p.product_id = d.product_id
   limit 150)
  union all
  -- (3) direct synonyms + Groq "direct" aliases (strength 1), name hits first
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
  -- (5) closely related types: DB strength-2 synonyms + Groq "related"
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
  -- (6a) broader terms: DB strength-3 synonyms + Groq "broader"
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
  -- (6b) semantic tail: MiniLM vector, cosine similarity >= 0.40
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
-- multi-source agreement wins ties inside a tier — Groq-expanded broader
-- terms and generic semantic matches can never outrank exact/prefix/direct-
-- synonym results because they sit in tiers 5/6.
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

-- Backwards-compatible 10-row wrapper (Header fallback path) — now passes the
-- 4-argument signature through.
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
  select * from public.search_products_ranked(search_query, 10, null, null);
$$;

-- Exactly one ranked function must remain, otherwise PostgREST named-argument
-- resolution becomes ambiguous. Drop the old 3-argument overload AFTER the
-- 4-argument version and the wrapper exist.
drop function if exists public.search_products_ranked(text, int, vector(384));

grant execute on function public.search_products_ranked(text, int, vector(384), jsonb) to anon, authenticated;
grant execute on function public.search_products(text) to anon, authenticated;

-- Make PostgREST pick up the new signature immediately.
notify pgrst, 'reload schema';

-- Verify in the SQL Editor:
--   select * from public.search_products_ranked('earphone', 10, null, null);
--   select * from public.search_products_ranked('earphone', 10, null,
--     '{"direct":["earbud","earpods"],"related":["headset"],"broader":["headphone"]}'::jsonb);
--   select count(*) from public.search_synonyms;              -- > 0
--   select * from public.search_query_expansions;             -- grows via the app



