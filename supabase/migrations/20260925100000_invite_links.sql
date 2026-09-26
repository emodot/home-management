-- Shareable invite links: an invite no longer has to name an email address, and whoever opens a
-- valid link can join (once — the first person to accept uses it up). Emailing an invite is still
-- possible; the emailed link works the same way.

alter table public.invites alter column email drop not null;

-- ---------------------------------------------------------------------------
-- Create an invite. With an email: rotate the pending invite for that address if there is one
-- (resend). Without: always a new link.
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

-- ---------------------------------------------------------------------------
-- New link for a pending invite (the token itself is never stored, so a link can't be shown
-- again). The previous link, including one that was emailed, stops working.
-- ---------------------------------------------------------------------------

create function public.invite_rotate(p_invite_id uuid, p_user_id uuid, p_token_hash text)
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

revoke execute on function public.invite_rotate(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.invite_rotate(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Look up (p_preview) or accept an invite. Anyone signed in may accept a valid link.
-- (Return columns change, so the function is dropped and recreated.)
-- ---------------------------------------------------------------------------

drop function public.invite_accept(text, uuid, boolean);

create function public.invite_accept(p_token_hash text, p_user_id uuid, p_preview boolean)
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
  select h.id, h.name, coalesce(inviter.full_name, inviter.email), v_already_member
  from public.households h
  left join public.profiles inviter on inviter.id = v_invite.invited_by
  where h.id = v_invite.household_id;
end;
$$;

revoke execute on function public.invite_accept(text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.invite_accept(text, uuid, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Activity: link invites have no email to name.
-- ---------------------------------------------------------------------------

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
      coalesce('invited ' || new.email, 'created an invite link'), v_label, new.invited_by);
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
