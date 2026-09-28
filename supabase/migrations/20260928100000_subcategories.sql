-- Sub-categories: one level deep. An expense can use a category or one of its sub-categories;
-- insights and filters roll sub-categories up into their parent, and budgets are only set on
-- top-level categories.

alter table public.expense_categories
  add column parent_id uuid,
  add constraint expense_categories_parent_fk
    foreign key (household_id, parent_id) references public.expense_categories (household_id, id);

create index expense_categories_parent_idx on public.expense_categories (parent_id)
  where parent_id is not null;

-- Names are unique among siblings (two parents can both have an "Other").
drop index public.expense_categories_household_name_idx;
create unique index expense_categories_household_name_idx on public.expense_categories
  (household_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

grant insert (parent_id), update (parent_id) on public.expense_categories to authenticated;

create function public.check_category_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'A category can''t be its own sub-category' using errcode = '23514';
    end if;
    if exists (select 1 from public.expense_categories p
               where p.id = new.parent_id and p.parent_id is not null) then
      raise exception 'Sub-categories can''t have sub-categories of their own' using errcode = '23514';
    end if;
    if tg_op = 'UPDATE' and exists (select 1 from public.expense_categories c
                                    where c.parent_id = new.id) then
      raise exception 'A category with sub-categories can''t become a sub-category' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger check_category_parent
  before insert or update of parent_id on public.expense_categories
  for each row execute function public.check_category_parent();

-- Archiving (or restoring) a category does the same to its sub-categories. A category that
-- becomes a sub-category loses its budget (budgets belong to top-level categories).
create function public.category_parent_effects()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parent_id is null and new.is_archived is distinct from old.is_archived then
    update public.expense_categories c set is_archived = new.is_archived
    where c.parent_id = new.id;
  end if;
  if new.parent_id is not null and old.parent_id is null then
    delete from public.budgets b where b.category_id = new.id;
  end if;
  return null;
end;
$$;

create trigger category_parent_effects
  after update of is_archived, parent_id on public.expense_categories
  for each row execute function public.category_parent_effects();

revoke execute on function public.check_category_parent() from public, anon, authenticated;
revoke execute on function public.category_parent_effects() from public, anon, authenticated;

create or replace function public.set_budget(p_household_id uuid, p_category_id uuid, p_amount_minor bigint)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_amount_minor is not null and exists (
    select 1 from public.expense_categories c where c.id = p_category_id and c.parent_id is not null
  ) then
    raise exception 'Budgets are set on top-level categories (they include their sub-categories)'
      using errcode = '23514';
  end if;
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
  (select c.parent_id from public.expense_categories c where c.id = e.category_id) as category_parent_id
from public.expenses e;
