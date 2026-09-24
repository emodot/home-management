-- M4: monthly budgets per category, and spending totals for the summary dashboard.

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  category_id uuid not null,
  monthly_amount_minor bigint not null
    check (monthly_amount_minor > 0 and monthly_amount_minor <= 100000000000000),
  currency char(3) not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  unique (household_id, category_id),
  foreign key (household_id, category_id)
    references public.expense_categories (household_id, id) on delete cascade
);

revoke all on public.budgets from anon;
revoke insert, update, delete, truncate, references, trigger on public.budgets from authenticated;
grant insert (household_id, category_id, monthly_amount_minor) on public.budgets to authenticated;
grant update (monthly_amount_minor) on public.budgets to authenticated;
grant delete on public.budgets to authenticated;

alter table public.budgets enable row level security;

create policy "Members manage budgets: select" on public.budgets
  for select to authenticated using (public.is_household_member(household_id));
create policy "Members manage budgets: insert" on public.budgets
  for insert to authenticated with check (public.is_household_member(household_id));
create policy "Members manage budgets: update" on public.budgets
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "Members manage budgets: delete" on public.budgets
  for delete to authenticated using (public.is_household_member(household_id));

-- Sets a category's monthly budget, or removes it when p_amount_minor is null.
-- Runs with the caller's privileges, so RLS and the grants above apply.
create function public.set_budget(p_household_id uuid, p_category_id uuid, p_amount_minor bigint)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_amount_minor is null then
    delete from public.budgets
    where household_id = p_household_id and category_id = p_category_id;
  else
    insert into public.budgets (household_id, category_id, monthly_amount_minor)
    values (p_household_id, p_category_id, p_amount_minor)
    on conflict (household_id, category_id)
    do update set monthly_amount_minor = excluded.monthly_amount_minor;
  end if;
end;
$$;

revoke execute on function public.set_budget(uuid, uuid, bigint) from public, anon;
grant execute on function public.set_budget(uuid, uuid, bigint) to authenticated;

-- Confirmed, non-deleted spending per category between two dates (inclusive).
-- Security invoker: RLS on expenses limits it to the caller's households.
create function public.expense_category_totals(p_household_id uuid, p_from date, p_to date)
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
    and e.occurred_on between p_from and p_to
  group by e.category_id;
$$;

revoke execute on function public.expense_category_totals(uuid, date, date) from public, anon;
grant execute on function public.expense_category_totals(uuid, date, date) to authenticated;
