-- My Kitchen meal planner: weeks of meals, batch cooking (leftovers), copying a week, and the
-- household's meal slots.
begin;
select plan(33);

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
select pg_temp.create_household('Chidi flat');
reset role;
insert into public.household_members (household_id, user_id)
values (current_setting('test.hid')::uuid, '22222222-2222-2222-2222-222222222222');
set local role authenticated;

-- ---------------------------------------------------------------- meal slots
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select is(
  (select array_to_string(meal_slots, ',') from public.households where id = current_setting('test.hid')::uuid),
  'breakfast,lunch,dinner',
  'households start with breakfast, lunch and dinner'
);
select lives_ok(
  $$ select public.set_meal_slots(current_setting('test.hid')::uuid, array['dinner', 'snack', 'breakfast', 'dinner']) $$,
  'a household admin chooses the slots'
);
select is(
  (select array_to_string(meal_slots, ',') from public.households where id = current_setting('test.hid')::uuid),
  'breakfast,snack,dinner',
  'kept in the day''s order, once each'
);
select throws_ok(
  $$ select public.set_meal_slots(current_setting('test.hid')::uuid, array['brunch']) $$,
  '23514', null, 'only known slots'
);
select throws_ok(
  $$ select public.set_meal_slots(current_setting('test.hid')::uuid, '{}') $$,
  '23514', null, 'at least one'
);
select public.set_meal_slots(current_setting('test.hid')::uuid, array['breakfast', 'lunch', 'dinner']);
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select throws_ok(
  $$ select public.set_meal_slots(current_setting('test.hid')::uuid, array['lunch']) $$,
  '42501', null, 'members who aren''t admins can''t'
);

-- ---------------------------------------------------------------- planning meals
insert into public.kitchen_items (household_id, name, normalized_name)
values (current_setting('test.hid')::uuid, 'Egusi', 'egusi');
select set_config('test.egusi', public.save_recipe(
  current_setting('test.hid')::uuid, null, 'Egusi soup', 6, null, 90, '{}', null,
  jsonb_build_array(jsonb_build_object('item_id', (select id from public.kitchen_items where normalized_name = 'egusi'), 'quantity', 2, 'unit', 'derica')),
  '[]')::text, true);

-- Sunday 11 October: egusi for dinner, covering lunch on Monday and Tuesday.
select set_config('test.cook', public.add_meal(
  current_setting('test.hid')::uuid, '2026-10-11', 'dinner', current_setting('test.egusi')::uuid, null, 4,
  '[{"date": "2026-10-12", "slot": "lunch", "servings": 2}, {"date": "2026-10-13", "slot": "lunch", "servings": 2}]'
)::text, true);
select is(
  (select title || ' ' || servings || ' ' || p.week_start from public.meal_plan_entries e
   join public.meal_plans p on p.id = e.plan_id where e.id = current_setting('test.cook')::uuid),
  'Egusi soup 4 2026-10-11',
  'a member plans a recipe, titled after it, in that week''s plan'
);
select is(
  (select string_agg(date || ' ' || slot || ' ' || title || ' ' || servings, '; ' order by date)
   from public.meal_plan_entries where leftover_of = current_setting('test.cook')::uuid),
  '2026-10-12 lunch Egusi soup 2; 2026-10-13 lunch Egusi soup 2',
  'with the later meals its pot covers'
);
select is(
  (select created_by from public.meal_plan_entries where id = current_setting('test.cook')::uuid),
  '22222222-2222-2222-2222-222222222222'::uuid,
  'who planned it is recorded'
);
select set_config('test.out', public.add_meal(
  current_setting('test.hid')::uuid, '2026-10-14', 'dinner', null, ' Eat out ', null)::text, true);
select is(
  (select title || ' ' || week_start from public.meal_plans p join public.meal_plan_entries e on e.plan_id = p.id
   where e.id = current_setting('test.out')::uuid),
  'Eat out 2026-10-11',
  'something written in goes in the week of its day (a Wednesday is in the week from Sunday)'
);
select is(
  (select count(*)::int from public.meal_plans where household_id = current_setting('test.hid')::uuid),
  1,
  'one plan per week'
);
select throws_ok(
  $$ select public.add_meal(current_setting('test.hid')::uuid, '2026-10-14', 'lunch', null, '  ', null) $$,
  '23502', null, 'a meal needs a recipe or a name'
);
select throws_ok(
  $$ select public.add_meal(current_setting('test.hid')::uuid, '2026-10-14', 'brunch', null, 'Toast', null) $$,
  '23514', null, 'and a known slot'
);
select throws_ok(
  $$ select public.add_meal(current_setting('test.hid')::uuid, '2026-10-12', 'dinner', current_setting('test.egusi')::uuid, null, 4,
       '[{"date": "2026-10-12", "slot": "lunch", "servings": 2}]') $$,
  '22023', null, 'leftovers come after the meal they''re cooked for'
);
select throws_ok(
  $$ select public.add_meal(current_setting('test.hid')::uuid, '2026-10-16', 'dinner', current_setting('test.egusi')::uuid, null, 4,
       '[{"date": "2026-10-18", "slot": "lunch", "servings": 2}]') $$,
  '22023', null, 'in the same week'
);

select lives_ok(
  $$ select public.set_meal_leftovers(current_setting('test.cook')::uuid,
       '[{"date": "2026-10-15", "slot": "dinner", "servings": 3}]') $$,
  'what a pot covers can change'
);
select is(
  (select string_agg(date || ' ' || slot || ' ' || servings, '; ') from public.meal_plan_entries
   where leftover_of = current_setting('test.cook')::uuid),
  '2026-10-15 dinner 3',
  'replacing the leftovers it had'
);
select throws_ok(
  $$ select public.set_meal_leftovers((select id from public.meal_plan_entries where leftover_of = current_setting('test.cook')::uuid),
       '[]') $$,
  '22023', null, 'leftovers don''t have leftovers'
);
select lives_ok(
  $$ update public.meal_plan_entries set servings = 5 where id = current_setting('test.cook')::uuid $$,
  'members change how many are eating'
);
select throws_ok(
  $$ update public.meal_plan_entries set date = '2026-10-20' where id = current_setting('test.cook')::uuid $$,
  '42501', null, 'but meals don''t move out of their week by hand'
);

-- ---------------------------------------------------------------- copying a week
select is(
  public.copy_meal_week(current_setting('test.hid')::uuid, '2026-10-11', '2026-10-18'),
  3,
  'a week copies into the next'
);
select is(
  (select string_agg(e.date || ' ' || e.slot || ' ' || e.title || coalesce(' from ' || c.date, ''), '; ' order by e.date, e.slot)
   from public.meal_plan_entries e
   join public.meal_plans p on p.id = e.plan_id and p.week_start = '2026-10-18'
   left join public.meal_plan_entries c on c.id = e.leftover_of),
  '2026-10-18 dinner Egusi soup; 2026-10-21 dinner Eat out; 2026-10-22 dinner Egusi soup from 2026-10-18',
  'same days and slots, leftovers pointing at the copied pot'
);
select throws_ok(
  $$ select public.copy_meal_week(current_setting('test.hid')::uuid, '2026-10-11', '2026-10-18') $$,
  '23505', null, 'only into an empty week'
);

-- ---------------------------------------------------------------- the week onto the shopping list
select is(
  public.add_plan_to_list(current_setting('test.hid')::uuid, '2026-10-11',
    jsonb_build_array(jsonb_build_object('item_id', (select id from public.kitchen_items where normalized_name = 'egusi'), 'quantity', 4, 'unit', 'derica')))
    -> 0 ->> 'status',
  'added',
  'what the week needs goes on the list'
);
select is(
  (select quantity || ' ' || unit || ' ' || source || ' ' || (source_ref = p.id)
   from public.shopping_list_items e, public.meal_plans p
   where e.item_id = (select id from public.kitchen_items where normalized_name = 'egusi')
     and p.household_id = e.household_id and p.week_start = '2026-10-11'),
  '4.00 derica meal_plan true',
  'for that week''s plan'
);
select is(
  (select string_agg(x ->> 'status', ' ') from jsonb_array_elements(public.add_plan_to_list(
    current_setting('test.hid')::uuid, '2026-10-11',
    jsonb_build_array(jsonb_build_object('item_id', (select id from public.kitchen_items where normalized_name = 'egusi'), 'quantity', 6, 'unit', 'derica')))) x),
  'topped_up',
  'doing it again tops the entry up rather than adding another'
);
select is(
  (select count(*)::int || ' ' || max(quantity) from public.shopping_list_items
   where item_id = (select id from public.kitchen_items where normalized_name = 'egusi')),
  '1 6.00',
  'one entry, with what''s needed'
);
select throws_ok(
  $$ select public.add_plan_to_list(current_setting('test.hid')::uuid, '2027-01-03', '[]') $$,
  'P0002', null, 'a week with no plan has nothing to add'
);

-- ---------------------------------------------------------------- removing
delete from public.meal_plan_entries where id = current_setting('test.cook')::uuid;
select is_empty(
  $$ select 1 from public.meal_plan_entries where leftover_of = current_setting('test.cook')::uuid $$,
  'removing a pot removes its leftovers'
);
delete from public.recipes where id = current_setting('test.egusi')::uuid;
select is(
  (select string_agg(coalesce(recipe_id::text, 'none') || ' ' || title, '; ') from public.meal_plan_entries e
   join public.meal_plans p on p.id = e.plan_id and p.week_start = '2026-10-18' where e.leftover_of is null and title <> 'Eat out'),
  'none Egusi soup',
  'a deleted recipe''s meals stay, by name'
);

-- ---------------------------------------------------------------- other households
select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);
select is_empty(
  $$ select 1 from public.meal_plans union all select 1 from public.meal_plan_entries $$,
  'other households can''t see the plan'
);
select throws_ok(
  $$ select public.add_meal(current_setting('test.hid')::uuid, '2026-10-14', 'lunch', null, 'Sneaky', null) $$,
  '42501', null, 'or add to it'
);
select throws_ok(
  $$ select public.add_plan_to_list(current_setting('test.hid')::uuid, '2026-10-11', '[]') $$,
  '42501', null, 'or put it on the list'
);

select * from finish();
rollback;
