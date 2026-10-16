-- Tour guide, T4: the getting-started checklist, ticked from the household's own data rather than
-- stored flags, so it's always right, including for members who join later.

-- What the household has done of the checklist. Security invoker: RLS limits it to the caller's
-- households (anyone else gets all false).
create function public.getting_started(p_household_id uuid)
returns table (
  has_expense boolean,
  has_receipt boolean,
  has_invited boolean,
  has_provider boolean,
  has_recurring_task boolean,
  has_shopping_list boolean
)
language sql
stable
set search_path = ''
as $$
  select
    exists (
      select 1 from public.expenses
      where household_id = p_household_id and status = 'confirmed' and deleted_at is null
    ),
    exists (
      select 1 from public.expense_receipts r
      join public.expenses e on e.id = r.expense_id
      where r.household_id = p_household_id and r.deleted_at is null and e.deleted_at is null
    ),
    -- A household admin's invite (the super-admin's 'admin' invite that set the household up
    -- doesn't count), or someone already joined.
    exists (
      select 1 from public.invites
      where household_id = p_household_id and role = 'member' and revoked_at is null
    )
    or (select count(*) from public.household_members where household_id = p_household_id) >= 2,
    exists (
      select 1 from public.providers where household_id = p_household_id and deleted_at is null
    ),
    exists (
      select 1 from public.tasks
      where household_id = p_household_id and frequency is not null and deleted_at is null
    ),
    -- On the list now, or bought on an earlier trip (the list empties as things are bought).
    exists (select 1 from public.shopping_list_items where household_id = p_household_id)
    or exists (select 1 from public.shopping_trips where household_id = p_household_id)
$$;

revoke execute on function public.getting_started(uuid) from public, anon;
grant execute on function public.getting_started(uuid) to authenticated;
