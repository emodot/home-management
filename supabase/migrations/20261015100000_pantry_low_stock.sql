-- My Kitchen, K5: the pantry's low-stock rule. When an item's quantity falls to or below its
-- low-stock threshold (or the threshold is raised past it), the item goes on the shopping list
-- (source 'pantry') with its usual unit and store — once: if it's already on the list, nothing
-- changes. Doing it here means it holds whoever changes the stock, and however fast.

create function public.pantry_low_stock_to_list()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_low boolean := new.low_stock_threshold is not null and new.quantity <= new.low_stock_threshold;
  v_was_low boolean := tg_op = 'UPDATE'
    and old.low_stock_threshold is not null and old.quantity <= old.low_stock_threshold;
begin
  if v_low and not v_was_low then
    insert into public.shopping_list_items (household_id, item_id, quantity, unit, store_tag, source)
    select new.household_id, new.item_id, 1, k.default_unit, k.default_store_tag, 'pantry'
    from public.kitchen_items k
    where k.id = new.item_id
    on conflict (household_id, item_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger low_stock_to_list
  after insert or update of quantity, low_stock_threshold on public.pantry_items
  for each row execute function public.pantry_low_stock_to_list();

-- Undo for removing a pantry item puts it back with the same id.
grant insert (id) on public.pantry_items to authenticated;
