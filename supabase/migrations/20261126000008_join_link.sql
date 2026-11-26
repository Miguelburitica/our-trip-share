-- Generic join link (QR) and personal-link recovery (openspec/changes/add-trip-membership).
-- The trip keeps its generic link's token in clear: it's meant to be shown again (QR, group chat), and
-- it only lets someone *ask* for a seat, which an admin must approve. Personal links stay hashed.
alter table public.trips add column join_token text unique check (join_token is null or length(join_token) >= 20);

create or replace function public.save_trip(p_trip jsonb, p_expected_version integer) returns integer
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
                                 join_token, created_at, version)
  select v_id, r.name, r.start_date, r.end_date, r.base_currency, r.status, r.settle_mode, r.hub_seat_id,
         r.join_token, coalesce(r.created_at, now()), v_next
    from jsonb_populate_record(null::public.trips, p_trip) r
  on conflict (id) do update set
    name = excluded.name, start_date = excluded.start_date, end_date = excluded.end_date,
    base_currency = excluded.base_currency, status = excluded.status, settle_mode = excluded.settle_mode,
    hub_seat_id = excluded.hub_seat_id, join_token = excluded.join_token, version = excluded.version;

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

-- The server is the only writer (decision 8): these client-callable RPCs from the first migration
-- linked and invited seats directly, bypassing the domain's rules (recovery, one-time links,
-- approval). Members keep reading through RLS; writes go through the app.
revoke execute on function public.create_trip, public.claim_seat_with_invite, public.issue_seat_invite,
  public.request_seat_claim, public.approve_seat_claim from authenticated, anon, public;
