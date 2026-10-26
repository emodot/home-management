-- Early access: the marketing site's "Get early access" form. Anyone can ask (anonymously, through
-- request_early_access); only super-admins see the requests and mark them invited or declined,
-- through the admin edge function (service role).

create table public.early_access_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120 and name = btrim(name)),
  email text not null unique check (
    char_length(email) <= 254
    and email = lower(btrim(email))
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  -- Who's in the house, where, what they hope to use it for.
  note text check (char_length(note) between 1 and 1000),
  status text not null default 'new' check (status in ('new', 'invited', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index early_access_requests_status_created_idx
  on public.early_access_requests (status, created_at desc);

-- No direct access for anyone: the form writes through request_early_access, admins read through
-- the admin edge function.
revoke all on public.early_access_requests from anon, authenticated;
alter table public.early_access_requests enable row level security;

-- Records (or refreshes) a request. Asking again with the same email updates the name and note
-- while the request is still new, and never says whether the email was already there.
-- A loose overall limit keeps a flood of submissions from filling the table.
create function public.request_early_access(p_name text, p_email text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    select count(*) from public.early_access_requests
    where created_at > now() - interval '1 hour'
  ) >= 200 then
    raise exception 'too_many_requests' using errcode = 'P0001';
  end if;

  insert into public.early_access_requests (name, email, note)
  values (btrim(p_name), lower(btrim(p_email)), nullif(btrim(p_note), ''))
  on conflict (email) do update
    set name = excluded.name,
        note = coalesce(excluded.note, public.early_access_requests.note),
        updated_at = now()
    where public.early_access_requests.status = 'new';
end;
$$;

revoke execute on function public.request_early_access(text, text, text) from public;
grant execute on function public.request_early_access(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Super-admins (service role only, through the admin edge function)
-- ---------------------------------------------------------------------------

-- A page of requests, newest first; p_status null means every status.
create function public.admin_list_access_requests(p_status text, p_limit int, p_offset int)
returns table (
  id uuid,
  name text,
  email text,
  note text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.name, r.email, r.note, r.status, r.created_at, r.updated_at,
         count(*) over () as total_count
  from public.early_access_requests r
  where p_status is null or r.status = p_status
  order by r.created_at desc
  limit p_limit offset p_offset
$$;

-- Marks a request; returns its email (for the admin log), or null if there's no such request.
create function public.admin_set_access_request_status(p_id uuid, p_status text)
returns text
language sql
security definer
set search_path = ''
as $$
  update public.early_access_requests
  set status = p_status, updated_at = now()
  where id = p_id
  returning email
$$;

revoke execute on function public.admin_list_access_requests(text, int, int) from public, anon, authenticated;
revoke execute on function public.admin_set_access_request_status(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_list_access_requests(text, int, int) to service_role;
grant execute on function public.admin_set_access_request_status(uuid, text) to service_role;

-- The admin log can now point at a request.
alter table public.admin_actions drop constraint admin_actions_target_type_check;
alter table public.admin_actions
  add constraint admin_actions_target_type_check
  check (target_type in ('user', 'household', 'access_request'));
