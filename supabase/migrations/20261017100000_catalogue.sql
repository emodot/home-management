-- My Kitchen, K9 (v2): per-item unit conversions and catalogue clean-up.
--
-- An item can say how its units relate ("1 bag = 50 kg", "1 crate = 30 pieces"). Conversion
-- (kitchen_convert with an item) then follows those, both ways, together with g/kg and ml/litre,
-- so stock bought by the bag and by the kg adds up. Duplicate catalogue items can be merged
-- (merge_kitchen_items): prices, list and pantry entries and conversions move to the item kept.

create table public.kitchen_item_units (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  item_id uuid not null,
  -- 1 <unit> = <factor> <to_unit>
  unit text not null check (public.is_kitchen_unit(unit)),
  factor numeric(12, 4) not null check (factor > 0 and factor <= 1000000),
  to_unit text not null check (public.is_kitchen_unit(to_unit)),
  created_by uuid default auth.uid() references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  check (unit <> to_unit),
  foreign key (household_id, item_id) references public.kitchen_items (household_id, id) on delete cascade,
  -- One definition per unit of an item.
  unique (item_id, unit)
);

revoke all on public.kitchen_item_units from anon;
revoke insert, update, delete, truncate, references, trigger on public.kitchen_item_units from authenticated;
grant insert (household_id, item_id, unit, factor, to_unit) on public.kitchen_item_units to authenticated;
grant delete on public.kitchen_item_units to authenticated;

alter table public.kitchen_item_units enable row level security;

create policy "Members manage item conversions: select" on public.kitchen_item_units
  for select to authenticated using (public.is_household_member(household_id));
create policy "Members manage item conversions: insert" on public.kitchen_item_units
  for insert to authenticated with check (public.is_household_member(household_id));
create policy "Members manage item conversions: delete" on public.kitchen_item_units
  for delete to authenticated using (public.is_household_member(household_id));

-- `p_quantity` of `p_from` in `p_to` for this item, or null if no chain of conversions links
-- them: g/kg and ml/litre, plus the item's own conversions read both ways, at most four steps.
-- convert() in packages/shared/src/kitchen/units.ts does the same.
create function public.kitchen_convert(p_item_id uuid, p_quantity numeric, p_from text, p_to text)
returns numeric
language sql
stable
set search_path = ''
as $$
  with recursive edges (a, b, f) as (
    select * from (values ('kg', 'g', 1000::numeric), ('g', 'kg', 0.001),
                          ('litre', 'ml', 1000), ('ml', 'litre', 0.001)) metric (a, b, f)
    union all
    select unit, to_unit, factor from public.kitchen_item_units where item_id = p_item_id
    union all
    select to_unit, unit, 1 / factor from public.kitchen_item_units where item_id = p_item_id
  ),
  walk (unit, f, depth, seen) as (
    select p_from, 1::numeric, 0, array[p_from]
    union all
    select e.b, w.f * e.f, w.depth + 1, w.seen || e.b
    from walk w
    join edges e on e.a = w.unit
    where w.depth < 4 and not e.b = any (w.seen)
  )
  select case
    when p_from = p_to then p_quantity
    else (select p_quantity * w.f from walk w where w.unit = p_to order by w.depth limit 1)
  end;
$$;

create or replace function public.finish_shopping_trip(
  p_household_id uuid,
  p_entries jsonb,
  p_total_minor bigint,
  p_category_id uuid,
  p_paid_on date,
  p_paid_by uuid,
  p_description text,
  p_notes text default null,
  p_store text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
  v_locked int;
  v_store text := nullif(btrim(coalesce(p_store, '')), '');
  v_expense_id uuid;
  v_trip_id uuid;
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  v_count := coalesce(jsonb_array_length(p_entries), 0);
  if v_count = 0 then
    raise exception 'nothing_to_finish' using errcode = '22023';
  end if;

  -- Lock the entries so two people can't finish the same trip.
  perform 1
  from public.shopping_list_items e
  where e.household_id = p_household_id
    and e.is_checked
    and e.id in (select (x ->> 'id')::uuid from jsonb_array_elements(p_entries) x)
  for update;
  get diagnostics v_locked = row_count;
  if v_locked <> v_count then
    raise exception 'list_changed' using errcode = '40001';
  end if;

  insert into public.expenses (household_id, amount_minor, occurred_on, category_id, description, notes, paid_by)
  values (p_household_id, p_total_minor, p_paid_on, p_category_id, btrim(p_description),
          nullif(btrim(coalesce(p_notes, '')), ''), p_paid_by)
  returning id into v_expense_id;

  insert into public.shopping_trips (household_id, expense_id, store_tag, total_minor, item_count, bought_on, created_by)
  values (p_household_id, v_expense_id, v_store, p_total_minor, v_count, p_paid_on, auth.uid())
  returning id into v_trip_id;

  insert into public.item_prices (household_id, item_id, trip_id, quantity, unit, price_minor, store_tag, bought_on, created_by)
  select p_household_id, e.item_id, v_trip_id, e.quantity, e.unit, (x ->> 'price_minor')::bigint,
         coalesce(v_store, e.store_tag), p_paid_on, auth.uid()
  from jsonb_array_elements(p_entries) x
  join public.shopping_list_items e on e.id = (x ->> 'id')::uuid
  where (x ->> 'price_minor') is not null;

  -- Into the pantry: added to what's there when the units combine (metric, or the item's own
  -- conversions), otherwise it replaces it.
  insert into public.pantry_items as p (household_id, item_id, quantity, unit)
  select p_household_id, e.item_id, e.quantity, e.unit
  from jsonb_array_elements(p_entries) x
  join public.shopping_list_items e on e.id = (x ->> 'id')::uuid
  where coalesce((x ->> 'to_pantry')::boolean, true)
  on conflict (household_id, item_id) do update set
    quantity = case
      when public.kitchen_convert(excluded.item_id, excluded.quantity, excluded.unit, p.unit) is not null
        then least(p.quantity + public.kitchen_convert(excluded.item_id, excluded.quantity, excluded.unit, p.unit), 99999)
      else excluded.quantity
    end,
    unit = case
      when public.kitchen_convert(excluded.item_id, excluded.quantity, excluded.unit, p.unit) is not null then p.unit
      else excluded.unit
    end;

  delete from public.shopping_list_items e
  where e.id in (select (x ->> 'id')::uuid from jsonb_array_elements(p_entries) x);

  return jsonb_build_object('trip_id', v_trip_id, 'expense_id', v_expense_id);
end;
$$;


-- ---------------------------------------------------------------------------
-- Merging duplicate items
-- ---------------------------------------------------------------------------

-- Folds p_merge into p_keep and deletes p_merge: its prices move across; its conversions move
-- unless p_keep already defines that unit; its list and pantry entries move, or combine with
-- p_keep's (quantities added when the units convert; otherwise p_keep's quantity stays and the
-- notes are joined).
create function public.merge_kitchen_items(p_keep uuid, p_merge uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keep public.kitchen_items;
  v_merge public.kitchen_items;
  v_keep_entry public.shopping_list_items;
  v_merge_entry public.shopping_list_items;
  v_keep_stock public.pantry_items;
  v_merge_stock public.pantry_items;
  v_converted numeric;
begin
  select * into v_keep from public.kitchen_items where id = p_keep for update;
  select * into v_merge from public.kitchen_items where id = p_merge for update;
  if v_keep.id is null or v_merge.id is null or v_keep.household_id <> v_merge.household_id
     or not public.is_household_member(v_keep.household_id) then
    raise exception 'item_not_found' using errcode = 'P0002';
  end if;
  if p_keep = p_merge then
    raise exception 'same_item' using errcode = '22023';
  end if;

  update public.item_prices set item_id = p_keep where item_id = p_merge;

  update public.kitchen_item_units u set item_id = p_keep
  where u.item_id = p_merge
    and not exists (select 1 from public.kitchen_item_units k where k.item_id = p_keep and k.unit = u.unit);

  if v_keep.default_store_tag is null and v_merge.default_store_tag is not null then
    update public.kitchen_items set default_store_tag = v_merge.default_store_tag where id = p_keep;
  end if;

  -- The shopping list.
  select * into v_keep_entry from public.shopping_list_items where item_id = p_keep for update;
  select * into v_merge_entry from public.shopping_list_items where item_id = p_merge for update;
  if v_merge_entry.id is not null then
    if v_keep_entry.id is null then
      update public.shopping_list_items set item_id = p_keep where id = v_merge_entry.id;
    else
      v_converted := public.kitchen_convert(p_keep, v_merge_entry.quantity, v_merge_entry.unit, v_keep_entry.unit);
      update public.shopping_list_items set
        quantity = case when v_converted is null then quantity else least(quantity + v_converted, 99999) end,
        notes = nullif(concat_ws(' · ', notes, v_merge_entry.notes), '')
      where id = v_keep_entry.id;
      delete from public.shopping_list_items where id = v_merge_entry.id;
    end if;
  end if;

  -- The pantry.
  select * into v_keep_stock from public.pantry_items where item_id = p_keep for update;
  select * into v_merge_stock from public.pantry_items where item_id = p_merge for update;
  if v_merge_stock.id is not null then
    if v_keep_stock.id is null then
      update public.pantry_items set item_id = p_keep where id = v_merge_stock.id;
    else
      v_converted := public.kitchen_convert(p_keep, v_merge_stock.quantity, v_merge_stock.unit, v_keep_stock.unit);
      update public.pantry_items set
        quantity = case when v_converted is null then quantity else least(quantity + v_converted, 99999) end,
        -- The sooner use-by date, and a threshold if only the merged one had one.
        expires_on = case
          when expires_on is null then v_merge_stock.expires_on
          when v_merge_stock.expires_on is null then expires_on
          else least(expires_on, v_merge_stock.expires_on)
        end,
        low_stock_threshold = coalesce(low_stock_threshold,
          case when v_merge_stock.unit = unit then v_merge_stock.low_stock_threshold end)
      where id = v_keep_stock.id;
      delete from public.pantry_items where id = v_merge_stock.id;
    end if;
  end if;

  delete from public.kitchen_items where id = p_merge;
end;
$$;

revoke execute on function public.merge_kitchen_items(uuid, uuid) from public, anon;
grant execute on function public.merge_kitchen_items(uuid, uuid) to authenticated;
