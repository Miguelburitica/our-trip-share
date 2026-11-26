-- Abandoned guests: every opened link signs the visitor in anonymously (no wall, decision 9). Those
-- who never end up in a seat would pile up in auth.users, so a daily job removes them.

-- Deleting a user must never delete a seat. A pending claim is just a request: drop it instead.
alter table public.seats drop constraint seats_pending_principal_id_fkey,
  add constraint seats_pending_principal_id_fkey foreign key (pending_principal_id)
    references auth.users (id) on delete set null;

-- Anonymous users older than p_older_than, not linked to any seat. Their pending requests are
-- withdrawn first, and a seat they created themselves ("No estoy en la lista") goes too if nobody
-- used it. Trip versions are bumped so a concurrent save_trip can't resurrect the request.
create function public.cleanup_abandoned_guests(p_older_than interval default interval '7 days') returns integer
language plpgsql security definer set search_path = public, auth as $$
declare
  v_users uuid[];
  v_trips uuid[];
  v_count integer;
begin
  select coalesce(array_agg(u.id), '{}') into v_users
    from auth.users u
   where u.is_anonymous
     and coalesce(u.last_sign_in_at, u.created_at) < now() - p_older_than
     and not exists (select 1 from public.seats s where s.principal_id = u.id);
  if cardinality(v_users) = 0 then return 0; end if;

  select coalesce(array_agg(distinct trip_id), '{}') into v_trips from public.seats where pending_principal_id = any (v_users);

  delete from public.seats s
   where s.pending_principal_id = any (v_users) and s.created_by is null and s.role = 'member' and s.principal_id is null
     and not exists (select 1 from public.expense_shares x where x.seat_id = s.id)
     and not exists (select 1 from public.expense_payers x where x.seat_id = s.id)
     and not exists (select 1 from public.expenses x where x.created_by = s.id)
     and not exists (select 1 from public.settlements x where s.id in (x.from_seat, x.to_seat, x.recorded_by));
  update public.seats set pending_principal_id = null, pending_kind = null, pending_requested_at = null
   where pending_principal_id = any (v_users);
  update public.trips set version = version + 1 where id = any (v_trips);

  delete from auth.users where id = any (v_users);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.cleanup_abandoned_guests from public, anon, authenticated;
grant execute on function public.cleanup_abandoned_guests to service_role;

-- Daily at 04:30 Bogotá (09:30 UTC) where pg_cron is available; otherwise run it from any scheduler:
--   select public.cleanup_abandoned_guests();
do $$
begin
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.schedule('cleanup-abandoned-guests', '30 9 * * *', 'select public.cleanup_abandoned_guests()');
exception when others then
  raise notice 'pg_cron not available, schedule cleanup_abandoned_guests() elsewhere: %', sqlerrm;
end;
$$;
