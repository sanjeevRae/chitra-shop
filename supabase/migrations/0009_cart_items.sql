-- 0009: persistent cart for logged-in customers.
-- Run once in Supabase Dashboard > SQL Editor. Safe to re-run.
--
-- Design notes:
-- - One row per (customer_id, product_id); qty is the source of truth.
-- - RLS enabled with NO public policies: browsers reach this table only
--   through /api/customer?action=cart with SUPABASE_SERVICE_ROLE_KEY
--   (same pattern as customers / customer_sessions / reviews).
-- - Guest carts stay in localStorage; on login the client merges them once.

create table if not exists public.cart_items (
  customer_id text not null references public.customers (id) on delete cascade,
  product_id text not null,
  qty integer not null default 1 check (qty >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (customer_id, product_id)
);

create index if not exists cart_items_customer_idx
  on public.cart_items (customer_id);
create index if not exists cart_items_updated_idx
  on public.cart_items (updated_at desc);

alter table public.cart_items enable row level security;

-- No public policies by design: browsers reach this table only through
-- /api/customer (service-role key), never with the anon key.
