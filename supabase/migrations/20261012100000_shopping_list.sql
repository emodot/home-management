-- My Kitchen, K2: the household's shared shopping list. Each catalogue item is on it at most once
-- (adding it again points at the existing entry). Members see each other's changes live through
-- Realtime. Entries are removed outright (the app offers Undo); finishing a shopping trip (K4)
-- clears the checked ones.

-- KITCHEN_UNITS in packages/shared/src/kitchen/units.ts (kitchen_items.default_unit lists them too).
create function public.is_kitchen_unit(unit text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select unit in (
    'pcs', 'kg', 'g', 'litre', 'ml', 'bag', 'tuber', 'crate', 'tin', 'sachet', 'pack', 'bunch',
    'mudu', 'paint_bucket', 'derica'
  );
$$;

create table public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  item_id uuid not null,
  quantity numeric(10, 2) not null default 1 check (quantity > 0 and quantity <= 99999),
  unit text not null default 'pcs' check (public.is_kitchen_unit(unit)),
  store_tag text
    check (store_tag is null or (char_length(store_tag) between 1 and 40 and store_tag = btrim(store_tag))),
  notes text check (notes is null or (char_length(notes) between 1 and 500 and notes = btrim(notes))),
  is_checked boolean not null default false,
  -- Set by a trigger when the entry is checked off, cleared when it's unchecked.
  checked_by uuid references public.profiles on delete set null,
  checked_at timestamptz,
  -- Where the entry came from. v1 writes 'manual' and 'pantry' (running low); v2 meal plans add
  -- 'meal_plan' entries pointing at their plan through source_ref.
  source text not null default 'manual' check (source in ('manual', 'pantry', 'meal_plan')),
  source_ref uuid,
  created_by uuid references public.profiles on delete set null,
  updated_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, item_id) references public.kitchen_items (household_id, id) on delete cascade,
  unique (household_id, item_id)
);

create trigger set_audit_fields
  before insert or update on public.shopping_list_items
  for each row execute function public.set_audit_fields();

create function public.set_shopping_list_checked()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_checked and (tg_op = 'INSERT' or not old.is_checked) then
    new.checked_by := auth.uid();
    new.checked_at := now();
  elsif not new.is_checked then
    new.checked_by := null;
    new.checked_at := null;
  end if;
  return new;
end;
$$;

create trigger set_checked
  before insert or update of is_checked on public.shopping_list_items
  for each row execute function public.set_shopping_list_checked();

revoke all on public.shopping_list_items from anon;
revoke insert, update, delete, truncate, references, trigger on public.shopping_list_items from authenticated;
-- id is insertable so Undo can put a removed entry back as it was.
grant insert (id, household_id, item_id, quantity, unit, store_tag, notes, is_checked, source, source_ref)
  on public.shopping_list_items to authenticated;
grant update (quantity, unit, store_tag, notes, is_checked)
  on public.shopping_list_items to authenticated;
grant delete on public.shopping_list_items to authenticated;

alter table public.shopping_list_items enable row level security;

create policy "Members manage the shopping list: select" on public.shopping_list_items
  for select to authenticated using (public.is_household_member(household_id));
create policy "Members manage the shopping list: insert" on public.shopping_list_items
  for insert to authenticated with check (public.is_household_member(household_id));
create policy "Members manage the shopping list: update" on public.shopping_list_items
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "Members manage the shopping list: delete" on public.shopping_list_items
  for delete to authenticated using (public.is_household_member(household_id));

-- Live updates for everyone looking at the list (Realtime applies the select policy above).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.shopping_list_items;
  end if;
end;
$$;
