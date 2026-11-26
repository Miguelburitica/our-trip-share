-- Saved split groups for quick add ("Carro 1", "Parejas"), shared by the trip
-- (openspec/changes/add-expense-ledger, task 5.1). The server writes them; members can read them.
create table public.split_groups (
  id         uuid primary key,
  trip_id    uuid not null references public.trips (id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 30),
  seat_ids   uuid[] not null check (cardinality(seat_ids) >= 2),
  created_by uuid not null references public.seats (id),
  created_at timestamptz not null default now()
);
create unique index split_groups_name_per_trip on public.split_groups (trip_id, lower(btrim(name)));

alter table public.split_groups enable row level security;
create policy split_groups_select on public.split_groups for select to authenticated
  using (public.is_trip_member(trip_id));
revoke insert, update, delete on public.split_groups from anon, authenticated;
