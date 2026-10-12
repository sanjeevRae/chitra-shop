-- 0007: customer accounts for the /profile port (SAUD ProfileDashboard).
-- Run once in Supabase Dashboard > SQL Editor. Safe to re-run.
--
-- Design notes:
-- - email is UNIQUE (case-insensitive via lower()), phone is indexed but NOT
--   unique (households share numbers; SAUD's own normalizer collides on purpose).
-- - password_hash stores ONLY scrypt hashes (salt:key hex). Plaintext passwords
--   are rejected by the API layer, never stored.
-- - customer_sessions stores sha256(session_secret); the raw secret is only
--   ever in the client's localStorage. Sessions carry an expiry.
-- - RLS is enabled on all three new tables with NO public policies: every read
--   and write goes through /api/customer with SUPABASE_SERVICE_ROLE_KEY
--   (same pattern as /api/admin).
-- - Existing `public.orders` (0001) stays the source of truth for orders; this
--   migration only adds `user_id` normalisation via index (the column exists).
-- - `public.reviews` is new, keyed (user_id, product_id) like SAUD's
--   `<userId>_<productId>` Firestore doc ids.
-- - Public product reviews stay in `public.product.reviews` (storefront JSON);
--   this table is the per-customer review history editable from /profile.

create table if not exists public.customers (
  id text primary key,
  method text not null default 'email' check (method in ('email', 'phone')),
  role text not null default 'customer',
  name text not null default '',
  email text,
  phone text,
  photo text not null default '',
  address text not null default '',
  city text not null default '',
  area text not null default '',
  landmark text not null default '',
  password_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upgrade path for databases created before this revision: drop the removed
-- google_sub column and widen/narrow the method check back to email/phone.
do $$
begin
  alter table public.customers drop column if exists google_sub;
  alter table public.customers drop constraint if exists customers_method_check;
  alter table public.customers
    add constraint customers_method_check check (method in ('email', 'phone'));
exception when others then
  null;
end $$;

-- Case-insensitive email uniqueness without blocking NULLs (two NULLs allowed).
create unique index if not exists customers_email_unique_idx
  on public.customers (lower(email)) where email is not null;

create index if not exists customers_phone_idx on public.customers (phone);
create index if not exists customers_updated_idx on public.customers (updated_at desc);

create table if not exists public.customer_sessions (
  id text primary key,
  customer_id text not null references public.customers (id) on delete cascade,
  secret_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);

create index if not exists customer_sessions_customer_idx
  on public.customer_sessions (customer_id);
create index if not exists customer_sessions_expires_idx
  on public.customer_sessions (expires_at);

create table if not exists public.reviews (
  id text primary key,
  user_id text not null,
  user_name text not null default '',
  user_photo text not null default '',
  product_id text not null,
  product_name text not null default '',
  rating integer not null default 5 check (rating >= 1 and rating <= 5),
  text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create index if not exists reviews_user_idx on public.reviews (user_id);
create index if not exists reviews_product_idx on public.reviews (product_id);
create index if not exists reviews_updated_idx on public.reviews (updated_at desc);

-- Orders: the user_id column exists from 0001; index it for per-customer lookup.
create index if not exists orders_user_idx on public.orders (user_id);

alter table public.customers enable row level security;
alter table public.customer_sessions enable row level security;
alter table public.reviews enable row level security;

-- No public policies by design: browsers reach these tables only through
-- /api/customer (service-role key), never with the anon key.
