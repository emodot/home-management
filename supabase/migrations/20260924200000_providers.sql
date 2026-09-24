-- M6: service providers (private to each household), linked from expenses and recurring bills.

create table public.providers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  name text not null check (char_length(name) between 1 and 100 and name = btrim(name)),
  trade text not null default 'other' check (trade in (
    'plumber', 'electrician', 'generator_technician', 'cleaner', 'painter', 'carpenter',
    'ac_technician', 'fumigator', 'other'
  )),
  -- E.164 (the app normalises Nigerian numbers like 0803 123 4567 to +2348031234567).
  phone text check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  whatsapp text check (whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  email text check (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  area text check (char_length(area) <= 100),
  notes text check (char_length(notes) <= 2000),
  rating smallint check (rating between 1 and 5),
  created_by uuid references public.profiles on delete set null,
  updated_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (household_id, id)
);

create index providers_household_name_idx on public.providers (household_id, lower(name));

create trigger set_audit_fields
  before insert or update on public.providers
  for each row execute function public.set_audit_fields();

revoke all on public.providers from anon;
revoke insert, update, delete, truncate, references, trigger on public.providers from authenticated;
grant insert (household_id, name, trade, phone, whatsapp, email, area, notes, rating)
  on public.providers to authenticated;
grant update (name, trade, phone, whatsapp, email, area, notes, rating, deleted_at)
  on public.providers to authenticated;

alter table public.providers enable row level security;

create policy "Members manage providers: select" on public.providers
  for select to authenticated using (public.is_household_member(household_id));
create policy "Members manage providers: insert" on public.providers
  for insert to authenticated with check (public.is_household_member(household_id));
create policy "Members manage providers: update" on public.providers
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- Links from expenses and recurring bills (same household only; cleared if the provider is purged)
-- ---------------------------------------------------------------------------

alter table public.expenses
  add column provider_id uuid,
  add foreign key (household_id, provider_id)
    references public.providers (household_id, id) on delete set null (provider_id);
create index expenses_provider_idx on public.expenses (household_id, provider_id)
  where provider_id is not null;
grant insert (provider_id), update (provider_id) on public.expenses to authenticated;

alter table public.recurring_expenses
  add column provider_id uuid,
  add foreign key (household_id, provider_id)
    references public.providers (household_id, id) on delete set null (provider_id);
grant insert (provider_id), update (provider_id) on public.recurring_expenses to authenticated;

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
  e.provider_id
from public.expenses e;

-- Generated pending expenses now carry the bill's provider.
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
      (household_id, amount_minor, currency, occurred_on, category_id, description, paid_by,
       provider_id, status, recurring_expense_id)
    select r.household_id, r.amount_minor, r.currency, d, r.category_id, r.description, v_paid_by,
           r.provider_id, 'pending', r.id
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
-- Spend per provider (confirmed, non-deleted), for provider pages and the dashboard.
-- Null bounds mean unbounded ("all time"). Security invoker: RLS applies.
-- ---------------------------------------------------------------------------

create function public.expense_provider_totals(
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
    and (p_from is null or e.occurred_on >= p_from)
    and (p_to is null or e.occurred_on <= p_to)
  group by e.provider_id;
$$;

revoke execute on function public.expense_provider_totals(uuid, date, date) from public, anon;
grant execute on function public.expense_provider_totals(uuid, date, date) to authenticated;
