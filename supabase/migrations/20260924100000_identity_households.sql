-- M1: profiles, households, household members, membership helper, RLS.
-- There are no roles: household membership is the only access check.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text check (char_length(full_name) <= 100),
  email text not null,
  avatar_url text,
  -- The household shown in the app. Constrained to one the user belongs to (FK added below).
  active_household_id uuid,
  created_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80 and name = btrim(name)),
  currency char(3) not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'Africa/Lagos',
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index household_members_user_id_idx on public.household_members (user_id);

-- The active household must be one of the user's memberships. When the membership goes away
-- (leaving, or the household being deleted) only active_household_id is cleared.
alter table public.profiles
  add constraint profiles_active_household_fk
  foreign key (active_household_id, id)
  references public.household_members (household_id, user_id)
  on delete set null (active_household_id);

-- ---------------------------------------------------------------------------
-- Membership helpers (security definer so policies can read household_members without recursion)
-- ---------------------------------------------------------------------------

create function public.is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members m
    where m.household_id = hid
      and m.user_id = (select auth.uid())
  );
$$;

-- True when the current user and `other_user_id` belong to at least one common household.
create function public.shares_household_with(other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members mine
    join public.household_members theirs using (household_id)
    where mine.user_id = (select auth.uid())
      and theirs.user_id = other_user_id
  );
$$;

revoke execute on function public.is_household_member(uuid) from public, anon;
revoke execute on function public.shares_household_with(uuid) from public, anon;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.shares_household_with(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Profiles are created and kept in sync from auth.users
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    nullif(btrim(left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 100)), ''),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (new.email is distinct from old.email)
  execute function public.handle_user_email_change();

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_email_change() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Creating a household (the creator becomes its first member and it becomes active)
-- ---------------------------------------------------------------------------

create function public.create_household(household_name text)
returns public.households
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  created public.households;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  insert into public.households (name)
  values (btrim(household_name))
  returning * into created;

  insert into public.household_members (household_id, user_id)
  values (created.id, uid);

  update public.profiles
  set active_household_id = created.id
  where id = uid;

  return created;
end;
$$;

revoke execute on function public.create_household(text) from public, anon;
grant execute on function public.create_household(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges: anon gets nothing; writes are limited to specific columns or go through functions.
-- ---------------------------------------------------------------------------

revoke all on public.profiles, public.households, public.household_members from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.profiles, public.households, public.household_members
  from authenticated;

grant update (full_name, avatar_url, active_household_id) on public.profiles to authenticated;
grant update (name) on public.households to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;

create policy "Profiles are visible to self and fellow household members"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_household_with(id));

create policy "Users update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Members can view their households"
  on public.households for select to authenticated
  using (public.is_household_member(id));

create policy "Members can update their households"
  on public.households for update to authenticated
  using (public.is_household_member(id))
  with check (public.is_household_member(id));

-- Inserts and deletes on household_members happen only through security definer functions
-- (create_household) and edge functions (invites, leaving) — see M2.
create policy "Members can view fellow members"
  on public.household_members for select to authenticated
  using (public.is_household_member(household_id));
