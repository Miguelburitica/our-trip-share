-- "Compartir resumen" (PRODUCT_SPEC: read-only summary link): anyone with the link sees the trip's
-- totals, balances and who pays whom, without signing in. The server reads it by token with the
-- service role; clients get nothing directly.
create table public.summary_links (
  trip_id    uuid primary key references public.trips (id) on delete cascade,
  token      text not null unique check (char_length(token) >= 24),
  created_at timestamptz not null default now()
);

alter table public.summary_links enable row level security;
revoke all on public.summary_links from anon, authenticated;
