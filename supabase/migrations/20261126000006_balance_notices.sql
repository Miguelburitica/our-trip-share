-- "Tu saldo cambió" notices (PRODUCT_SPEC R14; openspec/changes/add-settle-up, task 2.3).
-- The server writes them; each person reads only their own.
create table public.balance_notices (
  id             uuid primary key,
  trip_id        uuid not null references public.trips (id) on delete cascade,
  seat_id        uuid not null references public.seats (id) on delete cascade,
  delta          bigint not null check (delta <> 0),
  expense_id     uuid references public.expenses (id) on delete set null,
  cause_kind     text not null check (cause_kind in ('created', 'edited', 'deleted')),
  cause_title    text check (cause_title is null or length(cause_title) <= 80),
  cause_category text not null,
  by_seat        uuid references public.seats (id) on delete set null,
  created_at     timestamptz not null default now(),
  dismissed_at   timestamptz
);
create index balance_notices_open on public.balance_notices (trip_id, seat_id, created_at desc)
  where dismissed_at is null;

alter table public.balance_notices enable row level security;
create policy balance_notices_select_own on public.balance_notices for select to authenticated
  using (exists (select 1 from public.seats s where s.id = seat_id and s.principal_id = auth.uid()));
revoke insert, update, delete on public.balance_notices from anon, authenticated;
