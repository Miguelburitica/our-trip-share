-- Liquidando & Cerrado (PRODUCT_SPEC §6.6).

-- "Revisa tu parte": each person's answer once the trip is Liquidando. A question is private to the
-- person who asked and the trip's admins, so through the API a member reads only their own. The
-- server writes and shows admins the questions.
create table public.share_reviews (
  seat_id    uuid primary key references public.seats (id) on delete cascade,
  trip_id    uuid not null references public.trips (id) on delete cascade,
  status     text not null check (status in ('ok', 'question')),
  note       text check (char_length(note) <= 280),
  updated_at timestamptz not null default now(),
  check ((status = 'question') = (note is not null))
);
create index share_reviews_trip on public.share_reviews (trip_id);

alter table public.share_reviews enable row level security;
create policy share_reviews_select_own on public.share_reviews for select to authenticated
  using (exists (select 1 from public.seats s where s.id = seat_id and s.principal_id = auth.uid()));
revoke insert, update, delete on public.share_reviews from anon, authenticated;

-- The frozen plan is the server's to write, like everything else (decision 10).
drop policy plan_snapshots_write on public.plan_snapshots;
revoke insert, update, delete on public.plan_snapshots from anon, authenticated;
