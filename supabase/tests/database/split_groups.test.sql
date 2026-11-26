begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'member@test.local'),
  ('00000000-0000-0000-0000-0000000000e2', 'authenticated', 'authenticated', 'stranger@test.local');

set local role service_role;
select public.save_trip(jsonb_build_object(
  'id', '00000000-0000-0000-0000-00000000f001', 'name', 'Tayrona', 'base_currency', 'COP',
  'status', 'active', 'settle_mode', 'simplified',
  'seats', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000f101', 'display_name', 'Mateo', 'role', 'owner',
      'status', 'active', 'link_kind', 'user', 'principal_id', '00000000-0000-0000-0000-0000000000e1',
      'default_excluded', false, 'position', 0),
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000f102', 'display_name', 'Leo', 'role', 'member',
      'status', 'active', 'link_kind', 'none', 'default_excluded', false, 'position', 1))), null);

select lives_ok($$
  insert into public.split_groups (id, trip_id, name, seat_ids, created_by) values
    ('00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-00000000f001', 'Carro 1',
     array['00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000f102']::uuid[],
     '00000000-0000-0000-0000-00000000f101')
$$, 'the server saves a group');

select throws_ok($$
  insert into public.split_groups (id, trip_id, name, seat_ids, created_by) values
    (gen_random_uuid(), '00000000-0000-0000-0000-00000000f001', ' carro 1 ',
     array['00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000f102']::uuid[],
     '00000000-0000-0000-0000-00000000f101')
$$, '23505', null, 'names are unique per trip, ignoring case and spaces');

select throws_ok($$
  insert into public.split_groups (id, trip_id, name, seat_ids, created_by) values
    (gen_random_uuid(), '00000000-0000-0000-0000-00000000f001', 'Solo',
     array['00000000-0000-0000-0000-00000000f101']::uuid[], '00000000-0000-0000-0000-00000000f101')
$$, '23514', null, 'a group needs at least 2 people');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
select is((select count(*)::int from public.split_groups), 1, 'members read their trip''s groups');
select throws_ok($$
  insert into public.split_groups (id, trip_id, name, seat_ids, created_by) values
    (gen_random_uuid(), '00000000-0000-0000-0000-00000000f001', 'Parejas',
     array['00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000f102']::uuid[],
     '00000000-0000-0000-0000-00000000f101')
$$, '42501', null, 'members cannot write groups directly');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);
select is((select count(*)::int from public.split_groups), 0, 'strangers see no groups');

select * from finish();
rollback;
