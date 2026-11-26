-- Server-side repositories (docs/ARCHITECTURE.md, "Persistence").
-- The app server is the only writer: it loads an aggregate, lets the domain decide, and saves the
-- whole aggregate with the service role, guarded by an optimistic version. RLS and the column grants
-- from the earlier migrations keep guarding any direct client access with the publishable key.

-- ---------- trip aggregate: version + stable seat order ----------
alter table public.trips add column version integer not null default 0 check (version >= 0);
alter table public.seats add column position smallint not null default 0;

-- Seats reference seats (created_by) and trips reference seats (hub): check at commit so a whole
-- aggregate can be written in any order.
alter table public.seats drop constraint seats_created_by_fkey,
  add constraint seats_created_by_fkey foreign key (created_by) references public.seats (id)
    on delete set null deferrable initially deferred;
alter table public.trips drop constraint trips_hub_seat_fk,
  add constraint trips_hub_seat_fk foreign key (hub_seat_id) references public.seats (id)
    on delete set null deferrable initially deferred;

-- p_trip: trips columns (snake_case) plus "seats": an array of seats columns.
-- p_expected_version: null to insert. Returns the new version.
create function public.save_trip(p_trip jsonb, p_expected_version integer) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid := (p_trip ->> 'id')::uuid;
  v_current integer;
  v_next integer;
begin
  select version into v_current from public.trips where id = v_id for update;
  if v_current is null and p_expected_version is not null then
    raise exception 'trip not found' using errcode = 'P0002';
  end if;
  if v_current is not null and (p_expected_version is null or v_current <> p_expected_version) then
    raise exception 'trip version conflict' using errcode = '40001', hint = 'conflict';
  end if;
  v_next := coalesce(v_current + 1, 0);

  insert into public.trips as t (id, name, start_date, end_date, base_currency, status, settle_mode, hub_seat_id,
                                 created_at, version)
  select v_id, r.name, r.start_date, r.end_date, r.base_currency, r.status, r.settle_mode, r.hub_seat_id,
         coalesce(r.created_at, now()), v_next
    from jsonb_populate_record(null::public.trips, p_trip) r
  on conflict (id) do update set
    name = excluded.name, start_date = excluded.start_date, end_date = excluded.end_date,
    base_currency = excluded.base_currency, status = excluded.status, settle_mode = excluded.settle_mode,
    hub_seat_id = excluded.hub_seat_id, version = excluded.version;

  delete from public.seats s
   where s.trip_id = v_id
     and s.id not in (select (x ->> 'id')::uuid from jsonb_array_elements(coalesce(p_trip -> 'seats', '[]')) x);

  -- Unique indexes are checked row by row: write demotions and unlinks before promotions and links.
  insert into public.seats as s (id, trip_id, display_name, role, status, link_kind, principal_id,
                                 pending_principal_id, pending_kind, pending_requested_at, default_excluded,
                                 invite_token_hash, created_by, position)
  select r.id, v_id, r.display_name, r.role, r.status, r.link_kind, r.principal_id, r.pending_principal_id,
         r.pending_kind, r.pending_requested_at, r.default_excluded, r.invite_token_hash, r.created_by, r.position
    from jsonb_populate_recordset(null::public.seats, coalesce(p_trip -> 'seats', '[]')) r
   order by (r.role = 'owner'), (r.principal_id is not null), (r.pending_principal_id is not null)
  on conflict (id) do update set
    display_name = excluded.display_name, role = excluded.role, status = excluded.status,
    link_kind = excluded.link_kind, principal_id = excluded.principal_id,
    pending_principal_id = excluded.pending_principal_id, pending_kind = excluded.pending_kind,
    pending_requested_at = excluded.pending_requested_at, default_excluded = excluded.default_excluded,
    invite_token_hash = excluded.invite_token_hash, created_by = excluded.created_by, position = excluded.position;

  return v_next;
end;
$$;

-- ---------- expense aggregate: stable row order + full history ----------
alter table public.expense_payers add column position smallint not null default 0;
alter table public.expense_shares add column position smallint not null default 0;
alter table public.expense_changes add column summary text check (summary is null or length(summary) <= 200);

-- Same contract as before, plus: rows keep their order, and "changes" appends several history entries.
create or replace function public.save_expense(p_expense jsonb, p_expected_version integer) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid := (p_expense ->> 'id')::uuid;
  v_current integer;
begin
  select money_version into v_current from public.expenses where id = v_id for update;
  if v_current is null and p_expected_version is not null then
    raise exception 'expense not found' using errcode = 'P0002';
  end if;
  if v_current is not null and (p_expected_version is null or v_current <> p_expected_version) then
    raise exception 'money version conflict' using errcode = '40001', hint = 'conflict';
  end if;

  insert into public.expenses as x (id, trip_id, type, status, category, title, notes, occurred_at, currency, amount,
                         fx_rate, fx_source, base_amount, split_method, money_version, receipt_paths, created_by,
                         created_at, updated_at)
  select v_id, r.trip_id, coalesce(r.type, 'expense'), r.status, coalesce(r.category, 'otro'), r.title, r.notes,
         r.occurred_at, r.currency, r.amount, r.fx_rate, r.fx_source, r.base_amount, r.split_method, r.money_version,
         coalesce(r.receipt_paths, '{}'), r.created_by, coalesce(r.created_at, now()), coalesce(r.updated_at, now())
    from jsonb_populate_record(null::public.expenses, p_expense) r
  on conflict (id) do update set
    type = excluded.type, status = excluded.status, category = excluded.category, title = excluded.title,
    notes = excluded.notes, occurred_at = excluded.occurred_at, currency = excluded.currency,
    amount = excluded.amount, fx_rate = excluded.fx_rate, fx_source = excluded.fx_source,
    base_amount = excluded.base_amount, split_method = excluded.split_method,
    money_version = excluded.money_version, receipt_paths = excluded.receipt_paths, updated_at = excluded.updated_at;

  delete from public.expense_payers where expense_id = v_id;
  delete from public.expense_shares where expense_id = v_id;
  insert into public.expense_payers (expense_id, seat_id, amount, base_amount, position)
    select v_id, (p ->> 'seat_id')::uuid, (p ->> 'amount')::bigint, (p ->> 'base_amount')::bigint, i - 1
      from jsonb_array_elements(coalesce(p_expense -> 'payers', '[]')) with ordinality as a (p, i);
  insert into public.expense_shares (expense_id, seat_id, amount, base_amount, position)
    select v_id, (s ->> 'seat_id')::uuid, (s ->> 'amount')::bigint, (s ->> 'base_amount')::bigint, i - 1
      from jsonb_array_elements(coalesce(p_expense -> 'shares', '[]')) with ordinality as a (s, i);

  insert into public.expense_changes (expense_id, at, by_seat, kind, money_version, summary)
    select v_id, coalesce((c ->> 'at')::timestamptz, now()), (c ->> 'by_seat')::uuid, c ->> 'kind',
           coalesce((c ->> 'money_version')::integer, (p_expense ->> 'money_version')::integer), c ->> 'summary'
      from jsonb_array_elements(
             coalesce(p_expense -> 'changes', case when p_expense ? 'change' then jsonb_build_array(p_expense -> 'change') end, '[]')
           ) c;
end;
$$;

-- ---------- grants ----------
-- save_trip writes linking and role columns, so only the server (service role) may call it.
revoke execute on function public.save_trip from public, anon, authenticated;
grant execute on function public.save_trip to service_role;
grant execute on function public.save_expense to service_role;
