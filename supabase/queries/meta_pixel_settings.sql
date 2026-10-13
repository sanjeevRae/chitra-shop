-- Meta Pixel settings seed (optional — the dashboard's PUT upserts this row).
-- The storefront reads it via GET /api/storefront?action=tracking and the
-- admin reads/writes it via GET/PUT /api/admin?action=tracking (admin-gated).
-- The Pixel ID is public configuration, so it shares the storefront-readable
-- cms_items table. NEVER store a Conversions API access token in this row —
-- tokens stay server-side only (a separate restricted table + CAPI route).
insert into public.cms_items (path, item_id, data, updated_at) values
  ('settings', 'meta-pixel', '{"pixelId": "", "enabled": false}'::jsonb, now())
on conflict (path, item_id) do nothing;

-- Verify what the storefront serves:
-- select data from public.cms_items where path = 'settings' and item_id = 'meta-pixel';
