-- Recurring income (e.g. a monthly salary), like recurring bills: when one is due it becomes a
-- *pending* income entry that a household admin confirms (optionally correcting the amount) or
-- skips. Household admins only, like income.

create table public.recurring_income (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  source text not null check (char_length(source) between 1 and 200 and source = btrim(source)),
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 100000000000000),
  currency char(3) not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  received_by uuid references public.profiles on delete set null,
  frequency text not null check (frequency in ('weekly', 'monthly', 'quarterly', 'yearly')),
  interval_count int not null default 1 check (interval_count between 1 and 99),
  -- First pay day; its day of month anchors month-based schedules (see advance_date).
  start_on date not null,
  next_due_on date not null,
  is_active boolean not null default true,
  -- Each payment counts toward the month after it's paid (e.g. a salary paid on the 28th).
  for_next_month boolean not null default false,
  created_by uuid references public.profiles on delete set null,
  updated_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id)
);

create index recurring_income_due_idx on public.recurring_income (next_due_on) where is_active;

create trigger set_audit_fields
  before insert or update on public.recurring_income
  for each row execute function public.set_audit_fields();

-- Whoever usually receives it must be a member when set (same check as income).
create function public.check_recurring_income_received_by()
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

revoke execute on function public.check_recurring_income_received_by() from public, anon, authenticated;

create trigger check_received_by
  before insert or update of received_by on public.recurring_income
  for each row execute function public.check_recurring_income_received_by();

revoke all on public.recurring_income from anon;
revoke insert, update, delete, truncate, references, trigger on public.recurring_income from authenticated;
grant insert (household_id, source, amount_minor, received_by, frequency, interval_count, start_on, next_due_on, is_active, for_next_month)
  on public.recurring_income to authenticated;
grant update (source, amount_minor, received_by, frequency, interval_count, start_on, next_due_on, is_active, for_next_month)
  on public.recurring_income to authenticated;
grant delete on public.recurring_income to authenticated;

alter table public.recurring_income enable row level security;

create policy "Household admins manage recurring income: select" on public.recurring_income
  for select to authenticated using (public.is_household_admin(household_id));
create policy "Household admins manage recurring income: insert" on public.recurring_income
  for insert to authenticated with check (public.is_household_admin(household_id));
create policy "Household admins manage recurring income: update" on public.recurring_income
  for update to authenticated
  using (public.is_household_admin(household_id))
  with check (public.is_household_admin(household_id));
create policy "Household admins manage recurring income: delete" on public.recurring_income
  for delete to authenticated using (public.is_household_admin(household_id));

-- ---------------------------------------------------------------------------
-- Income generated from recurring income
-- ---------------------------------------------------------------------------

alter table public.income
  add column status text not null default 'confirmed' check (status in ('confirmed', 'pending')),
  add column recurring_income_id uuid,
  add foreign key (household_id, recurring_income_id)
    references public.recurring_income (household_id, id) on delete set null (recurring_income_id);

-- One entry per recurring income per pay day, deleted (skipped) ones included, so generation is
-- idempotent.
create unique index income_recurring_occurrence_idx
  on public.income (recurring_income_id, received_on)
  where recurring_income_id is not null;

-- Admins confirm pending income; they can't create pending entries or change the link.
grant update (status) on public.income to authenticated;

-- Pending income is a proposal, not money received.
create or replace function public.income_totals(p_household_id uuid, p_from date, p_to date)
returns table (month date, total_minor bigint, entry_count int)
language sql
stable
set search_path = ''
as $$
  select i.budget_month, sum(i.amount_minor)::bigint, count(*)::int
  from public.income i
  where i.household_id = p_household_id
    and i.deleted_at is null
    and i.status = 'confirmed'
    and i.budget_month between date_trunc('month', p_from)::date and p_to
  group by i.budget_month;
$$;

-- Turns due recurring income into pending entries, like generate_recurring_expenses.
create function public.generate_recurring_income(
  p_today date default null,
  p_household_id uuid default null,
  p_max_per_item int default 12
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_due date;
  v_dates date[];
  v_received_by uuid;
  v_inserted int;
  v_created int := 0;
begin
  for r in
    select ri.*, coalesce(p_today, (now() at time zone h.timezone)::date) as today
    from public.recurring_income ri
    join public.households h on h.id = ri.household_id
    where ri.is_active
      and (p_household_id is null or ri.household_id = p_household_id)
      and ri.next_due_on <= coalesce(p_today, (now() at time zone h.timezone)::date)
    for update of ri skip locked
  loop
    v_dates := '{}';
    v_due := r.next_due_on;
    while v_due <= r.today loop
      v_dates := v_dates || v_due;
      v_due := public.advance_date(v_due, r.frequency, r.interval_count, extract(day from r.start_on)::int);
    end loop;

    -- Whoever receives it may have left the household since it was set up.
    v_received_by := case when public.is_member_of(r.household_id, r.received_by) then r.received_by end;

    insert into public.income
      (household_id, amount_minor, currency, received_on, budget_month, source, received_by,
       status, recurring_income_id)
    select r.household_id, r.amount_minor, r.currency, d,
           (date_trunc('month', d) + case when r.for_next_month then interval '1 month' else interval '0' end)::date,
           r.source, v_received_by, 'pending', r.id
    from unnest(v_dates[greatest(1, array_length(v_dates, 1) - p_max_per_item + 1):]) as d
    on conflict (recurring_income_id, received_on) where recurring_income_id is not null do nothing;

    get diagnostics v_inserted = row_count;
    v_created := v_created + v_inserted;

    update public.recurring_income set next_due_on = v_due where id = r.id;
  end loop;
  return v_created;
end;
$$;

revoke execute on function public.generate_recurring_income(date, uuid, int) from public, anon, authenticated;
grant execute on function public.generate_recurring_income(date, uuid, int) to service_role;

-- Lets the app create anything already due right after an admin saves recurring income.
create function public.generate_due_recurring_income(p_household_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_household_admin(p_household_id) then
    raise exception 'not_household_admin' using errcode = '42501';
  end if;
  return public.generate_recurring_income(null, p_household_id);
end;
$$;

revoke execute on function public.generate_due_recurring_income(uuid) from public, anon;
grant execute on function public.generate_due_recurring_income(uuid) to authenticated;

-- The daily job calls generate_recurring_expenses; it now does recurring income too, so the job
-- needs no change. The count it returns includes both.
create or replace function public.generate_recurring_expenses(
  p_today date default null,
  p_household_id uuid default null,
  p_max_per_bill int default 12
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_due date;
  v_dates date[];
  v_paid_by uuid;
  v_inserted int;
  v_created int := 0;
begin
  for r in
    select re.*, coalesce(p_today, (now() at time zone h.timezone)::date) as today
    from public.recurring_expenses re
    join public.households h on h.id = re.household_id
    where re.is_active
      and (p_household_id is null or re.household_id = p_household_id)
      and re.next_due_on <= coalesce(p_today, (now() at time zone h.timezone)::date)
    for update of re skip locked
  loop
    v_dates := '{}';
    v_due := r.next_due_on;
    while v_due <= r.today loop
      v_dates := v_dates || v_due;
      v_due := public.advance_date(v_due, r.frequency, r.interval_count, extract(day from r.start_on)::int);
    end loop;

    -- Whoever pays may have left the household since the bill was set up.
    v_paid_by := case when public.is_member_of(r.household_id, r.paid_by) then r.paid_by end;

    insert into public.expenses
      (household_id, amount_minor, currency, occurred_on, budget_month, category_id, description,
       paid_by, provider_id, status, recurring_expense_id)
    select r.household_id, r.amount_minor, r.currency, d,
           (date_trunc('month', d) + case when r.for_next_month then interval '1 month' else interval '0' end)::date,
           r.category_id, r.description, v_paid_by, r.provider_id, 'pending', r.id
    from unnest(v_dates[greatest(1, array_length(v_dates, 1) - p_max_per_bill + 1):]) as d
    on conflict (recurring_expense_id, occurred_on) where recurring_expense_id is not null do nothing;

    get diagnostics v_inserted = row_count;
    v_created := v_created + v_inserted;

    update public.recurring_expenses set next_due_on = v_due where id = r.id;
  end loop;

  -- Only from the daily job (no household given): an app call for a household's bills shouldn't
  -- create income its caller may not be allowed to see.
  if p_household_id is null then
    v_created := v_created + public.generate_recurring_income(p_today, null, p_max_per_bill);
  end if;
  return v_created;
end;
$$;
