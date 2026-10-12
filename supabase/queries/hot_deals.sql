-- ================================================================
-- Hot Deals queries — Homepage CMS › Collections (Hot Deals shelf)
--
-- CMS path shared by BOTH the admin editor and app/page.tsx:
--   path = 'collections'
-- Admin saves via:  PUT /api/admin?action=cms  (path='collections')
-- Homepage reads via: GET /api/storefront?action=collections&path=collections
-- Row shape the homepage renders: id, title, badge, image, linkHref, enabled
--
-- How to run: Supabase Dashboard > SQL Editor > New query >
-- paste ONE numbered block at a time > Run.
-- Blocks 0–4 are read-only. Blocks 5–8 write, but only to the
-- collections path above; every other cms_items row is untouched.
-- ================================================================

-- 0) Confirm the exact table/shape the API code expects.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'cms_items'
order by ordinal_position;
-- Expect: path text, item_id text, data jsonb, updated_at timestamptz,
-- with primary key (path, item_id).

-- 1) Confirm RLS + the public SELECT policy the Hot Deals fetch depends on.
select tablename, rowsecurity as rls_enabled
from pg_tables
where schemaname = 'public' and tablename = 'cms_items';

select policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public' and tablename = 'cms_items';
-- Expect a SELECT policy whose `qual` is `true`, so anonymous storefront
-- requests can read Hot Deals rows (admin writes still use the service key
-- through /api/admin).

-- 2) See exactly what the Hot Deals section will fetch (newest first).
select item_id,
       updated_at,
       data ->> 'enabled'  as enabled,
       data ->> 'title'    as title,
       data ->> 'badge'    as badge,
       data ->> 'image'    as image,
       data ->> 'linkHref' as link_href
from public.cms_items
where path = 'collections'
order by updated_at desc;

-- 3) Same row shape the public API returns for the homepage.
select item_id as id, data
from public.cms_items
where path = 'collections';

-- 4) Enabled Hot Deals only — what the homepage renders.
select item_id as id,
       coalesce(nullif(data ->> 'badge', ''), '') as badge,
       coalesce(nullif(data ->> 'title', ''), '') as title,
       data ->> 'image' as image,
       coalesce(nullif(data ->> 'linkHref', ''), '/shop') as link_href,
       updated_at
from public.cms_items
where path = 'collections'
  and coalesce(data ->> 'enabled', 'true') <> 'false'
order by updated_at desc;

-- 5) Create/replace one Hot Deal card.
-- Same write the CMS "Add hot deal / Save changes" button performs.
-- Edit the values, keep path/item_id, then Run.
insert into public.cms_items (path, item_id, data, updated_at)
values (
  'collections',
  'hot-deal-1',
  jsonb_build_object(
    'id', 'hot-deal-1',
    'title', 'Pure Sound, Wireless Freedom',
    'badge', '30% OFF',
    'image', '/images/blog/thumb-1.jpg',
    'linkHref', '/shop',
    'enabled', true
  ),
  now()
)
on conflict (path, item_id)
do update set data = excluded.data, updated_at = now()
returning path, item_id, updated_at, data ->> 'title' as title;

-- 6) Hide one Hot Deal WITHOUT deleting it (homepage then skips it).
update public.cms_items
set data = jsonb_set(data, '{enabled}', 'false', true),
    updated_at = now()
where path = 'collections'
  and item_id = 'hot-deal-1'
returning item_id, data ->> 'enabled' as enabled, updated_at;

-- 7) Show it again.
update public.cms_items
set data = jsonb_set(data, '{enabled}', 'true', true),
    updated_at = now()
where path = 'collections'
  and item_id = 'hot-deal-1'
returning item_id, data ->> 'enabled' as enabled, updated_at;

-- 8) Delete one Hot Deal row (same as the admin "Delete" button).
-- Destructive: run only for the intended item_id.
delete from public.cms_items
where path = 'collections'
  and item_id = 'hot-deal-1'
returning path, item_id;
