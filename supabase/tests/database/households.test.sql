-- RLS and behaviour tests for profiles, households and household_members.
-- Run with `pnpm db:test` (supabase test db).
begin;
select plan(31);

-- Households are created by super-admins. This stand-in creates one and makes the caller its
-- household admin (and their active household), as if they had joined through an admin invite.
create function pg_temp.create_household(p_name text)
returns public.households
language plpgsql
security definer
as $fn$
declare
  h public.households;
begin
  h := public.admin_create_household(p_name);
  insert into public.household_members (household_id, user_id, role) values (h.id, auth.uid(), 'admin');
  update public.profiles set active_household_id = h.id where id = auth.uid();
  return h;
end;
$fn$;

-- Two users: Ada (creates a household) and Bola (starts as an outsider).
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ada@example.com', '{"full_name": "Ada Obi"}'),
  ('22222222-2222-2222-2222-222222222222', 'bola@example.com', '{}');

-- ---------------------------------------------------------------- profiles from sign-up
select is(
  (select full_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Ada Obi',
  'sign-up creates a profile with the name from auth metadata'
);
select is(
  (select email from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'bola@example.com',
  'sign-up copies the email'
);
update auth.users set email = 'bola@example.ng' where id = '22222222-2222-2222-2222-222222222222';
select is(
  (select email from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'bola@example.ng',
  'email changes in auth are synced to the profile'
);

-- ---------------------------------------------------------------- Ada creates a household
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

select throws_ok(
  $$ select public.admin_create_household('Mine') $$,
  '42501', null, 'signed-in users cannot create households (super-admins do)'
);
select lives_ok(
  $$ select set_config('test.hid_a', (pg_temp.create_household('  Obi home  ')).id::text, true) $$,
  'a household created for Ada'
);
select is((select name from public.households), 'Obi home', 'creator sees the household, name trimmed');
select is((select currency::text from public.households), 'NGN', 'currency defaults to NGN');
select is((select timezone from public.households), 'Africa/Lagos', 'timezone defaults to Africa/Lagos');
select is(
  (select count(*)::int from public.household_members where user_id = auth.uid()),
  1,
  'creator becomes a member'
);
select is(
  (select active_household_id::text from public.profiles where id = auth.uid()),
  current_setting('test.hid_a'),
  'the new household becomes active'
);
select ok(public.is_household_member(current_setting('test.hid_a')::uuid), 'is_household_member is true for a member');
select lives_ok(
  $$ update public.households set name = 'Obi family' where id = current_setting('test.hid_a')::uuid $$,
  'a member can rename the household'
);
select throws_ok(
  $$ update public.households set currency = 'USD' where id = current_setting('test.hid_a')::uuid $$,
  '42501', null,
  'currency cannot be changed from the client'
);
select throws_ok(
  $$ update public.profiles set email = 'x@example.com' where id = auth.uid() $$,
  '42501', null,
  'profile email cannot be changed from the client'
);
select throws_ok($$ select pg_temp.create_household('   ') $$, '23514', null, 'blank household names are rejected');

-- ---------------------------------------------------------------- Bola is an outsider
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);

select ok(not public.is_household_member(current_setting('test.hid_a')::uuid), 'is_household_member is false for an outsider');
select is_empty($$ select 1 from public.households $$, 'an outsider sees no households');
select is_empty($$ select 1 from public.household_members $$, 'an outsider sees no memberships');
select is(
  (select array_agg(id::text) from public.profiles),
  array['22222222-2222-2222-2222-222222222222'],
  'an outsider sees only their own profile'
);
select throws_ok(
  $$ insert into public.household_members (household_id, user_id)
     values (current_setting('test.hid_a')::uuid, auth.uid()) $$,
  '42501', null,
  'a user cannot add themselves to a household'
);
select throws_ok(
  $$ insert into public.households (name) values ('Sneaky') $$,
  '42501', null,
  'households cannot be inserted directly'
);
select throws_ok(
  $$ update public.profiles set active_household_id = current_setting('test.hid_a')::uuid where id = auth.uid() $$,
  '23503', null,
  'a user cannot activate a household they do not belong to'
);
update public.households set name = 'Hacked' where id = current_setting('test.hid_a')::uuid;

reset role;
select is(
  (select name from public.households where id = current_setting('test.hid_a')::uuid),
  'Obi family',
  'an outsider''s update does not touch the household'
);

-- ---------------------------------------------------------------- Bola joins (invites arrive in M2)
insert into public.household_members (household_id, user_id)
values (current_setting('test.hid_a')::uuid, '22222222-2222-2222-2222-222222222222');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);

select is((select count(*)::int from public.households), 1, 'a member sees the household');
select is((select count(*)::int from public.profiles), 2, 'members see each other''s profiles');
select lives_ok(
  $$ update public.profiles set active_household_id = current_setting('test.hid_a')::uuid where id = auth.uid() $$,
  'a member can make the household active'
);
update public.profiles set full_name = 'Not Ada' where id = '11111111-1111-1111-1111-111111111111';

reset role;
select is(
  (select full_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Ada Obi',
  'members cannot edit each other''s profiles'
);

delete from public.household_members where user_id = '22222222-2222-2222-2222-222222222222';
select is(
  (select active_household_id from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  null,
  'losing membership clears the active household'
);
select is(
  (select count(*)::int from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  1,
  'losing membership keeps the profile'
);

-- ---------------------------------------------------------------- anonymous access
set local role anon;
select throws_ok($$ select 1 from public.profiles $$, '42501', null, 'anon cannot read profiles');
select throws_ok($$ select public.admin_create_household('Anon home') $$, '42501', null, 'anon cannot create households');
reset role;

select * from finish();
rollback;
