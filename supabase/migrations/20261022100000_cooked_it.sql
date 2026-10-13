-- My Kitchen, K14 (v2): "Cooked it". cook_recipe takes what a pot used out of the pantry (the app
-- works out the amounts: packages/shared/src/kitchen/cook.ts) and, from the meal plan, marks the
-- meal cooked so the week's shopping stops counting it. uncook puts it back (the Undo).

alter table public.meal_plan_entries add column cooked_at timestamptz;

-- p_lines: [{ "item_id", "quantity", "unit" }], what the pot used. For each, from the pantry:
--   used           taken off (in the pantry's unit), down to zero at most ("ran_out" if it
--                  didn't cover it all);
--   not_in_pantry  nothing to take;
--   skipped        held in a unit that doesn't convert.
-- Returns [{ "item_id", "status", "used", "unit" }], which uncook takes to undo it.
create function public.cook_recipe(p_household_id uuid, p_lines jsonb, p_meal_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line jsonb;
  v_item_id uuid;
  v_stock public.pantry_items;
  v_needed numeric;
  v_used numeric;
  v_result jsonb := '[]';
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if p_meal_id is not null then
    update public.meal_plan_entries set cooked_at = now()
    where id = p_meal_id and household_id = p_household_id and leftover_of is null;
    if not found then
      raise exception 'meal_not_found' using errcode = 'P0002';
    end if;
  end if;

  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]')) loop
    v_item_id := (v_line ->> 'item_id')::uuid;
    select * into v_stock from public.pantry_items
    where household_id = p_household_id and item_id = v_item_id
    for update;
    if v_stock.id is null or v_stock.quantity <= 0 then
      v_result := v_result || jsonb_build_object('item_id', v_item_id, 'status', 'not_in_pantry', 'used', 0);
    else
      v_needed := round(public.kitchen_convert(v_item_id, (v_line ->> 'quantity')::numeric, v_line ->> 'unit', v_stock.unit), 2);
      if v_needed is null then
        v_result := v_result || jsonb_build_object('item_id', v_item_id, 'status', 'skipped', 'used', 0);
      else
        v_used := least(v_needed, v_stock.quantity);
        update public.pantry_items set quantity = quantity - v_used where id = v_stock.id;
        v_result := v_result || jsonb_build_object(
          'item_id', v_item_id,
          'status', case when v_used < v_needed then 'ran_out' else 'used' end,
          'used', v_used,
          'unit', v_stock.unit
        );
      end if;
    end if;
    v_stock := null;
  end loop;
  return v_result;
end;
$$;

revoke execute on function public.cook_recipe(uuid, jsonb, uuid) from public, anon;
grant execute on function public.cook_recipe(uuid, jsonb, uuid) to authenticated;

-- Undoes cook_recipe: `p_changes` is what it returned. Stock whose unit has since changed is left
-- alone. Unmarks the meal.
create function public.uncook(p_household_id uuid, p_changes jsonb, p_meal_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_change jsonb;
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  for v_change in select * from jsonb_array_elements(coalesce(p_changes, '[]')) loop
    if coalesce((v_change ->> 'used')::numeric, 0) > 0 then
      update public.pantry_items
      set quantity = least(quantity + (v_change ->> 'used')::numeric, 99999)
      where household_id = p_household_id
        and item_id = (v_change ->> 'item_id')::uuid
        and unit = v_change ->> 'unit';
    end if;
  end loop;
  if p_meal_id is not null then
    update public.meal_plan_entries set cooked_at = null
    where id = p_meal_id and household_id = p_household_id;
  end if;
end;
$$;

revoke execute on function public.uncook(uuid, jsonb, uuid) from public, anon;
grant execute on function public.uncook(uuid, jsonb, uuid) to authenticated;
