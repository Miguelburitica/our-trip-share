-- R14 during Liquidando: a money change by a non-admin that would reopen a settled balance waits
-- here for an admin. `proposed` is the expense as it would be; nothing counts until it's approved.
-- Server-only, like the rest of the ledger's writes.
create table public.held_changes (
  id           uuid primary key,
  trip_id      uuid not null references public.trips (id) on delete cascade,
  expense_id   uuid not null,
  kind         text not null check (kind in ('created', 'edited', 'deleted')),
  proposed     jsonb not null,
  base_version integer,
  by_seat      uuid not null references public.seats (id) on delete cascade,
  created_at   timestamptz not null default now()
);
create index held_changes_trip on public.held_changes (trip_id, created_at);

alter table public.held_changes enable row level security;
revoke all on public.held_changes from anon, authenticated;
