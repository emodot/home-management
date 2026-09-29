-- The month expenses count toward, recurring bills for the next month, and budgets that apply
-- from a month onward.
begin;
select plan(22);

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
  ('33333333-3333-3333-3333-333333333333', 'chidi@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select set_config('test.hid', (pg_temp.create_household('Obi home')).id::text, true);
select set_config('test.rent', (select id::text from public.expense_categories where name = 'Rent'), true);
select set_config('test.fuel', (select id::text from public.expense_categories where name = 'Fuel & Generator'), true);
-- This month and the next, in the household's timezone (Africa/Lagos).
select set_config('test.this', date_trunc('month', now() at time zone 'Africa/Lagos')::date::text, true);
select set_config('test.next', (current_setting('test.this')::date + interval '1 month')::date::text, true);
select set_config('test.after', (current_setting('test.this')::date + interval '2 month')::date::text, true);
select set_config('test.last', (current_setting('test.this')::date - interval '1 month')::date::text, true);

-- ---------------------------------------------------------------- expenses
insert into public.expenses (household_id, amount_minor, occurred_on, category_id, description) values
  (current_setting('test.hid')::uuid, 100000, '2026-09-29', current_setting('test.fuel')::uuid, 'Diesel');
insert into public.expenses (household_id, amount_minor, occurred_on, budget_month, category_id, description) values
  (current_setting('test.hid')::uuid, 25000000, '2026-09-29', '2026-10-15', current_setting('test.rent')::uuid, 'October rent');

select is(
  (select budget_month::text from public.expenses where description = 'Diesel'),
  '2026-09-01', 'an expense counts toward its payment month by default'
);
select is(
  (select budget_month::text from public.expenses where description = 'October rent'),
  '2026-10-01', 'or toward the month given, stored as its 1st'
);
select is(
  (select budget_month::text from public.expense_list where description = 'October rent'),
  '2026-10-01', 'expense_list has it'
);

update public.expenses set occurred_on = '2026-10-02' where description = 'Diesel';
select is(
  (select budget_month::text from public.expenses where description = 'Diesel'),
  '2026-10-01', 'it follows a changed payment date'
);
update public.expenses set occurred_on = '2026-09-30' where description = 'October rent';
select is(
  (select budget_month::text from public.expenses where description = 'October rent'),
  '2026-10-01', 'unless it was set to a different month'
);
update public.expenses set budget_month = '2026-11-01' where description = 'Diesel';
select is(
  (select summary from public.activity_log where entity_type = 'expense' and action = 'updated'
   order by id desc limit 1),
  'edited counts toward November 2026', 'moving it to another month is in the history'
);
select is(
  (select count(*)::int from public.activity_log
   where entity_type = 'expense' and action = 'updated' and summary like '%counts toward%'),
  1, 'following the date is not logged as a month change'
);

-- ---------------------------------------------------------------- totals by month counted toward
select is(
  (select array_agg(row(c.name, t.total_minor)::text order by c.name)
   from public.expense_category_totals(current_setting('test.hid')::uuid, '2026-10-01', '2026-10-31') t
   join public.expense_categories c on c.id = t.category_id),
  array[row('Rent', 25000000)::text], 'category totals use the month an expense counts toward'
);
select is_empty(
  $$ select * from public.expense_category_totals(current_setting('test.hid')::uuid, '2026-09-01', '2026-09-30') $$,
  '...so a payment made in September for October is not September spending'
);

-- ---------------------------------------------------------------- recurring bills
reset role;
insert into public.recurring_expenses
  (household_id, description, amount_minor, category_id, frequency, start_on, next_due_on, for_next_month)
values
  (current_setting('test.hid')::uuid, 'Rent', 25000000, current_setting('test.rent')::uuid, 'monthly', '2026-09-25', '2026-09-25', true),
  (current_setting('test.hid')::uuid, 'Diesel', 100000, current_setting('test.fuel')::uuid, 'monthly', '2026-09-25', '2026-09-25', false);
select is(public.generate_recurring_expenses('2026-09-26'), 2, 'due bills generate pending expenses');
select is(
  (select array_agg(row(description, budget_month)::text order by description)
   from public.expenses where status = 'pending'),
  array[row('Diesel', '2026-09-01')::text, row('Rent', '2026-10-01')::text],
  'a bill for next month counts toward the month after it is due'
);
set local role authenticated;

-- ---------------------------------------------------------------- budgets by month
select lives_ok(
  $$ select public.set_budget(current_setting('test.hid')::uuid, current_setting('test.fuel')::uuid,
                              current_setting('test.this')::date, 5000000) $$,
  'a budget can be set for this month'
);
select lives_ok(
  $$ select public.set_budget(current_setting('test.hid')::uuid, current_setting('test.fuel')::uuid,
                              current_setting('test.next')::date + 14, 8000000) $$,
  '...and a different one for next month (any day of it)'
);
select is(
  (select monthly_amount_minor from public.budgets_for_month(current_setting('test.hid')::uuid, current_setting('test.this')::date)),
  5000000::bigint, 'this month keeps its budget'
);
select is(
  (select monthly_amount_minor from public.budgets_for_month(current_setting('test.hid')::uuid, current_setting('test.after')::date)),
  8000000::bigint, 'next month''s budget carries forward'
);
select is_empty(
  $$ select 1 from public.budgets_for_month(current_setting('test.hid')::uuid, current_setting('test.last')::date) $$,
  'months before a budget have none'
);
select lives_ok(
  $$ select public.set_budget(current_setting('test.hid')::uuid, current_setting('test.fuel')::uuid,
                              current_setting('test.after')::date, null) $$,
  'a budget can be removed from a month on'
);
select is(
  (select array_agg(coalesce(b.monthly_amount_minor, 0) order by m)
   from unnest(array[current_setting('test.this')::date, current_setting('test.next')::date,
                     current_setting('test.after')::date]) m
   left join lateral public.budgets_for_month(current_setting('test.hid')::uuid, m) b on true),
  array[5000000, 8000000, 0]::bigint[], 'removing it leaves earlier months alone'
);
select public.set_budget(current_setting('test.hid')::uuid, current_setting('test.fuel')::uuid,
                         current_setting('test.next')::date, 5000000);
select is(
  (select count(*)::int from public.budgets where category_id = current_setting('test.fuel')::uuid),
  2, 'setting a month back to the budget before it drops that month''s own change'
);
select throws_ok(
  $$ select public.set_budget(current_setting('test.hid')::uuid, current_setting('test.fuel')::uuid,
                              current_setting('test.last')::date, 100) $$,
  '22023', null, 'past months can''t be changed'
);
select throws_ok(
  $$ insert into public.budgets (household_id, category_id, starts_on, monthly_amount_minor)
     values (current_setting('test.hid')::uuid, current_setting('test.rent')::uuid, '2020-01-01', 100) $$,
  '42501', null, 'budgets are only written through set_budget'
);

select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);
select throws_ok(
  $$ select public.set_budget(current_setting('test.hid')::uuid, current_setting('test.rent')::uuid,
                              current_setting('test.next')::date, 100) $$,
  '42501', null, 'outsiders can''t set budgets'
);

reset role;
select * from finish();
rollback;
