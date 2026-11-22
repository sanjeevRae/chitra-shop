-- 0015: password reset tokens for forgot-password / reset-password flow.
-- Run once in Supabase Dashboard > SQL Editor. Safe to re-run.
--
-- Design:
-- - One row per email (primary key = email) to prevent token spam.
-- - token_hash stores ONLY sha256 of the raw token; the raw token is emailed
--   to the user and never stored.
-- - expires_at is 15 minutes after creation.
-- - used flag marks the token as consumed after a successful reset.
-- - RLS enabled with NO public policies: reachable only via service-role key
--   in /api/customer (same pattern as customers / customer_sessions).

create table if not exists public.password_reset_tokens (
  email      text primary key,
  token_hash text not null,
  expires_at timestamptz not null,
  used       boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_tokens_expiry_idx
  on public.password_reset_tokens (expires_at);

alter table public.password_reset_tokens enable row level security;

-- No public policies: browsers reach this table only through
-- /api/customer (service-role key), never with the anon key.
