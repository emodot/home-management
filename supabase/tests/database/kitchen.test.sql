-- My Kitchen: the item catalogue is shared by the household's members and kept free of duplicates.
begin;
select plan(25);

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
select ok(
  public.is_kitchen_unit('derica') and not public.is_kitchen_unit('cup'),
  'units are checked against the kitchen list'
);

select * from finish();
rollback;
