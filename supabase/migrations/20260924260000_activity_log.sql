-- M9: household activity log, written by triggers.
-- summary: short and human ("edited amount ₦45,000 → ₦54,000").
-- changes: {"label": what it's about, "fields": {column: [old, new]}, "expense_id": for receipts}.

create table public.activity_log (
  -- Insertion order: the feed sorts and pages by id (timestamps can tie).
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households on delete cascade,
  actor_id uuid references public.profiles on delete set null,
  entity_type text not null check (entity_type in ('expense', 'receipt', 'provider', 'task', 'member', 'invite')),
  entity_id uuid not null,
  action text not null check (action in ('created', 'updated', 'deleted', 'restored', 'completed', 'joined', 'left')),
  summary text not null,
  changes jsonb,
  created_at timestamptz not null default clock_timestamp()
);

create index activity_log_household_idx on public.activity_log (household_id, id desc);
create index activity_log_entity_idx on public.activity_log (entity_id, id desc);
create index activity_log_expense_idx on public.activity_log ((changes ->> 'expense_id'))
  where entity_type = 'receipt';

revoke all on public.activity_log from anon, authenticated;
grant select on public.activity_log to authenticated;
alter table public.activity_log enable row level security;
create policy "Members view their household's activity" on public.activity_log
  for select to authenticated using (public.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- "₦45,000" / "₦45,000.50" (exact decimal arithmetic).
create function public.format_money(p_minor bigint, p_currency text default 'NGN')
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_currency = 'NGN' then '₦' else p_currency || ' ' end
      || case when p_minor % 100 = 0
              then to_char(p_minor / 100, 'FM999,999,999,999,990')
              else to_char(p_minor / 100.0, 'FM999,999,999,999,990.00') end;
$$;

create function public.format_day(p_date date)
returns text
language sql
immutable
set search_path = ''
as $$ select to_char(p_date, 'FMDD Mon YYYY') $$;

create function public.person_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$ select coalesce(p.full_name, p.email, 'nobody') from public.profiles p where p.id = p_user_id $$;

-- Actor: given explicitly, or set in home.actor_id by a service-role function acting for a user,
-- or else the signed-in user.
create function public.log_activity(
  p_household_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_summary text,
  p_changes jsonb default null,
  p_actor_id uuid default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.activity_log (household_id, actor_id, entity_type, entity_id, action, summary, changes)
  select p_household_id,
         coalesce(p_actor_id, nullif(current_setting('home.actor_id', true), '')::uuid, auth.uid()),
         p_entity_type, p_entity_id, p_action, p_summary, p_changes
  -- Nothing to log for a household that is being deleted (its rows are cascading away).
  where exists (select 1 from public.households h where h.id = p_household_id);
$$;

revoke execute on function public.log_activity(uuid, text, uuid, text, text, jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.person_name(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------

create function public.expenses_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parts text[] := '{}';
  v_fields jsonb := '{}';
  v_label jsonb := jsonb_build_object('label', new.description);
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.household_id, 'expense', new.id, 'created',
      case when new.status = 'pending'
           then 'added pending bill for ' || public.format_money(new.amount_minor, new.currency)
           else 'added ' || public.format_money(new.amount_minor, new.currency) end,
      v_label);
    return new;
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    perform public.log_activity(new.household_id, 'expense', new.id, 'deleted',
      case when new.status = 'pending' then 'skipped pending bill' else 'deleted expense' end, v_label);
    return new;
  elsif old.deleted_at is not null and new.deleted_at is null then
    perform public.log_activity(new.household_id, 'expense', new.id, 'restored', 'restored expense', v_label);
    return new;
  end if;

  if old.status = 'pending' and new.status = 'confirmed' then
    v_parts := v_parts || ('confirmed ' || public.format_money(new.amount_minor, new.currency));
  elsif new.amount_minor <> old.amount_minor then
    v_parts := v_parts || ('amount ' || public.format_money(old.amount_minor, old.currency)
                           || ' → ' || public.format_money(new.amount_minor, new.currency));
  end if;
  if new.amount_minor <> old.amount_minor then
    v_fields := v_fields || jsonb_build_object('amount_minor', jsonb_build_array(old.amount_minor, new.amount_minor));
  end if;
  if new.description <> old.description then
    v_parts := v_parts || ('description “' || old.description || '” → “' || new.description || '”');
    v_fields := v_fields || jsonb_build_object('description', jsonb_build_array(old.description, new.description));
  end if;
  if new.occurred_on <> old.occurred_on then
    v_parts := v_parts || ('date ' || public.format_day(old.occurred_on) || ' → ' || public.format_day(new.occurred_on));
    v_fields := v_fields || jsonb_build_object('occurred_on', jsonb_build_array(old.occurred_on, new.occurred_on));
  end if;
  if new.category_id <> old.category_id then
    v_parts := v_parts || ('category ' || (select name from public.expense_categories where id = old.category_id)
                           || ' → ' || (select name from public.expense_categories where id = new.category_id));
    v_fields := v_fields || jsonb_build_object('category_id', jsonb_build_array(old.category_id, new.category_id));
  end if;
  if new.paid_by is distinct from old.paid_by then
    v_parts := v_parts || ('paid by ' || coalesce(public.person_name(new.paid_by), 'nobody'));
    v_fields := v_fields || jsonb_build_object('paid_by', jsonb_build_array(old.paid_by, new.paid_by));
  end if;
  if new.provider_id is distinct from old.provider_id then
    v_parts := v_parts || ('provider ' || coalesce((select name from public.providers where id = new.provider_id), 'none'));
    v_fields := v_fields || jsonb_build_object('provider_id', jsonb_build_array(old.provider_id, new.provider_id));
  end if;
  if new.notes is distinct from old.notes then
    v_parts := v_parts || 'notes'::text;
    v_fields := v_fields || jsonb_build_object('notes', jsonb_build_array(old.notes, new.notes));
  end if;

  if cardinality(v_parts) > 0 then
    perform public.log_activity(new.household_id, 'expense', new.id, 'updated',
      case when v_parts[1] like 'confirmed %' then array_to_string(v_parts, ', ')
           else 'edited ' || array_to_string(v_parts, ', ') end,
      v_label || jsonb_build_object('fields', v_fields));
  end if;
  return new;
end;
$$;

create trigger log_activity
  after insert or update on public.expenses
  for each row execute function public.expenses_activity();

-- ---------------------------------------------------------------------------
-- Receipts (entity = the receipt; changes.expense_id ties it to its expense's history)
-- ---------------------------------------------------------------------------

create function public.receipts_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changes jsonb := jsonb_build_object(
    'label', (select description from public.expenses where id = new.expense_id),
    'expense_id', new.expense_id,
    'file_name', new.file_name);
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.household_id, 'receipt', new.id, 'created', 'added receipt ' || new.file_name, v_changes);
  elsif old.deleted_at is null and new.deleted_at is not null then
    perform public.log_activity(new.household_id, 'receipt', new.id, 'deleted', 'deleted receipt ' || new.file_name, v_changes);
  elsif old.deleted_at is not null and new.deleted_at is null then
    perform public.log_activity(new.household_id, 'receipt', new.id, 'restored', 'restored receipt ' || new.file_name, v_changes);
  end if;
  return new;
end;
$$;

create trigger log_activity
  after insert or update on public.expense_receipts
  for each row execute function public.receipts_activity();

-- ---------------------------------------------------------------------------
-- Providers
-- ---------------------------------------------------------------------------

create function public.providers_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label jsonb := jsonb_build_object('label', new.name);
  v_fields jsonb := '{}';
  v_names text[] := '{}';
  v_col text;
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  v_new jsonb := to_jsonb(new);
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.household_id, 'provider', new.id, 'created', 'added provider', v_label);
  elsif old.deleted_at is null and new.deleted_at is not null then
    perform public.log_activity(new.household_id, 'provider', new.id, 'deleted', 'deleted provider', v_label);
  elsif old.deleted_at is not null and new.deleted_at is null then
    perform public.log_activity(new.household_id, 'provider', new.id, 'restored', 'restored provider', v_label);
  else
    foreach v_col in array array['name', 'trade', 'phone', 'whatsapp', 'email', 'area', 'notes', 'rating'] loop
      if v_old -> v_col is distinct from v_new -> v_col then
        v_names := v_names || replace(v_col, '_', ' ');
        v_fields := v_fields || jsonb_build_object(v_col, jsonb_build_array(v_old -> v_col, v_new -> v_col));
      end if;
    end loop;
    if cardinality(v_names) > 0 then
      perform public.log_activity(new.household_id, 'provider', new.id, 'updated',
        case when v_names = array['rating']
             then 'rated ' || coalesce(new.rating::text || '/5', 'no rating')
             else 'edited ' || array_to_string(v_names, ', ') end,
        v_label || jsonb_build_object('fields', v_fields));
    end if;
  end if;
  return new;
end;
$$;

create trigger log_activity
  after insert or update on public.providers
  for each row execute function public.providers_activity();

-- ---------------------------------------------------------------------------
-- Tasks and completions
-- ---------------------------------------------------------------------------

create function public.tasks_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label jsonb := jsonb_build_object('label', new.title);
  v_fields jsonb := '{}';
  v_names text[] := '{}';
  v_col text;
  v_name text;
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  v_new jsonb := to_jsonb(new);
begin
  -- complete_task / undo_task_completion move the due date themselves; those are logged as
  -- completions, not edits.
  if tg_op = 'UPDATE' and current_setting('home.task_completion', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    perform public.log_activity(new.household_id, 'task', new.id, 'created', 'added task', v_label);
  elsif old.deleted_at is null and new.deleted_at is not null then
    perform public.log_activity(new.household_id, 'task', new.id, 'deleted', 'deleted task', v_label);
  elsif old.deleted_at is not null and new.deleted_at is null then
    perform public.log_activity(new.household_id, 'task', new.id, 'restored', 'restored task', v_label);
  else
    foreach v_col in array array['title', 'description', 'schedule_type', 'frequency', 'interval_count',
                                 'next_due_on', 'assignee_id', 'provider_id', 'default_category_id',
                                 'reminder_days_before', 'is_active'] loop
      if v_old -> v_col is distinct from v_new -> v_col then
        v_name := case v_col
          when 'next_due_on' then 'due date'
          when 'assignee_id' then 'assignee'
          when 'provider_id' then 'provider'
          when 'default_category_id' then 'category'
          when 'reminder_days_before' then 'reminder'
          when 'schedule_type' then 'schedule'
          when 'frequency' then 'schedule'
          when 'interval_count' then 'schedule'
          when 'is_active' then 'status'
          else v_col end;
        if not v_name = any(v_names) then
          v_names := v_names || v_name;
        end if;
        v_fields := v_fields || jsonb_build_object(v_col, jsonb_build_array(v_old -> v_col, v_new -> v_col));
      end if;
    end loop;
    if cardinality(v_names) > 0 then
      perform public.log_activity(new.household_id, 'task', new.id, 'updated',
        'edited ' || array_to_string(v_names, ', '),
        v_label || jsonb_build_object('fields', v_fields));
    end if;
  end if;
  return new;
end;
$$;

create trigger log_activity
  after insert or update on public.tasks
  for each row execute function public.tasks_activity();

create function public.task_completions_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.task_completions := case when tg_op = 'DELETE' then old else new end;
  v_title text := (select title from public.tasks where id = v_row.task_id);
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.household_id, 'task', new.task_id, 'completed',
      'marked done' || case when new.completed_on <> new.due_on
                            then ' (due ' || public.format_day(new.due_on) || ')' else '' end,
      jsonb_build_object('label', v_title, 'completion_id', new.id, 'completed_on', new.completed_on));
  else
    perform public.log_activity(old.household_id, 'task', old.task_id, 'updated',
      'undid “done” from ' || public.format_day(old.completed_on),
      jsonb_build_object('label', v_title, 'completion_id', old.id));
  end if;
  return null;
end;
$$;

create trigger log_activity
  after insert or delete on public.task_completions
  for each row execute function public.task_completions_activity();

-- Recreate the completion functions so their own due-date updates aren't logged as edits.
create or replace function public.complete_task(
  p_task_id uuid,
  p_completed_on date default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks;
  v_completed_on date;
  v_next date;
  v_completion_id uuid;
begin
  select * into v_task from public.tasks t where t.id = p_task_id for update;
  if not found or v_task.deleted_at is not null
     or not public.is_household_member(v_task.household_id) then
    raise exception 'task_not_found';
  end if;
  if not v_task.is_active then
    raise exception 'task_inactive';
  end if;

  v_completed_on := coalesce(
    p_completed_on,
    (select (now() at time zone h.timezone)::date from public.households h where h.id = v_task.household_id)
  );

  insert into public.task_completions (household_id, task_id, due_on, completed_on, completed_by, notes)
  values (v_task.household_id, v_task.id, v_task.next_due_on, v_completed_on, auth.uid(),
          nullif(btrim(p_notes), ''))
  returning id into v_completion_id;

  perform set_config('home.task_completion', 'on', true);
  if v_task.schedule_type = 'once' then
    update public.tasks set is_active = false where id = v_task.id;
  else
    if v_task.schedule_type = 'after_completion' then
      v_next := public.advance_date(v_completed_on, v_task.frequency, v_task.interval_count,
                                    extract(day from v_completed_on)::int);
    else
      v_next := v_task.next_due_on;
      loop
        v_next := public.advance_date(v_next, v_task.frequency, v_task.interval_count,
                                      extract(day from v_task.start_on)::int);
        exit when v_next > v_completed_on;
      end loop;
    end if;
    update public.tasks set next_due_on = v_next where id = v_task.id;
  end if;
  perform set_config('home.task_completion', '', true);

  return v_completion_id;
end;
$$;

create or replace function public.undo_task_completion(p_completion_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_completion public.task_completions;
begin
  select * into v_completion from public.task_completions c where c.id = p_completion_id for update;
  if not found or not public.is_household_member(v_completion.household_id) then
    raise exception 'completion_not_found';
  end if;
  if exists (
    select 1 from public.task_completions c
    where c.task_id = v_completion.task_id and c.created_at > v_completion.created_at
  ) then
    raise exception 'not_latest_completion';
  end if;

  delete from public.task_completions where id = v_completion.id;
  perform set_config('home.task_completion', 'on', true);
  update public.tasks
  set next_due_on = v_completion.due_on, is_active = true
  where id = v_completion.task_id;
  perform set_config('home.task_completion', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Members and invites (changed by service-role functions, so actors come from the rows)
-- ---------------------------------------------------------------------------

create function public.members_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.household_id, 'member', new.user_id, 'joined', 'joined the household',
      jsonb_build_object('label', public.person_name(new.user_id)), new.user_id);
  else
    perform public.log_activity(old.household_id, 'member', old.user_id, 'left', 'left the household',
      jsonb_build_object('label', public.person_name(old.user_id)), old.user_id);
  end if;
  return null;
end;
$$;

create trigger log_activity
  after insert or delete on public.household_members
  for each row execute function public.members_activity();

create function public.invites_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label jsonb := jsonb_build_object('label', new.email);
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.household_id, 'invite', new.id, 'created', 'invited ' || new.email,
      v_label, new.invited_by);
  elsif old.revoked_at is null and new.revoked_at is not null then
    perform public.log_activity(new.household_id, 'invite', new.id, 'deleted', 'cancelled the invite to ' || new.email, v_label);
  elsif new.token_hash <> old.token_hash and new.accepted_at is null then
    perform public.log_activity(new.household_id, 'invite', new.id, 'updated', 'resent the invite to ' || new.email,
      v_label, new.invited_by);
  end if;
  -- Accepting is logged as the member joining.
  return null;
end;
$$;

create trigger log_activity
  after insert or update on public.invites
  for each row execute function public.invites_activity();

-- invite_revoke runs as the service role; tell the trigger who did it.
create or replace function public.invite_revoke(p_invite_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
begin
  select i.household_id into v_household_id
  from public.invites i
  where i.id = p_invite_id and i.accepted_at is null and i.revoked_at is null
  for update;

  -- Same error for "doesn't exist" and "not yours" so ids can't be probed.
  if not found or not public.is_member_of(v_household_id, p_user_id) then
    raise exception 'invite_not_found';
  end if;

  perform set_config('home.actor_id', p_user_id::text, true);
  update public.invites set revoked_at = now() where id = p_invite_id;
  perform set_config('home.actor_id', '', true);
end;
$$;

revoke execute on function public.expenses_activity() from public, anon, authenticated;
revoke execute on function public.receipts_activity() from public, anon, authenticated;
revoke execute on function public.providers_activity() from public, anon, authenticated;
revoke execute on function public.tasks_activity() from public, anon, authenticated;
revoke execute on function public.task_completions_activity() from public, anon, authenticated;
revoke execute on function public.members_activity() from public, anon, authenticated;
revoke execute on function public.invites_activity() from public, anon, authenticated;
