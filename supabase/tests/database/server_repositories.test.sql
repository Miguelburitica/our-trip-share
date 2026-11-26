begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'owner@test.local');

-- The server (service role) writes a whole trip aggregate.
set local role service_role;
select is(
  public.save_trip(jsonb_build_object(
    'id', '00000000-0000-0000-0000-00000000c001', 'name', 'Tayrona', 'base_currency', 'COP',
    'status', 'active', 'settle_mode', 'simplified',
    'seats', jsonb_build_array(
      jsonb_build_object('id', '00000000-0000-0000-0000-00000000d001', 'display_name', 'Mateo', 'role', 'owner',
        'status', 'active', 'link_kind', 'user', 'principal_id', '00000000-0000-0000-0000-0000000000b1',
        'default_excluded', false, 'position', 0),
      jsonb_build_object('id', '00000000-0000-0000-0000-00000000d002', 'display_name', 'Leo', 'role', 'member',
        'status', 'active', 'link_kind', 'none', 'default_excluded', false,
        'created_by', '00000000-0000-0000-0000-00000000d001', 'position', 1)))
  , null),
  0, 'inserting a trip starts at version 0');

select throws_ok($$
  select public.save_trip(jsonb_build_object('id', '00000000-0000-0000-0000-00000000c001', 'name', 'X',
    'base_currency', 'COP', 'status', 'active', 'settle_mode', 'simplified', 'seats', '[]'::jsonb), null)
$$, '40001', null, 'a second insert of the same trip is a version conflict');

select is(
  public.save_trip((select jsonb_build_object('id', id, 'name', 'Tayrona 2027', 'base_currency', base_currency,
      'status', status, 'settle_mode', settle_mode,
      'seats', (select jsonb_agg(to_jsonb(s) order by s.position) from public.seats s where s.trip_id = t.id))
    from public.trips t where id = '00000000-0000-0000-0000-00000000c001'), 0),
  1, 'saving at the current version bumps it');

select throws_ok($$
  select public.save_trip(jsonb_build_object('id', '00000000-0000-0000-0000-00000000c001', 'name', 'Stale',
    'base_currency', 'COP', 'status', 'active', 'settle_mode', 'simplified', 'seats', '[]'::jsonb), 0)
$$, '40001', null, 'saving at a stale version is a conflict');

-- Members can't call it, even for their own trip: linking and roles only change through the domain.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
select throws_ok($$ select public.save_trip('{}'::jsonb, 0) $$, '42501', null, 'authenticated users cannot call save_trip');

select * from finish();
rollback;
