-- Budget months.
--
-- 1. Expenses keep their payment date (occurred_on) and get the month they count toward
--    (budget_month, the 1st of that month), e.g. rent paid on 29 Sep for October. It follows the
--    payment date's month unless set otherwise. Budgets and insights use it.
-- 2. Recurring bills can count toward the month after they're due.
-- 3. Budgets apply from a month (starts_on) onward until the next change for that category, so
--    next month's budget can differ without rewriting past months. A row with no amount removes
--    the budget from that month on. Past months can't be changed.

-- ---------------------------------------------------------------------------
-- Expenses: the month they count toward
-- ---------------------------------------------------------------------------

alter table public.expenses add column budget_month date;
-- Without the audit and activity triggers: filling the new column isn't an edit.
alter table public.expenses disable trigger user;
update public.expenses set budget_month = date_trunc('month', occurred_on)::date;
alter table public.expenses enable trigger user;
alter table public.expenses
  alter column budget_month set not null,
  add constraint expenses_budget_month_first_day check (extract(day from budget_month) = 1);

create index expenses_budget_month_idx on public.expenses (household_id, budget_month);

-- Fills budget_month from the payment date when it isn't given, stores it as the 1st of its
-- month, and keeps it following the payment date when the date changes, unless it had been set
-- to a different month.
create function public.set_expense_budget_month()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.budget_month := coalesce(new.budget_month, new.occurred_on);
  elsif new.occurred_on <> old.occurred_on
        and new.budget_month is not distinct from old.budget_month
        and old.budget_month = date_trunc('month', old.occurred_on)::date then
    new.budget_month := new.occurred_on;
  end if;
  new.budget_month := date_trunc('month', coalesce(new.budget_month, new.occurred_on))::date;
  return new;
end;
$$;

revoke execute on function public.set_expense_budget_month() from public, anon, authenticated;

create trigger set_budget_month
  before insert or update of occurred_on, budget_month on public.expenses
  for each row execute function public.set_expense_budget_month();

grant insert (budget_month), update (budget_month) on public.expenses to authenticated;

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
  e.recurring_expense_id,
  e.provider_id,
  e.task_completion_id,
  -- For filters that include a category's sub-categories.
  (select c.parent_id from public.expense_categories c where c.id = e.category_id) as category_parent_id,
  e.budget_month
from public.expenses e;

-- Spending totals are by the month expenses count toward: a range covers the months from
-- p_from's month to p_to (callers pass whole months).
create or replace function public.expense_category_totals(p_household_id uuid, p_from date, p_to date)
returns table (category_id uuid, total_minor bigint, expense_count int)
language sql
stable
set search_path = ''
as $$
  select e.category_id, sum(e.amount_minor)::bigint, count(*)::int
  from public.expenses e
  where e.household_id = p_household_id
    and e.deleted_at is null
    and e.status = 'confirmed'
    and e.budget_month between date_trunc('month', p_from)::date and p_to
  group by e.category_id;
$$;

create or replace function public.expense_provider_totals(
  p_household_id uuid,
  p_from date default null,
  p_to date default null
)
returns table (provider_id uuid, total_minor bigint, expense_count int)
language sql
stable
set search_path = ''
as $$
  select e.provider_id, sum(e.amount_minor)::bigint, count(*)::int
  from public.expenses e
  where e.household_id = p_household_id
    and e.provider_id is not null
    and e.deleted_at is null
    and e.status = 'confirmed'
    and (p_from is null or e.budget_month >= date_trunc('month', p_from)::date)
    and (p_to is null or e.budget_month <= p_to)
  group by e.provider_id;
$$;

-- An edit history line for a deliberate change of month (not one that just follows the date).
create or replace function public.expenses_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parts text[] := '{}';
  v_fields jsonb := '{}';
  v_label jsonb := jsonb_build_object('label', new.description);
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.household_id, 'expense', new.id, 'created',
      case when new.status = 'pending'
           then 'added pending bill for ' || public.format_money(new.amount_minor, new.currency)
           else 'added ' || public.format_money(new.amount_minor, new.currency) end,
      v_label);
    return new;
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    perform public.log_activity(new.household_id, 'expense', new.id, 'deleted',
      case when new.status = 'pending' then 'skipped pending bill' else 'deleted expense' end, v_label);
    return new;
  elsif old.deleted_at is not null and new.deleted_at is null then
    perform public.log_activity(new.household_id, 'expense', new.id, 'restored', 'restored expense', v_label);
    return new;
  end if;

  if old.status = 'pending' and new.status = 'confirmed' then
    v_parts := v_parts || ('confirmed ' || public.format_money(new.amount_minor, new.currency));
  elsif new.amount_minor <> old.amount_minor then
    v_parts := v_parts || ('amount ' || public.format_money(old.amount_minor, old.currency)
                           || ' → ' || public.format_money(new.amount_minor, new.currency));
  end if;
  if new.amount_minor <> old.amount_minor then
    v_fields := v_fields || jsonb_build_object('amount_minor', jsonb_build_array(old.amount_minor, new.amount_minor));
  end if;
  if new.description <> old.description then
    v_parts := v_parts || ('description “' || old.description || '” → “' || new.description || '”');
    v_fields := v_fields || jsonb_build_object('description', jsonb_build_array(old.description, new.description));
  end if;
  if new.occurred_on <> old.occurred_on then
    v_parts := v_parts || ('date ' || public.format_day(old.occurred_on) || ' → ' || public.format_day(new.occurred_on));
    v_fields := v_fields || jsonb_build_object('occurred_on', jsonb_build_array(old.occurred_on, new.occurred_on));
  end if;
  if new.budget_month <> old.budget_month
     and not (old.budget_month = date_trunc('month', old.occurred_on)::date
              and new.budget_month = date_trunc('month', new.occurred_on)::date) then
    v_parts := v_parts || ('counts toward ' || to_char(new.budget_month, 'FMMonth YYYY'));
    v_fields := v_fields || jsonb_build_object('budget_month', jsonb_build_array(old.budget_month, new.budget_month));
  end if;
  if new.category_id <> old.category_id then
    v_parts := v_parts || ('category ' || (select name from public.expense_categories where id = old.category_id)
                           || ' → ' || (select name from public.expense_categories where id = new.category_id));
    v_fields := v_fields || jsonb_build_object('category_id', jsonb_build_array(old.category_id, new.category_id));
  end if;
  if new.paid_by is distinct from old.paid_by then
    v_parts := v_parts || ('paid by ' || coalesce(public.person_name(new.paid_by), 'nobody'));
    v_fields := v_fields || jsonb_build_object('paid_by', jsonb_build_array(old.paid_by, new.paid_by));
  end if;
  if new.provider_id is distinct from old.provider_id then
    v_parts := v_parts || ('provider ' || coalesce((select name from public.providers where id = new.provider_id), 'none'));
    v_fields := v_fields || jsonb_build_object('provider_id', jsonb_build_array(old.provider_id, new.provider_id));
  end if;
  if new.notes is distinct from old.notes then
    v_parts := v_parts || 'notes'::text;
    v_fields := v_fields || jsonb_build_object('notes', jsonb_build_array(old.notes, new.notes));
  end if;

  if cardinality(v_parts) > 0 then
    perform public.log_activity(new.household_id, 'expense', new.id, 'updated',
      case when v_parts[1] like 'confirmed %' then array_to_string(v_parts, ', ')
           else 'edited ' || array_to_string(v_parts, ', ') end,
      v_label || jsonb_build_object('fields', v_fields));
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Recurring bills that count toward the following month (e.g. rent due on the 25th)
-- ---------------------------------------------------------------------------

alter table public.recurring_expenses
  add column for_next_month boolean not null default false;

grant insert (for_next_month), update (for_next_month) on public.recurring_expenses to authenticated;

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
  return v_created;
end;
$$;

-- ---------------------------------------------------------------------------
-- Budgets from a month onward
-- ---------------------------------------------------------------------------

-- Existing budgets have always applied, so they start long ago and history reads as before.
alter table public.budgets add column starts_on date;
update public.budgets set starts_on = date '2000-01-01';
alter table public.budgets
  alter column starts_on set not null,
  add constraint budgets_starts_on_first_day check (extract(day from starts_on) = 1),
  alter column monthly_amount_minor drop not null,
  drop constraint budgets_household_id_category_id_key,
  add constraint budgets_household_id_category_id_starts_on_key unique (household_id, category_id, starts_on);

-- Budgets are written only through set_budget, which enforces the month rules.
revoke insert, update, delete on public.budgets from authenticated;

-- The budgets in force in a month: each category's latest change on or before it, unless that
-- change removed the budget. Security invoker: RLS limits it to the caller's households.
create function public.budgets_for_month(p_household_id uuid, p_month date)
returns setof public.budgets
language sql
stable
set search_path = ''
as $$
  select * from (
    select distinct on (b.category_id) b.*
    from public.budgets b
    where b.household_id = p_household_id
      and b.starts_on <= date_trunc('month', p_month)::date
    order by b.category_id, b.starts_on desc
  ) latest
  where latest.monthly_amount_minor is not null;
$$;

revoke execute on function public.budgets_for_month(uuid, date) from public, anon;
grant execute on function public.budgets_for_month(uuid, date) to authenticated;

-- Sets a category's budget from p_month onward (until its next change), or removes it from then
-- on when p_amount_minor is null. Only this month (in the household's timezone) and later.
create function public.set_budget(
  p_household_id uuid,
  p_category_id uuid,
  p_month date,
  p_amount_minor bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_current date;
  v_before bigint;
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'not a member of this household' using errcode = '42501';
  end if;
  select date_trunc('month', now() at time zone h.timezone)::date into v_current
  from public.households h where h.id = p_household_id;
  if v_month < v_current then
    raise exception 'Budgets for past months can''t be changed' using errcode = '22023';
  end if;

  -- What applied just before this month. Setting the same again needs no change of its own.
  select b.monthly_amount_minor into v_before
  from public.budgets b
  where b.household_id = p_household_id and b.category_id = p_category_id and b.starts_on < v_month
  order by b.starts_on desc
  limit 1;

  if p_amount_minor is not distinct from v_before then
    delete from public.budgets
    where household_id = p_household_id and category_id = p_category_id and starts_on = v_month;
  else
    insert into public.budgets (household_id, category_id, starts_on, monthly_amount_minor)
    values (p_household_id, p_category_id, v_month, p_amount_minor)
    on conflict (household_id, category_id, starts_on)
    do update set monthly_amount_minor = excluded.monthly_amount_minor;
  end if;
end;
$$;

revoke execute on function public.set_budget(uuid, uuid, date, bigint) from public, anon;
grant execute on function public.set_budget(uuid, uuid, date, bigint) to authenticated;

-- The old form (still used by an app version that hasn't reloaded yet) sets it from this month.
create or replace function public.set_budget(p_household_id uuid, p_category_id uuid, p_amount_minor bigint)
returns void
language sql
set search_path = ''
as $$
  select public.set_budget(
    p_household_id,
    p_category_id,
    (select (now() at time zone h.timezone)::date from public.households h where h.id = p_household_id),
    p_amount_minor
  );
$$;
