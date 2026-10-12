-- 0006: dedicated herobanner table for the homepage hero (line ~192).
-- Run once in Supabase Dashboard > SQL Editor. Safe to re-run.
-- Slots: hero-main (big VR tile), hero-side-1, hero-side-2 (indigo/sky tiles),
-- hero-wide (blue smartphone tile). Admin edits image/text/buttons per slot.
create table if not exists public.herobanner (
  id text primary key,
  eyebrow text not null default '',
  title text not null default '',
  subtitle text not null default '',
  image text not null default '',
  button_label text not null default '',
  button_href text not null default '/product',
  tone text not null default '',
  position integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.herobanner enable row level security;

drop policy if exists "Storefront can read herobanner" on public.herobanner;
create policy "Storefront can read herobanner"
on public.herobanner for select using (enabled = true);

create index if not exists herobanner_position_idx on public.herobanner (position);

-- Extra hero-main slides (JSONB array of {image,eyebrow,title,subtitle,buttonLabel,buttonHref}).
-- hero-main rotates left through main tile + these extras. Other slots ignore it.
alter table public.herobanner add column if not exists slides jsonb not null default '[]';
