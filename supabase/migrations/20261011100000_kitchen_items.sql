-- My Kitchen, K0: the household's item catalogue. Shopping list, pantry and price rows will
-- reference it by id, so prices and stock line up across features (and v2 recipes and meal plans
-- can use the same items). Any member can add and edit items; v1 never deletes them (merging
-- duplicates is planned for v2).

create table public.kitchen_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  name text not null check (char_length(name) between 1 and 80 and name = btrim(name)),
  -- The matching key ("Tomatoes " → "tomato"), from normalizeItemName in packages/shared, so the
  -- same item can't be added twice under slightly different spellings.
  normalized_name text not null
    check (char_length(normalized_name) between 1 and 80 and normalized_name = lower(btrim(normalized_name))),
  -- KITCHEN_UNITS in packages/shared/src/kitchen/units.ts.
  default_unit text not null default 'pcs' check (default_unit in (
    'pcs', 'kg', 'g', 'litre', 'ml', 'bag', 'tuber', 'crate', 'tin', 'sachet', 'pack', 'bunch',
    'mudu', 'paint_bucket', 'derica'
  )),
  -- Where it's usually bought ("Mile 12", "Shoprite"); free text, shared with list rows.
  default_store_tag text
    check (default_store_tag is null or (char_length(default_store_tag) between 1 and 40 and default_store_tag = btrim(default_store_tag))),
  created_by uuid references public.profiles on delete set null,
  updated_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, normalized_name),
  -- For composite foreign keys from list, pantry and price rows (same household).
  unique (household_id, id)
);

create trigger set_audit_fields
  before insert or update on public.kitchen_items
  for each row execute function public.set_audit_fields();

revoke all on public.kitchen_items from anon;
revoke insert, update, delete, truncate, references, trigger on public.kitchen_items from authenticated;
grant insert (household_id, name, normalized_name, default_unit, default_store_tag)
  on public.kitchen_items to authenticated;
grant update (name, normalized_name, default_unit, default_store_tag)
  on public.kitchen_items to authenticated;

alter table public.kitchen_items enable row level security;

create policy "Members manage kitchen items: select" on public.kitchen_items
  for select to authenticated using (public.is_household_member(household_id));
create policy "Members manage kitchen items: insert" on public.kitchen_items
  for insert to authenticated with check (public.is_household_member(household_id));
create policy "Members manage kitchen items: update" on public.kitchen_items
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
