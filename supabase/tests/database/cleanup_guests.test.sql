begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- c1 owner (account), c2 linked guest (old), c3 old guest with a pending claim on a placeholder,
-- c4 old guest who asked for a new seat, c5 old guest that never did anything, c6 fresh guest.
insert into auth.users (id, aud, role, email, is_anonymous, created_at) values
  ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'owner@test.local', false, now() - interval '30 days'),
  ('00000000-0000-0000-0000-0000000000c2', 'authenticated', 'authenticated', null, true, now() - interval '30 days'),
  ('00000000-0000-0000-0000-0000000000c3', 'authenticated', 'authenticated', null, true, now() - interval '30 days'),
  ('00000000-0000-0000-0000-0000000000c4', 'authenticated', 'authenticated', null, true, now() - interval '30 days'),
  ('00000000-0000-0000-0000-0000000000c5', 'authenticated', 'authenticated', null, true, now() - interval '30 days'),
  ('00000000-0000-0000-0000-0000000000c6', 'authenticated', 'authenticated', null, true, now());

set local role service_role;
select public.save_trip(jsonb_build_object(
  'id', '00000000-0000-0000-0000-00000000cc01', 'name', 'Tayrona', 'base_currency', 'COP',
  'status', 'active', 'settle_mode', 'simplified',
  'seats', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000cd01', 'display_name', 'Mateo', 'role', 'owner',
      'status', 'active', 'link_kind', 'user', 'principal_id', '00000000-0000-0000-0000-0000000000c1', 'default_excluded', false, 'position', 0),
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000cd02', 'display_name', 'Juli', 'role', 'member',
      'status', 'active', 'link_kind', 'guest', 'principal_id', '00000000-0000-0000-0000-0000000000c2', 'default_excluded', false,
      'created_by', '00000000-0000-0000-0000-00000000cd01', 'position', 1),
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000cd03', 'display_name', 'Leo', 'role', 'member',
      'status', 'active', 'link_kind', 'none', 'default_excluded', false, 'created_by', '00000000-0000-0000-0000-00000000cd01',
      'pending_principal_id', '00000000-0000-0000-0000-0000000000c3', 'pending_kind', 'guest', 'pending_requested_at', now(), 'position', 2),
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000cd04', 'display_name', 'Sofi', 'role', 'member',
      'status', 'active', 'link_kind', 'none', 'default_excluded', false,
      'pending_principal_id', '00000000-0000-0000-0000-0000000000c4', 'pending_kind', 'guest', 'pending_requested_at', now(), 'position', 3))), null);
reset role;

select throws_ok($$ set local role authenticated; select public.cleanup_abandoned_guests() $$, '42501', null,
  'members cannot run the cleanup');
reset role;

select is(public.cleanup_abandoned_guests(), 3, 'removes the three old guests without a seat');
select is((select array_agg(id order by id)::text from auth.users where id::text like '00000000-0000-0000-0000-0000000000c%'),
  '{00000000-0000-0000-0000-0000000000c1,00000000-0000-0000-0000-0000000000c2,00000000-0000-0000-0000-0000000000c6}',
  'accounts, linked guests and fresh guests stay');
select is((select display_name from public.seats where id = '00000000-0000-0000-0000-00000000cd03'), 'Leo',
  'a placeholder someone asked for stays');
select is((select pending_principal_id from public.seats where id = '00000000-0000-0000-0000-00000000cd03'), null,
  'and the abandoned request is withdrawn');
select is((select count(*)::int from public.seats where id = '00000000-0000-0000-0000-00000000cd04'), 0,
  'a seat the abandoned guest created for themself goes away');
select is((select version from public.trips where id = '00000000-0000-0000-0000-00000000cc01'), 1,
  'the trip version moves so stale writers conflict');

select * from finish();
rollback;
