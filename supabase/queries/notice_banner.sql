-- ================================================================
-- Notice Banner queries — Homepage CMS › Notice Banner
--
-- CMS path shared by BOTH the admin editor and Header.tsx:
--   path = 'homepage/noticeBanners/items'
-- Admin saves via:  PUT /api/admin?action=cms
-- Header reads via: GET /api/storefront?action=notice&path=homepage/noticeBanners/items
--
-- How to run: Supabase Dashboard > SQL Editor > New query >
-- paste ONE numbered block at a time > Run.
-- Blocks 0–4 are read-only. Blocks 5–8 write, but only to the notice path
-- above; every other cms_items row is untouched.
-- ================================================================

-- 0) Confirm the exact table/shape the API code expects.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'cms_items'
order by ordinal_position;
-- Expect: path text, item_id text, data jsonb, updated_at timestamptz,
-- with primary key (path, item_id).

-- 1) Confirm RLS + the public SELECT policy the Header fetch depends on.
select tablename, rowsecurity as rls_enabled
from pg_tables
where schemaname = 'public' and tablename = 'cms_items';

select policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public' and tablename = 'cms_items';
-- Expect a SELECT policy whose `qual` is `true`, so anonymous storefront
-- requests can read notice rows (admin writes still use the service key
-- through /api/admin).

-- 2) See exactly what Header.tsx will fetch (newest first).
select item_id,
       updated_at,
       data ->> 'enabled'     as enabled,
       data ->> 'message'     as message,
       data ->> 'title'       as title,
       data ->> 'countdownTo' as countdown_to
from public.cms_items
where path = 'homepage/noticeBanners/items'
order by updated_at desc;

-- 3) Same row shape the public API returns for the header.
select item_id as id, data
from public.cms_items
where path = 'homepage/noticeBanners/items';

-- 4) Newest non-disabled candidate — what the header prefers.
-- (Header.tsx shows `message`, falling back to `title`, plus a live
-- `XX days, XX hrs, XX min` countdown from `countdownTo`. When no enabled
-- row matches, the header banner stays hidden.)
select item_id as id,
       coalesce(nullif(data ->> 'message', ''), data ->> 'title', '') as display_text,
       updated_at
from public.cms_items
where path = 'homepage/noticeBanners/items'
  and coalesce(data ->> 'enabled', 'true') <> 'false'
order by updated_at desc
limit 1;

-- 5) Create/replace the notice the header shows.
-- Same write the CMS "Save changes" button performs. Edit the values,
-- keep path/item_id, then Run. `countdownTo` is the only timing field and
-- Header renders it live as `XX days, XX hrs, XX min`.
insert into public.cms_items (path, item_id, data, updated_at)
values (
  'homepage/noticeBanners/items',
  'main-notice',
  jsonb_build_object(
    'id', 'main-notice',
    'title', 'Summer Sale',
    'message', 'Get 50% Off This Summer Sale. Grab It Fast!',
    'countdownTo', (now() + interval '3 days')::text,
    'enabled', true
  ),
  now()
)
on conflict (path, item_id)
do update set data = excluded.data, updated_at = now()
returning path, item_id, updated_at, data ->> 'message' as message;

-- 6) Hide the banner WITHOUT deleting it (Header then hides the banner).
update public.cms_items
set data = jsonb_set(data, '{enabled}', 'false', true),
    updated_at = now()
where path = 'homepage/noticeBanners/items'
  and item_id = 'main-notice'
returning item_id, data ->> 'enabled' as enabled, updated_at;

-- 7) Show it again.
update public.cms_items
set data = jsonb_set(data, '{enabled}', 'true', true),
    updated_at = now()
where path = 'homepage/noticeBanners/items'
  and item_id = 'main-notice'
returning item_id, data ->> 'enabled' as enabled, updated_at;

-- 8) Delete one notice row (same as the admin "Delete" button).
-- Destructive: run only for the intended item_id.
delete from public.cms_items
where path = 'homepage/noticeBanners/items'
  and item_id = 'main-notice'
returning path, item_id;
