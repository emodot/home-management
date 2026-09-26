-- Managing admin accounts (service role only, called by the admin edge function).
begin;
select plan(8);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'admin@example.com', '{"full_name": "Ops Admin"}'),
  ('22222222-2222-2222-2222-222222222222', 'Bola@Example.com', '{}');
insert into public.app_admins (user_id) values ('11111111-1111-1111-1111-111111111111');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select throws_ok($$ select * from public.admin_list_admins() $$, '42501', null, 'admins cannot call these directly');
select throws_ok($$ select public.admin_grant(auth.uid()) $$, '42501', null, 'nobody can grant admin from the app');

reset role;
set local role service_role;
select is(
  (select row(email, full_name, household_count)::text from public.admin_list_admins()),
  row('admin@example.com', 'Ops Admin', 0)::text,
  'lists admins'
);
select is(
  (select row(id, is_admin)::text from public.admin_find_user_by_email(' bola@example.COM ')),
  row('22222222-2222-2222-2222-222222222222'::uuid, false)::text,
  'finds an existing regular account by email, ignoring case'
);
select is_empty($$ select * from public.admin_find_user_by_email('new@example.com') $$, 'a free email finds nothing');

select public.admin_grant('22222222-2222-2222-2222-222222222222');
select public.admin_grant('22222222-2222-2222-2222-222222222222');
select is((select count(*)::int from public.app_admins), 2, 'granting is idempotent');
select is_empty($$ select 1 from public.admin_list_users() $$, 'admins are not listed as users');
select public.admin_revoke('22222222-2222-2222-2222-222222222222');
select is(
  (select array_agg(email) from public.admin_list_users()),
  array['Bola@Example.com'],
  'revoking makes them a regular user again'
);

reset role;
select * from finish();
rollback;
