-- Recurring expenses: date arithmetic, generating pending expenses, confirming and skipping.
begin;
select plan(30);

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

-- ---------------------------------------------------------------- advance_date
select is(public.advance_date('2026-01-31', 'monthly', 1, 31), '2026-02-28'::date, 'Jan 31 + 1 month = Feb 28');
select is(public.advance_date('2026-02-28', 'monthly', 1, 31), '2026-03-31'::date, 'anchored to the 31st, Feb 28 + 1 month = Mar 31');
select is(public.advance_date('2028-01-31', 'monthly', 1, 31), '2028-02-29'::date, 'leap years get Feb 29');
select is(public.advance_date('2026-11-30', 'quarterly', 1, 30), '2027-02-28'::date, 'quarterly across a year end');
select is(public.advance_date('2028-02-29', 'yearly', 1, 29), '2029-02-28'::date, 'Feb 29 + 1 year = Feb 28');
select is(public.advance_date('2029-02-28', 'yearly', 3, 29), '2032-02-29'::date, 'and back to Feb 29 in a leap year');
select is(public.advance_date('2026-09-24', 'weekly', 2, 24), '2026-10-08'::date, 'every 2 weeks');
select is(public.advance_date('2026-09-15', 'monthly', 2, 15), '2026-11-15'::date, 'every 2 months');

-- ---------------------------------------------------------------- setup
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ada@example.com', '{"full_name": "Ada Obi"}'),
  ('22222222-2222-2222-2222-222222222222', 'bola@example.com', '{}'),
  ('33333333-3333-3333-3333-333333333333', 'chidi@example.com', '{}');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);
select set_config('test.other_hid', (pg_temp.create_household('Chidi home')).id::text, true);
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select set_config('test.hid', (pg_temp.create_household('Obi home')).id::text, true);
select set_config('test.cat', (
  select id::text from public.expense_categories
  where household_id = current_setting('test.hid')::uuid and name = 'Internet & TV'), true);
reset role;
insert into public.household_members (household_id, user_id)
values (current_setting('test.hid')::uuid, '22222222-2222-2222-2222-222222222222');
set local role authenticated;

-- ---------------------------------------------------------------- definitions
select lives_ok(
  $$ insert into public.recurring_expenses
       (household_id, description, amount_minor, category_id, paid_by, frequency, start_on, next_due_on)
     values (current_setting('test.hid')::uuid, 'Spectranet', 2200000, current_setting('test.cat')::uuid,
             '22222222-2222-2222-2222-222222222222', 'monthly', '2026-07-31', '2026-07-31') $$,
  'members can add recurring expenses'
);
select set_config('test.rid', (select id::text from public.recurring_expenses where description = 'Spectranet'), true);
select throws_ok(
  $$ insert into public.recurring_expenses
       (household_id, description, amount_minor, category_id, frequency, start_on, next_due_on)
     values (current_setting('test.hid')::uuid, 'Daily?', 100, current_setting('test.cat')::uuid, 'daily', '2026-09-01', '2026-09-01') $$,
  '23514', null, 'recurring expenses are weekly, monthly, quarterly or yearly'
);
select throws_ok(
  $$ insert into public.recurring_expenses
       (household_id, description, amount_minor, category_id, frequency, start_on, next_due_on, paid_by)
     values (current_setting('test.hid')::uuid, 'x', 100, current_setting('test.cat')::uuid, 'monthly', '2026-09-01', '2026-09-01', '33333333-3333-3333-3333-333333333333') $$,
  '23514', null, 'paid_by must be a member'
);
select lives_ok(
  $$ insert into public.recurring_expenses
       (household_id, description, amount_minor, category_id, frequency, start_on, next_due_on, is_active)
     values (current_setting('test.hid')::uuid, 'Paused gym', 1000000, current_setting('test.cat')::uuid, 'monthly', '2026-08-01', '2026-08-01', false),
            (current_setting('test.hid')::uuid, 'Future rent', 50000000, current_setting('test.cat')::uuid, 'yearly', '2027-01-01', '2027-01-01', true) $$,
  'paused and future bills'
);

-- ---------------------------------------------------------------- generation
select throws_ok(
  $$ select public.generate_recurring_expenses('2026-09-30') $$,
  '42501', null, 'members cannot run the job for everyone'
);
select is(
  public.generate_due_recurring_expenses(current_setting('test.hid')::uuid) >= 0,
  true,
  'members can generate what is due in their own household'
);

reset role;
-- Bola leaves: generated expenses fall back to no payer rather than failing.
delete from public.household_members where user_id = '22222222-2222-2222-2222-222222222222';
delete from public.expenses where recurring_expense_id is not null; -- start from a clean slate
update public.recurring_expenses set next_due_on = '2026-07-31' where description = 'Spectranet';
set local role service_role;

select is(public.generate_recurring_expenses('2026-09-30'), 3, 'creates one pending expense per missed occurrence');
select is(
  (select array_agg(occurred_on::text order by occurred_on) from public.expenses where recurring_expense_id = current_setting('test.rid')::uuid),
  array['2026-07-31', '2026-08-31', '2026-09-30'],
  'occurrences keep the month-end anchor'
);
select is(
  (select array_agg(distinct row(status, amount_minor, paid_by, description)::text) from public.expenses where recurring_expense_id = current_setting('test.rid')::uuid),
  array[row('pending', 2200000, null, 'Spectranet')::text],
  'generated expenses are pending copies of the bill (payer cleared after they left)'
);
select is(
  (select next_due_on from public.recurring_expenses where id = current_setting('test.rid')::uuid),
  '2026-10-31'::date,
  'next_due_on moves past today'
);
select is(public.generate_recurring_expenses('2026-09-30'), 0, 'running again creates nothing');
select is(
  (select count(*)::int from public.expenses where description in ('Paused gym', 'Future rent')),
  0,
  'paused and future bills are left alone'
);

update public.recurring_expenses set next_due_on = '2023-01-15', start_on = '2023-01-15' where id = current_setting('test.rid')::uuid;
select is(public.generate_recurring_expenses('2026-09-30', null, 12), 12, 'a long gap is capped');
select is(
  (select max(occurred_on) from public.expenses where recurring_expense_id = current_setting('test.rid')::uuid and occurred_on < '2026-07-01'),
  '2026-06-15'::date,
  'keeping the most recent occurrences'
);
select is(
  (select next_due_on from public.recurring_expenses where id = current_setting('test.rid')::uuid),
  '2026-10-15'::date,
  'and still catches up'
);

-- ---------------------------------------------------------------- confirm and skip
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select is(
  (select total_minor from public.expense_category_totals(current_setting('test.hid')::uuid, '2026-09-01', '2026-09-30')),
  null,
  'pending expenses are not counted as spending'
);
select lives_ok(
  $$ update public.expenses set status = 'confirmed', amount_minor = 2500000
     where recurring_expense_id = current_setting('test.rid')::uuid and occurred_on = '2026-09-30' $$,
  'members can confirm a pending expense, changing the amount'
);
select is(
  (select total_minor from public.expense_category_totals(current_setting('test.hid')::uuid, '2026-09-01', '2026-09-30')),
  2500000::bigint,
  'confirmed expenses count'
);
select lives_ok(
  $$ update public.expenses set deleted_at = now()
     where recurring_expense_id = current_setting('test.rid')::uuid and occurred_on = '2026-08-31' $$,
  'members can skip a pending expense'
);
select throws_ok(
  $$ update public.expenses set status = 'maybe' where recurring_expense_id = current_setting('test.rid')::uuid $$,
  '23514', null, 'status must be confirmed or pending'
);
select throws_ok(
  $$ insert into public.expenses (household_id, amount_minor, occurred_on, category_id, description, status)
     values (current_setting('test.hid')::uuid, 100, '2026-09-01', current_setting('test.cat')::uuid, 'x', 'pending') $$,
  '42501', null, 'members cannot create pending expenses directly'
);

reset role;
update public.recurring_expenses set next_due_on = '2026-08-31' where id = current_setting('test.rid')::uuid;
set local role service_role;
select is(public.generate_recurring_expenses('2026-09-30'), 0, 'skipped occurrences are not recreated');

reset role;
select * from finish();
rollback;
