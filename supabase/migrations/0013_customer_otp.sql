create table if not exists public.customer_otps (
  email      text        not null,
  otp_hash   text        not null,
  expires_at timestamptz not null,
  attempts   integer     not null default 0,
  created_at timestamptz not null default now(),
  primary key (email)
);

create index if not exists customer_otps_expiry_idx on public.customer_otps (expires_at);

alter table public.customer_otps enable row level security;
-- No public policies: reachable only via the service-role key in /api/customer.
