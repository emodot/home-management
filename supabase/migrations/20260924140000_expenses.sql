-- M3: expense categories, expenses, receipts (table + private storage bucket), soft delete.
-- Links to providers, task completions and recurring expenses are added with those tables
-- (M5-M7).

-- ---------------------------------------------------------------------------
-- Audit columns (shared by expenses now; providers and tasks later)
-- ---------------------------------------------------------------------------

create function public.set_audit_fields()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  name text not null check (char_length(name) between 1 and 40 and name = btrim(name)),
  -- A lucide icon name; the app maps known names to icons.
  icon text not null default 'circle' check (icon ~ '^[a-z0-9-]{1,40}$'),
  is_archived boolean not null default false,
  sort_order int not null default 0,
  unique (household_id, id) -- target for composite FKs that keep categories in-household
);

create unique index expense_categories_household_name_idx
  on public.expense_categories (household_id, lower(name));

-- The default categories, in display order. Used for new households and the backfill below.
create function public.default_expense_categories()
returns table (name text, icon text, sort_order int)
language sql
immutable
set search_path = ''
as $$
  values
    ('Utilities', 'lightbulb', 1),
    ('Electricity', 'zap', 2),
    ('Fuel & Generator', 'fuel', 3),
    ('Water', 'droplets', 4),
    ('Internet & TV', 'wifi', 5),
    ('Repairs & Maintenance', 'wrench', 6),
    ('Cleaning', 'sparkles', 7),
    ('Security', 'shield', 8),
    ('Estate Dues & Service Charge', 'building', 9),
    ('Rent', 'key-round', 10),
    ('Groceries', 'shopping-basket', 11),
    ('Furniture & Appliances', 'sofa', 12),
    ('Other', 'circle-ellipsis', 13)
$$;

create function public.seed_expense_categories()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.expense_categories (household_id, name, icon, sort_order)
  select new.id, d.name, d.icon, d.sort_order
  from public.default_expense_categories() d;
  return new;
end;
$$;

revoke execute on function public.seed_expense_categories() from public, anon, authenticated;
revoke execute on function public.default_expense_categories() from public, anon, authenticated;

create trigger seed_expense_categories
  after insert on public.households
  for each row execute function public.seed_expense_categories();

-- Households created before this migration.
insert into public.expense_categories (household_id, name, icon, sort_order)
select h.id, d.name, d.icon, d.sort_order
from public.households h
cross join public.default_expense_categories() d
where not exists (select 1 from public.expense_categories ec where ec.household_id = h.id);

-- Sets sort_order to each id's position in p_ids. Runs with the caller's RLS.
create function public.reorder_expense_categories(p_household_id uuid, p_ids uuid[])
returns void
language sql
as $$
  update public.expense_categories c
  set sort_order = t.ord
  from unnest(p_ids) with ordinality as t(id, ord)
  where c.id = t.id and c.household_id = p_household_id;
$$;

revoke execute on function public.reorder_expense_categories(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_expense_categories(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 100000000000000),
  currency char(3) not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  occurred_on date not null,
  category_id uuid not null,
  description text not null check (char_length(description) between 1 and 200 and description = btrim(description)),
  notes text check (char_length(notes) <= 2000),
  -- Who paid (tracking only). Must be a member when set; kept if they later leave.
  paid_by uuid default auth.uid() references public.profiles on delete set null,
  status text not null default 'confirmed' check (status in ('confirmed', 'pending')),
  created_by uuid references public.profiles on delete set null,
  updated_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (household_id, id),
  foreign key (household_id, category_id) references public.expense_categories (household_id, id)
);

create index expenses_household_occurred_idx
  on public.expenses (household_id, occurred_on desc, created_at desc)
  where deleted_at is null;
create index expenses_household_deleted_idx
  on public.expenses (household_id, deleted_at)
  where deleted_at is not null;
create index expenses_category_idx on public.expenses (household_id, category_id);

create trigger set_audit_fields
  before insert or update on public.expenses
  for each row execute function public.set_audit_fields();

create function public.check_expense_paid_by()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.paid_by is not null
     and (tg_op = 'INSERT' or new.paid_by is distinct from old.paid_by)
     and not public.is_member_of(new.household_id, new.paid_by) then
    raise exception 'paid_by must be a household member' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.check_expense_paid_by() from public, anon, authenticated;

create trigger check_expense_paid_by
  before insert or update of paid_by on public.expenses
  for each row execute function public.check_expense_paid_by();

-- ---------------------------------------------------------------------------
-- Receipts
-- ---------------------------------------------------------------------------

create table public.expense_receipts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  expense_id uuid not null,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 255),
  mime_type text not null check (mime_type in (
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'
  )),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_by uuid default auth.uid() references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (household_id, expense_id) references public.expenses (household_id, id) on delete cascade,
  -- {household_id}/{expense_id}/{file}
  check (storage_path like household_id::text || '/' || expense_id::text || '/_%')
);

create index expense_receipts_expense_idx on public.expense_receipts (expense_id);

-- ---------------------------------------------------------------------------
-- List view: expenses plus their live receipt count (for the "has receipt" filter) and one text
-- column to search description and notes with a single ilike.
-- ---------------------------------------------------------------------------

create view public.expense_list
with (security_invoker = true)
as
select
  e.id, e.household_id, e.amount_minor, e.currency, e.occurred_on, e.category_id,
  e.description, e.notes, e.paid_by, e.status, e.created_by, e.updated_by,
  e.created_at, e.updated_at, e.deleted_at,
  e.description || ' ' || coalesce(e.notes, '') as search_text,
  (select count(*)::int
   from public.expense_receipts r
   where r.expense_id = e.id and r.deleted_at is null) as receipt_count
from public.expenses e;

-- ---------------------------------------------------------------------------
-- Privileges and RLS. No hard deletes from the client: soft delete via deleted_at, and the daily
-- job purges rows older than 30 days (M8).
-- ---------------------------------------------------------------------------

revoke all on public.expense_categories, public.expenses, public.expense_receipts, public.expense_list
  from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.expense_categories, public.expenses, public.expense_receipts
  from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.expense_list from authenticated;

grant insert (household_id, name, icon, sort_order) on public.expense_categories to authenticated;
grant update (name, icon, is_archived, sort_order) on public.expense_categories to authenticated;
grant insert (household_id, amount_minor, occurred_on, category_id, description, notes, paid_by)
  on public.expenses to authenticated;
grant update (amount_minor, occurred_on, category_id, description, notes, paid_by, deleted_at)
  on public.expenses to authenticated;
grant insert (household_id, expense_id, storage_path, file_name, mime_type, size_bytes)
  on public.expense_receipts to authenticated;
grant update (deleted_at) on public.expense_receipts to authenticated;

alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_receipts enable row level security;

create policy "Members manage categories: select" on public.expense_categories
  for select to authenticated using (public.is_household_member(household_id));
create policy "Members manage categories: insert" on public.expense_categories
  for insert to authenticated with check (public.is_household_member(household_id));
create policy "Members manage categories: update" on public.expense_categories
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "Members manage expenses: select" on public.expenses
  for select to authenticated using (public.is_household_member(household_id));
create policy "Members manage expenses: insert" on public.expenses
  for insert to authenticated with check (public.is_household_member(household_id));
create policy "Members manage expenses: update" on public.expenses
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "Members manage receipts: select" on public.expense_receipts
  for select to authenticated using (public.is_household_member(household_id));
create policy "Members manage receipts: insert" on public.expense_receipts
  for insert to authenticated with check (public.is_household_member(household_id));
create policy "Members manage receipts: update" on public.expense_receipts
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- Storage: private bucket, objects at {household_id}/{expense_id}/{uuid}.{ext}
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts', 'receipts', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do nothing;

-- The household id in an object path, or null if the first segment isn't a uuid.
create function public.storage_household_id(object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(object_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(object_name, '/', 1)::uuid
  end;
$$;

-- Uploads must go under an existing, non-deleted expense of a household the caller belongs to.
create function public.can_upload_receipt(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_household_member(public.storage_household_id(object_name))
    and exists (
      select 1
      from public.expenses e
      where e.household_id = public.storage_household_id(object_name)
        and e.id::text = split_part(object_name, '/', 2)
        and e.deleted_at is null
    )
    and split_part(object_name, '/', 3) <> ''
    and split_part(object_name, '/', 4) = '';
$$;

revoke execute on function public.can_upload_receipt(text) from public, anon;
grant execute on function public.can_upload_receipt(text) to authenticated;
grant execute on function public.storage_household_id(text) to authenticated;

create policy "Members read their household's receipts"
  on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.is_household_member(public.storage_household_id(name)));

create policy "Members upload receipts to their household's expenses"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.can_upload_receipt(name));

-- Lets the app clean up an upload whose database row failed to save. Normal deletes are soft.
create policy "Members delete their household's receipt files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.is_household_member(public.storage_household_id(name)));
