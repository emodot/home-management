-- App admins: operators who can see and manage every user and household. Everything here except
-- "am I an admin?" is service-role only; the `admin` edge function checks is_app_admin first.
-- Make someone an admin in the SQL editor:
--   insert into public.app_admins (user_id) select id from auth.users where email = 'you@example.com';

create table public.app_admins (
  user_id uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

revoke all on public.app_admins from anon, authenticated;
grant select on public.app_admins to authenticated;
alter table public.app_admins enable row level security;
-- Lets the app show the Admin link; nobody can list the other admins.
create policy "Users can see whether they are an admin" on public.app_admins
  for select to authenticated using (user_id = (select auth.uid()));

-- What admins did, for accountability.
create table public.admin_actions (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users on delete set null,
  action text not null,
  target_type text not null check (target_type in ('user', 'household')),
  target_id uuid not null,
  details jsonb,
  created_at timestamptz not null default now()
);

revoke all on public.admin_actions from anon, authenticated;
alter table public.admin_actions enable row level security;

create function public.is_app_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select exists (select 1 from public.app_admins a where a.user_id = p_user_id) $$;

create function public.admin_log(
  p_admin_id uuid,
  p_action text,
  p_target_type text,
  p_target_id uuid,
  p_details jsonb default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.admin_actions (admin_id, action, target_type, target_id, details)
  values (p_admin_id, p_action, p_target_type, p_target_id, p_details);
$$;

-- ---------------------------------------------------------------------------
-- Overview
-- ---------------------------------------------------------------------------

create function public.admin_overview()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'users', (select count(*) from auth.users),
    'households', (select count(*) from public.households),
    'expenses', (select count(*) from public.expenses where deleted_at is null),
    'tasks', (select count(*) from public.tasks where deleted_at is null),
    'providers', (select count(*) from public.providers where deleted_at is null),
    'newUsers30d', (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'activeHouseholds30d', (
      select count(distinct household_id) from public.activity_log
      where created_at > now() - interval '30 days'
    ),
    -- Sign-ups per week (Monday-based, UTC) for the last 12 weeks, oldest first, zeros included.
    'signupsByWeek', (
      select jsonb_agg(jsonb_build_object('week', w.week::date, 'count', coalesce(s.count, 0))
                       order by w.week)
      from generate_series(date_trunc('week', now()) - interval '11 weeks',
                           date_trunc('week', now()), interval '1 week') as w(week)
      left join (
        select date_trunc('week', created_at) as week, count(*) as count
        from auth.users group by 1
      ) s on s.week = w.week
    ),
    'recentActions', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.id desc)
      from (
        select a.id, a.action, a.target_type as "targetType", a.target_id as "targetId",
               a.details, a.created_at as "createdAt",
               coalesce(p.full_name, p.email) as "adminName"
        from public.admin_actions a
        left join public.profiles p on p.id = a.admin_id
        order by a.id desc
        limit 10
      ) a
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------

create function public.admin_list_users(p_search text default null, p_limit int default 25, p_offset int default 0)
returns table (
  id uuid,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  banned_until timestamptz,
  is_admin boolean,
  household_count int,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email::text, p.full_name, p.avatar_url, u.created_at, u.last_sign_in_at,
         u.banned_until, public.is_app_admin(u.id),
         (select count(*)::int from public.household_members m where m.user_id = u.id),
         count(*) over ()
  from auth.users u
  left join public.profiles p on p.id = u.id
  where nullif(btrim(p_search), '') is null
     or u.email ilike '%' || btrim(p_search) || '%'
     or p.full_name ilike '%' || btrim(p_search) || '%'
  order by u.created_at desc, u.id
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
$$;

create function public.admin_get_user(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', u.id,
    'email', u.email,
    'fullName', p.full_name,
    'isAdmin', public.is_app_admin(u.id),
    'households', coalesce((
      select jsonb_agg(jsonb_build_object('id', h.id, 'name', h.name,
                                          'memberCount', (select count(*) from public.household_members x
                                                          where x.household_id = h.id))
                       order by h.name)
      from public.household_members m
      join public.households h on h.id = m.household_id
      where m.user_id = u.id
    ), '[]'::jsonb)
  )
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = p_user_id;
$$;

-- ---------------------------------------------------------------------------
-- Households
-- ---------------------------------------------------------------------------

create function public.admin_list_households(p_search text default null, p_limit int default 25, p_offset int default 0)
returns table (
  id uuid,
  name text,
  created_at timestamptz,
  member_count int,
  expense_count int,
  task_count int,
  last_activity_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select h.id, h.name, h.created_at,
         (select count(*)::int from public.household_members m where m.household_id = h.id),
         (select count(*)::int from public.expenses e where e.household_id = h.id and e.deleted_at is null),
         (select count(*)::int from public.tasks t where t.household_id = h.id and t.deleted_at is null),
         (select max(a.created_at) from public.activity_log a where a.household_id = h.id),
         count(*) over ()
  from public.households h
  where nullif(btrim(p_search), '') is null or h.name ilike '%' || btrim(p_search) || '%'
  order by h.created_at desc, h.id
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
$$;

create function public.admin_get_household(p_household_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', h.id,
    'name', h.name,
    'createdAt', h.created_at,
    'counts', jsonb_build_object(
      'expenses', (select count(*) from public.expenses e where e.household_id = h.id and e.deleted_at is null),
      'receipts', (select count(*) from public.expense_receipts r where r.household_id = h.id and r.deleted_at is null),
      'tasks', (select count(*) from public.tasks t where t.household_id = h.id and t.deleted_at is null),
      'providers', (select count(*) from public.providers p where p.household_id = h.id and p.deleted_at is null),
      'pendingInvites', (select count(*) from public.invites i where i.household_id = h.id
                         and i.accepted_at is null and i.revoked_at is null and i.expires_at > now())
    ),
    'lastActivityAt', (select max(a.created_at) from public.activity_log a where a.household_id = h.id),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('userId', m.user_id, 'email', p.email, 'fullName', p.full_name,
                                          'joinedAt', m.joined_at)
                       order by m.joined_at)
      from public.household_members m
      join public.profiles p on p.id = m.user_id
      where m.household_id = h.id
    ), '[]'::jsonb)
  )
  from public.households h
  where h.id = p_household_id;
$$;

create function public.admin_rename_household(p_household_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.households set name = btrim(p_name) where id = p_household_id;
  if not found then
    raise exception 'household_not_found';
  end if;
end;
$$;

-- Deletes a household and everything it owns (rows cascade; the caller removes its files).
create function public.admin_delete_household(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.households where id = p_household_id;
  if not found then
    raise exception 'household_not_found';
  end if;
end;
$$;

revoke execute on function public.is_app_admin(uuid) from public, anon, authenticated;
revoke execute on function public.admin_log(uuid, text, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.admin_overview() from public, anon, authenticated;
revoke execute on function public.admin_list_users(text, int, int) from public, anon, authenticated;
revoke execute on function public.admin_get_user(uuid) from public, anon, authenticated;
revoke execute on function public.admin_list_households(text, int, int) from public, anon, authenticated;
revoke execute on function public.admin_get_household(uuid) from public, anon, authenticated;
revoke execute on function public.admin_rename_household(uuid, text) from public, anon, authenticated;
revoke execute on function public.admin_delete_household(uuid) from public, anon, authenticated;
grant execute on function public.is_app_admin(uuid) to service_role;
grant execute on function public.admin_log(uuid, text, text, uuid, jsonb) to service_role;
grant execute on function public.admin_overview() to service_role;
grant execute on function public.admin_list_users(text, int, int) to service_role;
grant execute on function public.admin_get_user(uuid) to service_role;
grant execute on function public.admin_list_households(text, int, int) to service_role;
grant execute on function public.admin_get_household(uuid) to service_role;
grant execute on function public.admin_rename_household(uuid, text) to service_role;
grant execute on function public.admin_delete_household(uuid) to service_role;
