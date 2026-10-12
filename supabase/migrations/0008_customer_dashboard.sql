-- 0008: per-user customer dashboard (unique data + dashboard per user).
-- Run once in Supabase Dashboard > SQL Editor. Safe to re-run.
--
-- DESIGN DECISION (please read): this project does NOT create one physical
-- table per user. A table-per-user design breaks Postgres/PostgREST:
-- thousands of tables, no shared indexes, RLS policies per table, migrations
-- can never run safely, and the Supabase schema cache chokes. Instead each
-- user owns exactly one `customers` row (unique id) and every order, review,
-- and session carries that `user_id` / `customer_id`. "Each unique user has
-- its own unique data + dashboard" is delivered by:
--   1. user_id-scoped queries (GET /api/customer?action=orders|reviews),
--   2. the per-user pages /profile and /orders (session token -> customer id),
--   3. the `customer_dashboard` view below (one row per unique user).

-- Supporting indexes for per-user dashboard lookups.
create index if not exists orders_user_created_idx
  on public.orders (user_id, created_at desc);
create index if not exists reviews_user_updated_idx
  on public.reviews (user_id, updated_at desc);
create index if not exists customer_sessions_customer_expires_idx
  on public.customer_sessions (customer_id, expires_at desc);

-- One dashboard row per unique user: profile + order/review aggregates.
create or replace view public.customer_dashboard as
select
  c.id as customer_id,
  c.name,
  c.email,
  c.phone,
  c.photo,
  c.created_at as joined_at,
  (select count(*) from public.orders o where o.user_id = c.id) as order_count,
  (select coalesce(sum(o.total), 0) from public.orders o where o.user_id = c.id) as total_spent,
  (select count(*) from public.reviews r where r.user_id = c.id) as review_count,
  (select max(o.created_at) from public.orders o where o.user_id = c.id) as last_order_at
from public.customers c;

-- Latest order per user (handy for "track my order" widgets).
create or replace view public.customer_latest_order as
select distinct on (o.user_id)
  o.user_id as customer_id,
  o.id as order_id,
  o.status,
  o.total,
  o.created_at as ordered_at
from public.orders o
where o.user_id is not null
order by o.user_id, o.created_at desc;
