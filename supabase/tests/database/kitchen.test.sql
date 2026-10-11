-- My Kitchen: the item catalogue is shared by the household's members and kept free of duplicates.
begin;
select plan(11);

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

select * from finish();
rollback;
