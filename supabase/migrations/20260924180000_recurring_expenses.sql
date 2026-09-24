-- M5: recurring expenses. The daily job (and members, right after saving a bill) turn due
-- occurrences into *pending* expenses, which members confirm or skip.
-- Provider links are added with providers (M6).

-- ---------------------------------------------------------------------------
-- Date arithmetic (mirrors packages/shared/src/recurrence.ts)
-- ---------------------------------------------------------------------------

-- Moves p_from forward by one step. Month-based steps keep the anchor day where the month allows
-- it: anchored to the 31st, Jan 31 → Feb 28 (29 in leap years) → Mar 31.
create function public.advance_date(
  p_from date,
  p_frequency text,
  p_interval int,
  p_anchor_day int
)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_months int;
  v_first date;
begin
  if p_frequency = 'daily' then
    return p_from + p_interval;
  elsif p_frequency = 'weekly' then
    return p_from + 7 * p_interval;
  end if;

  v_months := p_interval * case p_frequency
    when 'monthly' then 1
    when 'quarterly' then 3
    when 'yearly' then 12
  end;
  if v_months is null then
    raise exception 'unknown frequency %', p_frequency;
  end if;

  v_first := (date_trunc('month', p_from) + make_interval(months => v_months))::date;
  return v_first + (least(
    p_anchor_day,
    extract(day from (v_first + interval '1 month' - interval '1 day'))::int
  ) - 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- Definitions
-- ---------------------------------------------------------------------------

create table public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  description text not null check (char_length(description) between 1 and 200 and description = btrim(description)),
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 100000000000000),
  currency char(3) not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  category_id uuid not null,
  paid_by uuid references public.profiles on delete set null,
  frequency text not null check (frequency in ('weekly', 'monthly', 'quarterly', 'yearly')),
  interval_count int not null default 1 check (interval_count between 1 and 99),
  -- First due date; its day of month anchors month-based schedules (see advance_date).
  start_on date not null,
  next_due_on date not null,
  is_active boolean not null default true,
  created_by uuid references public.profiles on delete set null,
  updated_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, category_id) references public.expense_categories (household_id, id)
);

create index recurring_expenses_due_idx
  on public.recurring_expenses (next_due_on)
  where is_active;

create trigger set_audit_fields
  before insert or update on public.recurring_expenses
  for each row execute function public.set_audit_fields();

-- Same rule as expenses: paid_by must be a current member when set.
create trigger check_paid_by
  before insert or update of paid_by on public.recurring_expenses
  for each row execute function public.check_expense_paid_by();

revoke all on public.recurring_expenses from anon;
revoke insert, update, delete, truncate, references, trigger on public.recurring_expenses from authenticated;
grant insert (household_id, description, amount_minor, category_id, paid_by, frequency, interval_count, start_on, next_due_on, is_active)
  on public.recurring_expenses to authenticated;
grant update (description, amount_minor, category_id, paid_by, frequency, interval_count, start_on, next_due_on, is_active)
  on public.recurring_expenses to authenticated;
grant delete on public.recurring_expenses to authenticated;

alter table public.recurring_expenses enable row level security;

create policy "Members manage recurring expenses: select" on public.recurring_expenses
  for select to authenticated using (public.is_household_member(household_id));
create policy "Members manage recurring expenses: insert" on public.recurring_expenses
  for insert to authenticated with check (public.is_household_member(household_id));
create policy "Members manage recurring expenses: update" on public.recurring_expenses
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "Members manage recurring expenses: delete" on public.recurring_expenses
  for delete to authenticated using (public.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- Expenses generated from a definition
-- ---------------------------------------------------------------------------

alter table public.expenses
  add column recurring_expense_id uuid,
  add foreign key (household_id, recurring_expense_id)
    references public.recurring_expenses (household_id, id) on delete set null (recurring_expense_id);

-- One expense per bill per due date, deleted (skipped) ones included, so generation is idempotent.
create unique index expenses_recurring_occurrence_idx
  on public.expenses (recurring_expense_id, occurred_on)
  where recurring_expense_id is not null;

-- Members confirm pending expenses; they can't create pending ones or change the link.
grant update (status) on public.expenses to authenticated;

create or replace view public.expense_list
with (security_invoker = true)
as
select
  e.id, e.household_id, e.amount_minor, e.currency, e.occurred_on, e.category_id,
  e.description, e.notes, e.paid_by, e.status, e.created_by, e.updated_by,
  e.created_at, e.updated_at, e.deleted_at,
  e.description || ' ' || coalesce(e.notes, '') as search_text,
  (select count(*)::int
   from public.expense_receipts r
   where r.expense_id = e.id and r.deleted_at is null) as receipt_count,
  e.recurring_expense_id
from public.expenses e;

-- ---------------------------------------------------------------------------
-- Generation (daily job step 1)
-- ---------------------------------------------------------------------------

-- Creates pending expenses for every due occurrence of active bills and advances next_due_on.
-- "Today" is each household's local date unless p_today is given. After a long gap only the most
-- recent p_max_per_bill occurrences are created. Safe to run repeatedly. Returns rows created.
create function public.generate_recurring_expenses(
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
      (household_id, amount_minor, currency, occurred_on, category_id, description, paid_by, status, recurring_expense_id)
    select r.household_id, r.amount_minor, r.currency, d, r.category_id, r.description, v_paid_by, 'pending', r.id
    from unnest(v_dates[greatest(1, array_length(v_dates, 1) - p_max_per_bill + 1):]) as d
    on conflict (recurring_expense_id, occurred_on) where recurring_expense_id is not null do nothing;

    get diagnostics v_inserted = row_count;
    v_created := v_created + v_inserted;

    update public.recurring_expenses set next_due_on = v_due where id = r.id;
  end loop;
  return v_created;
end;
$$;

revoke execute on function public.generate_recurring_expenses(date, uuid, int) from public, anon, authenticated;
grant execute on function public.generate_recurring_expenses(date, uuid, int) to service_role;

-- Lets the app create anything already due right after a member saves a bill, instead of waiting
-- for the next daily run.
create function public.generate_due_recurring_expenses(p_household_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'not_member';
  end if;
  return public.generate_recurring_expenses(null, p_household_id);
end;
$$;

revoke execute on function public.generate_due_recurring_expenses(uuid) from public, anon;
grant execute on function public.generate_due_recurring_expenses(uuid) to authenticated;
