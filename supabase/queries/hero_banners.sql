-- Hero banners for the homepage hero (app/page.tsx line ~192, Supabase `herobanner`).
-- Run in Supabase Dashboard > SQL Editor. Safe to re-run (upsert by id).
--
-- Slots used by the frontend (first 4 by position):
--   hero-main   -> big left tile (image + eyebrow + title + subtitle + button)
--   hero-side-1 -> top middle tile (eyebrow + title + image, whole tile links)
--   hero-side-2 -> bottom middle tile (same shape)
--   hero-wide   -> right tile (eyebrow + title + image, whole tile links)
-- Admin edits the same fields at: Admin > Content (CMS) > Hero Banners
-- (path 'herobanners' -> PUT /api/admin?action=cms).
-- Homepage reads: GET /api/storefront?action=hero&path=herobanners.

-- 0) Confirm the exact table/shape the API code expects.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'herobanner'
order by ordinal_position;

-- 1) Confirm RLS + the public SELECT policy the homepage fetch needs.
select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'herobanner';

-- 2) List all hero banners in display order (admin view).
select id, position, enabled, eyebrow, title, subtitle, image, button_label, button_href, tone
from public.herobanner
order by position asc, id asc;

-- 3) What the homepage renders: enabled banners in display order.
select id, eyebrow, title, subtitle, image, button_label, button_href, tone
from public.herobanner
where enabled = true
order by position asc, id asc;

-- 4) Seed/replace the 4 current hero tiles (same content as the UI placeholder).
insert into public.herobanner
  (id, eyebrow, title, subtitle, image, button_label, button_href, tone, position, enabled)
values
  ('hero-main', 'Just Launched', 'Immersive VR Experience',
   'Feel every detail with smooth motion, clear visuals, and total comfort.',
   '/images/hero/image-1.jpg', 'Discover Collection', '/product', '', 0, true),
  ('hero-side-1', 'Just Launched', 'Style That Moves With You', '',
   '/images/hero/image-2.png', '', '/product', 'bg-indigo-500/10', 1, true),
  ('hero-side-2', 'Tablet', 'A Bigger Screen for Bigger Ideas', '',
   '/images/hero/image-3.png', '', '/product', 'bg-sky-500/10', 2, true),
  ('hero-wide', 'Smartphone', 'Power and Performance Designed for Everyday Use', '',
   '/images/hero/image-4.png', '', '/product', 'bg-blue-500/10', 3, true)
on conflict (id) do update set
  eyebrow = excluded.eyebrow,
  title = excluded.title,
  subtitle = excluded.subtitle,
  image = excluded.image,
  button_label = excluded.button_label,
  button_href = excluded.button_href,
  tone = excluded.tone,
  position = excluded.position,
  enabled = excluded.enabled,
  updated_at = now();

-- 5) Edit one tile's text/buttons (example: change the main CTA link).
-- update public.herobanner
-- set title = 'New Season Collection',
--     button_label = 'Shop Now',
--     button_href = '/product?category=audio-equipment',
--     updated_at = now()
-- where id = 'hero-main';

-- 6) Hide one tile without deleting (homepage skips disabled rows).
-- update public.herobanner set enabled = false, updated_at = now()
-- where id = 'hero-wide';

-- 7) Show it again.
-- update public.herobanner set enabled = true, updated_at = now()
-- where id = 'hero-wide';

-- 8) Delete one tile (same as admin Delete).
-- delete from public.herobanner where id = 'hero-wide';
