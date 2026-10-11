-- My Kitchen, K7: the cooking gas tracker. Logging a refill (log_gas_refill) also records a
-- "Cooking Gas" expense and can keep a one-off "Refill cooking gas" task due a few days before the
-- predicted next refill (the prediction is worked out in the app, packages/shared/src/kitchen/gas.ts).
-- Removing a refill logged by mistake (remove_gas_refill) sends its expense to Recently deleted.

-- ---------------------------------------------------------------------------
-- "Cooking Gas": a default category, after Groceries
-- ---------------------------------------------------------------------------

create or replace function public.default_expense_categories()
returns table (name text, icon text, sort_order int)
language sql
immutable
set search_path = ''
as $$
  values
    ('Utilities', 'lightbulb', 1),
    ('Electricity', 'zap', 2),
    ('Fuel & Generator', 'fuel', 3),
    ('Water', 'droplets', 4),
    ('Internet & TV', 'wifi', 5),
    ('Repairs & Maintenance', 'wrench', 6),
    ('Cleaning', 'sparkles', 7),
    ('Security', 'shield', 8),
    ('Estate Dues & Service Charge', 'building', 9),
    ('Rent', 'key-round', 10),
    ('Groceries', 'shopping-basket', 11),
    ('Cooking Gas', 'flame', 12),
    ('Furniture & Appliances', 'sofa', 13),
    ('Other', 'circle-ellipsis', 14)
$$;

-- The household's Cooking Gas category (top level), created after its Groceries (or last) when
-- it has none, e.g. it was renamed.
create function public.cooking_gas_category(p_household_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_after int;
begin
  select id into v_id from public.expense_categories
  where household_id = p_household_id and parent_id is null and lower(name) = 'cooking gas';
  if found then
    return v_id;
  end if;

  select coalesce(
    (select sort_order from public.expense_categories
     where household_id = p_household_id and parent_id is null and lower(name) = 'groceries'),
    (select max(sort_order) from public.expense_categories
     where household_id = p_household_id and parent_id is null),
    0
  ) into v_after;
  update public.expense_categories set sort_order = sort_order + 1
  where household_id = p_household_id and parent_id is null and sort_order > v_after;
  insert into public.expense_categories (household_id, name, icon, sort_order)
  values (p_household_id, 'Cooking Gas', 'flame', v_after + 1)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.cooking_gas_category(uuid) from public, anon, authenticated;

-- Existing households get it now (a household that already has a "Cooking Gas" keeps its own).
select public.cooking_gas_category(id) from public.households;

-- ---------------------------------------------------------------------------
-- Refills
-- ---------------------------------------------------------------------------

create table public.gas_refills (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  refilled_on date not null,
  cylinder_kg numeric(5, 2) not null check (cylinder_kg > 0 and cylinder_kg <= 100),
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 100000000000000),
  provider_id uuid,
  -- The expense it recorded (unlinked if that expense is purged).
  expense_id uuid references public.expenses on delete set null,
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  foreign key (household_id, provider_id)
    references public.providers (household_id, id) on delete set null (provider_id)
);

create index gas_refills_household_idx on public.gas_refills (household_id, refilled_on desc);

-- The household's "Refill cooking gas" task, so each refill moves the same task.
create table public.gas_reminders (
  household_id uuid primary key references public.households on delete cascade,
  task_id uuid not null,
  foreign key (household_id, task_id) references public.tasks (household_id, id) on delete cascade
);

revoke all on public.gas_refills, public.gas_reminders from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.gas_refills, public.gas_reminders from authenticated;

alter table public.gas_refills enable row level security;
alter table public.gas_reminders enable row level security;

create policy "Members see gas refills" on public.gas_refills
  for select to authenticated using (public.is_household_member(household_id));
create policy "Members see the gas reminder" on public.gas_reminders
  for select to authenticated using (public.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- Logging and removing refills
-- ---------------------------------------------------------------------------

-- p_reminder_on: when the "Refill cooking gas" task should be due (a few days before the
-- predicted refill), or null for no reminder. Days already past become today.
create function public.log_gas_refill(
  p_household_id uuid,
  p_refilled_on date,
  p_cylinder_kg numeric,
  p_amount_minor bigint,
  p_paid_by uuid,
  p_provider_id uuid default null,
  p_reminder_on date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category uuid;
  v_expense_id uuid;
  v_refill_id uuid;
  v_task_id uuid;
  v_today date;
  v_due date;
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;

  v_category := public.cooking_gas_category(p_household_id);

  insert into public.expenses (household_id, amount_minor, occurred_on, category_id, description, paid_by, provider_id)
  values (p_household_id, p_amount_minor, p_refilled_on, v_category,
          'Cooking gas refill (' || (p_cylinder_kg::float8)::text || ' kg)',
          p_paid_by, p_provider_id)
  returning id into v_expense_id;

  insert into public.gas_refills (household_id, refilled_on, cylinder_kg, amount_minor, provider_id, expense_id, created_by)
  values (p_household_id, p_refilled_on, p_cylinder_kg, p_amount_minor, p_provider_id, v_expense_id, auth.uid())
  returning id into v_refill_id;

  if p_reminder_on is not null then
    select (now() at time zone h.timezone)::date into v_today
    from public.households h where h.id = p_household_id;
    v_due := greatest(p_reminder_on, v_today);

    select t.id into v_task_id
    from public.gas_reminders g
    join public.tasks t on t.id = g.task_id and t.deleted_at is null
    where g.household_id = p_household_id;

    if v_task_id is null then
      insert into public.tasks (household_id, title, description, schedule_type, start_on, next_due_on,
                                provider_id, default_category_id)
      values (p_household_id, 'Refill cooking gas',
              'Due a few days before the gas is expected to run out. Logging the next refill moves it.',
              'once', v_due, v_due, p_provider_id, v_category)
      returning id into v_task_id;
      insert into public.gas_reminders (household_id, task_id) values (p_household_id, v_task_id)
      on conflict (household_id) do update set task_id = excluded.task_id;
    else
      update public.tasks
      set start_on = v_due, next_due_on = v_due, is_active = true,
          provider_id = coalesce(p_provider_id, provider_id)
      where id = v_task_id;
    end if;
  end if;

  return jsonb_build_object('refill_id', v_refill_id, 'expense_id', v_expense_id, 'task_id', v_task_id);
end;
$$;

revoke execute on function public.log_gas_refill(uuid, date, numeric, bigint, uuid, uuid, date) from public, anon;
grant execute on function public.log_gas_refill(uuid, date, numeric, bigint, uuid, uuid, date) to authenticated;

create function public.remove_gas_refill(p_refill_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refill public.gas_refills;
begin
  select * into v_refill from public.gas_refills where id = p_refill_id for update;
  if not found or not public.is_household_member(v_refill.household_id) then
    raise exception 'refill_not_found' using errcode = 'P0002';
  end if;
  delete from public.gas_refills where id = p_refill_id;
  update public.expenses set deleted_at = now()
  where id = v_refill.expense_id and deleted_at is null;
end;
$$;

revoke execute on function public.remove_gas_refill(uuid) from public, anon;
grant execute on function public.remove_gas_refill(uuid) to authenticated;
