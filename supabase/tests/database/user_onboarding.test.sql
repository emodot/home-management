-- Onboarding progress: each user reads and records only their own, through mark_onboarding.
begin;
select plan(13);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ada@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bola@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

select lives_ok(
  $$ select public.mark_onboarding('tour:welcome', 1, 'dismissed', 2) $$,
  'a user records skipping a tour'
);
select is(
  (select row(user_id, version, status, last_step)::text from public.user_onboarding where key = 'tour:welcome'),
  row('11111111-1111-1111-1111-111111111111'::uuid, 1, 'dismissed', 2)::text,
  'with the step it was skipped on'
);

select lives_ok(
  $$ select public.mark_onboarding('tour:welcome', 2, 'completed', 4) $$,
  'replaying it records the new outcome'
);
select is(
  (select row(version, status, last_step)::text from public.user_onboarding where key = 'tour:welcome'),
  row(2, 'completed', null::int)::text,
  'replacing the old one (a finished tour keeps no step)'
);

select public.mark_onboarding('checklist', 1, 'dismissed');
select public.mark_onboarding('hint:price-tracker', 1, 'completed');
select is(
  (select count(*)::int from public.user_onboarding),
  3,
  'the checklist and hints are recorded the same way'
);

select throws_ok(
  $$ select public.mark_onboarding('Welcome tour', 1, 'completed') $$,
  '23514', null, 'keys are tour:<id>, hint:<id> or checklist'
);
select throws_ok(
  $$ select public.mark_onboarding('tour:kitchen', 1, 'seen') $$,
  '23514', null, 'a tour is completed or dismissed'
);
select throws_ok(
  $$ insert into public.user_onboarding (user_id, key, status) values (auth.uid(), 'tour:tasks', 'completed') $$,
  '42501', null, 'rows are not written directly'
);

-- Bola sees none of Ada's.
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select is((select count(*)::int from public.user_onboarding), 0, 'users see only their own progress');
select public.mark_onboarding('tour:welcome', 1, 'completed');
select is(
  (select count(*)::int from public.user_onboarding),
  1,
  'and record their own without touching anyone else''s'
);

reset role;
select is(
  (select status from public.user_onboarding
   where user_id = '11111111-1111-1111-1111-111111111111' and key = 'tour:welcome'),
  'completed',
  'Ada''s welcome tour is as she left it'
);

set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$ select public.mark_onboarding('tour:welcome', 1, 'completed') $$,
  '42501', null, 'signed-out visitors record nothing'
);

reset role;
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select is(
  (select count(*)::int from public.user_onboarding
   where user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'a deleted account takes its progress with it'
);

select * from finish();
rollback;
