-- My Kitchen, K10 (v2): recipes. A household recipe box: title, one photo, servings, prep and
-- cook time, tags, notes, ingredients (catalogue items with a quantity and unit, some optional) and
-- steps. save_recipe writes a recipe with its ingredients and steps in one go. Scaling to other
-- servings is worked out in the app (packages/shared/src/kitchen/recipes.ts).

-- Tags are short labels as typed ("Soup", "Sunday"), trimmed.
create function public.valid_recipe_tags(p_tags text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(p_tags) <= 12
    and coalesce((select bool_and(char_length(t) between 1 and 30 and t = btrim(t)) from unnest(p_tags) t), true);
$$;

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  title text not null check (char_length(title) between 1 and 120 and title = btrim(title)),
  servings int not null default 4 check (servings between 1 and 100),
  prep_minutes int check (prep_minutes is null or prep_minutes between 0 and 1440),
  cook_minutes int check (cook_minutes is null or cook_minutes between 0 and 1440),
  tags text[] not null default '{}' check (public.valid_recipe_tags(tags)),
  notes text check (notes is null or (char_length(notes) between 1 and 4000 and notes = btrim(notes))),
  -- {household_id}/{recipe_id}/{file} in the recipe-photos bucket.
  photo_path text,
  created_by uuid references public.profiles on delete set null,
  updated_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  check (photo_path is null or photo_path like household_id::text || '/' || id::text || '/_%')
);

create index recipes_household_idx on public.recipes (household_id, title);

create trigger set_audit_fields
  before insert or update on public.recipes
  for each row execute function public.set_audit_fields();

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  recipe_id uuid not null,
  item_id uuid not null,
  -- Null for "to taste".
  quantity numeric(10, 2) check (quantity is null or (quantity > 0 and quantity <= 99999)),
  unit text not null default 'pcs' check (public.is_kitchen_unit(unit)),
  is_optional boolean not null default false,
  -- "chopped", "for frying".
  note text check (note is null or (char_length(note) between 1 and 200 and note = btrim(note))),
  position int not null check (position > 0),
  foreign key (household_id, recipe_id) references public.recipes (household_id, id) on delete cascade,
  foreign key (household_id, item_id) references public.kitchen_items (household_id, id) on delete cascade
);

create index recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id, position);
create index recipe_ingredients_item_idx on public.recipe_ingredients (item_id);

create table public.recipe_steps (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  recipe_id uuid not null,
  position int not null check (position > 0),
  body text not null check (char_length(body) between 1 and 2000 and body = btrim(body)),
  foreign key (household_id, recipe_id) references public.recipes (household_id, id) on delete cascade
);

create index recipe_steps_recipe_idx on public.recipe_steps (recipe_id, position);

revoke all on public.recipes, public.recipe_ingredients, public.recipe_steps from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.recipes, public.recipe_ingredients, public.recipe_steps from authenticated;
grant insert (household_id, title, servings, prep_minutes, cook_minutes, tags, notes)
  on public.recipes to authenticated;
grant update (title, servings, prep_minutes, cook_minutes, tags, notes, photo_path)
  on public.recipes to authenticated;
grant delete on public.recipes to authenticated;
grant insert (household_id, recipe_id, item_id, quantity, unit, is_optional, note, position)
  on public.recipe_ingredients to authenticated;
grant delete on public.recipe_ingredients to authenticated;
grant insert (household_id, recipe_id, position, body) on public.recipe_steps to authenticated;
grant delete on public.recipe_steps to authenticated;

alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps enable row level security;

create policy "Members manage recipes: select" on public.recipes
  for select to authenticated using (public.is_household_member(household_id));
create policy "Members manage recipes: insert" on public.recipes
  for insert to authenticated with check (public.is_household_member(household_id));
create policy "Members manage recipes: update" on public.recipes
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "Members manage recipes: delete" on public.recipes
  for delete to authenticated using (public.is_household_member(household_id));

create policy "Members manage recipe ingredients: select" on public.recipe_ingredients
  for select to authenticated using (public.is_household_member(household_id));
create policy "Members manage recipe ingredients: insert" on public.recipe_ingredients
  for insert to authenticated with check (public.is_household_member(household_id));
create policy "Members manage recipe ingredients: delete" on public.recipe_ingredients
  for delete to authenticated using (public.is_household_member(household_id));

create policy "Members manage recipe steps: select" on public.recipe_steps
  for select to authenticated using (public.is_household_member(household_id));
create policy "Members manage recipe steps: insert" on public.recipe_steps
  for insert to authenticated with check (public.is_household_member(household_id));
create policy "Members manage recipe steps: delete" on public.recipe_steps
  for delete to authenticated using (public.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- Saving
-- ---------------------------------------------------------------------------

-- Creates (p_recipe_id null) or updates a recipe, replacing its ingredients and steps with the
-- ones given, in order. Runs as the caller, so the policies above apply. Returns the recipe id.
--   p_ingredients: [{ "item_id", "quantity" (null = to taste), "unit", "is_optional", "note" }]
--   p_steps: ["Wash the rice", ...]
create function public.save_recipe(
  p_household_id uuid,
  p_recipe_id uuid,
  p_title text,
  p_servings int,
  p_prep_minutes int,
  p_cook_minutes int,
  p_tags text[],
  p_notes text,
  p_ingredients jsonb,
  p_steps jsonb
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_recipe_id is null then
    insert into public.recipes (household_id, title, servings, prep_minutes, cook_minutes, tags, notes)
    values (p_household_id, p_title, p_servings, p_prep_minutes, p_cook_minutes, p_tags, p_notes)
    returning id into v_id;
  else
    update public.recipes
    set title = p_title, servings = p_servings, prep_minutes = p_prep_minutes,
        cook_minutes = p_cook_minutes, tags = p_tags, notes = p_notes
    where id = p_recipe_id and household_id = p_household_id
    returning id into v_id;
    if v_id is null then
      raise exception 'recipe_not_found' using errcode = 'P0002';
    end if;
    delete from public.recipe_ingredients where recipe_id = v_id;
    delete from public.recipe_steps where recipe_id = v_id;
  end if;

  insert into public.recipe_ingredients (household_id, recipe_id, item_id, quantity, unit, is_optional, note, position)
  select p_household_id, v_id, (x ->> 'item_id')::uuid, (x ->> 'quantity')::numeric,
         coalesce(x ->> 'unit', 'pcs'), coalesce((x ->> 'is_optional')::boolean, false),
         nullif(btrim(coalesce(x ->> 'note', '')), ''), n::int
  from jsonb_array_elements(coalesce(p_ingredients, '[]')) with ordinality as t (x, n);

  insert into public.recipe_steps (household_id, recipe_id, position, body)
  select p_household_id, v_id, n::int, btrim(x #>> '{}')
  from jsonb_array_elements(coalesce(p_steps, '[]')) with ordinality as t (x, n);

  return v_id;
end;
$$;

revoke execute on function public.save_recipe(uuid, uuid, text, int, int, int, text[], text, jsonb, jsonb) from public, anon;
grant execute on function public.save_recipe(uuid, uuid, text, int, int, int, text[], text, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Photos: one per recipe, private to the household
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-photos', 'recipe-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Uploads must go under an existing recipe of a household the caller belongs to:
-- {household_id}/{recipe_id}/{file}.
create function public.can_upload_recipe_photo(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_household_member(public.storage_household_id(object_name))
    and exists (
      select 1 from public.recipes r
      where r.household_id = public.storage_household_id(object_name)
        and r.id::text = split_part(object_name, '/', 2)
    )
    and split_part(object_name, '/', 3) <> ''
    and split_part(object_name, '/', 4) = '';
$$;

revoke execute on function public.can_upload_recipe_photo(text) from public, anon;
grant execute on function public.can_upload_recipe_photo(text) to authenticated;

create policy "Members read their household's recipe photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'recipe-photos' and public.is_household_member(public.storage_household_id(name)));

create policy "Members upload recipe photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'recipe-photos' and public.can_upload_recipe_photo(name));

create policy "Members delete their household's recipe photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'recipe-photos' and public.is_household_member(public.storage_household_id(name)));

-- ---------------------------------------------------------------------------
-- Merging catalogue items also moves recipe ingredients
-- ---------------------------------------------------------------------------

create or replace function public.merge_kitchen_items(p_keep uuid, p_merge uuid)
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
  update public.recipe_ingredients set item_id = p_keep where item_id = p_merge;

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

