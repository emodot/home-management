-- My Kitchen, K4: finishing a shopping trip. One call (finish_shopping_trip) turns the checked list
-- entries into an expense, a trip, a price history and pantry stock, and clears them from the list,
-- all or nothing. The pantry table is created here because finishing a trip fills it; K5 adds its
-- screens.

-- ---------------------------------------------------------------------------
-- Pantry: what's in the kitchen, one row per catalogue item
-- ---------------------------------------------------------------------------

create table public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  item_id uuid not null,
  quantity numeric(10, 2) not null default 0 check (quantity >= 0 and quantity <= 99999),
  unit text not null default 'pcs' check (public.is_kitchen_unit(unit)),
  location text not null default 'pantry'
    check (location in ('fridge', 'freezer', 'pantry', 'store_room')),
  expires_on date,
  -- At or below this quantity the item counts as running low (K5).
  low_stock_threshold numeric(10, 2) check (low_stock_threshold is null or low_stock_threshold >= 0),
  created_by uuid references public.profiles on delete set null,
  updated_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, item_id) references public.kitchen_items (household_id, id) on delete cascade,
  unique (household_id, item_id)
);

create trigger set_audit_fields
  before insert or update on public.pantry_items
  for each row execute function public.set_audit_fields();

revoke all on public.pantry_items from anon;
revoke insert, update, delete, truncate, references, trigger on public.pantry_items from authenticated;
grant insert (household_id, item_id, quantity, unit, location, expires_on, low_stock_threshold)
  on public.pantry_items to authenticated;
grant update (quantity, unit, location, expires_on, low_stock_threshold)
  on public.pantry_items to authenticated;
grant delete on public.pantry_items to authenticated;

alter table public.pantry_items enable row level security;

create policy "Members manage the pantry: select" on public.pantry_items
  for select to authenticated using (public.is_household_member(household_id));
create policy "Members manage the pantry: insert" on public.pantry_items
  for insert to authenticated with check (public.is_household_member(household_id));
create policy "Members manage the pantry: update" on public.pantry_items
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "Members manage the pantry: delete" on public.pantry_items
  for delete to authenticated using (public.is_household_member(household_id));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.pantry_items;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trips and prices (written only by finish_shopping_trip)
-- ---------------------------------------------------------------------------

create table public.shopping_trips (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  -- The expense it created; kept (unlinked) if that expense is later purged.
  expense_id uuid references public.expenses on delete set null,
  store_tag text
    check (store_tag is null or (char_length(store_tag) between 1 and 40 and store_tag = btrim(store_tag))),
  total_minor bigint not null check (total_minor > 0),
  item_count int not null check (item_count > 0),
  bought_on date not null,
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  unique (household_id, id)
);

create table public.item_prices (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  item_id uuid not null,
  trip_id uuid not null,
  quantity numeric(10, 2) not null check (quantity > 0),
  unit text not null check (public.is_kitchen_unit(unit)),
  -- What was paid for the whole line, and per one unit of it.
  price_minor bigint not null check (price_minor > 0),
  unit_price_minor bigint generated always as (round(price_minor / quantity)::bigint) stored,
  store_tag text,
  bought_on date not null,
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  foreign key (household_id, item_id) references public.kitchen_items (household_id, id) on delete cascade,
  foreign key (household_id, trip_id) references public.shopping_trips (household_id, id) on delete cascade
);

create index item_prices_item_idx on public.item_prices (item_id, bought_on desc);

revoke all on public.shopping_trips, public.item_prices from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.shopping_trips, public.item_prices from authenticated;

alter table public.shopping_trips enable row level security;
alter table public.item_prices enable row level security;

create policy "Members see shopping trips" on public.shopping_trips
  for select to authenticated using (public.is_household_member(household_id));
create policy "Members see item prices" on public.item_prices
  for select to authenticated using (public.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- Units
-- ---------------------------------------------------------------------------

-- `p_quantity` of `p_from` in `p_to` units, or null if they don't convert (convert() in
-- packages/shared/src/kitchen/units.ts).
create function public.kitchen_convert(p_quantity numeric, p_from text, p_to text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_from = p_to then p_quantity
    when p_from = 'kg' and p_to = 'g' then p_quantity * 1000
    when p_from = 'g' and p_to = 'kg' then p_quantity / 1000
    when p_from = 'litre' and p_to = 'ml' then p_quantity * 1000
    when p_from = 'ml' and p_to = 'litre' then p_quantity / 1000
  end;
$$;

-- ---------------------------------------------------------------------------
-- Finishing a trip
-- ---------------------------------------------------------------------------

-- p_entries: [{ "id": list entry, "price_minor": line price or null, "to_pantry": bool }], the
-- checked entries being bought. Raises list_changed if any of them is gone or no longer checked
-- (e.g. someone else finished the trip first), so nothing is half-done.
create function public.finish_shopping_trip(
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

  -- Into the pantry: added to what's there when the units combine, otherwise it replaces it.
  insert into public.pantry_items as p (household_id, item_id, quantity, unit)
  select p_household_id, e.item_id, e.quantity, e.unit
  from jsonb_array_elements(p_entries) x
  join public.shopping_list_items e on e.id = (x ->> 'id')::uuid
  where coalesce((x ->> 'to_pantry')::boolean, true)
  on conflict (household_id, item_id) do update set
    quantity = case
      when public.kitchen_convert(excluded.quantity, excluded.unit, p.unit) is not null
        then least(p.quantity + public.kitchen_convert(excluded.quantity, excluded.unit, p.unit), 99999)
      else excluded.quantity
    end,
    unit = case
      when public.kitchen_convert(excluded.quantity, excluded.unit, p.unit) is not null then p.unit
      else excluded.unit
    end;

  delete from public.shopping_list_items e
  where e.id in (select (x ->> 'id')::uuid from jsonb_array_elements(p_entries) x);

  return jsonb_build_object('trip_id', v_trip_id, 'expense_id', v_expense_id);
end;
$$;

revoke execute on function public.finish_shopping_trip(uuid, jsonb, bigint, uuid, date, uuid, text, text, text)
  from public, anon;
grant execute on function public.finish_shopping_trip(uuid, jsonb, bigint, uuid, date, uuid, text, text, text)
  to authenticated;
