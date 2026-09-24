-- Budgets and the spending totals behind the summary dashboard.
begin;
select plan(15);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ada@example.com', '{"full_name": "Ada Obi"}'),
  ('33333333-3333-3333-3333-333333333333', 'chidi@example.com', '{}');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);
select set_config('test.other_hid', (public.create_household('Chidi home')).id::text, true);
select set_config('test.other_cat', (select id::text from public.expense_categories where name = 'Rent'), true);

select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select set_config('test.hid', (public.create_household('Obi home')).id::text, true);
select set_config('test.power', (
  select id::text from public.expense_categories
  where household_id = current_setting('test.hid')::uuid and name = 'Electricity'), true);
select set_config('test.water', (
  select id::text from public.expense_categories
  where household_id = current_setting('test.hid')::uuid and name = 'Water'), true);

-- ---------------------------------------------------------------- budgets
select lives_ok(
  $$ select public.set_budget(current_setting('test.hid')::uuid, current_setting('test.power')::uuid, 5000000) $$,
  'members can set a budget'
);
select is(
  (select row(monthly_amount_minor, currency)::text from public.budgets
   where category_id = current_setting('test.power')::uuid),
  row(5000000, 'NGN')::text,
  'the budget is stored in minor units, in NGN'
);
select lives_ok(
  $$ select public.set_budget(current_setting('test.hid')::uuid, current_setting('test.power')::uuid, 6000000) $$,
  'setting it again updates it'
);
select is(
  (select array_agg(monthly_amount_minor) from public.budgets
   where category_id = current_setting('test.power')::uuid),
  array[6000000::bigint],
  'one budget per category'
);
select lives_ok(
  $$ select public.set_budget(current_setting('test.hid')::uuid, current_setting('test.power')::uuid, null) $$,
  'a null amount removes the budget'
);
select is_empty(
  $$ select 1 from public.budgets where category_id = current_setting('test.power')::uuid $$,
  'the budget is gone'
);
select throws_ok(
  $$ select public.set_budget(current_setting('test.hid')::uuid, current_setting('test.water')::uuid, 0) $$,
  '23514', null, 'budgets must be positive'
);
select throws_ok(
  $$ select public.set_budget(current_setting('test.hid')::uuid, current_setting('test.other_cat')::uuid, 100) $$,
  '23503', null, 'budgets must use the household''s own categories'
);
select lives_ok(
  $$ select public.set_budget(current_setting('test.hid')::uuid, current_setting('test.water')::uuid, 2000000) $$,
  'budget for water'
);
select throws_ok(
  $$ update public.budgets set household_id = current_setting('test.other_hid')::uuid $$,
  '42501', null, 'budgets cannot be moved between households'
);

-- ---------------------------------------------------------------- totals
insert into public.expenses (household_id, amount_minor, occurred_on, category_id, description) values
  (current_setting('test.hid')::uuid, 4500000, '2026-09-03', current_setting('test.power')::uuid, 'Token'),
  (current_setting('test.hid')::uuid, 500000, '2026-09-30', current_setting('test.power')::uuid, 'Token top-up'),
  (current_setting('test.hid')::uuid, 999900, '2026-09-10', current_setting('test.power')::uuid, 'Deleted one'),
  (current_setting('test.hid')::uuid, 700000, '2026-08-31', current_setting('test.power')::uuid, 'Last month'),
  (current_setting('test.hid')::uuid, 1500000, '2026-09-15', current_setting('test.water')::uuid, 'Tanker');
update public.expenses set deleted_at = now() where description = 'Deleted one';
reset role;
-- Pending expenses (M5) are proposals, not spending.
insert into public.expenses (household_id, amount_minor, occurred_on, category_id, description, status)
values (current_setting('test.hid')::uuid, 800000, '2026-09-20', current_setting('test.water')::uuid, 'Pending bill', 'pending');
set local role authenticated;

select is(
  (select array_agg(row(c.name, t.total_minor, t.expense_count)::text order by c.name)
   from public.expense_category_totals(current_setting('test.hid')::uuid, '2026-09-01', '2026-09-30') t
   join public.expense_categories c on c.id = t.category_id),
  array[row('Electricity', 5000000, 2)::text, row('Water', 1500000, 1)::text],
  'totals include both ends of the range and skip deleted, pending and other months'
);
select is(
  (select total_minor from public.expense_category_totals(current_setting('test.hid')::uuid, '2026-08-01', '2026-08-31')),
  700000::bigint,
  'totals for another month'
);

select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);
select is_empty(
  $$ select * from public.expense_category_totals(current_setting('test.hid')::uuid, '2026-01-01', '2026-12-31') $$,
  'outsiders get no totals'
);
select is_empty($$ select 1 from public.budgets $$, 'outsiders see no budgets');

reset role;
set local role anon;
select throws_ok(
  $$ select * from public.expense_category_totals(gen_random_uuid(), '2026-01-01', '2026-12-31') $$,
  '42501', null, 'anon cannot read totals'
);

reset role;
select * from finish();
rollback;
