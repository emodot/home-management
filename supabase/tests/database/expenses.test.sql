-- Categories, expenses, receipts and receipt storage.
begin;
select plan(43);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ada@example.com', '{"full_name": "Ada Obi"}'),
  ('22222222-2222-2222-2222-222222222222', 'bola@example.com', '{}'),
  ('33333333-3333-3333-3333-333333333333', 'chidi@example.com', '{}');

-- Ada and Bola share a household; Chidi has his own.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);
select set_config('test.other_hid', (public.create_household('Chidi home')).id::text, true);
select set_config('test.other_cat', (select id::text from public.expense_categories where name = 'Rent'), true);

select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select set_config('test.hid', (public.create_household('Obi home')).id::text, true);
reset role;
insert into public.household_members (household_id, user_id)
values (current_setting('test.hid')::uuid, '22222222-2222-2222-2222-222222222222');
set local role authenticated;

-- ---------------------------------------------------------------- categories
select is(
  (select array_agg(name order by sort_order) from public.expense_categories
   where household_id = current_setting('test.hid')::uuid),
  array['Utilities', 'Electricity', 'Fuel & Generator', 'Water', 'Internet & TV',
        'Repairs & Maintenance', 'Cleaning', 'Security', 'Estate Dues & Service Charge', 'Rent',
        'Groceries', 'Furniture & Appliances', 'Other'],
  'new households get the default categories in order'
);
select is(
  (select count(*)::int from public.expense_categories),
  13,
  'members only see their own household''s categories'
);
select set_config('test.cat', (
  select id::text from public.expense_categories
  where household_id = current_setting('test.hid')::uuid and name = 'Electricity'
), true);

select lives_ok(
  $$ insert into public.expense_categories (household_id, name, icon, sort_order)
     values (current_setting('test.hid')::uuid, 'School fees', 'graduation-cap', 14) $$,
  'members can add categories'
);
select throws_ok(
  $$ insert into public.expense_categories (household_id, name, sort_order)
     values (current_setting('test.hid')::uuid, 'school FEES', 15) $$,
  '23505', null, 'category names are unique per household, ignoring case'
);
select throws_ok(
  $$ insert into public.expense_categories (household_id, name, sort_order)
     values (current_setting('test.other_hid')::uuid, 'Sneaky', 1) $$,
  '42501', null, 'members cannot add categories to other households'
);
select lives_ok(
  $$ update public.expense_categories set name = 'School & lessons', is_archived = true
     where household_id = current_setting('test.hid')::uuid and name = 'School fees' $$,
  'members can rename and archive categories'
);
select lives_ok(
  $$ select public.reorder_expense_categories(
       current_setting('test.hid')::uuid,
       array(select id from public.expense_categories
             where household_id = current_setting('test.hid')::uuid
             order by sort_order desc)) $$,
  'members can reorder categories'
);
select is(
  (select name from public.expense_categories
   where household_id = current_setting('test.hid')::uuid order by sort_order limit 1),
  'School & lessons',
  'reordering applies the given order'
);
select throws_ok(
  $$ delete from public.expense_categories where household_id = current_setting('test.hid')::uuid $$,
  '42501', null, 'categories cannot be deleted, only archived'
);

-- ---------------------------------------------------------------- expenses
select lives_ok(
  $$ insert into public.expenses (household_id, amount_minor, occurred_on, category_id, description)
     values (current_setting('test.hid')::uuid, 4500000, '2026-09-20', current_setting('test.cat')::uuid, 'NEPA token') $$,
  'members can add expenses'
);
select set_config('test.eid', (select id::text from public.expenses where description = 'NEPA token'), true);
select is(
  (select row(currency, status, paid_by, created_by, updated_by)::text
   from public.expenses where id = current_setting('test.eid')::uuid),
  row('NGN', 'confirmed', auth.uid(), auth.uid(), auth.uid())::text,
  'defaults: NGN, confirmed, paid by and created by the current user'
);
select throws_ok(
  $$ insert into public.expenses (household_id, amount_minor, occurred_on, category_id, description, created_by)
     values (current_setting('test.hid')::uuid, 100, '2026-09-20', current_setting('test.cat')::uuid, 'x', '22222222-2222-2222-2222-222222222222') $$,
  '42501', null, 'audit columns cannot be set by the client'
);
select throws_ok(
  $$ insert into public.expenses (household_id, amount_minor, occurred_on, category_id, description)
     values (current_setting('test.hid')::uuid, 100, '2026-09-20', current_setting('test.other_cat')::uuid, 'x') $$,
  '23503', null, 'expenses cannot use another household''s category'
);
select throws_ok(
  $$ insert into public.expenses (household_id, amount_minor, occurred_on, category_id, description, paid_by)
     values (current_setting('test.hid')::uuid, 100, '2026-09-20', current_setting('test.cat')::uuid, 'x', '33333333-3333-3333-3333-333333333333') $$,
  '23514', null, 'paid_by must be a household member'
);
select throws_ok(
  $$ insert into public.expenses (household_id, amount_minor, occurred_on, category_id, description)
     values (current_setting('test.hid')::uuid, 0, '2026-09-20', current_setting('test.cat')::uuid, 'x') $$,
  '23514', null, 'amounts must be positive'
);
select throws_ok(
  $$ insert into public.expenses (household_id, amount_minor, occurred_on, category_id, description)
     values (current_setting('test.hid')::uuid, 100, '2026-09-20', current_setting('test.cat')::uuid, '  ') $$,
  '23514', null, 'descriptions cannot be blank'
);
select throws_ok(
  $$ insert into public.expenses (household_id, amount_minor, occurred_on, category_id, description, paid_by)
     values (current_setting('test.other_hid')::uuid, 100, '2026-09-20', current_setting('test.other_cat')::uuid, 'x', null) $$,
  '42501', null, 'members cannot add expenses to other households'
);

-- Bola edits Ada's expense.
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select lives_ok(
  $$ update public.expenses set amount_minor = 5400000, paid_by = auth.uid()
     where id = current_setting('test.eid')::uuid $$,
  'any member can edit any expense'
);
select is(
  (select row(amount_minor, paid_by, created_by, updated_by)::text
   from public.expenses where id = current_setting('test.eid')::uuid),
  row(5400000, '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')::text,
  'edits keep created_by and record updated_by'
);
select throws_ok(
  $$ update public.expenses set household_id = current_setting('test.other_hid')::uuid
     where id = current_setting('test.eid')::uuid $$,
  '42501', null, 'expenses cannot be moved to another household'
);
select throws_ok(
  $$ update public.expenses set currency = 'USD' where id = current_setting('test.eid')::uuid $$,
  '42501', null, 'currency cannot be changed'
);
select throws_ok(
  $$ delete from public.expenses where id = current_setting('test.eid')::uuid $$,
  '42501', null, 'expenses cannot be hard-deleted by members'
);

-- ---------------------------------------------------------------- receipts and storage
select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('receipts', current_setting('test.hid') || '/' || current_setting('test.eid') || '/a.jpg') $$,
  'members can upload a receipt file under an expense'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('receipts', current_setting('test.hid') || '/' || gen_random_uuid() || '/b.jpg') $$,
  '42501', null, 'uploads must be under an existing expense'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('receipts', current_setting('test.hid') || '/' || current_setting('test.eid') || '/deeper/c.jpg') $$,
  '42501', null, 'uploads must be directly under the expense folder'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('receipts', 'not-a-uuid/x/d.jpg') $$,
  '42501', null, 'uploads must start with a household id'
);
select lives_ok(
  $$ insert into public.expense_receipts (household_id, expense_id, storage_path, file_name, mime_type, size_bytes)
     values (current_setting('test.hid')::uuid, current_setting('test.eid')::uuid,
             current_setting('test.hid') || '/' || current_setting('test.eid') || '/a.jpg',
             'receipt.jpg', 'image/jpeg', 204800) $$,
  'members can record a receipt'
);
select throws_ok(
  $$ insert into public.expense_receipts (household_id, expense_id, storage_path, file_name, mime_type, size_bytes)
     values (current_setting('test.hid')::uuid, current_setting('test.eid')::uuid,
             current_setting('test.other_hid') || '/' || current_setting('test.eid') || '/x.jpg',
             'x.jpg', 'image/jpeg', 100) $$,
  '23514', null, 'receipt paths must match their household and expense'
);
select throws_ok(
  $$ insert into public.expense_receipts (household_id, expense_id, storage_path, file_name, mime_type, size_bytes)
     values (current_setting('test.hid')::uuid, current_setting('test.eid')::uuid,
             current_setting('test.hid') || '/' || current_setting('test.eid') || '/y.gif',
             'y.gif', 'image/gif', 100) $$,
  '23514', null, 'only allowed file types can be recorded'
);
select throws_ok(
  $$ insert into public.expense_receipts (household_id, expense_id, storage_path, file_name, mime_type, size_bytes)
     values (current_setting('test.hid')::uuid, current_setting('test.eid')::uuid,
             current_setting('test.hid') || '/' || current_setting('test.eid') || '/z.pdf',
             'z.pdf', 'application/pdf', 10485761) $$,
  '23514', null, 'receipts are at most 10 MB'
);
select is(
  (select receipt_count from public.expense_list where id = current_setting('test.eid')::uuid),
  1,
  'expense_list counts receipts'
);
select lives_ok(
  $$ update public.expense_receipts set deleted_at = now() where expense_id = current_setting('test.eid')::uuid $$,
  'members can soft-delete receipts'
);
select is(
  (select receipt_count from public.expense_list where id = current_setting('test.eid')::uuid),
  0,
  'deleted receipts are not counted'
);

-- ---------------------------------------------------------------- soft delete
select lives_ok(
  $$ update public.expenses set deleted_at = now() where id = current_setting('test.eid')::uuid $$,
  'members can soft-delete expenses'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('receipts', current_setting('test.hid') || '/' || current_setting('test.eid') || '/e.jpg') $$,
  '42501', null, 'deleted expenses do not accept uploads'
);
select lives_ok(
  $$ update public.expenses set deleted_at = null where id = current_setting('test.eid')::uuid $$,
  'members can restore expenses'
);

-- ---------------------------------------------------------------- outsiders
select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);
select is_empty($$ select 1 from public.expenses where household_id = current_setting('test.hid')::uuid $$, 'outsiders see no expenses');
select is_empty($$ select 1 from public.expense_list where household_id = current_setting('test.hid')::uuid $$, 'outsiders see nothing in expense_list');
select is_empty($$ select 1 from public.expense_receipts $$, 'outsiders see no receipts');
select is_empty($$ select 1 from storage.objects where bucket_id = 'receipts' $$, 'outsiders cannot list receipt files');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('receipts', current_setting('test.hid') || '/' || current_setting('test.eid') || '/f.jpg') $$,
  '42501', null, 'outsiders cannot upload to another household'
);

reset role;
set local role anon;
select throws_ok($$ select 1 from public.expenses $$, '42501', null, 'anon cannot read expenses');

-- ---------------------------------------------------------------- deleting the household
reset role;
delete from public.household_members
where household_id = current_setting('test.hid')::uuid and user_id = '22222222-2222-2222-2222-222222222222';
set local role service_role;
select is(
  public.leave_household(current_setting('test.hid')::uuid, '11111111-1111-1111-1111-111111111111', true),
  'deleted',
  'a household with categories, expenses and receipts can be deleted'
);

reset role;
select * from finish();
rollback;
