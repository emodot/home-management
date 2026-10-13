-- My Kitchen, K13 (v2): the week's meal plan onto the shopping list. The app works out what the
-- plan's pots need beyond the pantry (packages/shared/src/kitchen/plan-list.ts); add_plan_to_list
-- puts it on the list for that week's plan (source 'meal_plan', source_ref = the plan), merging
-- with what's there exactly as add_recipe_to_list does, which now shares the same steps.

-- Puts `p_lines` ([{ "item_id", "quantity", "unit" }]) on the list for `p_source`: new entries are
-- added; an item already on the list is topped up to what's needed when the units convert, never
-- added twice. Returns [{ "item_id", "status" }]: added, topped_up, covered or kept.
create function public.put_on_list(
  p_household_id uuid,
  p_source text,
  p_source_ref uuid,
  p_lines jsonb
)
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
      values (p_household_id, v_item_id, v_quantity, v_unit, v_item.default_store_tag, p_source, p_source_ref);
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

revoke execute on function public.put_on_list(uuid, text, uuid, jsonb) from public, anon, authenticated;

create or replace function public.add_recipe_to_list(p_household_id uuid, p_recipe_id uuid, p_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if not exists (select 1 from public.recipes where id = p_recipe_id and household_id = p_household_id) then
    raise exception 'recipe_not_found' using errcode = 'P0002';
  end if;
  return public.put_on_list(p_household_id, 'recipe', p_recipe_id, p_lines);
end;
$$;

-- What the week starting `p_week_start` needs, onto the list for its plan.
create function public.add_plan_to_list(p_household_id uuid, p_week_start date, p_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan uuid;
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  select id into v_plan from public.meal_plans
  where household_id = p_household_id and week_start = p_week_start;
  if v_plan is null then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;
  return public.put_on_list(p_household_id, 'meal_plan', v_plan, p_lines);
end;
$$;

revoke execute on function public.add_plan_to_list(uuid, date, jsonb) from public, anon;
grant execute on function public.add_plan_to_list(uuid, date, jsonb) to authenticated;
