-- Income: money coming into the household (salary, business, rent received), recorded like
-- expenses with a received date and the month it counts toward, so each month has a net
-- (income minus spending). Only household admins can see or record income. It isn't written to
-- the activity log, which every member can read.

create table public.income (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 100000000000000),
  currency char(3) not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  received_on date not null,
  -- The month it counts toward (its 1st), the received date's month unless set otherwise.
  budget_month date not null check (extract(day from budget_month) = 1),
  source text not null check (char_length(source) between 1 and 200 and source = btrim(source)),
  notes text check (notes is null or char_length(notes) <= 2000),
  received_by uuid references public.profiles on delete set null,
  created_by uuid references public.profiles on delete set null,
  updated_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index income_household_month_idx on public.income (household_id, budget_month)
  where deleted_at is null;

create trigger set_audit_fields
  before insert or update on public.income
  for each row execute function public.set_audit_fields();

-- Same rules as expenses' budget_month: defaults to the received date's month, stored as the
-- 1st, and follows a changed date unless it had been set to a different month.
create function public.set_income_budget_month()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.budget_month := coalesce(new.budget_month, new.received_on);
  elsif new.received_on <> old.received_on
        and new.budget_month is not distinct from old.budget_month
        and old.budget_month = date_trunc('month', old.received_on)::date then
    new.budget_month := new.received_on;
  end if;
  new.budget_month := date_trunc('month', coalesce(new.budget_month, new.received_on))::date;
  return new;
end;
$$;

-- Whoever received it must be a member when set (like an expense's paid_by).
create function public.check_income_received_by()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.received_by is not null
     and (tg_op = 'INSERT' or new.received_by is distinct from old.received_by)
     and not public.is_member_of(new.household_id, new.received_by) then
    raise exception 'received_by must be a household member' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.set_income_budget_month() from public, anon, authenticated;
revoke execute on function public.check_income_received_by() from public, anon, authenticated;

create trigger set_budget_month
  before insert or update of received_on, budget_month on public.income
  for each row execute function public.set_income_budget_month();

create trigger check_received_by
  before insert or update of received_by on public.income
  for each row execute function public.check_income_received_by();

-- ---------------------------------------------------------------------------
-- Household admins only
-- ---------------------------------------------------------------------------

-- Whether the caller is an admin of the household.
create function public.is_household_admin(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_household_admin_of(hid, auth.uid());
$$;

revoke execute on function public.is_household_admin(uuid) from public, anon;
grant execute on function public.is_household_admin(uuid) to authenticated;

revoke all on public.income from anon;
revoke insert, update, delete, truncate, references, trigger on public.income from authenticated;
grant insert (household_id, amount_minor, received_on, budget_month, source, notes, received_by)
  on public.income to authenticated;
-- Deleting is a soft delete (deleted_at); rows are purged after 30 days.
grant update (amount_minor, received_on, budget_month, source, notes, received_by, deleted_at)
  on public.income to authenticated;

alter table public.income enable row level security;

create policy "Household admins manage income: select" on public.income
  for select to authenticated using (public.is_household_admin(household_id));
create policy "Household admins manage income: insert" on public.income
  for insert to authenticated with check (public.is_household_admin(household_id));
create policy "Household admins manage income: update" on public.income
  for update to authenticated
  using (public.is_household_admin(household_id))
  with check (public.is_household_admin(household_id));

-- Income per month it counts toward (non-deleted), for the months from p_from's month to p_to.
-- Security invoker: RLS means only household admins get rows.
create function public.income_totals(p_household_id uuid, p_from date, p_to date)
returns table (month date, total_minor bigint, entry_count int)
language sql
stable
set search_path = ''
as $$
  select i.budget_month, sum(i.amount_minor)::bigint, count(*)::int
  from public.income i
  where i.household_id = p_household_id
    and i.deleted_at is null
    and i.budget_month between date_trunc('month', p_from)::date and p_to
  group by i.budget_month;
$$;

revoke execute on function public.income_totals(uuid, date, date) from public, anon;
grant execute on function public.income_totals(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Purging: income soft-deleted over 30 days ago goes with the rest
-- ---------------------------------------------------------------------------

create or replace function public.purge_deleted_rows(p_before timestamptz default now() - interval '30 days')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paths text[];
  v_receipts int;
  v_expenses int;
  v_providers int;
  v_tasks int;
  v_income int;
begin
  -- Receipts deleted on their own, or belonging to an expense being purged.
  with gone as (
    delete from public.expense_receipts r
    where r.deleted_at < p_before
       or exists (select 1 from public.expenses e where e.id = r.expense_id and e.deleted_at < p_before)
    returning r.storage_path
  )
  select coalesce(array_agg(storage_path), '{}'), count(*) into v_paths, v_receipts from gone;

  delete from public.expenses where deleted_at < p_before;
  get diagnostics v_expenses = row_count;
  delete from public.tasks where deleted_at < p_before;
  get diagnostics v_tasks = row_count;
  delete from public.providers where deleted_at < p_before;
  get diagnostics v_providers = row_count;
  delete from public.income where deleted_at < p_before;
  get diagnostics v_income = row_count;

  return jsonb_build_object(
    'receipts', v_receipts,
    'expenses', v_expenses,
    'tasks', v_tasks,
    'providers', v_providers,
    'income', v_income,
    'storage_paths', to_jsonb(v_paths)
  );
end;
$$;
