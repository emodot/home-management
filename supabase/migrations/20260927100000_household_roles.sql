-- Households are run centrally: only super-admins (app admins) create them, each household has
-- household admins, and only household admins invite members. Super-admins choose who is a
-- household admin. Members can leave but never delete a household.

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------

alter table public.household_members
  add column role text not null default 'member' check (role in ('admin', 'member'));

-- Existing households: their earliest member becomes the household admin.
update public.household_members m set role = 'admin'
where m.joined_at = (select min(x.joined_at) from public.household_members x
                     where x.household_id = m.household_id);

alter table public.invites
  add column role text not null default 'member' check (role in ('admin', 'member'));
grant select (role) on public.invites to authenticated;

create function public.is_household_admin_of(hid uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = uid and m.role = 'admin'
  );
$$;

revoke execute on function public.is_household_admin_of(uuid, uuid) from public, anon, authenticated;
grant execute on function public.is_household_admin_of(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Creating households: super-admins only (through the admin edge function)
-- ---------------------------------------------------------------------------

drop function public.create_household(text);

create function public.admin_create_household(p_name text)
returns public.households
language sql
security definer
set search_path = ''
as $$
  -- Default categories are added by the households insert trigger.
  insert into public.households (name) values (btrim(p_name)) returning *;
$$;

-- An invite that makes whoever accepts it a household admin. Not tied to a member, so it has no
-- inviter (the household's activity shows it as automatic).
create function public.admin_create_invite(p_household_id uuid, p_email text, p_token_hash text)
returns table (invite_id uuid, email text, expires_at timestamptz, household_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.invites;
begin
  if not exists (select 1 from public.households h where h.id = p_household_id) then
    raise exception 'household_not_found';
  end if;
  insert into public.invites (household_id, email, token_hash, invited_by, role)
  values (p_household_id, nullif(lower(btrim(p_email)), ''), p_token_hash, null, 'admin')
  returning * into v_invite;

  return query
  select v_invite.id, v_invite.email, v_invite.expires_at, h.name
  from public.households h where h.id = p_household_id;
end;
$$;

create function public.admin_set_member_role(p_household_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.household_members m set role = p_role
  where m.household_id = p_household_id and m.user_id = p_user_id;
  if not found then
    raise exception 'not_member';
  end if;
end;
$$;

revoke execute on function public.admin_create_household(text) from public, anon, authenticated;
revoke execute on function public.admin_create_invite(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.admin_set_member_role(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_create_household(text) to service_role;
grant execute on function public.admin_create_invite(uuid, text, text) to service_role;
grant execute on function public.admin_set_member_role(uuid, uuid, text) to service_role;

create or replace function public.admin_get_household(p_household_id uuid)
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
                                          'joinedAt', m.joined_at, 'role', m.role)
                       order by m.joined_at)
      from public.household_members m
      join public.profiles p on p.id = m.user_id
      where m.household_id = h.id
    ), '[]'::jsonb)
  )
  from public.households h
  where h.id = p_household_id;
$$;

-- ---------------------------------------------------------------------------
-- Invites: household admins only
-- ---------------------------------------------------------------------------

create or replace function public.invite_upsert(
  p_household_id uuid,
  p_email text,
  p_token_hash text,
  p_invited_by uuid
)
returns table (
  invite_id uuid,
  email text,
  expires_at timestamptz,
  household_name text,
  inviter_name text,
  resent boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := nullif(lower(btrim(p_email)), '');
  v_invite public.invites;
  v_resent boolean := false;
begin
  if not public.is_member_of(p_household_id, p_invited_by) then
    raise exception 'not_member';
  end if;
  if not public.is_household_admin_of(p_household_id, p_invited_by) then
    raise exception 'not_household_admin';
  end if;

  if v_email is not null and exists (
    select 1
    from public.household_members m
    join public.profiles p on p.id = m.user_id
    where m.household_id = p_household_id and lower(p.email) = v_email
  ) then
    raise exception 'already_member';
  end if;

  if v_email is not null then
    update public.invites i
    set token_hash = p_token_hash,
        expires_at = now() + interval '7 days',
        invited_by = p_invited_by
    where i.household_id = p_household_id
      and i.email = v_email
      and i.accepted_at is null
      and i.revoked_at is null
    returning * into v_invite;
    v_resent := found;
  end if;

  if not v_resent then
    insert into public.invites (household_id, email, token_hash, invited_by)
    values (p_household_id, v_email, p_token_hash, p_invited_by)
    returning * into v_invite;
  end if;

  return query
  select v_invite.id, v_invite.email, v_invite.expires_at, h.name,
         coalesce(p.full_name, p.email), v_resent
  from public.households h
  join public.profiles p on p.id = p_invited_by
  where h.id = p_household_id;
end;
$$;

create or replace function public.invite_rotate(p_invite_id uuid, p_user_id uuid, p_token_hash text)
returns table (
  invite_id uuid,
  email text,
  expires_at timestamptz,
  household_name text,
  inviter_name text,
  resent boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.invites;
begin
  select * into v_invite
  from public.invites i
  where i.id = p_invite_id and i.accepted_at is null and i.revoked_at is null
  for update;

  -- Same error for "doesn't exist" and "not yours" so ids can't be probed.
  if not found or not public.is_member_of(v_invite.household_id, p_user_id) then
    raise exception 'invite_not_found';
  end if;
  if not public.is_household_admin_of(v_invite.household_id, p_user_id) then
    raise exception 'not_household_admin';
  end if;

  perform set_config('home.invite_new_link', 'on', true);
  update public.invites i
  set token_hash = p_token_hash,
      expires_at = now() + interval '7 days',
      invited_by = p_user_id
  where i.id = p_invite_id
  returning * into v_invite;
  perform set_config('home.invite_new_link', '', true);

  return query
  select v_invite.id, v_invite.email, v_invite.expires_at, h.name,
         coalesce(p.full_name, p.email), true
  from public.households h
  join public.profiles p on p.id = p_user_id
  where h.id = v_invite.household_id;
end;
$$;

create or replace function public.invite_revoke(p_invite_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
begin
  select i.household_id into v_household_id
  from public.invites i
  where i.id = p_invite_id and i.accepted_at is null and i.revoked_at is null
  for update;

  -- Same error for "doesn't exist" and "not yours" so ids can't be probed.
  if not found or not public.is_member_of(v_household_id, p_user_id) then
    raise exception 'invite_not_found';
  end if;
  if not public.is_household_admin_of(v_household_id, p_user_id) then
    raise exception 'not_household_admin';
  end if;

  perform set_config('home.actor_id', p_user_id::text, true);
  update public.invites set revoked_at = now() where id = p_invite_id;
  perform set_config('home.actor_id', '', true);
end;
$$;

create or replace function public.invite_accept(p_token_hash text, p_user_id uuid, p_preview boolean)
returns table (
  household_id uuid,
  household_name text,
  inviter_name text,
  already_member boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.invites;
  v_already_member boolean;
begin
  select * into v_invite from public.invites i where i.token_hash = p_token_hash for update;

  if not found then
    raise exception 'invite_not_found';
  end if;

  v_already_member := public.is_member_of(v_invite.household_id, p_user_id);

  if v_invite.revoked_at is not null then
    raise exception 'invite_revoked';
  end if;
  -- Re-opening a link you already used just takes you to the household.
  if v_invite.accepted_at is not null and not v_already_member then
    raise exception 'invite_used';
  end if;
  if v_invite.accepted_at is null and v_invite.expires_at <= now() then
    raise exception 'invite_expired';
  end if;

  if not p_preview and v_invite.accepted_at is null and not v_already_member then
    insert into public.household_members (household_id, user_id, role)
    values (v_invite.household_id, p_user_id, v_invite.role)
    on conflict do nothing;

    update public.invites i set accepted_at = now() where i.id = v_invite.id;
    v_already_member := true;
  elsif not p_preview and v_invite.accepted_at is null and v_invite.role = 'admin'
        and not public.is_household_admin_of(v_invite.household_id, p_user_id) then
    -- A member opening an admin invite becomes a household admin (and uses the link up).
    update public.household_members m set role = 'admin'
    where m.household_id = v_invite.household_id and m.user_id = p_user_id;
    update public.invites i set accepted_at = now() where i.id = v_invite.id;
  end if;

  if not p_preview then
    update public.profiles p set active_household_id = v_invite.household_id where p.id = p_user_id;
  end if;

  return query
  select h.id, h.name, coalesce(inviter.full_name, inviter.email), v_already_member
  from public.households h
  left join public.profiles inviter on inviter.id = v_invite.invited_by
  where h.id = v_invite.household_id;
end;
$$;

create or replace function public.invites_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label jsonb := jsonb_build_object('label', new.email);
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.household_id, 'invite', new.id, 'created',
      case when new.role = 'admin'
           then coalesce('invited ' || new.email || ' as household admin', 'created a household admin invite')
           else coalesce('invited ' || new.email, 'created an invite link') end,
      v_label, new.invited_by);
  elsif old.revoked_at is null and new.revoked_at is not null then
    perform public.log_activity(new.household_id, 'invite', new.id, 'deleted',
      coalesce('cancelled the invite to ' || new.email, 'cancelled an invite link'), v_label);
  elsif new.token_hash <> old.token_hash and new.accepted_at is null then
    perform public.log_activity(new.household_id, 'invite', new.id, 'updated',
      case
        when new.email is null then 'made a new invite link'
        when current_setting('home.invite_new_link', true) = 'on'
          then 'made a new link for the invite to ' || new.email
        else 'resent the invite to ' || new.email
      end,
      v_label, new.invited_by);
  end if;
  -- Accepting is logged as the member joining.
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Leaving: never deletes the household; the last household admin must stay while others remain
-- ---------------------------------------------------------------------------

drop function public.leave_household(uuid, uuid, boolean);

create function public.leave_household(p_household_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Serialise concurrent leaves so two admins can't both leave at once.
  perform 1 from public.households h where h.id = p_household_id for update;

  if not found or not public.is_member_of(p_household_id, p_user_id) then
    raise exception 'not_member';
  end if;

  if public.is_household_admin_of(p_household_id, p_user_id)
     and not exists (select 1 from public.household_members m
                     where m.household_id = p_household_id and m.user_id <> p_user_id
                       and m.role = 'admin')
     and exists (select 1 from public.household_members m
                 where m.household_id = p_household_id and m.user_id <> p_user_id) then
    raise exception 'last_admin';
  end if;

  delete from public.household_members
  where household_id = p_household_id and user_id = p_user_id;
  return 'left';
end;
$$;

revoke execute on function public.leave_household(uuid, uuid) from public, anon, authenticated;
grant execute on function public.leave_household(uuid, uuid) to service_role;
