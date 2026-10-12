-- My Kitchen, K12 (v2): the meal planner. A week (Sunday to Saturday, `meal_plans`) of meals
-- (`meal_plan_entries`): a recipe or something written in ("Eat out"), in one of the household's
-- meal slots. Batch cooking: a meal can cover later meals that week as leftovers (leftover_of
-- points at the meal it was cooked for), so its ingredients count once and the pot is cooked for
-- all of them. Meals are added, given leftovers and copied from another week through the functions
-- below, which keep each meal inside its week and leftovers after their pot.

-- ---------------------------------------------------------------------------
-- Meal slots, per household
-- ---------------------------------------------------------------------------

-- In the day's order: breakfast, lunch, snack, dinner.
create function public.meal_slot_order(p_slot text)
returns int
language sql
immutable
set search_path = ''
as $$
  select array_position(array['breakfast', 'lunch', 'snack', 'dinner'], p_slot);
$$;

alter table public.households
  add column meal_slots text[] not null default array['breakfast', 'lunch', 'dinner']
  check (
    cardinality(meal_slots) between 1 and 4
    and meal_slots <@ array['breakfast', 'lunch', 'snack', 'dinner']
  );

-- Household admins choose the slots their plan shows. Meals already in a slot that's turned off
-- stay, and show again if it's turned back on.
create function public.set_meal_slots(p_household_id uuid, p_slots text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_household_admin(p_household_id) then
    raise exception 'not_household_admin' using errcode = '42501';
  end if;
  update public.households
  set meal_slots = coalesce((
    select array_agg(s order by public.meal_slot_order(s))
    from (select distinct unnest(p_slots) s) x
  ), '{}')
  where id = p_household_id;
end;
$$;

revoke execute on function public.set_meal_slots(uuid, text[]) from public, anon;
grant execute on function public.set_meal_slots(uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Plans and meals
-- ---------------------------------------------------------------------------

create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  -- Always a Sunday.
  week_start date not null check (extract(dow from week_start) = 0),
  created_by uuid default auth.uid() references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  unique (household_id, week_start),
  unique (household_id, id)
);

create table public.meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  plan_id uuid not null,
  date date not null,
  slot text not null check (public.meal_slot_order(slot) is not null),
  -- Null for something written in, or when the recipe has since been deleted.
  recipe_id uuid,
  -- The recipe's title when it was planned, or what was written in.
  title text not null check (char_length(title) between 1 and 120 and title = btrim(title)),
  -- How many are eating this meal (null when it doesn't matter, e.g. "Eat out").
  servings int check (servings is null or servings between 1 and 100),
  -- Leftovers: the meal whose pot covers this one.
  leftover_of uuid references public.meal_plan_entries on delete cascade,
  created_by uuid default auth.uid() references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  foreign key (household_id, plan_id) references public.meal_plans (household_id, id) on delete cascade,
  foreign key (household_id, recipe_id)
    references public.recipes (household_id, id) on delete set null (recipe_id),
  check (leftover_of is null or leftover_of <> id)
);

create index meal_plan_entries_plan_idx on public.meal_plan_entries (plan_id, date);
create index meal_plan_entries_leftover_idx on public.meal_plan_entries (leftover_of);
create index meal_plan_entries_recipe_idx on public.meal_plan_entries (recipe_id);

revoke all on public.meal_plans, public.meal_plan_entries from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.meal_plans, public.meal_plan_entries from authenticated;
grant update (title, servings) on public.meal_plan_entries to authenticated;
grant delete on public.meal_plan_entries to authenticated;

alter table public.meal_plans enable row level security;
alter table public.meal_plan_entries enable row level security;

create policy "Members see meal plans" on public.meal_plans
  for select to authenticated using (public.is_household_member(household_id));
create policy "Members manage meals: select" on public.meal_plan_entries
  for select to authenticated using (public.is_household_member(household_id));
create policy "Members manage meals: update" on public.meal_plan_entries
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "Members manage meals: delete" on public.meal_plan_entries
  for delete to authenticated using (public.is_household_member(household_id));

-- Live updates for everyone looking at the plan.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.meal_plan_entries;
  end if;
end;
$$;

-- The Sunday starting the week `p_date` is in.
create function public.meal_week_start(p_date date)
returns date
language sql
immutable
set search_path = ''
as $$
  select p_date - extract(dow from p_date)::int;
$$;

-- The household's plan for the week starting `p_week_start`, made if there isn't one yet.
create function public.meal_plan_for(p_household_id uuid, p_week_start date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.meal_plans (household_id, week_start)
  values (p_household_id, p_week_start)
  on conflict (household_id, week_start) do nothing;
  select id into v_id from public.meal_plans
  where household_id = p_household_id and week_start = p_week_start;
  return v_id;
end;
$$;

revoke execute on function public.meal_plan_for(uuid, date) from public, anon, authenticated;

-- Replaces a meal's leftovers with `p_leftovers` ([{ "date", "slot", "servings" }]): later meals
-- in the same week, each eating from its pot.
create function public.put_meal_leftovers(p_cook public.meal_plan_entries, p_leftovers jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_week date := public.meal_week_start(p_cook.date);
  v_line jsonb;
  v_date date;
  v_slot text;
begin
  delete from public.meal_plan_entries where leftover_of = p_cook.id;
  for v_line in select * from jsonb_array_elements(coalesce(p_leftovers, '[]')) loop
    v_date := (v_line ->> 'date')::date;
    v_slot := v_line ->> 'slot';
    if public.meal_week_start(v_date) <> v_week
       or (v_date, public.meal_slot_order(v_slot)) <= (p_cook.date, public.meal_slot_order(p_cook.slot)) then
      raise exception 'leftovers_must_be_later_that_week' using errcode = '22023';
    end if;
    insert into public.meal_plan_entries
      (household_id, plan_id, date, slot, recipe_id, title, servings, leftover_of)
    values (p_cook.household_id, p_cook.plan_id, v_date, v_slot, p_cook.recipe_id, p_cook.title,
            nullif(v_line ->> 'servings', '')::int, p_cook.id);
  end loop;
end;
$$;

revoke execute on function public.put_meal_leftovers(public.meal_plan_entries, jsonb) from public, anon, authenticated;

-- Plans a meal: a recipe (its title by default) or something written in, for `p_servings`, with
-- any later meals that week it also covers. Returns the meal's id.
create function public.add_meal(
  p_household_id uuid,
  p_date date,
  p_slot text,
  p_recipe_id uuid,
  p_title text,
  p_servings int,
  p_leftovers jsonb default '[]'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_entry public.meal_plan_entries;
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if p_recipe_id is not null then
    select coalesce(v_title, r.title) into v_title from public.recipes r
    where r.id = p_recipe_id and r.household_id = p_household_id;
    if not found then
      raise exception 'recipe_not_found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.meal_plan_entries (household_id, plan_id, date, slot, recipe_id, title, servings)
  values (p_household_id, public.meal_plan_for(p_household_id, public.meal_week_start(p_date)),
          p_date, p_slot, p_recipe_id, v_title, p_servings)
  returning * into v_entry;
  perform public.put_meal_leftovers(v_entry, p_leftovers);
  return v_entry.id;
end;
$$;

revoke execute on function public.add_meal(uuid, date, text, uuid, text, int, jsonb) from public, anon;
grant execute on function public.add_meal(uuid, date, text, uuid, text, int, jsonb) to authenticated;

-- Changes which later meals a meal's pot covers.
create function public.set_meal_leftovers(p_entry_id uuid, p_leftovers jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.meal_plan_entries;
begin
  select * into v_entry from public.meal_plan_entries where id = p_entry_id for update;
  if v_entry.id is null or not public.is_household_member(v_entry.household_id) then
    raise exception 'meal_not_found' using errcode = 'P0002';
  end if;
  if v_entry.leftover_of is not null then
    raise exception 'leftovers_have_no_leftovers' using errcode = '22023';
  end if;
  perform public.put_meal_leftovers(v_entry, p_leftovers);
end;
$$;

revoke execute on function public.set_meal_leftovers(uuid, jsonb) from public, anon;
grant execute on function public.set_meal_leftovers(uuid, jsonb) to authenticated;

-- Copies the week starting `p_from` into the (empty) week starting `p_to`, same days and slots,
-- leftovers and all. Returns how many meals were copied.
create function public.copy_meal_week(p_household_id uuid, p_from date, p_to date)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from uuid;
  v_to uuid;
  v_shift int := p_to - p_from;
  v_cook public.meal_plan_entries;
  v_new_id uuid;
  v_count int := 0;
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if extract(dow from p_from) <> 0 or extract(dow from p_to) <> 0 or p_from = p_to then
    raise exception 'weeks_start_on_sunday' using errcode = '22023';
  end if;
  select id into v_from from public.meal_plans where household_id = p_household_id and week_start = p_from;
  v_to := public.meal_plan_for(p_household_id, p_to);
  if exists (select 1 from public.meal_plan_entries where plan_id = v_to) then
    raise exception 'week_not_empty' using errcode = '23505';
  end if;

  for v_cook in
    select * from public.meal_plan_entries where plan_id = v_from and leftover_of is null
    order by date, public.meal_slot_order(slot), created_at
  loop
    insert into public.meal_plan_entries (household_id, plan_id, date, slot, recipe_id, title, servings)
    values (p_household_id, v_to, v_cook.date + v_shift, v_cook.slot, v_cook.recipe_id, v_cook.title, v_cook.servings)
    returning id into v_new_id;
    insert into public.meal_plan_entries
      (household_id, plan_id, date, slot, recipe_id, title, servings, leftover_of)
    select p_household_id, v_to, e.date + v_shift, e.slot, e.recipe_id, e.title, e.servings, v_new_id
    from public.meal_plan_entries e where e.leftover_of = v_cook.id;
    v_count := v_count + 1 + (select count(*) from public.meal_plan_entries where leftover_of = v_cook.id);
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.copy_meal_week(uuid, date, date) from public, anon;
grant execute on function public.copy_meal_week(uuid, date, date) to authenticated;
