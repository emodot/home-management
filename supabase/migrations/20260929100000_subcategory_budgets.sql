-- Budgets on sub-categories too. A sub-category's budget counts its own spending; a top-level
-- category's budget still includes its sub-categories' (the app does the sums). A category keeps
-- its budget when it moves under another one or back to the top level.

create or replace function public.set_budget(p_household_id uuid, p_category_id uuid, p_amount_minor bigint)
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

-- Archiving (or restoring) a category does the same to its sub-categories.
create or replace function public.category_parent_effects()
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
  return null;
end;
$$;
