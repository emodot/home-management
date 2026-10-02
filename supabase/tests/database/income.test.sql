-- Income: household admins only, counted by the month it counts toward, purged after deletion.
begin;
select plan(16);

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

-- Ada is the household admin, Bola a member, Chidi an outsider.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ada@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bola@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'chidi@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select set_config('test.hid', (pg_temp.create_household('Obi home')).id::text, true);
reset role;
insert into public.household_members (household_id, user_id)
values (current_setting('test.hid')::uuid, '22222222-2222-2222-2222-222222222222');
set local role authenticated;

-- ---------------------------------------------------------------- the admin records income
select ok(public.is_household_admin(current_setting('test.hid')::uuid), 'Ada is a household admin');
select lives_ok(
  $$ insert into public.income (household_id, amount_minor, received_on, source, received_by)
     values (current_setting('test.hid')::uuid, 50000000, '2026-09-28', 'Salary – Acme', auth.uid()) $$,
  'a household admin can record income'
);
select throws_ok(
  $$ insert into public.income (household_id, amount_minor, received_on, source)
     values (current_setting('test.hid')::uuid, 100, '2026-09-28', ' Acme ') $$,
  '23514', null, 'sources are stored trimmed (the app trims them)'
);
update public.income set source = 'Salary' where amount_minor = 50000000;
select is(
  (select row(budget_month, created_by)::text from public.income),
  row('2026-09-01'::date, '11111111-1111-1111-1111-111111111111'::uuid)::text,
  'it counts toward the month received by default, and records who added it'
);
insert into public.income (household_id, amount_minor, received_on, budget_month, source)
values (current_setting('test.hid')::uuid, 20000000, '2026-09-29', '2026-10-20', 'Rent received');
select is(
  (select budget_month::text from public.income where source = 'Rent received'),
  '2026-10-01', 'or toward the month given'
);
update public.income set received_on = '2026-10-01' where source = 'Salary';
select is(
  (select budget_month::text from public.income where source = 'Salary'),
  '2026-10-01', 'it follows a changed received date'
);
select throws_ok(
  $$ insert into public.income (household_id, amount_minor, received_on, source, received_by)
     values (current_setting('test.hid')::uuid, 100, '2026-09-28', 'Gift', '33333333-3333-3333-3333-333333333333') $$,
  '23514', null, 'whoever received it must be a member'
);
select throws_ok(
  $$ insert into public.income (household_id, amount_minor, received_on, source)
     values (current_setting('test.hid')::uuid, 0, '2026-09-28', 'Nothing') $$,
  '23514', null, 'amounts must be positive'
);
select is(
  (select array_agg(row(month, total_minor, entry_count)::text order by month)
   from public.income_totals(current_setting('test.hid')::uuid, '2026-09-01', '2026-10-31')),
  array[row('2026-10-01'::date, 70000000::bigint, 2)::text],
  'totals are by the month income counts toward'
);
select throws_ok(
  $$ delete from public.income $$,
  '42501', null, 'income is soft-deleted, not deleted'
);

-- ---------------------------------------------------------------- members can't see it
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select ok(not public.is_household_admin(current_setting('test.hid')::uuid), 'Bola is not a household admin');
select is_empty($$ select 1 from public.income $$, 'members see no income');
select is_empty(
  $$ select * from public.income_totals(current_setting('test.hid')::uuid, '2026-01-01', '2026-12-31') $$,
  'members get no income totals'
);
select throws_ok(
  $$ insert into public.income (household_id, amount_minor, received_on, source)
     values (current_setting('test.hid')::uuid, 100, '2026-09-28', 'Sneaky') $$,
  '42501', null, 'members cannot record income'
);

-- ---------------------------------------------------------------- outsiders, and purging
select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);
select is_empty($$ select 1 from public.income $$, 'outsiders see no income');

reset role;
update public.income set deleted_at = now() - interval '31 days' where source = 'Rent received';
select is(
  (select (public.purge_deleted_rows())->>'income'),
  '1', 'income deleted over 30 days ago is purged'
);

select * from finish();
rollback;
