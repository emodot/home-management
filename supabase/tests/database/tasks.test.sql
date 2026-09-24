-- Tasks: validation, completing each schedule type, undo, linked expenses, RLS.
begin;
select plan(27);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ada@example.com', '{"full_name": "Ada Obi"}'),
  ('33333333-3333-3333-3333-333333333333', 'chidi@example.com', '{}');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);
select set_config('test.other_hid', (public.create_household('Chidi home')).id::text, true);

select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select set_config('test.hid', (public.create_household('Obi home')).id::text, true);
select set_config('test.cat', (
  select id::text from public.expense_categories
  where household_id = current_setting('test.hid')::uuid and name = 'Fuel & Generator'), true);
insert into public.providers (household_id, name, trade)
values (current_setting('test.hid')::uuid, 'Emeka Gen', 'generator_technician');
select set_config('test.pid', (select id::text from public.providers where name = 'Emeka Gen'), true);

-- ---------------------------------------------------------------- creating
select lives_ok(
  $$ insert into public.tasks (household_id, title, schedule_type, frequency, interval_count, start_on, next_due_on,
                               assignee_id, provider_id, default_category_id)
     values
       (current_setting('test.hid')::uuid, 'Service generator', 'after_completion', 'monthly', 3, '2026-06-01', '2026-09-01',
        auth.uid(), current_setting('test.pid')::uuid, current_setting('test.cat')::uuid),
       (current_setting('test.hid')::uuid, 'Pay estate levy', 'fixed', 'monthly', 1, '2026-01-31', '2026-01-31',
        null, null, null),
       (current_setting('test.hid')::uuid, 'Fix gate hinge', 'once', null, 1, '2026-09-20', '2026-09-20',
        null, null, null) $$,
  'members can add tasks of each schedule type'
);
select set_config('test.gen', (select id::text from public.tasks where title = 'Service generator'), true);
select set_config('test.levy', (select id::text from public.tasks where title = 'Pay estate levy'), true);
select set_config('test.gate', (select id::text from public.tasks where title = 'Fix gate hinge'), true);

select throws_ok(
  $$ insert into public.tasks (household_id, title, schedule_type, frequency, start_on, next_due_on)
     values (current_setting('test.hid')::uuid, 'x', 'once', 'monthly', '2026-09-01', '2026-09-01') $$,
  '23514', null, 'one-off tasks have no frequency'
);
select throws_ok(
  $$ insert into public.tasks (household_id, title, schedule_type, start_on, next_due_on)
     values (current_setting('test.hid')::uuid, 'x', 'fixed', '2026-09-01', '2026-09-01') $$,
  '23514', null, 'repeating tasks need a frequency'
);
select throws_ok(
  $$ insert into public.tasks (household_id, title, schedule_type, frequency, start_on, next_due_on, assignee_id)
     values (current_setting('test.hid')::uuid, 'x', 'fixed', 'weekly', '2026-09-01', '2026-09-01', '33333333-3333-3333-3333-333333333333') $$,
  '23514', null, 'assignees must be members'
);
select throws_ok(
  $$ insert into public.tasks (household_id, title, schedule_type, frequency, start_on, next_due_on, reminder_days_before)
     values (current_setting('test.hid')::uuid, 'x', 'fixed', 'weekly', '2026-09-01', '2026-09-01', 31) $$,
  '23514', null, 'reminders are at most 30 days ahead'
);
select throws_ok(
  $$ insert into public.task_completions (household_id, task_id, due_on, completed_on)
     values (current_setting('test.hid')::uuid, current_setting('test.gen')::uuid, '2026-09-01', '2026-09-01') $$,
  '42501', null, 'completions can only be recorded through complete_task'
);

-- ---------------------------------------------------------------- after_completion
select set_config('test.c1', public.complete_task(current_setting('test.gen')::uuid, '2026-09-20', ' Changed oil ')::text, true);
select is(
  (select row(due_on, completed_on, completed_by, notes)::text from public.task_completions where id = current_setting('test.c1')::uuid),
  row('2026-09-01'::date, '2026-09-20'::date, auth.uid(), 'Changed oil')::text,
  'a completion records the due date it satisfied, who and when'
);
select is(
  (select next_due_on from public.tasks where id = current_setting('test.gen')::uuid),
  '2026-12-20'::date,
  'after_completion: next due is 3 months after completion'
);

-- ---------------------------------------------------------------- fixed (month-end anchored)
select lives_ok($$ select public.complete_task(current_setting('test.levy')::uuid, '2026-01-30') $$, 'complete a fixed task early');
select is((select next_due_on from public.tasks where id = current_setting('test.levy')::uuid), '2026-02-28'::date,
  'fixed: advances one period from the due date (Jan 31 → Feb 28)');
select lives_ok($$ select public.complete_task(current_setting('test.levy')::uuid, '2026-02-28') $$, 'complete on the due date');
select is((select next_due_on from public.tasks where id = current_setting('test.levy')::uuid), '2026-03-31'::date,
  'fixed: keeps the 31st anchor');
select lives_ok($$ select public.complete_task(current_setting('test.levy')::uuid, '2026-05-10') $$, 'complete very late');
select is((select next_due_on from public.tasks where id = current_setting('test.levy')::uuid), '2026-05-31'::date,
  'fixed: moves to the first scheduled date after the completion');

-- ---------------------------------------------------------------- once
select lives_ok($$ select public.complete_task(current_setting('test.gate')::uuid) $$, 'complete a one-off task (today by default)');
select is((select is_active from public.tasks where id = current_setting('test.gate')::uuid), false,
  'one-off tasks become inactive');
select throws_ok($$ select public.complete_task(current_setting('test.gate')::uuid) $$, 'P0001', 'task_inactive',
  'an inactive task cannot be completed again');

-- ---------------------------------------------------------------- undo
select set_config('test.c2', (select id::text from public.task_completions where task_id = current_setting('test.gate')::uuid), true);
select lives_ok($$ select public.undo_task_completion(current_setting('test.c2')::uuid) $$, 'the latest completion can be undone');
select is(
  (select row(is_active, next_due_on)::text from public.tasks where id = current_setting('test.gate')::uuid),
  row(true, '2026-09-20'::date)::text,
  'undo restores the task'
);
select set_config('test.first_levy', (
  select id::text from public.task_completions
  where task_id = current_setting('test.levy')::uuid order by completed_on limit 1), true);
select throws_ok($$ select public.undo_task_completion(current_setting('test.first_levy')::uuid) $$, 'P0001', 'not_latest_completion',
  'only the latest completion can be undone');

-- ---------------------------------------------------------------- linked expenses
select lives_ok(
  $$ insert into public.expenses (household_id, amount_minor, occurred_on, category_id, description, provider_id, task_completion_id)
     values (current_setting('test.hid')::uuid, 2500000, '2026-09-20', current_setting('test.cat')::uuid, 'Service generator',
             current_setting('test.pid')::uuid, current_setting('test.c1')::uuid) $$,
  'an expense can be logged against a completion'
);
select is(
  (select task_completion_id::text from public.expense_list where description = 'Service generator'),
  current_setting('test.c1'),
  'expense_list includes the completion'
);
select throws_ok(
  $$ update public.expenses set task_completion_id = null where description = 'Service generator' $$,
  '42501', null, 'the link is set when the expense is created'
);

-- ---------------------------------------------------------------- outsiders
select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);
select is_empty($$ select 1 from public.tasks $$, 'outsiders see no tasks');
select is_empty($$ select 1 from public.task_completions $$, 'outsiders see no completions');
select throws_ok($$ select public.complete_task(current_setting('test.gen')::uuid) $$, 'P0001', 'task_not_found',
  'outsiders cannot complete tasks');
select throws_ok($$ select public.undo_task_completion(current_setting('test.c1')::uuid) $$, 'P0001', 'completion_not_found',
  'outsiders cannot undo completions');

reset role;
select * from finish();
rollback;
