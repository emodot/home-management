-- My Kitchen, K3: what was paid for a list entry, entered in shopping mode when it's checked off.
-- It's the price for the whole line as bought ("₦5,000 for 2 kg"); a per-unit price is worked out
-- from the quantity where the unit allows it. Unchecking an entry clears its price.

alter table public.shopping_list_items
  add column price_paid_minor bigint
    check (price_paid_minor is null or (price_paid_minor > 0 and price_paid_minor <= 100000000000000));

grant insert (price_paid_minor), update (price_paid_minor) on public.shopping_list_items to authenticated;

create or replace function public.set_shopping_list_checked()
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
    new.price_paid_minor := null;
  end if;
  return new;
end;
$$;
