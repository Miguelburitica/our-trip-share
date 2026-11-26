-- Bounded context: settlement (openspec/changes/add-settle-up)

create type public.settlement_status as enum ('pending', 'confirmed', 'disputed', 'reversed');

create table public.settlements (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  from_seat   uuid not null references public.seats (id),
  to_seat     uuid not null references public.seats (id),
  amount      bigint not null check (amount > 0),
  currency    text not null check (currency in ('COP','USD','EUR','MXN','BRL','PEN','JPY','KWD')),
  base_amount bigint not null check (base_amount > 0),
  method      text not null check (method in ('cash','breb','nequi','daviplata','bank','paypal','offset')),
  note        text check (note is null or length(note) <= 300),
  recorded_by uuid not null references public.seats (id),
  recorded_at timestamptz not null default now(),
  status      public.settlement_status not null,
  resolved_at timestamptz,
  resolved_by uuid references public.seats (id),
  check (from_seat <> to_seat),
  check (method <> 'offset' or note is not null)
);
create index settlements_trip on public.settlements (trip_id, recorded_at);

-- Frozen plan when a trip enters Liquidando (R9).
create table public.plan_snapshots (
  trip_id         uuid primary key references public.trips (id) on delete cascade,
  frozen_at       timestamptz not null default now(),
  transfers       jsonb not null,
  ledger_balances jsonb not null
);

alter table public.settlements enable row level security;
alter table public.plan_snapshots enable row level security;

create policy settlements_select on public.settlements for select to authenticated
  using (public.is_trip_member(trip_id));
-- Members record what they sent or received; admins may record between others.
create policy settlements_insert on public.settlements for insert to authenticated
  with check (
    public.is_trip_member(trip_id)
    and exists (
      select 1 from public.seats me
       where me.trip_id = settlements.trip_id and me.principal_id = auth.uid() and me.id = settlements.recorded_by
         and (me.id in (settlements.from_seat, settlements.to_seat) or me.role in ('owner', 'admin'))
    )
  );
create policy settlements_update on public.settlements for update to authenticated
  using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

create policy plan_snapshots_select on public.plan_snapshots for select to authenticated
  using (public.is_trip_member(trip_id));
create policy plan_snapshots_write on public.plan_snapshots for all to authenticated
  using (public.is_trip_admin(trip_id)) with check (public.is_trip_admin(trip_id));
