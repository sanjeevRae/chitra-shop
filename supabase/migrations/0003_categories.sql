-- Supabase Postgres: dedicated `public.category` table for Shop by Category.
-- Run in Supabase Dashboard > SQL Editor > New query > paste > Run.
-- Fields: id (TEXT PK), name (TEXT), text (TEXT description/tagline),
-- image (TEXT), enabled (BOOLEAN show/hide).

create table if not exists public.category (
  id text primary key,
  name text not null,
  text text not null default '',
  image text not null default '',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Idempotent: add `text` when the table already exists from an older migration.
alter table public.category add column if not exists text text not null default '';
alter table public.category add column if not exists image text not null default '';
alter table public.category add column if not exists enabled boolean not null default true;
alter table public.category add column if not exists created_at timestamptz not null default now();
alter table public.category add column if not exists updated_at timestamptz not null default now();

alter table public.category enable row level security;

-- Public storefront can read enabled categories only.
drop policy if exists "Storefront can read categories" on public.category;
create policy "Storefront can read categories"
on public.category for select using (enabled = true);

create index if not exists category_name_idx on public.category (name);
