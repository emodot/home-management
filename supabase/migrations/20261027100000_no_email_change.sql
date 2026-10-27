-- Sign-in emails can't be changed: invites are made out to an email address, and the app no longer
-- offers it. Refuses both a requested change (an email_change waiting for confirmation) and a
-- direct one, whoever asks, so it holds even for calls that skip the app.
create function public.refuse_email_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.email is distinct from old.email
     or (coalesce(new.email_change, '') <> '' and new.email_change is distinct from old.email_change)
  then
    raise exception 'email_change_not_allowed' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.refuse_email_change() from public, anon, authenticated;

create trigger refuse_email_change
  before update of email, email_change on auth.users
  for each row
  execute function public.refuse_email_change();
