-- Early access: anyone can ask; nobody but the admin edge function (service role) can read or mark
-- the requests.
begin;
select plan(13);

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'ada@example.com');

-- A visitor to the marketing site.
set local role anon;
select set_config('request.jwt.claims', '', true);

select lives_ok(
  $$ select public.request_early_access('  Bola Ade ', ' Bola@Example.com ', 'Four of us in Lekki.') $$,
  'anyone can ask for early access'
);
select lives_ok(
  $$ select public.request_early_access('Bola A.', 'bola@example.com', null) $$,
  'asking again with the same email is fine'
);
select throws_ok(
  $$ select public.request_early_access('Chi', 'not-an-email', null) $$,
  '23514', null, 'the email must look like one'
);
select throws_ok(
  $$ select public.request_early_access('', 'chi@example.com', null) $$,
  '23514', null, 'a name is needed'
);
select throws_ok(
  $$ select public.request_early_access('Chi', 'chi@example.com', repeat('x', 1001)) $$,
  '23514', null, 'the note is at most 1000 characters'
);
select throws_ok(
  $$ select * from public.early_access_requests $$,
  '42501', null, 'visitors can’t read the requests'
);
select throws_ok(
  $$ select * from public.admin_list_access_requests(null, 10, 0) $$,
  '42501', null, 'or list them'
);

-- A signed-in household user can't see them either.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select throws_ok(
  $$ select public.admin_set_access_request_status(gen_random_uuid(), 'invited') $$,
  '42501', null, 'signed-in users can’t mark requests'
);

reset role;
select is(
  (select row(name, email, note, status)::text from public.early_access_requests),
  row('Bola A.', 'bola@example.com', 'Four of us in Lekki.', 'new')::text,
  'one request per email: trimmed, lower-cased, the latest name and the note kept'
);

-- The admin edge function.
set local role service_role;
select is(
  (select count(*)::int from public.admin_list_access_requests(null, 10, 0)),
  1,
  'super-admins list the requests'
);
select is(
  public.admin_set_access_request_status(
    (select id from public.early_access_requests where email = 'bola@example.com'), 'invited'),
  'bola@example.com',
  'and mark them, getting the email back for the log'
);
reset role;

set local role anon;
select public.request_early_access('Someone else', 'bola@example.com', 'Again?');
reset role;
select is(
  (select row(name, status)::text from public.early_access_requests),
  row('Bola A.', 'invited')::text,
  'a request that has been handled isn’t reopened by asking again'
);

select lives_ok(
  $$ insert into public.admin_actions (action, target_type, target_id)
     values ('set_access_request_status', 'access_request', gen_random_uuid()) $$,
  'the admin log can point at a request'
);

select * from finish();
rollback;
