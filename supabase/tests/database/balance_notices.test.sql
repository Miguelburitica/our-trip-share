begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'mateo@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'juli@test.local');

set local role service_role;
select public.save_trip(jsonb_build_object(
  'id', '00000000-0000-0000-0000-00000000aa01', 'name', 'Tayrona', 'base_currency', 'COP',
  'status', 'active', 'settle_mode', 'simplified',
  'seats', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000ab01', 'display_name', 'Mateo', 'role', 'owner',
      'status', 'active', 'link_kind', 'user', 'principal_id', '00000000-0000-0000-0000-0000000000a1',
      'default_excluded', false, 'position', 0),
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000ab02', 'display_name', 'Juli', 'role', 'member',
      'status', 'active', 'link_kind', 'user', 'principal_id', '00000000-0000-0000-0000-0000000000a2',
      'default_excluded', false, 'position', 1))), null);
insert into public.balance_notices (id, trip_id, seat_id, delta, cause_kind, cause_title, cause_category, by_seat)
values (gen_random_uuid(), '00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-00000000ab02',
        -12000, 'edited', 'Cena', 'comida', '00000000-0000-0000-0000-00000000ab01');

insert into public.payout_handles (seat_id, trip_id, handles)
values ('00000000-0000-0000-0000-00000000ab01', '00000000-0000-0000-0000-00000000aa01', '[{"kind":"breb","value":"@mateo"}]');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
select is((select count(*)::int from public.payout_handles), 0, 'Juli cannot read Mateo''s payment details directly');
select is((select count(*)::int from public.balance_notices), 1, 'Juli reads her own notice');
select throws_ok($$ update public.balance_notices set dismissed_at = now() $$, '42501', null, 'members cannot write notices directly');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select is((select count(*)::int from public.balance_notices), 0, 'other members of the trip do not see it');
select is((select count(*)::int from public.payout_handles), 1, 'Mateo reads his own payment details');

select * from finish();
rollback;
