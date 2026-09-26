-- Profile photos: users write only inside their own avatars folder; profiles follow email changes.
begin;
select plan(8);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ada@example.com', '{"full_name": "Ada Obi"}'),
  ('22222222-2222-2222-2222-222222222222', 'bola@example.com', '{}');

select is(
  (select row(public, file_size_limit)::text from storage.buckets where id = 'avatars'),
  row(true, 2097152::bigint)::text,
  'avatars are public and at most 2 MB'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('avatars', '11111111-1111-1111-1111-111111111111/avatar.jpg') $$,
  'users can upload their own avatar'
);
select lives_ok(
  $$ update storage.objects set metadata = '{"v": 2}' where bucket_id = 'avatars' and name = '11111111-1111-1111-1111-111111111111/avatar.jpg' $$,
  'and replace it'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('avatars', '22222222-2222-2222-2222-222222222222/avatar.jpg') $$,
  '42501', null, 'but not into someone else''s folder'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('avatars', 'avatar.jpg') $$,
  '42501', null, 'or outside any folder'
);

select lives_ok(
  $$ update public.profiles set full_name = 'Ada O.', avatar_url = 'https://x.supabase.co/storage/v1/object/public/avatars/1/avatar.jpg?v=1'
     where id = auth.uid() $$,
  'users update their own name and photo'
);
select throws_ok(
  $$ update public.profiles set email = 'x@example.com' where id = auth.uid() $$,
  '42501', null, 'the email follows the sign-in email and cannot be edited directly'
);

reset role;
update auth.users set email = 'ada.obi@example.com' where id = '11111111-1111-1111-1111-111111111111';
select is(
  (select email from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'ada.obi@example.com',
  'a confirmed email change is copied to the profile'
);

select * from finish();
rollback;
