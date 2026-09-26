-- Admin-only accounts: admins sign in at /admin/sign-in and are kept out of the regular app, and
-- existing admins add or remove admins from the admin area. Admin accounts are no longer counted
-- or listed as users.

-- ---------------------------------------------------------------------------
-- Admins
-- ---------------------------------------------------------------------------

create function public.admin_list_admins()
returns table (
  id uuid,
  email text,
  full_name text,
  admin_since timestamptz,
  last_sign_in_at timestamptz,
  household_count int
)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email::text, p.full_name, a.created_at, u.last_sign_in_at,
         (select count(*)::int from public.household_members m where m.user_id = u.id)
  from public.app_admins a
  join auth.users u on u.id = a.user_id
  left join public.profiles p on p.id = u.id
  order by a.created_at, u.email;
$$;

-- For "add admin": is the email free, a regular account, or already an admin?
create function public.admin_find_user_by_email(p_email text)
returns table (id uuid, is_admin boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, public.is_app_admin(u.id)
  from auth.users u
  where lower(u.email) = lower(btrim(p_email));
$$;

create function public.admin_grant(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.app_admins (user_id) values (p_user_id) on conflict do nothing;
$$;

create function public.admin_revoke(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.app_admins where user_id = p_user_id;
$$;

-- ---------------------------------------------------------------------------
-- Users and stats no longer include admin accounts
-- ---------------------------------------------------------------------------

create or replace function public.admin_overview()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'users', (select count(*) from auth.users u where not public.is_app_admin(u.id)),
    'households', (select count(*) from public.households),
    'expenses', (select count(*) from public.expenses where deleted_at is null),
    'tasks', (select count(*) from public.tasks where deleted_at is null),
    'providers', (select count(*) from public.providers where deleted_at is null),
    'newUsers30d', (select count(*) from auth.users u
                    where u.created_at > now() - interval '30 days' and not public.is_app_admin(u.id)),
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
        from auth.users u where not public.is_app_admin(u.id) group by 1
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

create or replace function public.admin_list_users(p_search text default null, p_limit int default 25, p_offset int default 0)
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
  where not public.is_app_admin(u.id)
    and (nullif(btrim(p_search), '') is null
         or u.email ilike '%' || btrim(p_search) || '%'
         or p.full_name ilike '%' || btrim(p_search) || '%')
  order by u.created_at desc, u.id
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
$$;

revoke execute on function public.admin_list_admins() from public, anon, authenticated;
revoke execute on function public.admin_find_user_by_email(text) from public, anon, authenticated;
revoke execute on function public.admin_grant(uuid) from public, anon, authenticated;
revoke execute on function public.admin_revoke(uuid) from public, anon, authenticated;
grant execute on function public.admin_list_admins() to service_role;
grant execute on function public.admin_find_user_by_email(text) to service_role;
grant execute on function public.admin_grant(uuid) to service_role;
grant execute on function public.admin_revoke(uuid) to service_role;
