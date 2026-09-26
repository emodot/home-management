-- Invites and leaving a household. The functions are called as service_role, like the edge
-- functions do; the first block checks nobody else can call them.
begin;
select plan(53);

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

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ada@example.com', '{"full_name": "Ada Obi"}'),
  ('22222222-2222-2222-2222-222222222222', 'bola@example.com', '{}'),
  ('33333333-3333-3333-3333-333333333333', 'chidi@example.com', '{}'),
  ('44444444-4444-4444-4444-444444444444', 'dayo@example.com', '{}');

-- Ada creates a household.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select set_config('test.hid', (pg_temp.create_household('Obi home')).id::text, true);

-- ---------------------------------------------------------------- only the service role
select throws_ok(
  $$ select * from public.invite_upsert(current_setting('test.hid')::uuid, 'x@example.com', repeat('a', 64), auth.uid()) $$,
  '42501', null, 'users cannot call invite_upsert'
);
select throws_ok(
  $$ select * from public.invite_accept(repeat('a', 64), auth.uid(), false) $$,
  '42501', null, 'users cannot call invite_accept'
);
select throws_ok(
  $$ select public.invite_revoke(gen_random_uuid(), auth.uid()) $$,
  '42501', null, 'users cannot call invite_revoke'
);
select throws_ok(
  $$ select public.leave_household(current_setting('test.hid')::uuid, auth.uid()) $$,
  '42501', null, 'users cannot call leave_household'
);
select throws_ok(
  $$ insert into public.invites (household_id, email, token_hash) values (current_setting('test.hid')::uuid, 'x@example.com', repeat('a', 64)) $$,
  '42501', null, 'users cannot insert invites directly'
);

reset role;
set local role service_role;

-- ---------------------------------------------------------------- creating and resending
select throws_ok(
  $$ select * from public.invite_upsert(current_setting('test.hid')::uuid, 'dayo@example.com', repeat('a', 64), '22222222-2222-2222-2222-222222222222') $$,
  'P0001', 'not_member', 'non-members cannot invite'
);
select throws_ok(
  $$ select * from public.invite_upsert(current_setting('test.hid')::uuid, 'ADA@example.com', repeat('a', 64), '11111111-1111-1111-1111-111111111111') $$,
  'P0001', 'already_member', 'existing members cannot be invited'
);

select is(
  (select row(email, household_name, inviter_name, resent)::text
   from public.invite_upsert(current_setting('test.hid')::uuid, ' Bola@Example.com ', repeat('a', 64), '11111111-1111-1111-1111-111111111111')),
  row('bola@example.com', 'Obi home', 'Ada Obi', false)::text,
  'a member can invite; the email is normalised'
);
select is(
  (select resent from public.invite_upsert(current_setting('test.hid')::uuid, 'bola@example.com', repeat('b', 64), '11111111-1111-1111-1111-111111111111')),
  true,
  'inviting the same address again is a resend'
);
select is(
  (select array_agg(token_hash) from public.invites where email = 'bola@example.com'),
  array[repeat('b', 64)],
  'a resend keeps one invite and replaces its token'
);
select ok(
  (select expires_at > now() + interval '6 days 23 hours' from public.invites where email = 'bola@example.com'),
  'invites expire in 7 days'
);

-- ---------------------------------------------------------------- accepting
select throws_ok(
  $$ select * from public.invite_accept(repeat('a', 64), '22222222-2222-2222-2222-222222222222', true) $$,
  'P0001', 'invite_not_found', 'the token replaced by a resend no longer works'
);
select is(
  (select row(household_name, inviter_name, already_member)::text
   from public.invite_accept(repeat('b', 64), '33333333-3333-3333-3333-333333333333', true)),
  row('Obi home', 'Ada Obi', false)::text,
  'anyone with the link can preview it'
);
select is(
  (select count(*)::int from public.household_members where household_id = current_setting('test.hid')::uuid),
  1,
  'previews do not add members'
);
select is(
  (select already_member
   from public.invite_accept(repeat('b', 64), '22222222-2222-2222-2222-222222222222', false)),
  true,
  'whoever opens the link can accept it'
);
select ok(
  public.is_member_of(current_setting('test.hid')::uuid, '22222222-2222-2222-2222-222222222222'),
  'accepting adds the member'
);
select is(
  (select active_household_id::text from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  current_setting('test.hid'),
  'accepting makes the household active'
);
select isnt(
  (select accepted_at from public.invites where email = 'bola@example.com'),
  null,
  'accepting marks the invite accepted'
);
select lives_ok(
  $$ select * from public.invite_accept(repeat('b', 64), '22222222-2222-2222-2222-222222222222', false) $$,
  'reopening a used link as its member is harmless'
);
select throws_ok(
  $$ select * from public.invite_accept(repeat('b', 64), '33333333-3333-3333-3333-333333333333', true) $$,
  'P0001', 'invite_used', 'a used invite cannot be used by anyone else'
);

-- ---------------------------------------------------------------- expiry and revoking
select throws_ok(
  $$ select * from public.invite_upsert(current_setting('test.hid')::uuid, 'chidi@example.com', repeat('c', 64), '22222222-2222-2222-2222-222222222222') $$,
  'P0001', 'not_household_admin', 'members who are not household admins cannot invite'
);
select lives_ok(
  $$ select * from public.invite_upsert(current_setting('test.hid')::uuid, 'chidi@example.com', repeat('c', 64), '11111111-1111-1111-1111-111111111111') $$,
  'household admins can invite'
);
update public.invites set expires_at = now() - interval '1 minute' where email = 'chidi@example.com';
select throws_ok(
  $$ select * from public.invite_accept(repeat('c', 64), '33333333-3333-3333-3333-333333333333', true) $$,
  'P0001', 'invite_expired', 'expired invites cannot be used'
);
select throws_ok(
  $$ select public.invite_revoke((select id from public.invites where email = 'chidi@example.com'), '33333333-3333-3333-3333-333333333333') $$,
  'P0001', 'invite_not_found', 'outsiders cannot revoke invites'
);
select throws_ok(
  $$ select public.invite_revoke((select id from public.invites where email = 'chidi@example.com'), '22222222-2222-2222-2222-222222222222') $$,
  'P0001', 'not_household_admin', 'members who are not household admins cannot revoke invites'
);
select lives_ok(
  $$ select public.invite_revoke((select id from public.invites where email = 'chidi@example.com'), '11111111-1111-1111-1111-111111111111') $$,
  'household admins can revoke a pending invite'
);
select throws_ok(
  $$ select * from public.invite_accept(repeat('c', 64), '33333333-3333-3333-3333-333333333333', true) $$,
  'P0001', 'invite_revoked', 'revoked invites cannot be used'
);

-- ---------------------------------------------------------------- shareable links (no email)
select is(
  (select row(email, resent)::text
   from public.invite_upsert(current_setting('test.hid')::uuid, null, repeat('d', 64), '11111111-1111-1111-1111-111111111111')),
  row(null::text, false)::text,
  'a member can create an invite link without an email'
);
select lives_ok(
  $$ select * from public.invite_upsert(current_setting('test.hid')::uuid, null, repeat('e', 64), '11111111-1111-1111-1111-111111111111') $$,
  'every new link is a separate invite'
);
select is(
  (select count(*)::int from public.invites where email is null and accepted_at is null),
  2,
  'two pending links'
);
select throws_ok(
  $$ select * from public.invite_rotate((select id from public.invites where token_hash = repeat('d', 64)), '33333333-3333-3333-3333-333333333333', repeat('f', 64)) $$,
  'P0001', 'invite_not_found', 'outsiders cannot make a new link'
);
select throws_ok(
  $$ select * from public.invite_rotate((select id from public.invites where token_hash = repeat('d', 64)), '22222222-2222-2222-2222-222222222222', repeat('f', 64)) $$,
  'P0001', 'not_household_admin', 'members who are not household admins cannot make new links'
);
select is(
  (select resent from public.invite_rotate((select id from public.invites where token_hash = repeat('d', 64)), '11111111-1111-1111-1111-111111111111', repeat('f', 64))),
  true,
  'household admins can make a new link for a pending invite'
);
select throws_ok(
  $$ select * from public.invite_accept(repeat('d', 64), '44444444-4444-4444-4444-444444444444', true) $$,
  'P0001', 'invite_not_found', 'the old link stops working'
);
select is(
  (select already_member from public.invite_accept(repeat('f', 64), '22222222-2222-2222-2222-222222222222', false)),
  true,
  'a member opening a link just goes to the household'
);
select is(
  (select accepted_at from public.invites where token_hash = repeat('f', 64)),
  null,
  '...without using the link up'
);
select lives_ok(
  $$ select * from public.invite_accept(repeat('f', 64), '44444444-4444-4444-4444-444444444444', false) $$,
  'someone new joins with the link'
);
select ok(
  public.is_member_of(current_setting('test.hid')::uuid, '44444444-4444-4444-4444-444444444444'),
  'and is now a member'
);
select throws_ok(
  $$ select * from public.invite_accept(repeat('f', 64), '33333333-3333-3333-3333-333333333333', true) $$,
  'P0001', 'invite_used', 'a link works for one person only'
);
select is(
  public.leave_household(current_setting('test.hid')::uuid, '44444444-4444-4444-4444-444444444444'),
  'left',
  'they can leave again'
);

-- ---------------------------------------------------------------- what members can read
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select is(
  (select count(*)::int from (select id, email, invited_by, expires_at from public.invites) i),
  4,
  'members can list their household''s invites'
);
select throws_ok($$ select token_hash from public.invites $$, '42501', null, 'token hashes are not readable');
select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);
select is_empty($$ select id from public.invites $$, 'outsiders see no invites');

-- ---------------------------------------------------------------- admin invites and roles
reset role;
set local role service_role;
select is(
  (select row(email, household_name)::text
   from public.admin_create_invite(current_setting('test.hid')::uuid, ' Chidi@Example.com ', repeat('9', 64))),
  row('chidi@example.com', 'Obi home')::text,
  'super-admins create household admin invites'
);
select lives_ok(
  $$ select * from public.invite_accept(repeat('9', 64), '33333333-3333-3333-3333-333333333333', false) $$,
  'accepting an admin invite'
);
select ok(
  public.is_household_admin_of(current_setting('test.hid')::uuid, '33333333-3333-3333-3333-333333333333'),
  '...makes you a household admin'
);
select lives_ok(
  $$ select public.admin_set_member_role(current_setting('test.hid')::uuid, '33333333-3333-3333-3333-333333333333', 'member') $$,
  'super-admins change roles'
);
select throws_ok(
  $$ select public.admin_set_member_role(current_setting('test.hid')::uuid, '44444444-4444-4444-4444-444444444444', 'admin') $$,
  'P0001', 'not_member', 'only members have roles'
);
select lives_ok(
  $$ select public.leave_household(current_setting('test.hid')::uuid, '33333333-3333-3333-3333-333333333333') $$,
  'chidi leaves again'
);

-- ---------------------------------------------------------------- leaving
select throws_ok(
  $$ select public.leave_household(current_setting('test.hid')::uuid, '11111111-1111-1111-1111-111111111111') $$,
  'P0001', 'last_admin', 'the last household admin cannot leave while others remain'
);
select is(
  public.leave_household(current_setting('test.hid')::uuid, '22222222-2222-2222-2222-222222222222'),
  'left',
  'a member can leave'
);
select is(
  public.leave_household(current_setting('test.hid')::uuid, '11111111-1111-1111-1111-111111111111'),
  'left',
  'the last member can leave too'
);
select ok(
  exists (select 1 from public.households where id = current_setting('test.hid')::uuid),
  'leaving never deletes the household'
);

reset role;
select * from finish();
rollback;
