-- The getting-started checklist, worked out from the household's own data.
begin;
select plan(10);

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

create function pg_temp.checklist()
returns text
language sql
as $fn$
  select row(has_expense, has_receipt, has_invited, has_provider, has_recurring_task, has_shopping_list)::text
  from public.getting_started(current_setting('test.hid')::uuid)
$fn$;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ada@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bola@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'chidi@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select set_config('test.hid', (pg_temp.create_household('Obi home')).id::text, true);
reset role;
-- The super-admin's invite that made Ada the household admin.
insert into public.invites (household_id, email, token_hash, role, accepted_at)
values (current_setting('test.hid')::uuid, 'ada@example.com', repeat('a', 64), 'admin', now());
set local role authenticated;

select is(pg_temp.checklist(), '(f,f,f,f,f,f)', 'a new household has done nothing yet (its own admin invite doesn''t count)');

-- An expense, then one with a receipt.
insert into public.expenses (household_id, amount_minor, occurred_on, category_id, description)
values (current_setting('test.hid')::uuid, 500000, '2026-10-01',
        (select id from public.expense_categories where household_id = current_setting('test.hid')::uuid and name = 'Water'),
        'Water tanker');
select set_config('test.eid', (select id::text from public.expenses where description = 'Water tanker'), true);
select is(pg_temp.checklist(), '(t,f,f,f,f,f)', 'an expense ticks the first item');

insert into public.expense_receipts (household_id, expense_id, storage_path, file_name, mime_type, size_bytes)
values (current_setting('test.hid')::uuid, current_setting('test.eid')::uuid,
        current_setting('test.hid') || '/' || current_setting('test.eid') || '/r.jpg', 'r.jpg', 'image/jpeg', 10);
select is(pg_temp.checklist(), '(t,t,f,f,f,f)', 'a receipt ticks the second');

update public.expenses set deleted_at = now() where id = current_setting('test.eid')::uuid;
select is(pg_temp.checklist(), '(f,f,f,f,f,f)', 'an expense in Recently deleted (and its receipt) doesn''t count');
update public.expenses set deleted_at = null where id = current_setting('test.eid')::uuid;

-- Inviting someone: an invite they haven't taken up yet, or someone already in.
reset role;
insert into public.invites (household_id, email, token_hash, revoked_at)
values (current_setting('test.hid')::uuid, 'gone@example.com', repeat('b', 64), now());
set local role authenticated;
select is((select has_invited from public.getting_started(current_setting('test.hid')::uuid)), false, 'a revoked invite doesn''t count');
reset role;
insert into public.household_members (household_id, user_id) values (current_setting('test.hid')::uuid, '22222222-2222-2222-2222-222222222222');
set local role authenticated;
select is((select has_invited from public.getting_started(current_setting('test.hid')::uuid)), true, 'a second member does');

-- A provider, a one-off and a repeating task, something on the list.
insert into public.providers (household_id, name, trade) values (current_setting('test.hid')::uuid, 'Musa Electric', 'electrician');
insert into public.tasks (household_id, title, schedule_type, start_on, next_due_on)
values (current_setting('test.hid')::uuid, 'Fix the gate', 'once', '2026-10-20', '2026-10-20');
select is(pg_temp.checklist(), '(t,t,t,t,f,f)', 'a one-off task isn''t a recurring one');
insert into public.tasks (household_id, title, schedule_type, frequency, start_on, next_due_on)
values (current_setting('test.hid')::uuid, 'Service generator', 'fixed', 'monthly', '2026-10-20', '2026-10-20');
insert into public.kitchen_items (household_id, name, normalized_name) values (current_setting('test.hid')::uuid, 'Rice', 'rice');
insert into public.shopping_list_items (household_id, item_id)
values (current_setting('test.hid')::uuid, (select id from public.kitchen_items where normalized_name = 'rice'));
select is(pg_temp.checklist(), '(t,t,t,t,t,t)', 'everything done');

-- The list empties as things are bought; the trips remember it was started.
delete from public.shopping_list_items where household_id = current_setting('test.hid')::uuid;
reset role;
insert into public.shopping_trips (household_id, bought_on, item_count, total_minor)
values (current_setting('test.hid')::uuid, '2026-10-21', 1, 250000);
set local role authenticated;
select is((select has_shopping_list from public.getting_started(current_setting('test.hid')::uuid)), true, 'a shopping trip counts once the list is empty');

-- Outsiders learn nothing.
select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);
select is(pg_temp.checklist(), '(f,f,f,f,f,f)', 'someone outside the household sees nothing done');

select * from finish();
rollback;
