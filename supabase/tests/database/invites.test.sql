-- Invites and leaving a household. The functions are called as service_role, like the edge
-- functions do; the first block checks nobody else can call them.
begin;
select plan(33);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ada@example.com', '{"full_name": "Ada Obi"}'),
  ('22222222-2222-2222-2222-222222222222', 'bola@example.com', '{}'),
  ('33333333-3333-3333-3333-333333333333', 'chidi@example.com', '{}');

-- Ada creates a household.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select set_config('test.hid', (public.create_household('Obi home')).id::text, true);

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
  $$ select public.leave_household(current_setting('test.hid')::uuid, auth.uid(), true) $$,
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
  (select row(household_name, email, email_matches, already_member)::text
   from public.invite_accept(repeat('b', 64), '33333333-3333-3333-3333-333333333333', true)),
  row('Obi home', 'bola@example.com', false, false)::text,
  'preview reports an email mismatch without failing'
);
select throws_ok(
  $$ select * from public.invite_accept(repeat('b', 64), '33333333-3333-3333-3333-333333333333', false) $$,
  'P0001', 'email_mismatch', 'someone else cannot accept the invite'
);
select is(
  (select count(*)::int from public.household_members where household_id = current_setting('test.hid')::uuid),
  1,
  'previews and failed accepts do not add members'
);
select is(
  (select row(email_matches, already_member)::text
   from public.invite_accept(repeat('b', 64), '22222222-2222-2222-2222-222222222222', false)),
  row(true, true)::text,
  'the invited user can accept'
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
select lives_ok(
  $$ select * from public.invite_upsert(current_setting('test.hid')::uuid, 'chidi@example.com', repeat('c', 64), '22222222-2222-2222-2222-222222222222') $$,
  'any member can invite'
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
select lives_ok(
  $$ select public.invite_revoke((select id from public.invites where email = 'chidi@example.com'), '11111111-1111-1111-1111-111111111111') $$,
  'any member can revoke a pending invite'
);
select throws_ok(
  $$ select * from public.invite_accept(repeat('c', 64), '33333333-3333-3333-3333-333333333333', true) $$,
  'P0001', 'invite_revoked', 'revoked invites cannot be used'
);

-- ---------------------------------------------------------------- what members can read
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select is(
  (select count(*)::int from (select id, email, invited_by, expires_at from public.invites) i),
  2,
  'members can list their household''s invites'
);
select throws_ok($$ select token_hash from public.invites $$, '42501', null, 'token hashes are not readable');
select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);
select is_empty($$ select id from public.invites $$, 'outsiders see no invites');

-- ---------------------------------------------------------------- leaving
reset role;
set local role service_role;
select is(
  public.leave_household(current_setting('test.hid')::uuid, '22222222-2222-2222-2222-222222222222', false),
  'left',
  'a member can leave'
);
select throws_ok(
  $$ select public.leave_household(current_setting('test.hid')::uuid, '11111111-1111-1111-1111-111111111111', false) $$,
  'P0001', 'last_member', 'the last member must confirm deletion'
);
select is(
  public.leave_household(current_setting('test.hid')::uuid, '11111111-1111-1111-1111-111111111111', true),
  'deleted',
  'the last member leaving deletes the household'
);
select ok(
  not exists (select 1 from public.households where id = current_setting('test.hid')::uuid)
  and not exists (select 1 from public.invites where household_id = current_setting('test.hid')::uuid),
  'deleting the household removes its data'
);

reset role;
select * from finish();
rollback;
