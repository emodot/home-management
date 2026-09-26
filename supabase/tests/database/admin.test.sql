-- App admin functions: only the service role can call them; they see across all households.
begin;
select plan(19);

insert into auth.users (id, email, raw_user_meta_data, created_at) values
  ('11111111-1111-1111-1111-111111111111', 'ada@example.com', '{"full_name": "Ada Obi"}', now() - interval '60 days'),
  ('22222222-2222-2222-2222-222222222222', 'bola@example.com', '{"full_name": "Bola Ade"}', now() - interval '3 days'),
  ('33333333-3333-3333-3333-333333333333', 'chidi@example.com', '{}', now());
insert into public.app_admins (user_id) values ('11111111-1111-1111-1111-111111111111');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select set_config('test.hid', (public.create_household('Ade home')).id::text, true);
insert into public.expenses (household_id, amount_minor, occurred_on, category_id, description)
values (current_setting('test.hid')::uuid, 100000, current_date,
        (select id from public.expense_categories where household_id = current_setting('test.hid')::uuid and name = 'Water'),
        'Water');
select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);
select set_config('test.other_hid', (public.create_household('Chidi flat')).id::text, true);

-- ---------------------------------------------------------------- access
select is_empty($$ select 1 from public.app_admins $$, 'non-admins do not see the admin list');
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select is((select count(*)::int from public.app_admins), 1, 'admins can see that they are an admin');
select throws_ok($$ select public.admin_overview() $$, '42501', null, 'even admins cannot call admin functions directly');
select throws_ok($$ select * from public.admin_list_users() $$, '42501', null, 'user listing is service-role only');
select throws_ok($$ insert into public.app_admins (user_id) values (auth.uid()) $$, '42501', null, 'nobody can make themselves an admin');

reset role;
set local role service_role;
select ok(public.is_app_admin('11111111-1111-1111-1111-111111111111'), 'is_app_admin: admin');
select ok(not public.is_app_admin('22222222-2222-2222-2222-222222222222'), 'is_app_admin: member');

-- ---------------------------------------------------------------- overview
select is(
  (select jsonb_build_object('users', o -> 'users', 'households', o -> 'households', 'expenses', o -> 'expenses',
                             'newUsers30d', o -> 'newUsers30d', 'activeHouseholds30d', o -> 'activeHouseholds30d')
   from (select public.admin_overview() as o) x),
  '{"users": 2, "households": 2, "expenses": 1, "newUsers30d": 2, "activeHouseholds30d": 2}'::jsonb,
  'overview counts across all households (admin accounts are not users)'
);
select is(
  (select jsonb_array_length(public.admin_overview() -> 'signupsByWeek')),
  12,
  'sign-ups cover the last 12 weeks'
);
select is(
  (select ((public.admin_overview() -> 'signupsByWeek') -> 11 ->> 'count')::int
          + ((public.admin_overview() -> 'signupsByWeek') -> 10 ->> 'count')::int),
  2,
  'recent sign-ups land in the latest weeks'
);

-- ---------------------------------------------------------------- users
select is(
  (select array_agg(email order by email) from public.admin_list_users()),
  array['bola@example.com', 'chidi@example.com'],
  'lists every user except admin accounts'
);
select is(
  (select row(email, household_count, is_admin, total_count)::text from public.admin_list_users('BOLA')),
  row('bola@example.com', 1, false, 1::bigint)::text,
  'searches by email or name, case-insensitively'
);
select is(
  (select count(*)::int from public.admin_list_users(null, 1, 0)),
  1,
  'pages'
);
select is(
  (select public.admin_get_user('33333333-3333-3333-3333-333333333333') -> 'households' -> 0 ->> 'name'),
  'Chidi flat',
  'a user''s households'
);

-- ---------------------------------------------------------------- households
select is(
  (select row(name, member_count, expense_count)::text from public.admin_list_households('ade')),
  row('Ade home', 1, 1)::text,
  'lists households with their size'
);
select is(
  (select public.admin_get_household(current_setting('test.hid')::uuid) -> 'members' -> 0 ->> 'email'),
  'bola@example.com',
  'household detail includes members'
);
select lives_ok(
  $$ select public.admin_rename_household(current_setting('test.hid')::uuid, ' Ade family ') $$,
  'rename'
);
select throws_ok(
  $$ select public.admin_rename_household(gen_random_uuid(), 'x') $$,
  'P0001', 'household_not_found', 'renaming a missing household fails'
);
select public.admin_delete_household(current_setting('test.other_hid')::uuid);
select public.admin_log('11111111-1111-1111-1111-111111111111', 'delete_household', 'household',
                        current_setting('test.other_hid')::uuid, '{"name": "Chidi flat"}');
select is(
  (select row(
     (select count(*) from public.households where id = current_setting('test.other_hid')::uuid),
     public.admin_overview() -> 'recentActions' -> 0 ->> 'adminName',
     (select name from public.households where id = current_setting('test.hid')::uuid))::text),
  row(0::bigint, 'Ada Obi', 'Ade family')::text,
  'deleting removes the household; the action is logged with the admin''s name'
);

reset role;
select * from finish();
rollback;
