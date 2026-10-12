-- 0010: admin login hardening — role check + dedicated admin sessions.
-- Run once in Supabase Dashboard > SQL Editor. Safe to re-run.
--
-- What this does:
-- 1. Widens public.customers.method to allow 'admin' so staff accounts can be
--    created with the SAME email/password storage (scrypt hash, no plaintext).
-- 2. Widens the role check (was implicitly free-text; now explicit) so only
--    'customer' and 'admin' exist — no stray roles that could confuse gates.
-- 3. Adds public.admin_sessions (12-hour opaque session tokens, sha256 of the
--    secret only). Separate from customer_sessions so admin auth NEVER shares
--    state with the storefront cart/orders flow.
-- 4. Enables RLS on admin_sessions with NO public policies: browsers reach it
--    only through /api/admin (service-role key), same pattern as 0007.
-- 5. Seeds NOTHING: create your first admin via the API bootstrap (see below).

do $$
begin
  alter table public.customers drop constraint if exists customers_method_check;
  alter table public.customers
    add constraint customers_method_check check (method in ('email', 'phone', 'admin'));
exception when others then
  null;
end $$;

do $$
begin
  alter table public.customers drop constraint if exists customers_role_check;
  alter table public.customers
    add constraint customers_role_check check (role in ('customer', 'admin'));
exception when others then
  null;
end $$;

create table if not exists public.admin_sessions (
  id text primary key,
  customer_id text not null references public.customers (id) on delete cascade,
  secret_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '12 hours'
);

create index if not exists admin_sessions_customer_idx
  on public.admin_sessions (customer_id);
create index if not exists admin_sessions_expires_idx
  on public.admin_sessions (expires_at);

-- Purge expired sessions opportunistically (runs on every insert of a session;
-- cheap index range delete, keeps the table small).
create or replace function public.purge_expired_admin_sessions()
returns trigger
language plpgsql
as $func$
begin
  delete from public.admin_sessions where expires_at < now();
  return new;
end;
$func$;

drop trigger if exists purge_expired_admin_sessions on public.admin_sessions;
create trigger purge_expired_admin_sessions
  after insert on public.admin_sessions
  execute function public.purge_expired_admin_sessions();

alter table public.admin_sessions enable row level security;

-- No public policies by design: browsers reach this table only through
-- /api/admin (service-role key), never with the anon key.
