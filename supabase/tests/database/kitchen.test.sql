-- My Kitchen: the item catalogue is shared by the household's members and kept free of duplicates.
begin;
select plan(64);

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
  ('22222222-2222-2222-2222-222222222222', 'bola@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'chidi@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select set_config('test.hid', (pg_temp.create_household('Obi home')).id::text, true);
select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);
select set_config('test.other_hid', (pg_temp.create_household('Chidi flat')).id::text, true);
reset role;
insert into public.household_members (household_id, user_id)
values (current_setting('test.hid')::uuid, '22222222-2222-2222-2222-222222222222');
set local role authenticated;

-- ---------------------------------------------------------------- members add items
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select lives_ok(
  $$ insert into public.kitchen_items (household_id, name, normalized_name, default_unit, default_store_tag)
     values (current_setting('test.hid')::uuid, 'Tomatoes', 'tomato', 'paint_bucket', 'Mile 12') $$,
  'a member (not only household admins) can add an item'
);
select is(
  (select created_by from public.kitchen_items where normalized_name = 'tomato'),
  '22222222-2222-2222-2222-222222222222'::uuid,
  'who added it is recorded'
);
select is(
  (select default_unit from public.kitchen_items where normalized_name = 'tomato'),
  'paint_bucket',
  'local units are allowed'
);
select throws_ok(
  $$ insert into public.kitchen_items (household_id, name, normalized_name)
     values (current_setting('test.hid')::uuid, 'Tomato', 'tomato') $$,
  '23505', null, 'the same item can''t be added twice'
);
select throws_ok(
  $$ insert into public.kitchen_items (household_id, name, normalized_name, default_unit)
     values (current_setting('test.hid')::uuid, 'Rice', 'rice', 'cup') $$,
  '23514', null, 'units come from the known list'
);
select throws_ok(
  $$ insert into public.kitchen_items (household_id, name, normalized_name)
     values (current_setting('test.hid')::uuid, 'Beans', 'Beans') $$,
  '23514', null, 'the matching key is lower case'
);

-- ---------------------------------------------------------------- members edit items
select lives_ok(
  $$ update public.kitchen_items set default_store_tag = 'Oyingbo', default_unit = 'bag'
     where normalized_name = 'tomato' $$,
  'a member can change an item''s defaults'
);
select throws_ok(
  $$ update public.kitchen_items set household_id = current_setting('test.other_hid')::uuid
     where normalized_name = 'tomato' $$,
  '42501', null, 'an item can''t move to another household'
);
select throws_ok(
  $$ delete from public.kitchen_items where normalized_name = 'tomato' $$,
  '42501', null, 'items aren''t deleted in v1'
);

-- ---------------------------------------------------------------- other households
select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);
select is_empty(
  $$ select 1 from public.kitchen_items where household_id = current_setting('test.hid')::uuid $$,
  'other households can''t see the catalogue'
);
select throws_ok(
  $$ insert into public.kitchen_items (household_id, name, normalized_name)
     values (current_setting('test.hid')::uuid, 'Garri', 'garri') $$,
  '42501', null, 'other households can''t add to it'
);

-- ---------------------------------------------------------------- the shopping list
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select set_config('test.tomato', (select id::text from public.kitchen_items where normalized_name = 'tomato'), true);
select lives_ok(
  $$ insert into public.shopping_list_items (household_id, item_id, quantity, unit, store_tag)
     values (current_setting('test.hid')::uuid, current_setting('test.tomato')::uuid, 2, 'paint_bucket', 'Mile 12') $$,
  'a member can add an item to the list'
);
select is(
  (select created_by from public.shopping_list_items where item_id = current_setting('test.tomato')::uuid),
  '22222222-2222-2222-2222-222222222222'::uuid,
  'the list shows who added it'
);
select throws_ok(
  $$ insert into public.shopping_list_items (household_id, item_id)
     values (current_setting('test.hid')::uuid, current_setting('test.tomato')::uuid) $$,
  '23505', null, 'an item is on the list only once'
);
select throws_ok(
  $$ insert into public.shopping_list_items (household_id, item_id, quantity)
     values (current_setting('test.hid')::uuid, current_setting('test.tomato')::uuid, 0) $$,
  '23514', null, 'quantities are above zero'
);
select throws_ok(
  $$ insert into public.shopping_list_items (household_id, item_id, source)
     values (current_setting('test.hid')::uuid, current_setting('test.tomato')::uuid, 'robot') $$,
  '23514', null, 'sources are manual, pantry or meal_plan'
);

select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
update public.shopping_list_items set is_checked = true where item_id = current_setting('test.tomato')::uuid;
select is(
  (select checked_by from public.shopping_list_items where item_id = current_setting('test.tomato')::uuid),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'checking an entry off records who did it'
);
update public.shopping_list_items set is_checked = false where item_id = current_setting('test.tomato')::uuid;
select ok(
  (select checked_by is null and checked_at is null from public.shopping_list_items
   where item_id = current_setting('test.tomato')::uuid),
  'unchecking clears it'
);
select throws_ok(
  $$ update public.shopping_list_items set created_by = auth.uid() $$,
  '42501', null, 'who added an entry can''t be changed'
);

-- Another household's catalogue item can't be put on this list.
select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);
insert into public.kitchen_items (household_id, name, normalized_name)
values (current_setting('test.other_hid')::uuid, 'Yam', 'yam');
select set_config('test.yam', (select id::text from public.kitchen_items where normalized_name = 'yam'), true);
select is_empty(
  $$ select 1 from public.shopping_list_items $$,
  'other households can''t see the list'
);
delete from public.shopping_list_items;
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select isnt_empty(
  $$ select 1 from public.shopping_list_items $$,
  'other households can''t remove entries'
);
select throws_ok(
  $$ insert into public.shopping_list_items (household_id, item_id)
     values (current_setting('test.hid')::uuid, current_setting('test.yam')::uuid) $$,
  '23503', null, 'list entries use this household''s catalogue'
);

-- Removing and putting back (Undo) keeps the entry's id.
select set_config('test.entry', (select id::text from public.shopping_list_items limit 1), true);
delete from public.shopping_list_items where id = current_setting('test.entry')::uuid;
select is_empty($$ select 1 from public.shopping_list_items $$, 'a member can remove an entry');
select lives_ok(
  $$ insert into public.shopping_list_items (id, household_id, item_id, quantity, unit, store_tag)
     values (current_setting('test.entry')::uuid, current_setting('test.hid')::uuid,
             current_setting('test.tomato')::uuid, 2, 'paint_bucket', 'Mile 12') $$,
  'Undo puts it back with the same id'
);
-- ---------------------------------------------------------------- prices in shopping mode
update public.shopping_list_items set is_checked = true, price_paid_minor = 500000
where id = current_setting('test.entry')::uuid;
select is(
  (select price_paid_minor from public.shopping_list_items where id = current_setting('test.entry')::uuid),
  500000::bigint,
  'the price paid for the line is kept with the checked entry'
);
select throws_ok(
  $$ update public.shopping_list_items set price_paid_minor = 0 where id = current_setting('test.entry')::uuid $$,
  '23514', null, 'a price is above zero (skip it instead)'
);
update public.shopping_list_items set is_checked = false where id = current_setting('test.entry')::uuid;
select is(
  (select price_paid_minor from public.shopping_list_items where id = current_setting('test.entry')::uuid),
  null::bigint,
  'unchecking clears the price'
);
select ok(
  public.is_kitchen_unit('derica') and not public.is_kitchen_unit('cup'),
  'units are checked against the kitchen list'
);

-- ---------------------------------------------------------------- finishing a trip
-- Bola's list: tomatoes (checked, priced), rice (checked, no price, not for the pantry), garri
-- (checked, in grams into a pantry kept in kg), beans (checked, in mudu into a pantry kept in bags),
-- pepper (not checked: stays on the list).
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
insert into public.kitchen_items (household_id, name, normalized_name) values
  (current_setting('test.hid')::uuid, 'Rice', 'rice'),
  (current_setting('test.hid')::uuid, 'Garri', 'garri'),
  (current_setting('test.hid')::uuid, 'Beans', 'bean'),
  (current_setting('test.hid')::uuid, 'Pepper', 'pepper');
create temp table ids as
  select normalized_name as n, id from public.kitchen_items where household_id = current_setting('test.hid')::uuid;
grant select on ids to authenticated;
insert into public.pantry_items (household_id, item_id, quantity, unit) values
  (current_setting('test.hid')::uuid, (select id from ids where n = 'tomato'), 1, 'paint_bucket'),
  (current_setting('test.hid')::uuid, (select id from ids where n = 'garri'), 2, 'kg'),
  (current_setting('test.hid')::uuid, (select id from ids where n = 'bean'), 2, 'bag');
update public.shopping_list_items set is_checked = true, price_paid_minor = 500000 where item_id = (select id from ids where n = 'tomato');
insert into public.shopping_list_items (household_id, item_id, quantity, unit, is_checked) values
  (current_setting('test.hid')::uuid, (select id from ids where n = 'rice'), 1, 'bag', true),
  (current_setting('test.hid')::uuid, (select id from ids where n = 'garri'), 500, 'g', true),
  (current_setting('test.hid')::uuid, (select id from ids where n = 'bean'), 3, 'mudu', true),
  (current_setting('test.hid')::uuid, (select id from ids where n = 'pepper'), 1, 'pcs', false);
create temp table entries as
  select k.n, e.id from public.shopping_list_items e join ids k on k.id = e.item_id;
grant select on entries to authenticated;
select set_config('test.groceries', (select id::text from public.expense_categories
  where household_id = current_setting('test.hid')::uuid and name = 'Groceries'), true);
select set_config('test.payload', jsonb_build_array(
  jsonb_build_object('id', (select id from entries where n = 'tomato'), 'price_minor', 500000, 'to_pantry', true),
  jsonb_build_object('id', (select id from entries where n = 'rice'), 'price_minor', null, 'to_pantry', false),
  jsonb_build_object('id', (select id from entries where n = 'garri'), 'price_minor', 150000, 'to_pantry', true),
  jsonb_build_object('id', (select id from entries where n = 'bean'), 'price_minor', 900000, 'to_pantry', true)
)::text, true);

select throws_ok(
  $$ select public.finish_shopping_trip(current_setting('test.hid')::uuid, current_setting('test.payload')::jsonb,
       0, current_setting('test.groceries')::uuid, '2026-10-10', auth.uid(), 'Shopping at Mile 12') $$,
  '23514', null, 'a trip needs a total above zero'
);
select throws_ok(
  $$ select public.finish_shopping_trip(current_setting('test.hid')::uuid,
       (current_setting('test.payload')::jsonb) || jsonb_build_array(jsonb_build_object('id', (select id from entries where n = 'pepper'))),
       3850000, current_setting('test.groceries')::uuid, '2026-10-10', auth.uid(), 'Shopping at Mile 12') $$,
  '40001', null, 'entries that aren''t checked off (or are gone) stop the whole trip'
);
select set_config('test.trip', public.finish_shopping_trip(
  current_setting('test.hid')::uuid, current_setting('test.payload')::jsonb, 3850000,
  current_setting('test.groceries')::uuid, '2026-10-10', auth.uid(), 'Shopping at Mile 12',
  'Tomatoes, Rice, Garri, Beans', 'Mile 12')::text, true);

select is(
  (select amount_minor from public.expenses where id = (current_setting('test.trip')::jsonb ->> 'expense_id')::uuid),
  3850000::bigint,
  'finishing creates the expense for the total paid'
);
select is(
  (select category_id::text || ' ' || occurred_on || ' ' || description || ' / ' || paid_by::text
   from public.expenses where id = (current_setting('test.trip')::jsonb ->> 'expense_id')::uuid),
  current_setting('test.groceries') || ' 2026-10-10 Shopping at Mile 12 / 22222222-2222-2222-2222-222222222222',
  'with its category, date, description and who paid'
);
select is(
  (select item_count || ' ' || total_minor || ' ' || store_tag from public.shopping_trips
   where id = (current_setting('test.trip')::jsonb ->> 'trip_id')::uuid),
  '4 3850000 Mile 12',
  'and records the trip'
);
select is(
  (select count(*)::int from public.item_prices where trip_id = (current_setting('test.trip')::jsonb ->> 'trip_id')::uuid),
  3,
  'prices are recorded for the lines that have one'
);
select is(
  (select unit_price_minor from public.item_prices where item_id = (select id from ids where n = 'bean')),
  300000::bigint,
  'with the price per unit worked out'
);
select is(
  (select quantity from public.pantry_items where item_id = (select id from ids where n = 'tomato')),
  3.00,
  'the pantry adds to what''s there in the same unit'
);
select is(
  (select quantity || ' ' || unit from public.pantry_items where item_id = (select id from ids where n = 'garri')),
  '2.50 kg',
  '…converting grams into kilograms'
);
select is(
  (select quantity || ' ' || unit from public.pantry_items where item_id = (select id from ids where n = 'bean')),
  '3.00 mudu',
  '…and switching to the new unit when they don''t combine'
);
select is_empty(
  $$ select 1 from public.pantry_items where item_id = (select id from ids where n = 'rice') $$,
  'lines kept out of the pantry stay out'
);
select is(
  (select array_agg(k.n) from public.shopping_list_items e join ids k on k.id = e.item_id)::text,
  '{pepper}',
  'the bought entries leave the list; the rest stay'
);
select throws_ok(
  $$ select public.finish_shopping_trip(current_setting('test.hid')::uuid, current_setting('test.payload')::jsonb,
       3850000, current_setting('test.groceries')::uuid, '2026-10-10', auth.uid(), 'Again') $$,
  '40001', null, 'the same trip can''t be finished twice'
);
select throws_ok(
  $$ insert into public.item_prices (household_id, item_id, trip_id, quantity, unit, price_minor, bought_on)
     values (current_setting('test.hid')::uuid, (select id from ids where n = 'rice'),
             (current_setting('test.trip')::jsonb ->> 'trip_id')::uuid, 1, 'bag', 100, '2026-10-10') $$,
  '42501', null, 'prices are only written by finishing a trip'
);
-- ---------------------------------------------------------------- low stock goes on the list
-- After the trip the pantry has 2.5 kg of garri (and the list only pepper); give it a threshold.
update public.kitchen_items set default_unit = 'kg', default_store_tag = 'Oyingbo' where normalized_name = 'garri';
update public.pantry_items set low_stock_threshold = 1 where item_id = (select id from ids where n = 'garri');
select is_empty(
  $$ select 1 from public.shopping_list_items where item_id = (select id from ids where n = 'garri') $$,
  'above its threshold, an item stays off the list'
);
update public.pantry_items set quantity = 1 where item_id = (select id from ids where n = 'garri');
select is(
  (select source || ' ' || unit || ' ' || store_tag || ' ' || quantity from public.shopping_list_items
   where item_id = (select id from ids where n = 'garri')),
  'pantry kg Oyingbo 1.00',
  'falling to the threshold puts it on the list, with its usual unit and store'
);
update public.pantry_items set quantity = 0 where item_id = (select id from ids where n = 'garri');
select is(
  (select count(*)::int from public.shopping_list_items where item_id = (select id from ids where n = 'garri')),
  1,
  'falling further doesn''t add it again'
);
update public.shopping_list_items set quantity = 3 where item_id = (select id from ids where n = 'garri');
update public.pantry_items set quantity = 5 where item_id = (select id from ids where n = 'garri');
update public.pantry_items set quantity = 0.5 where item_id = (select id from ids where n = 'garri');
select is(
  (select quantity from public.shopping_list_items where item_id = (select id from ids where n = 'garri')),
  3.00,
  'running low again while it''s still on the list leaves the entry as it is'
);
select is(
  (select is_checked::text from public.shopping_list_items where item_id = (select id from ids where n = 'pepper')),
  'false',
  '(pepper is untouched)'
);
update public.pantry_items set low_stock_threshold = 2 where item_id = (select id from ids where n = 'tomato');
select is(
  (select source from public.shopping_list_items where item_id = (select id from ids where n = 'tomato')),
  null,
  'raising a threshold to just below the stock adds nothing'
);
update public.pantry_items set low_stock_threshold = 5 where item_id = (select id from ids where n = 'tomato');
select is(
  (select source from public.shopping_list_items where item_id = (select id from ids where n = 'tomato')),
  'pantry',
  'raising it past the stock does'
);

-- ---------------------------------------------------------------- cooking gas
select is(
  (select count(*)::int from public.expense_categories
   where household_id = current_setting('test.hid')::uuid and name = 'Cooking Gas' and parent_id is null),
  1,
  'households have a Cooking Gas category'
);
select ok(
  (select g.sort_order = c.sort_order + 1 from public.expense_categories g, public.expense_categories c
   where g.household_id = current_setting('test.hid')::uuid and g.name = 'Cooking Gas'
     and c.household_id = g.household_id and c.name = 'Groceries'),
  'right after Groceries'
);
select set_config('test.gas1', public.log_gas_refill(
  current_setting('test.hid')::uuid, '2026-08-01', 12.5, 1800000, auth.uid())::text, true);
select is(
  (select e.amount_minor || ' ' || c.name || ' ' || e.description from public.expenses e
   join public.expense_categories c on c.id = e.category_id
   where e.id = (current_setting('test.gas1')::jsonb ->> 'expense_id')::uuid),
  '1800000 Cooking Gas Cooking gas refill (12.5 kg)',
  'a refill records a Cooking Gas expense'
);
select is(
  (select cylinder_kg::text || ' ' || refilled_on from public.gas_refills
   where id = (current_setting('test.gas1')::jsonb ->> 'refill_id')::uuid),
  '12.50 2026-08-01',
  'and the refill itself'
);
select is(current_setting('test.gas1')::jsonb ->> 'task_id', null, 'no reminder unless asked');
select set_config('test.gas2', public.log_gas_refill(
  current_setting('test.hid')::uuid, '2026-09-15', 6, 1000000, auth.uid(), null, '2099-10-20')::text, true);
select is(
  (select title || ' ' || schedule_type || ' ' || next_due_on || ' ' || is_active from public.tasks
   where id = (current_setting('test.gas2')::jsonb ->> 'task_id')::uuid),
  'Refill cooking gas once 2099-10-20 true',
  'asking for a reminder creates a one-off task due then'
);
update public.tasks set is_active = false where id = (current_setting('test.gas2')::jsonb ->> 'task_id')::uuid;
select set_config('test.gas3', public.log_gas_refill(
  current_setting('test.hid')::uuid, '2026-10-20', 12.5, 1900000, auth.uid(), null, '2099-12-01')::text, true);
select is(
  current_setting('test.gas3')::jsonb ->> 'task_id',
  current_setting('test.gas2')::jsonb ->> 'task_id',
  'the next refill moves the same task'
);
select is(
  (select next_due_on || ' ' || is_active from public.tasks
   where id = (current_setting('test.gas3')::jsonb ->> 'task_id')::uuid),
  '2099-12-01 true',
  'to the new date, active again'
);
select set_config('test.gas4', public.log_gas_refill(
  current_setting('test.hid')::uuid, '2026-10-21', 3, 400000, auth.uid(), null, '2000-01-01')::text, true);
select is(
  (select next_due_on from public.tasks where id = (current_setting('test.gas4')::jsonb ->> 'task_id')::uuid),
  (select (now() at time zone 'Africa/Lagos')::date),
  'a reminder date already past becomes today'
);
select is(
  (select (cylinder_kg::float8)::text from public.gas_refills where id = (current_setting('test.gas4')::jsonb ->> 'refill_id')::uuid),
  '3',
  '(whole sizes stay whole)'
);
select lives_ok(
  $$ select public.remove_gas_refill((current_setting('test.gas4')::jsonb ->> 'refill_id')::uuid) $$,
  'a refill logged by mistake can be removed'
);
select ok(
  (select deleted_at is not null from public.expenses where id = (current_setting('test.gas4')::jsonb ->> 'expense_id')::uuid)
  and not exists (select 1 from public.gas_refills where id = (current_setting('test.gas4')::jsonb ->> 'refill_id')::uuid),
  'with its expense moved to Recently deleted'
);
select throws_ok(
  $$ insert into public.gas_refills (household_id, refilled_on, cylinder_kg, amount_minor)
     values (current_setting('test.hid')::uuid, '2026-10-01', 12.5, 100) $$,
  '42501', null, 'refills are only written by logging them'
);

select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);
select throws_ok(
  $$ select public.finish_shopping_trip(current_setting('test.hid')::uuid, '[{"id": "00000000-0000-0000-0000-000000000000"}]',
       100, current_setting('test.groceries')::uuid, '2026-10-10', auth.uid(), 'Not mine') $$,
  '42501', null, 'other households can''t finish this one''s trips'
);
select is_empty(
  $$ select 1 from public.item_prices union all select 1 from public.shopping_trips union all select 1 from public.pantry_items
     union all select 1 from public.gas_refills $$,
  'or see its prices, trips and pantry'
);

select * from finish();
rollback;
