-- Recurring income: household admins only, pending entries on each pay day, confirm or skip.
begin;
select plan(14);

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

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ada@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bola@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select set_config('test.hid', (pg_temp.create_household('Obi home')).id::text, true);
reset role;
insert into public.household_members (household_id, user_id)
values (current_setting('test.hid')::uuid, '22222222-2222-2222-2222-222222222222');
set local role authenticated;

-- ---------------------------------------------------------------- the admin sets up a salary
select lives_ok(
  $$ insert into public.recurring_income
       (household_id, source, amount_minor, received_by, frequency, start_on, next_due_on, for_next_month)
     values (current_setting('test.hid')::uuid, 'Salary – Acme', 50000000, auth.uid(), 'monthly',
             '2026-08-28', '2026-08-28', true) $$,
  'a household admin can set up recurring income'
);
select throws_ok(
  $$ insert into public.recurring_income (household_id, source, amount_minor, frequency, start_on, next_due_on)
     values (current_setting('test.hid')::uuid, 'Daily', 100, 'daily', '2026-09-01', '2026-09-01') $$,
  '23514', null, 'frequencies are weekly, monthly, quarterly or yearly'
);
select throws_ok(
  $$ insert into public.income (household_id, amount_minor, received_on, source, status)
     values (current_setting('test.hid')::uuid, 100, '2026-09-01', 'Sneaky', 'pending') $$,
  '42501', null, 'admins cannot create pending income themselves'
);

-- ---------------------------------------------------------------- generation
reset role;
select is(public.generate_recurring_income('2026-09-30'), 2, 'each pay day due so far becomes pending income');
select is(public.generate_recurring_income('2026-09-30'), 0, 'running it again creates nothing new');
select is(
  (select array_agg(row(received_on, budget_month, status, received_by)::text order by received_on)
   from public.income),
  array[
    row('2026-08-28'::date, '2026-09-01'::date, 'pending', '11111111-1111-1111-1111-111111111111'::uuid)::text,
    row('2026-09-28'::date, '2026-10-01'::date, 'pending', '11111111-1111-1111-1111-111111111111'::uuid)::text
  ],
  'pending entries count toward the next month when set to, and keep who receives it'
);
select is(
  (select next_due_on::text from public.recurring_income),
  '2026-10-28', 'the next pay day moves on'
);
select is(public.generate_recurring_expenses('2026-10-28'), 1, 'the daily job''s run also generates income');
set local role authenticated;

-- ---------------------------------------------------------------- confirming and skipping
select is_empty(
  $$ select * from public.income_totals(current_setting('test.hid')::uuid, '2026-09-01', '2026-11-30') $$,
  'pending income is not counted'
);
update public.income set status = 'confirmed', amount_minor = 52000000 where received_on = '2026-09-28';
update public.income set deleted_at = now() where received_on = '2026-08-28';
select is(
  (select array_agg(row(month, total_minor)::text order by month)
   from public.income_totals(current_setting('test.hid')::uuid, '2026-09-01', '2026-11-30')),
  array[row('2026-10-01'::date, 52000000::bigint)::text],
  'confirmed income counts, with its corrected amount; skipped income does not'
);
select lives_ok(
  $$ select public.generate_due_recurring_income(current_setting('test.hid')::uuid) $$,
  'admins can generate what is due right after saving'
);

-- ---------------------------------------------------------------- members
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select is_empty($$ select 1 from public.recurring_income $$, 'members see no recurring income');
select throws_ok(
  $$ select public.generate_due_recurring_income(current_setting('test.hid')::uuid) $$,
  '42501', null, 'members cannot generate income'
);
select lives_ok(
  $$ select public.generate_due_recurring_expenses(current_setting('test.hid')::uuid) $$,
  'members can still generate due bills'
);

reset role;
select * from finish();
rollback;
