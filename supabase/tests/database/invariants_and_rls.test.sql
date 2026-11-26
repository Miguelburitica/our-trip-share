begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

-- Principals: Mateo (account), Juli (guest), a stranger.
insert into auth.users (id, aud, role, email, is_anonymous) values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'mateo@test.local', false),
  ('00000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', null, true),
  ('00000000-0000-0000-0000-0000000000a3', 'authenticated', 'authenticated', 'stranger@test.local', false);

create function pg_temp.act_as(p_uid text, p_anon boolean default false) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'is_anonymous', p_anon)::text, true);
$$;

set local role authenticated;

-- ---------- trip membership ----------
-- Seats are linked by the app server (decision 8); members can't call the linking RPCs themselves.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.create_trip('X', 'COP', 'Mateo', array[]::text[]) $$,
  '42501', null, 'members cannot create trips directly');
reset role;
select lives_ok($$ select public.create_trip('Cartagena', 'COP', 'Mateo', array['Ana', 'Juli', ' ana ']) $$,
  'the server creates Cartagena for Mateo');
select lives_ok($$
  select public.issue_seat_invite(
    (select id from public.seats where display_name = 'Juli'
        and trip_id = (select trip_id from public.seats where principal_id = '00000000-0000-0000-0000-0000000000a1')),
    encode(extensions.digest('tok-juli', 'sha256'), 'hex'))
$$, 'the server issues a personal invite for Juli');
set local role authenticated;
select is((select count(*)::int from public.seats), 3, 'duplicate names are skipped: Mateo, Ana, Juli');
select is((select role::text from public.seats where display_name = 'Mateo'), 'owner', 'creator is owner');

-- Juli (guest) opens her personal link.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2', true);
select is((select count(*)::int from public.trips), 0, 'before claiming, Juli sees no trip');
select throws_ok($$ select * from public.claim_seat_with_invite('tok-juli') $$, '42501', null,
  'members cannot claim seats directly');
reset role;
select lives_ok($$ select * from public.claim_seat_with_invite('tok-juli') $$, 'the server links Juli to her seat');
set local role authenticated;
select is((select link_kind::text from public.seats where display_name = 'Juli'), 'guest', 'linked as guest');
select throws_ok($$ update public.seats set principal_id = auth.uid() where display_name = 'Ana' $$,
  '42501', null, 'members cannot rewrite who holds a seat');

-- The stranger reuses Juli's token and tries the generic link.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
reset role;
select throws_ok($$ select * from public.claim_seat_with_invite('tok-juli') $$,
  'P0001', null, 'a claimed personal link cannot be reused');
set local role authenticated;
select is((select count(*)::int from public.trip_unclaimed_first_names(
  (select trip_id from public.seats where id = (select seat_id from public.trip_unclaimed_first_names(
     (select id from public.trips limit 1)) limit 1)))), 0, 'stranger cannot even resolve trip ids it cannot see');
select is((select count(*)::int from public.seats), 0, 'stranger sees no seats');

-- ---------- expense ledger ----------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$
  select public.save_expense(jsonb_build_object(
    'id', '10000000-0000-0000-0000-000000000001',
    'trip_id', (select id from public.trips where name = 'Cartagena'),
    'type', 'expense', 'status', 'complete', 'category', 'comida', 'title', 'Cena',
    'occurred_at', now(), 'currency', 'COP', 'amount', 540000, 'fx_rate', 1, 'fx_source', 'same_currency',
    'base_amount', 540000, 'split_method', 'equal', 'money_version', 1,
    'created_by', (select id from public.seats where display_name = 'Mateo'),
    'payers', jsonb_build_array(jsonb_build_object('seat_id', (select id from public.seats where display_name = 'Mateo'), 'amount', 540000, 'base_amount', 540000)),
    'shares', (select jsonb_agg(jsonb_build_object('seat_id', id, 'amount', 180000, 'base_amount', 180000)) from public.seats),
    'change', jsonb_build_object('kind', 'created', 'by_seat', (select id from public.seats where display_name = 'Mateo'))
  ), null);
  set constraints all immediate;
$$, 'a balanced expense is saved atomically');

select throws_ok($$
  select public.save_expense(jsonb_build_object(
    'id', '10000000-0000-0000-0000-000000000001',
    'trip_id', (select id from public.trips where name = 'Cartagena'),
    'type', 'expense', 'status', 'complete', 'category', 'comida', 'occurred_at', now(),
    'currency', 'COP', 'amount', 600000, 'split_method', 'equal', 'money_version', 2,
    'created_by', (select id from public.seats where display_name = 'Mateo')
  ), 0)
$$, '40001', null, 'a stale money version is a conflict');

select throws_ok($$
  do $x$ begin
    perform public.save_expense(jsonb_build_object(
      'id', '10000000-0000-0000-0000-000000000002',
      'trip_id', (select id from public.trips where name = 'Cartagena'),
      'type', 'expense', 'status', 'complete', 'occurred_at', now(),
      'currency', 'COP', 'amount', 100000, 'base_amount', 100000, 'split_method', 'exact', 'money_version', 1,
      'created_by', (select id from public.seats where display_name = 'Mateo'),
      'payers', jsonb_build_array(jsonb_build_object('seat_id', (select id from public.seats where display_name = 'Mateo'), 'amount', 100000, 'base_amount', 100000)),
      'shares', jsonb_build_array(jsonb_build_object('seat_id', (select id from public.seats where display_name = 'Ana'), 'amount', 90000, 'base_amount', 90000))
    ), null);
    set constraints all immediate;
  end $x$
$$, '23514', null, 'shares that do not sum to the amount are rejected by Postgres');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2', true);
select is((select count(*)::int from public.expenses), 1, 'Juli (guest member) sees the trip expense');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select is((select count(*)::int from public.expenses), 0, 'stranger sees no expenses');
select throws_ok($$
  insert into public.expenses (trip_id, status, occurred_at, currency, amount, split_method, created_by)
  values ((select trip_id from public.seats limit 1), 'complete', now(), 'COP', 1, 'equal',
          '00000000-0000-0000-0000-000000000000')
$$, null, null, 'stranger cannot insert expenses');

-- ---------- settlement ----------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2', true);
select lives_ok($$
  insert into public.settlements (trip_id, from_seat, to_seat, amount, currency, base_amount, method, recorded_by, status)
  select s.trip_id, s.id, m.id, 180000, 'COP', 180000, 'breb', s.id, 'pending'
    from public.seats s join public.seats m on m.trip_id = s.trip_id and m.display_name = 'Mateo'
   where s.display_name = 'Juli'
$$, 'Juli records a payment she sent');

select throws_ok($$
  insert into public.settlements (trip_id, from_seat, to_seat, amount, currency, base_amount, method, recorded_by, status)
  select a.trip_id, a.id, m.id, 1000, 'COP', 1000, 'cash', j.id, 'pending'
    from public.seats a
    join public.seats m on m.trip_id = a.trip_id and m.display_name = 'Mateo'
    join public.seats j on j.trip_id = a.trip_id and j.display_name = 'Juli'
   where a.display_name = 'Ana'
$$, '42501', null, 'a plain member cannot record a payment between two others');

select * from finish();
rollback;
