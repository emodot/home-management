-- M2: invites and leaving a household.
-- Invites are created, accepted and revoked only through edge functions. They call the functions
-- below with the service role; none of them are executable by anon or authenticated users.
-- Functions report expected failures as `raise exception '<code>'` (SQLSTATE P0001) so edge
-- functions can map them to responses.

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  email text not null check (email = lower(btrim(email)) and email like '_%@_%'),
  -- SHA-256 (hex) of the token in the invite link. The token itself is never stored.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid references public.profiles on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (accepted_at is null or revoked_at is null)
);

create index invites_household_id_idx on public.invites (household_id);

-- One live invite per address per household; sending again rotates its token instead.
create unique index invites_one_pending_per_email_idx
  on public.invites (household_id, email)
  where accepted_at is null and revoked_at is null;

-- Members can list their household's invites, but never read token hashes.
revoke all on public.invites from anon, authenticated;
grant select (id, household_id, email, invited_by, expires_at, accepted_at, revoked_at, created_at)
  on public.invites to authenticated;

alter table public.invites enable row level security;

create policy "Members can view their household's invites"
  on public.invites for select to authenticated
  using (public.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- Private helper: membership check for an explicit user (edge functions pass the caller's id).
-- ---------------------------------------------------------------------------

create function public.is_member_of(hid uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m where m.household_id = hid and m.user_id = uid
  );
$$;

-- ---------------------------------------------------------------------------
-- Create an invite, or rotate the token of the pending one for the same address (resend).
-- ---------------------------------------------------------------------------

create function public.invite_upsert(
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
  v_email text := lower(btrim(p_email));
  v_invite public.invites;
  v_resent boolean := false;
begin
  if not public.is_member_of(p_household_id, p_invited_by) then
    raise exception 'not_member';
  end if;

  if exists (
    select 1
    from public.household_members m
    join public.profiles p on p.id = m.user_id
    where m.household_id = p_household_id and lower(p.email) = v_email
  ) then
    raise exception 'already_member';
  end if;

  update public.invites i
  set token_hash = p_token_hash,
      expires_at = now() + interval '7 days',
      invited_by = p_invited_by
  where i.household_id = p_household_id
    and i.email = v_email
    and i.accepted_at is null
    and i.revoked_at is null
  returning * into v_invite;

  if found then
    v_resent := true;
  else
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

-- ---------------------------------------------------------------------------
-- Look up (p_preview) or accept an invite by token hash.
-- ---------------------------------------------------------------------------

create function public.invite_accept(p_token_hash text, p_user_id uuid, p_preview boolean)
returns table (
  household_id uuid,
  household_name text,
  inviter_name text,
  email text,
  email_matches boolean,
  already_member boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.invites;
  v_user_email text;
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

  select lower(p.email) into v_user_email from public.profiles p where p.id = p_user_id;

  if not p_preview and v_invite.accepted_at is null then
    if v_user_email is distinct from v_invite.email then
      raise exception 'email_mismatch';
    end if;

    insert into public.household_members (household_id, user_id)
    values (v_invite.household_id, p_user_id)
    on conflict do nothing;

    update public.invites i set accepted_at = now() where i.id = v_invite.id;
    v_already_member := true;
  end if;

  if not p_preview then
    update public.profiles p set active_household_id = v_invite.household_id where p.id = p_user_id;
  end if;

  return query
  select h.id, h.name, coalesce(inviter.full_name, inviter.email), v_invite.email,
         v_user_email is not distinct from v_invite.email, v_already_member
  from public.households h
  left join public.profiles inviter on inviter.id = v_invite.invited_by
  where h.id = v_invite.household_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Revoke a pending invite (any member of its household).
-- ---------------------------------------------------------------------------

create function public.invite_revoke(p_invite_id uuid, p_user_id uuid)
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

  update public.invites set revoked_at = now() where id = p_invite_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Leave a household. The last member can only leave by deleting it (p_delete_if_last).
-- Returns 'left' or 'deleted'; the caller removes storage objects when deleted.
-- ---------------------------------------------------------------------------

create function public.leave_household(p_household_id uuid, p_user_id uuid, p_delete_if_last boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_count int;
begin
  -- Serialise concurrent leaves so two "second-to-last" members can't both leave.
  perform 1 from public.households h where h.id = p_household_id for update;

  if not found or not public.is_member_of(p_household_id, p_user_id) then
    raise exception 'not_member';
  end if;

  select count(*) into v_member_count
  from public.household_members m
  where m.household_id = p_household_id;

  if v_member_count = 1 then
    if not p_delete_if_last then
      raise exception 'last_member';
    end if;
    delete from public.households where id = p_household_id; -- cascades to everything it owns
    return 'deleted';
  end if;

  delete from public.household_members
  where household_id = p_household_id and user_id = p_user_id;
  return 'left';
end;
$$;

-- Service role only.
revoke execute on function public.is_member_of(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.invite_upsert(uuid, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.invite_accept(text, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.invite_revoke(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.leave_household(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.is_member_of(uuid, uuid) to service_role;
grant execute on function public.invite_upsert(uuid, text, text, uuid) to service_role;
grant execute on function public.invite_accept(text, uuid, boolean) to service_role;
grant execute on function public.invite_revoke(uuid, uuid) to service_role;
grant execute on function public.leave_household(uuid, uuid, boolean) to service_role;
