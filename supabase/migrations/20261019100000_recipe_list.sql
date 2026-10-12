-- My Kitchen, K11 (v2): from a recipe to the shopping list. "Add missing to list" puts what a
-- recipe needs beyond the pantry on the list (worked out in the app,
-- packages/shared/src/kitchen/cook.ts) through add_recipe_to_list, which never makes a second
-- entry for an item: an entry already there is topped up to what's needed when the units convert.
-- Entries it adds remember the recipe (source 'recipe', source_ref = the recipe's id).

alter table public.shopping_list_items drop constraint shopping_list_items_source_check;
alter table public.shopping_list_items add constraint shopping_list_items_source_check
  check (source in ('manual', 'pantry', 'meal_plan', 'recipe'));

-- p_lines: [{ "item_id", "quantity", "unit" }], what's short, in the recipe's units. For each:
--   added     not on the list: added with the recipe as its source;
--   topped_up on the list with less than that: raised to it (and back on the list if checked off);
--   covered   on the list with at least that already;
--   kept      on the list in a unit that doesn't convert: left as it is.
-- Returns [{ "item_id", "status" }] in the order given.
create function public.add_recipe_to_list(p_household_id uuid, p_recipe_id uuid, p_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line jsonb;
  v_item_id uuid;
  v_quantity numeric;
  v_unit text;
  v_entry public.shopping_list_items;
  v_item public.kitchen_items;
  v_needed numeric;
  v_status text;
  v_result jsonb := '[]';
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if not exists (select 1 from public.recipes where id = p_recipe_id and household_id = p_household_id) then
    raise exception 'recipe_not_found' using errcode = 'P0002';
  end if;

  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]')) loop
    v_item_id := (v_line ->> 'item_id')::uuid;
    v_quantity := round((v_line ->> 'quantity')::numeric, 2);
    v_unit := v_line ->> 'unit';
    select * into v_item from public.kitchen_items where id = v_item_id and household_id = p_household_id;
    if v_item.id is null then
      raise exception 'item_not_found' using errcode = 'P0002';
    end if;

    select * into v_entry from public.shopping_list_items
    where household_id = p_household_id and item_id = v_item_id
    for update;

    if v_entry.id is null then
      insert into public.shopping_list_items (household_id, item_id, quantity, unit, store_tag, source, source_ref)
      values (p_household_id, v_item_id, v_quantity, v_unit, v_item.default_store_tag, 'recipe', p_recipe_id);
      v_status := 'added';
    else
      v_needed := round(public.kitchen_convert(v_item_id, v_quantity, v_unit, v_entry.unit), 2);
      if v_needed is null then
        v_status := 'kept';
      elsif v_entry.quantity >= v_needed then
        v_status := 'covered';
      else
        update public.shopping_list_items
        set quantity = least(v_needed, 99999), is_checked = false
        where id = v_entry.id;
        v_status := 'topped_up';
      end if;
    end if;
    v_result := v_result || jsonb_build_object('item_id', v_item_id, 'status', v_status);
    v_entry := null;
    v_item := null;
  end loop;
  return v_result;
end;
$$;

revoke execute on function public.add_recipe_to_list(uuid, uuid, jsonb) from public, anon;
grant execute on function public.add_recipe_to_list(uuid, uuid, jsonb) to authenticated;
