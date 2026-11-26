-- "Cómo me pagan" (PRODUCT_SPEC §6.7): Bre-B key, Nequi/Daviplata number, bank, PayPal.me.
-- Private: the app shows them only to members who owe that person in the current plan; directly
-- through the API a member can read only their own. The server writes.
create table public.payout_handles (
  seat_id    uuid primary key references public.seats (id) on delete cascade,
  trip_id    uuid not null references public.trips (id) on delete cascade,
  handles    jsonb not null default '[]' check (jsonb_typeof(handles) = 'array' and jsonb_array_length(handles) <= 4),
  updated_at timestamptz not null default now()
);
create index payout_handles_trip on public.payout_handles (trip_id);

alter table public.payout_handles enable row level security;
create policy payout_handles_select_own on public.payout_handles for select to authenticated
  using (exists (select 1 from public.seats s where s.id = seat_id and s.principal_id = auth.uid()));
revoke insert, update, delete on public.payout_handles from anon, authenticated;
