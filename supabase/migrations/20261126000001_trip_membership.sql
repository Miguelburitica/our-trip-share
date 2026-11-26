-- Bounded context: trip-membership (openspec/changes/add-trip-membership)

create type public.trip_status as enum ('active', 'settling', 'closed');
create type public.settle_mode as enum ('simplified', 'hub', 'direct');
create type public.seat_role as enum ('owner', 'admin', 'member');
create type public.seat_status as enum ('active', 'left');
create type public.link_kind as enum ('none', 'guest', 'user');

create table public.trips (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(btrim(name)) between 1 and 80),
  start_date    date,
  end_date      date,
  base_currency text not null check (base_currency in ('COP','USD','EUR','MXN','BRL','PEN','JPY','KWD')),
  status        public.trip_status not null default 'active',
  settle_mode   public.settle_mode not null default 'simplified',
  hub_seat_id   uuid,
  created_at    timestamptz not null default now(),
  check (start_date is null or end_date is null or end_date >= start_date)
);

create table public.seats (
  id                   uuid primary key default gen_random_uuid(),
  trip_id              uuid not null references public.trips (id) on delete cascade,
  display_name         text not null check (length(btrim(display_name)) between 1 and 60),
  role                 public.seat_role not null default 'member',
  status               public.seat_status not null default 'active',
  link_kind            public.link_kind not null default 'none',
  principal_id         uuid references auth.users (id) on delete set null,
  pending_principal_id uuid references auth.users (id) on delete cascade,
  pending_kind         public.link_kind,
  pending_requested_at timestamptz,
  default_excluded     boolean not null default false,
  invite_token_hash    text unique,
  created_by           uuid references public.seats (id) on delete set null,
  created_at           timestamptz not null default now(),
  check ((link_kind = 'none') = (principal_id is null)),
  check (role <> 'owner' or principal_id is not null)
);

-- One principal per trip, one owner per trip, unique names per trip.
create unique index seats_one_principal_per_trip on public.seats (trip_id, principal_id) where principal_id is not null;
create unique index seats_one_pending_per_trip on public.seats (trip_id, pending_principal_id) where pending_principal_id is not null;
create unique index seats_one_owner_per_trip on public.seats (trip_id) where role = 'owner';
create unique index seats_name_per_trip on public.seats (trip_id, lower(btrim(display_name)));
create index seats_principal on public.seats (principal_id);

alter table public.trips
  add constraint trips_hub_seat_fk foreign key (hub_seat_id) references public.seats (id) on delete set null;

-- ---------- membership helpers (security definer: no RLS recursion) ----------

create function public.is_trip_member(p_trip uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.seats where trip_id = p_trip and principal_id = auth.uid());
$$;

create function public.is_trip_admin(p_trip uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.seats
    where trip_id = p_trip and principal_id = auth.uid() and role in ('owner', 'admin')
  );
$$;

create function public.current_link_kind() returns public.link_kind
language sql stable as $$
  select case when coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then 'guest'::public.link_kind
              else 'user'::public.link_kind end;
$$;

-- ---------- RLS ----------

alter table public.trips enable row level security;
alter table public.seats enable row level security;

create policy trips_select on public.trips for select to authenticated using (public.is_trip_member(id));
create policy trips_update on public.trips for update to authenticated
  using (public.is_trip_admin(id)) with check (public.is_trip_admin(id));

create policy seats_select on public.seats for select to authenticated using (public.is_trip_member(trip_id));
create policy seats_insert on public.seats for insert to authenticated
  with check (public.is_trip_member(trip_id) and role = 'member' and principal_id is null);
create policy seats_update on public.seats for update to authenticated
  using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

-- Members may only touch harmless columns directly; linking, roles and tokens go through RPCs.
revoke update on public.seats from authenticated;
grant update (display_name, default_excluded, status) on public.seats to authenticated;
revoke insert, update, delete on public.trips from anon;
revoke insert on public.trips from authenticated;

-- ---------- RPCs ----------

-- Creates a trip, the caller's owner seat and placeholder seats atomically.
create function public.create_trip(
  p_name text,
  p_base_currency text,
  p_display_name text,
  p_people text[] default '{}',
  p_start_date date default null,
  p_end_date date default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_trip uuid;
  v_owner uuid;
  v_name text;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  insert into public.trips (name, base_currency, start_date, end_date)
  values (btrim(p_name), p_base_currency, p_start_date, p_end_date)
  returning id into v_trip;

  insert into public.seats (trip_id, display_name, role, link_kind, principal_id)
  values (v_trip, btrim(p_display_name), 'owner', public.current_link_kind(), auth.uid())
  returning id into v_owner;

  foreach v_name in array coalesce(p_people, '{}') loop
    if length(btrim(v_name)) > 0 then
      insert into public.seats (trip_id, display_name, created_by)
      values (v_trip, btrim(v_name), v_owner)
      on conflict do nothing;
    end if;
  end loop;
  return v_trip;
end;
$$;

-- Personal link: compare-and-set link of the caller to the seat holding this token.
create function public.claim_seat_with_invite(p_token text) returns table (trip_id uuid, seat_id uuid)
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_hash text := encode(extensions.digest(p_token, 'sha256'), 'hex');
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  return query
    update public.seats s
       set principal_id = auth.uid(),
           link_kind = public.current_link_kind(),
           pending_principal_id = null, pending_kind = null, pending_requested_at = null
     where s.invite_token_hash = v_hash
       and (s.principal_id is null or s.principal_id = auth.uid())
    returning s.trip_id, s.id;
  if not found then
    raise exception 'invite invalid or already claimed' using errcode = 'P0001', hint = 'already_claimed';
  end if;
end;
$$;

-- Owner/admin issues a personal invite; re-issuing revokes the previous link.
create function public.issue_seat_invite(p_seat uuid, p_token_hash text) returns void
language plpgsql security definer set search_path = public as $$
declare v_trip uuid;
begin
  select trip_id into v_trip from public.seats where id = p_seat and role <> 'owner';
  if v_trip is null or not public.is_trip_admin(v_trip) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.seats
     set invite_token_hash = p_token_hash, principal_id = null, link_kind = 'none',
         pending_principal_id = null, pending_kind = null, pending_requested_at = null
   where id = p_seat;
end;
$$;

-- Generic link: a pending claim the caller cannot use until approved.
create function public.request_seat_claim(p_seat uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  update public.seats
     set pending_principal_id = auth.uid(), pending_kind = public.current_link_kind(), pending_requested_at = now()
   where id = p_seat and principal_id is null
     and (pending_principal_id is null or pending_principal_id = auth.uid());
  if not found then raise exception 'already claimed' using errcode = 'P0001', hint = 'already_claimed'; end if;
end;
$$;

create function public.approve_seat_claim(p_seat uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_seat public.seats;
begin
  select * into v_seat from public.seats where id = p_seat for update;
  if v_seat.id is null or v_seat.pending_principal_id is null then
    raise exception 'no pending claim' using errcode = 'P0001', hint = 'invalid_state';
  end if;
  if not (public.is_trip_admin(v_seat.trip_id)
          or exists (select 1 from public.seats c where c.id = v_seat.created_by and c.principal_id = auth.uid())) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.seats
     set principal_id = v_seat.pending_principal_id, link_kind = v_seat.pending_kind,
         pending_principal_id = null, pending_kind = null, pending_requested_at = null
   where id = p_seat and principal_id is null;
  if not found then raise exception 'already claimed' using errcode = 'P0001', hint = 'already_claimed'; end if;
end;
$$;

-- Anonymous visitors on the generic link only see first names of unclaimed seats.
create function public.trip_unclaimed_first_names(p_trip uuid) returns table (seat_id uuid, first_name text)
language sql stable security definer set search_path = public as $$
  select id, split_part(btrim(display_name), ' ', 1)
    from public.seats where trip_id = p_trip and principal_id is null and status = 'active'
   order by created_at;
$$;

grant execute on function public.create_trip, public.claim_seat_with_invite, public.issue_seat_invite,
  public.request_seat_claim, public.approve_seat_claim, public.trip_unclaimed_first_names to authenticated;
