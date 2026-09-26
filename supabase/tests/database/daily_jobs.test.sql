-- Daily job steps 2-4: task reminders, purging soft-deleted rows, expiring invites.
begin;
select plan(20);

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
  ('22222222-2222-2222-2222-222222222222', 'bola@example.com', '{"full_name": "Bola Ade"}');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select set_config('test.hid', (pg_temp.create_household('Obi home')).id::text, true);
reset role;
insert into public.household_members (household_id, user_id)
values (current_setting('test.hid')::uuid, '22222222-2222-2222-2222-222222222222');

insert into public.providers (household_id, name, trade, phone)
values (current_setting('test.hid')::uuid, 'Emeka Gen', 'generator_technician', '+2348051234567');
insert into public.tasks (household_id, title, schedule_type, frequency, start_on, next_due_on,
                          reminder_days_before, assignee_id, provider_id) values
  -- Unassigned, due in 2 days, remind 2 days before → upcoming to both members.
  (current_setting('test.hid')::uuid, 'Service generator', 'fixed', 'quarterly', '2026-09-26', '2026-09-26', 2,
   null, (select id from public.providers where name = 'Emeka Gen')),
  -- Assigned to Bola, overdue since yesterday → overdue to Bola only.
  (current_setting('test.hid')::uuid, 'Clean tank', 'fixed', 'monthly', '2026-09-23', '2026-09-23', 1,
   '22222222-2222-2222-2222-222222222222', null),
  -- Due in 5 days with a 1-day reminder → nothing yet.
  (current_setting('test.hid')::uuid, 'Fumigate', 'fixed', 'yearly', '2026-09-29', '2026-09-29', 1, null, null);
insert into public.tasks (household_id, title, schedule_type, frequency, start_on, next_due_on, is_active)
values (current_setting('test.hid')::uuid, 'Paused', 'fixed', 'weekly', '2026-09-20', '2026-09-20', false);

set local role authenticated;
select throws_ok($$ select * from public.claim_task_reminders('2026-09-24') $$, '42501', null,
  'members cannot run the reminder job');
reset role;
set local role service_role;

-- ---------------------------------------------------------------- reminders
create temp table claimed on commit drop as
select * from public.claim_task_reminders('2026-09-24');

select is(
  (select array_agg(row(kind, task_title, recipient_email)::text order by task_title, recipient_email) from claimed),
  array[
    row('overdue', 'Clean tank', 'bola@example.com')::text,
    row('upcoming', 'Service generator', 'ada@example.com')::text,
    row('upcoming', 'Service generator', 'bola@example.com')::text
  ],
  'upcoming reminders go to everyone when unassigned; overdue to the assignee'
);
select is(
  (select row(household_name, due_on, provider_name, provider_phone, recipient_name)::text
   from claimed where task_title = 'Service generator' and recipient_email = 'ada@example.com'),
  row('Obi home', '2026-09-26'::date, 'Emeka Gen', '+2348051234567', 'Ada Obi')::text,
  'claims include what the email needs'
);
select is(
  (select assigned_to_recipient from claimed where task_title = 'Clean tank'),
  true,
  'the email can say it was assigned to them'
);
select is((select count(*)::int from public.reminder_logs), 3, 'claims are logged');
select is_empty($$ select * from public.claim_task_reminders('2026-09-24') $$, 'running again sends nothing new');
select is_empty(
  $$ select * from public.claim_task_reminders('2026-09-25') where kind = 'overdue' $$,
  'overdue reminders are sent once per due date'
);
select is(
  (select count(*)::int from public.claim_task_reminders('2026-09-28') where task_title = 'Fumigate'),
  2,
  'reminders start reminder_days_before the due date'
);

select lives_ok(
  $$ select public.release_task_reminder((
       select l.id from public.reminder_logs l join public.tasks t on t.id = l.task_id
       where l.kind = 'overdue' and t.title = 'Clean tank')) $$,
  'a failed send can be released'
);
select is(
  (select count(*)::int from public.claim_task_reminders('2026-09-25') where task_title = 'Clean tank'),
  1,
  'and is retried on the next run'
);

-- Reassigning to someone who left makes it go to everyone again.
reset role;
update public.tasks set next_due_on = '2026-10-01', assignee_id = '22222222-2222-2222-2222-222222222222'
where title = 'Clean tank';
delete from public.household_members where user_id = '22222222-2222-2222-2222-222222222222';
set local role service_role;
select is(
  (select array_agg(recipient_email) from public.claim_task_reminders('2026-10-01') where task_title = 'Clean tank'),
  array['ada@example.com'],
  'a former member''s tasks remind the remaining members'
);

-- ---------------------------------------------------------------- purge
reset role;
select set_config('test.cat', (
  select id::text from public.expense_categories
  where household_id = current_setting('test.hid')::uuid and name = 'Water'), true);
insert into public.expenses (household_id, amount_minor, occurred_on, category_id, description, deleted_at) values
  (current_setting('test.hid')::uuid, 100, '2026-08-01', current_setting('test.cat')::uuid, 'Old deleted', now() - interval '31 days'),
  (current_setting('test.hid')::uuid, 200, '2026-08-02', current_setting('test.cat')::uuid, 'Recently deleted', now() - interval '5 days'),
  (current_setting('test.hid')::uuid, 300, '2026-08-03', current_setting('test.cat')::uuid, 'Kept', null);
insert into public.expense_receipts (household_id, expense_id, storage_path, file_name, mime_type, size_bytes, deleted_at)
select e.household_id, e.id, e.household_id || '/' || e.id || '/' || v.f, v.f, 'image/jpeg', 10, v.deleted_at
from public.expenses e
cross join lateral (values
  ('a.jpg', null::timestamptz),
  ('b.jpg', now() - interval '40 days')
) as v(f, deleted_at)
where e.description in ('Old deleted', 'Kept');
update public.providers set deleted_at = now() - interval '45 days' where name = 'Emeka Gen';
update public.tasks set deleted_at = now() - interval '60 days' where title = 'Fumigate';

set local role service_role;
select set_config('test.purge', public.purge_deleted_rows()::text, true);
select is(
  (select jsonb_build_object('receipts', r->'receipts', 'expenses', r->'expenses', 'tasks', r->'tasks', 'providers', r->'providers')
   from (select current_setting('test.purge')::jsonb as r) x),
  '{"receipts": 3, "expenses": 1, "tasks": 1, "providers": 1}'::jsonb,
  'old soft-deleted rows are purged, with their receipts'
);
select is(
  (select jsonb_array_length(current_setting('test.purge')::jsonb -> 'storage_paths')),
  3,
  'the purge returns the receipt files to delete'
);
select is(
  (select array_agg(description order by description) from public.expenses),
  array['Kept', 'Recently deleted'],
  'recent deletions and live rows stay'
);
select is(
  (select array_agg(file_name) from public.expense_receipts),
  array['a.jpg'],
  'a live expense keeps its live receipts'
);
select is(
  (select provider_id from public.tasks where title = 'Service generator'),
  null,
  'links to purged providers are cleared'
);
select is(public.purge_deleted_rows() -> 'expenses', '0'::jsonb, 'purging again removes nothing');

-- ---------------------------------------------------------------- invites
reset role;
insert into public.invites (household_id, email, token_hash, expires_at, accepted_at) values
  (current_setting('test.hid')::uuid, 'old@example.com', repeat('a', 64), now() - interval '40 days', null),
  (current_setting('test.hid')::uuid, 'recent@example.com', repeat('b', 64), now() - interval '2 days', null),
  (current_setting('test.hid')::uuid, 'used@example.com', repeat('c', 64), now() - interval '40 days', now() - interval '45 days');
set local role service_role;
select is(public.delete_expired_invites(), 1, 'invites expired over 30 days ago are removed');
select is(
  (select array_agg(email order by email) from public.invites),
  array['recent@example.com', 'used@example.com'],
  'recently expired and accepted invites stay'
);

reset role;
set local role authenticated;
select throws_ok($$ select public.purge_deleted_rows() $$, '42501', null, 'members cannot purge');

reset role;
select * from finish();
rollback;
