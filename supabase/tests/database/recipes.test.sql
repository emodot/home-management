-- My Kitchen recipes: shared by the household's members, saved with their ingredients and steps in
-- one go, with a private photo.
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
insert into public.kitchen_items (household_id, name, normalized_name)
values (current_setting('test.other_hid')::uuid, 'Yam', 'yam');
select set_config('test.yam', (select id::text from public.kitchen_items where normalized_name = 'yam'), true);
reset role;
insert into public.household_members (household_id, user_id)
values (current_setting('test.hid')::uuid, '22222222-2222-2222-2222-222222222222');
set local role authenticated;

-- Bola's catalogue.
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
insert into public.kitchen_items (household_id, name, normalized_name) values
  (current_setting('test.hid')::uuid, 'Rice', 'rice'),
  (current_setting('test.hid')::uuid, 'Tomatoes', 'tomato'),
  (current_setting('test.hid')::uuid, 'Salt', 'salt'),
  (current_setting('test.hid')::uuid, 'Bay leaves', 'bay leaf'),
  (current_setting('test.hid')::uuid, 'Dried bay leaves', 'dried bay leaf');
create temp table ids as
  select normalized_name as n, id from public.kitchen_items where household_id = current_setting('test.hid')::uuid;
grant select on ids to authenticated;

-- ---------------------------------------------------------------- saving
select set_config('test.rid', public.save_recipe(
  current_setting('test.hid')::uuid, null, 'Jollof rice', 4, 15, 60, array['Rice', 'Party'], null,
  jsonb_build_array(
    jsonb_build_object('item_id', (select id from ids where n = 'rice'), 'quantity', 3, 'unit', 'derica'),
    jsonb_build_object('item_id', (select id from ids where n = 'tomato'), 'quantity', 1.5, 'unit', 'kg', 'note', ' blended '),
    jsonb_build_object('item_id', (select id from ids where n = 'salt'), 'quantity', null, 'unit', 'pcs'),
    jsonb_build_object('item_id', (select id from ids where n = 'bay leaf'), 'quantity', 2, 'unit', 'pcs', 'is_optional', true)
  ),
  '["Parboil the rice.", "  Fry the tomato base.  "]'::jsonb
)::text, true);

select is(
  (select title || ' ' || servings || ' ' || prep_minutes || '+' || cook_minutes || ' ' || array_to_string(tags, ',')
   from public.recipes where id = current_setting('test.rid')::uuid),
  'Jollof rice 4 15+60 Rice,Party',
  'a member saves a recipe'
);
select is(
  (select created_by from public.recipes where id = current_setting('test.rid')::uuid),
  '22222222-2222-2222-2222-222222222222'::uuid,
  'who added it is recorded'
);
select is(
  (select string_agg(k.name || ' ' || coalesce(i.quantity::text, 'to taste') || ' ' || i.unit
                     || coalesce(' (' || i.note || ')', '') || case when i.is_optional then ' optional' else '' end,
                     '; ' order by i.position)
   from public.recipe_ingredients i join public.kitchen_items k on k.id = i.item_id
   where i.recipe_id = current_setting('test.rid')::uuid),
  'Rice 3.00 derica; Tomatoes 1.50 kg (blended); Salt to taste pcs; Bay leaves 2.00 pcs optional',
  'with its ingredients in order: notes trimmed, "to taste" and optional ones kept'
);
select is(
  (select string_agg(position || '. ' || body, ' ' order by position) from public.recipe_steps
   where recipe_id = current_setting('test.rid')::uuid),
  '1. Parboil the rice. 2. Fry the tomato base.',
  'and its steps in order, trimmed'
);

select lives_ok(
  $$ select public.save_recipe(current_setting('test.hid')::uuid, current_setting('test.rid')::uuid,
       'Party jollof', 10, null, 90, '{}', 'Use a big pot.',
       jsonb_build_array(jsonb_build_object('item_id', (select id from ids where n = 'rice'), 'quantity', 2, 'unit', 'bag')),
       '["Cook it all."]') $$,
  'saving again updates it'
);
select is(
  (select title || ' ' || servings || ' ' || coalesce(prep_minutes::text, '-') || ' ' || notes from public.recipes
   where id = current_setting('test.rid')::uuid),
  'Party jollof 10 - Use a big pot.',
  'with the new details'
);
select is(
  (select count(*)::int from public.recipe_ingredients where recipe_id = current_setting('test.rid')::uuid)
  + 10 * (select count(*)::int from public.recipe_steps where recipe_id = current_setting('test.rid')::uuid),
  11,
  'and replaces the ingredients and steps'
);

select throws_ok(
  $$ select public.save_recipe(current_setting('test.hid')::uuid, null, 'Yam porridge', 4, null, null, '{}', null,
       jsonb_build_array(jsonb_build_object('item_id', current_setting('test.yam')::uuid, 'quantity', 1, 'unit', 'tuber')),
       '[]') $$,
  '23503', null, 'ingredients must be this household''s items'
);
select is(
  (select count(*)::int from public.recipes where title = 'Yam porridge'),
  0,
  '…and nothing of that recipe is saved'
);
select throws_ok(
  $$ select public.save_recipe(current_setting('test.hid')::uuid, null, 'Moi moi', 4, null, null, array[' Snack'], null, '[]', '[]') $$,
  '23514', null, 'tags are trimmed'
);
select throws_ok(
  $$ select public.save_recipe(current_setting('test.hid')::uuid, null, 'Moi moi', 0, null, null, '{}', null, '[]', '[]') $$,
  '23514', null, 'servings are at least 1'
);
select throws_ok(
  $$ select public.save_recipe(current_setting('test.hid')::uuid, null, 'Moi moi', 4, null, null, '{}', null,
       jsonb_build_array(jsonb_build_object('item_id', (select id from ids where n = 'rice'), 'quantity', 0, 'unit', 'kg')),
       '[]') $$,
  '23514', null, 'quantities are above zero'
);
select throws_ok(
  $$ update public.recipe_ingredients set quantity = 5 where recipe_id = current_setting('test.rid')::uuid $$,
  '42501', null, 'ingredients change only by saving the recipe'
);

-- ---------------------------------------------------------------- photos
select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('recipe-photos', current_setting('test.hid') || '/' || current_setting('test.rid') || '/a.jpg') $$,
  'members can upload a photo under a recipe'
);
select lives_ok(
  $$ update public.recipes set photo_path = current_setting('test.hid') || '/' || current_setting('test.rid') || '/a.jpg'
     where id = current_setting('test.rid')::uuid $$,
  'and set it as the recipe''s photo'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('recipe-photos', current_setting('test.hid') || '/' || gen_random_uuid() || '/b.jpg') $$,
  '42501', null, 'uploads must be under an existing recipe'
);
select throws_ok(
  $$ update public.recipes set photo_path = current_setting('test.hid') || '/' || gen_random_uuid() || '/a.jpg'
     where id = current_setting('test.rid')::uuid $$,
  '23514', null, 'a recipe''s photo is in its own folder'
);

-- ---------------------------------------------------------------- merging items
select set_config('test.r2', public.save_recipe(
  current_setting('test.hid')::uuid, null, 'Pepper soup', 2, null, null, array['Soup'], null,
  jsonb_build_array(jsonb_build_object('item_id', (select id from ids where n = 'dried bay leaf'), 'quantity', 3, 'unit', 'pcs')),
  '[]')::text, true);
select public.merge_kitchen_items((select id from ids where n = 'bay leaf'), (select id from ids where n = 'dried bay leaf'));
select is(
  (select k.name from public.recipe_ingredients i join public.kitchen_items k on k.id = i.item_id
   where i.recipe_id = current_setting('test.r2')::uuid),
  'Bay leaves',
  'merging catalogue items moves recipe ingredients to the item kept'
);

-- ---------------------------------------------------------------- other households
select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);
select is_empty(
  $$ select 1 from public.recipes union all select 1 from public.recipe_ingredients union all select 1 from public.recipe_steps $$,
  'other households can''t see the recipes'
);
select throws_ok(
  $$ select public.save_recipe(current_setting('test.hid')::uuid, current_setting('test.rid')::uuid,
       'Mine now', 4, null, null, '{}', null, '[]', '[]') $$,
  'P0002', null, 'or change them'
);
select throws_ok(
  $$ select public.save_recipe(current_setting('test.hid')::uuid, null, 'Sneaky', 4, null, null, '{}', null, '[]', '[]') $$,
  '42501', null, 'or add to them'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('recipe-photos', current_setting('test.hid') || '/' || current_setting('test.rid') || '/c.jpg') $$,
  '42501', null, 'or upload photos to them'
);
delete from public.recipes where id = current_setting('test.rid')::uuid;

select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select isnt_empty(
  $$ select 1 from public.recipes where id = current_setting('test.rid')::uuid $$,
  '(their delete removed nothing)'
);
select lives_ok(
  $$ delete from public.recipes where id = current_setting('test.rid')::uuid $$,
  'any member can delete a recipe'
);
select is_empty(
  $$ select 1 from public.recipe_ingredients where recipe_id = current_setting('test.rid')::uuid
     union all select 1 from public.recipe_steps where recipe_id = current_setting('test.rid')::uuid $$,
  'with its ingredients and steps'
);

select * from finish();
rollback;
