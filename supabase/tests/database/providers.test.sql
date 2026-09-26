-- Providers: RLS, validation, links from expenses and bills, spend totals.
begin;
select plan(20);

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
  ('11111111-1111-1111-1111-111111111111', 'ada@example.com', '{"full_name": "Ada Obi"}'),
  ('33333333-3333-3333-3333-333333333333', 'chidi@example.com', '{}');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);
select set_config('test.other_hid', (pg_temp.create_household('Chidi home')).id::text, true);
insert into public.providers (household_id, name, trade) values (current_setting('test.other_hid')::uuid, 'Chidi plumber', 'plumber');
select set_config('test.other_pid', (select id::text from public.providers where name = 'Chidi plumber'), true);

select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select set_config('test.hid', (pg_temp.create_household('Obi home')).id::text, true);
select set_config('test.cat', (
  select id::text from public.expense_categories
  where household_id = current_setting('test.hid')::uuid and name = 'Repairs & Maintenance'), true);

-- ---------------------------------------------------------------- providers
select lives_ok(
  $$ insert into public.providers (household_id, name, trade, phone, whatsapp, email, area, rating)
     values (current_setting('test.hid')::uuid, 'Musa Electric', 'electrician', '+2348031234567',
             '+2348031234567', 'musa@example.com', 'Lekki Phase 1', 5) $$,
  'members can add providers'
);
select set_config('test.pid', (select id::text from public.providers where name = 'Musa Electric'), true);
select is(
  (select row(created_by, trade)::text from public.providers where id = current_setting('test.pid')::uuid),
  row(auth.uid(), 'electrician')::text,
  'audit columns are set'
);
select throws_ok(
  $$ insert into public.providers (household_id, name, phone) values (current_setting('test.hid')::uuid, 'x', '08031234567') $$,
  '23514', null, 'phone numbers are stored in E.164'
);
select throws_ok(
  $$ insert into public.providers (household_id, name, rating) values (current_setting('test.hid')::uuid, 'x', 6) $$,
  '23514', null, 'ratings are 1 to 5'
);
select throws_ok(
  $$ insert into public.providers (household_id, name, trade) values (current_setting('test.hid')::uuid, 'x', 'architect') $$,
  '23514', null, 'trades come from the list'
);
select throws_ok(
  $$ insert into public.providers (household_id, name, email) values (current_setting('test.hid')::uuid, 'x', 'not-an-email') $$,
  '23514', null, 'emails must look like emails'
);
select is(
  (select count(*)::int from public.providers),
  1,
  'members only see their own household''s providers'
);
select throws_ok(
  $$ delete from public.providers where id = current_setting('test.pid')::uuid $$,
  '42501', null, 'providers are soft-deleted, not deleted'
);
select lives_ok(
  $$ update public.providers set deleted_at = now() where id = current_setting('test.pid')::uuid $$,
  'members can soft-delete providers'
);
select lives_ok(
  $$ update public.providers set deleted_at = null, rating = null where id = current_setting('test.pid')::uuid $$,
  'and restore them'
);

-- ---------------------------------------------------------------- links
select lives_ok(
  $$ insert into public.expenses (household_id, amount_minor, occurred_on, category_id, description, provider_id) values
       (current_setting('test.hid')::uuid, 3000000, '2026-09-10', current_setting('test.cat')::uuid, 'Rewiring', current_setting('test.pid')::uuid),
       (current_setting('test.hid')::uuid, 1500000, '2025-12-10', current_setting('test.cat')::uuid, 'Socket repair', current_setting('test.pid')::uuid),
       (current_setting('test.hid')::uuid, 999900, '2026-09-11', current_setting('test.cat')::uuid, 'Deleted job', current_setting('test.pid')::uuid) $$,
  'expenses can link to a provider'
);
update public.expenses set deleted_at = now() where description = 'Deleted job';
select throws_ok(
  $$ insert into public.expenses (household_id, amount_minor, occurred_on, category_id, description, provider_id)
     values (current_setting('test.hid')::uuid, 100, '2026-09-10', current_setting('test.cat')::uuid, 'x', current_setting('test.other_pid')::uuid) $$,
  '23503', null, 'expenses cannot link to another household''s provider'
);
select is(
  (select provider_id::text from public.expense_list where description = 'Rewiring'),
  current_setting('test.pid'),
  'expense_list includes the provider'
);

-- ---------------------------------------------------------------- totals
select is(
  (select row(total_minor, expense_count)::text
   from public.expense_provider_totals(current_setting('test.hid')::uuid)),
  row(4500000, 2)::text,
  'all-time spend skips deleted expenses'
);
select is(
  (select total_minor from public.expense_provider_totals(current_setting('test.hid')::uuid, '2026-01-01', '2026-12-31')),
  3000000::bigint,
  'spend within a date range'
);

-- ---------------------------------------------------------------- recurring bills carry the provider
select lives_ok(
  $$ insert into public.recurring_expenses
       (household_id, description, amount_minor, category_id, frequency, start_on, next_due_on, provider_id)
     values (current_setting('test.hid')::uuid, 'Generator service', 2500000, current_setting('test.cat')::uuid,
             'quarterly', '2026-09-01', '2026-09-01', current_setting('test.pid')::uuid) $$,
  'bills can link to a provider'
);
reset role;
set local role service_role;
select is(public.generate_recurring_expenses('2026-09-30'), 1, 'the bill generates a pending expense');
select is(
  (select provider_id::text from public.expenses where description = 'Generator service'),
  current_setting('test.pid'),
  'with the bill''s provider'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);
select is_empty(
  $$ select * from public.expense_provider_totals(current_setting('test.hid')::uuid) $$,
  'outsiders get no provider totals'
);
select is(
  (select array_agg(name) from public.providers),
  array['Chidi plumber'],
  'outsiders see only their own providers'
);

reset role;
select * from finish();
rollback;
