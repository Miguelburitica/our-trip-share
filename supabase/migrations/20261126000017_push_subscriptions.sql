-- Web Push (PRODUCT_SPEC §6.9): one row per device that turned on "Avisos". The server sends with
-- the service role; clients never read endpoints or keys. A user deleted (abandoned guest) takes
-- their devices with them.
create table public.push_subscriptions (
  endpoint     text primary key check (endpoint like 'https://%'),
  p256dh       text not null,
  auth         text not null,
  principal_id uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now()
);
create index push_subscriptions_principal on public.push_subscriptions (principal_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
