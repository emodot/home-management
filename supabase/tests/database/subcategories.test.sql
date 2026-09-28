-- Sub-categories: one level, unique among siblings, archiving cascades, budgets on any level,
-- and expense_list exposes the parent for roll-up filters.
begin;
select plan(15);

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
  ('11111111-1111-1111-1111-111111111111', 'ada@example.com', '{"full_name": "Ada Obi"}');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select set_config('test.hid', (pg_temp.create_household('Obi home')).id::text, true);
select set_config('test.utilities', (select id::text from public.expense_categories
  where household_id = current_setting('test.hid')::uuid and name = 'Utilities'), true);
select set_config('test.water', (select id::text from public.expense_categories
  where household_id = current_setting('test.hid')::uuid and name = 'Water'), true);

select lives_ok(
  $$ insert into public.expense_categories (household_id, name, icon, parent_id)
     values (current_setting('test.hid')::uuid, 'Borehole', 'droplets', current_setting('test.utilities')::uuid),
            (current_setting('test.hid')::uuid, 'Waste', 'trash-2', current_setting('test.utilities')::uuid) $$,
  'members add sub-categories'
);
select set_config('test.borehole', (select id::text from public.expense_categories where name = 'Borehole'), true);

select lives_ok(
  $$ insert into public.expense_categories (household_id, name, parent_id)
     values (current_setting('test.hid')::uuid, 'Other', current_setting('test.utilities')::uuid) $$,
  'a sub-category can share a name with a top-level category'
);
select throws_ok(
  $$ insert into public.expense_categories (household_id, name, parent_id)
     values (current_setting('test.hid')::uuid, 'waste', current_setting('test.utilities')::uuid) $$,
  '23505', null, 'names are unique among siblings'
);
select throws_ok(
  $$ insert into public.expense_categories (household_id, name, parent_id)
     values (current_setting('test.hid')::uuid, 'Deep', current_setting('test.borehole')::uuid) $$,
  '23514', null, 'sub-categories cannot have their own sub-categories'
);
select throws_ok(
  $$ update public.expense_categories set parent_id = current_setting('test.water')::uuid
     where id = current_setting('test.utilities')::uuid $$,
  '23514', null, 'a category with sub-categories cannot become a sub-category'
);

-- ---------------------------------------------------------------- budgets
select lives_ok(
  $$ select public.set_budget(current_setting('test.hid')::uuid, current_setting('test.water')::uuid, 500000) $$,
  'budget on a top-level category'
);
select lives_ok(
  $$ select public.set_budget(current_setting('test.hid')::uuid, current_setting('test.borehole')::uuid, 200000) $$,
  'budget on a sub-category'
);
select lives_ok(
  $$ update public.expense_categories set parent_id = current_setting('test.utilities')::uuid
     where id = current_setting('test.water')::uuid $$,
  'a top-level category can move under another'
);
select is(
  (select monthly_amount_minor::int from public.budgets where category_id = current_setting('test.water')::uuid),
  500000,
  '...and keeps its budget'
);
select lives_ok(
  $$ update public.expense_categories set parent_id = null
     where id = current_setting('test.water')::uuid $$,
  'a sub-category can move back to the top level'
);
select is(
  (select count(*)::int from public.budgets
   where category_id in (current_setting('test.water')::uuid, current_setting('test.borehole')::uuid)),
  2,
  'budgets survive moves'
);

-- ---------------------------------------------------------------- archiving
update public.expense_categories set is_archived = true where id = current_setting('test.utilities')::uuid;
select is(
  (select bool_and(is_archived) from public.expense_categories where parent_id = current_setting('test.utilities')::uuid),
  true,
  'archiving a category archives its sub-categories'
);
update public.expense_categories set is_archived = false where id = current_setting('test.utilities')::uuid;
select is(
  (select bool_or(is_archived) from public.expense_categories where parent_id = current_setting('test.utilities')::uuid),
  false,
  'restoring it restores them'
);

-- ---------------------------------------------------------------- roll-up
insert into public.expenses (household_id, amount_minor, occurred_on, category_id, description)
values (current_setting('test.hid')::uuid, 100000, '2026-09-20', current_setting('test.borehole')::uuid, 'Pump repair'),
       (current_setting('test.hid')::uuid, 200000, '2026-09-21', current_setting('test.utilities')::uuid, 'Meter');
select is(
  (select category_parent_id::text from public.expense_list where description = 'Pump repair'),
  current_setting('test.utilities'),
  'expense_list carries the parent of a sub-category'
);
select is(
  (select count(*)::int from public.expense_list
   where category_id = current_setting('test.utilities')::uuid
      or category_parent_id = current_setting('test.utilities')::uuid),
  2,
  'filtering by a category can include its sub-categories'
);

reset role;
select * from finish();
rollback;
