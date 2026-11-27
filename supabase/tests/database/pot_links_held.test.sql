begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'mateo@test.local');

set local role service_role;
select public.save_trip(jsonb_build_object(
  'id', '00000000-0000-0000-0000-00000000cc01', 'name', 'Tayrona', 'base_currency', 'COP',
  'status', 'settling', 'settle_mode', 'simplified',
  'seats', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000cd01', 'display_name', 'Mateo', 'role', 'owner',
      'status', 'active', 'link_kind', 'user', 'principal_id', '00000000-0000-0000-0000-0000000000c1',
      'default_excluded', false, 'position', 0),
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000cd02', 'display_name', 'Juli', 'role', 'member',
      'status', 'active', 'link_kind', 'none', 'default_excluded', false, 'position', 1),
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000cd03', 'display_name', 'La vaca', 'role', 'member',
      'status', 'active', 'link_kind', 'none', 'default_excluded', true, 'position', 2,
      'holder_seat_id', '00000000-0000-0000-0000-00000000cd01'))), null);

select is((select holder_seat_id::text from public.seats where id = '00000000-0000-0000-0000-00000000cd03'),
          '00000000-0000-0000-0000-00000000cd01', 'save_trip stores who holds la vaca');

select throws_ok($$
  update public.seats set holder_seat_id = id where id = '00000000-0000-0000-0000-00000000cd03'
$$, '23514', null, 'la vaca cannot hold itself');

select throws_ok($$
  update public.seats set principal_id = '00000000-0000-0000-0000-0000000000c1'
   where id = '00000000-0000-0000-0000-00000000cd03'
$$, '23514', null, 'nobody can link to la vaca');

select throws_ok($$
  update public.seats set holder_seat_id = '00000000-0000-0000-0000-00000000cd01'
   where id = '00000000-0000-0000-0000-00000000cd02'
$$, '23505', null, 'one vaca per trip');

select throws_ok($$
  insert into public.summary_links (trip_id, token) values ('00000000-0000-0000-0000-00000000cc01', 'short')
$$, '23514', null, 'summary tokens are long enough not to be guessed');

insert into public.summary_links (trip_id, token)
values ('00000000-0000-0000-0000-00000000cc01', 'abcdefghijklmnopqrstuvwxyz012345');
insert into public.held_changes (id, trip_id, expense_id, kind, proposed, base_version, by_seat)
values (gen_random_uuid(), '00000000-0000-0000-0000-00000000cc01', gen_random_uuid(), 'created', '{}', null,
        '00000000-0000-0000-0000-00000000cd02');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);

select throws_ok($$ select count(*) from public.summary_links $$, '42501', null,
                 'even the owner cannot read summary tokens directly');
select throws_ok($$ select count(*) from public.push_subscriptions $$, '42501', null,
                 'push endpoints and keys are server only');
select throws_ok($$ select count(*) from public.held_changes $$, '42501', null,
                 'changes waiting for approval are read through the server only');
select throws_ok($$
  insert into public.held_changes (id, trip_id, expense_id, kind, proposed, by_seat)
  values (gen_random_uuid(), '00000000-0000-0000-0000-00000000cc01', gen_random_uuid(), 'created', '{}',
          '00000000-0000-0000-0000-00000000cd01')
$$, '42501', null, 'clients cannot hold or approve changes themselves');

reset role;
set local role anon;
select throws_ok($$ select count(*) from public.summary_links $$, '42501', null,
                 'the public summary goes through the server, not the table');

select * from finish();
rollback;
