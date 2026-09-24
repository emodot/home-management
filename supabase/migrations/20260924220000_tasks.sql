-- M7: recurring household tasks and their completion history. Completing a task can be followed
-- by logging an expense linked to that completion. Reminders (reminder_days_before) arrive in M8.

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  title text not null check (char_length(title) between 1 and 120 and title = btrim(title)),
  description text check (char_length(description) <= 2000),
  schedule_type text not null check (schedule_type in ('fixed', 'after_completion', 'once')),
  frequency text check (frequency in ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
  interval_count int not null default 1 check (interval_count between 1 and 99),
  -- First due date; its day of month anchors fixed month-based schedules (see advance_date).
  start_on date not null,
  next_due_on date not null,
  assignee_id uuid references public.profiles on delete set null,
  provider_id uuid,
  default_category_id uuid,
  reminder_days_before int not null default 1 check (reminder_days_before between 0 and 30),
  is_active boolean not null default true,
  created_by uuid references public.profiles on delete set null,
  updated_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (household_id, id),
  -- One-off tasks have no frequency; repeating ones must have one.
  check ((schedule_type = 'once') = (frequency is null)),
  foreign key (household_id, provider_id)
    references public.providers (household_id, id) on delete set null (provider_id),
  foreign key (household_id, default_category_id)
    references public.expense_categories (household_id, id) on delete set null (default_category_id)
);

create index tasks_household_due_idx on public.tasks (household_id, next_due_on)
  where deleted_at is null and is_active;
create index tasks_provider_idx on public.tasks (household_id, provider_id) where provider_id is not null;

create trigger set_audit_fields
  before insert or update on public.tasks
  for each row execute function public.set_audit_fields();

create function public.check_task_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and not public.is_member_of(new.household_id, new.assignee_id) then
    raise exception 'assignee must be a household member' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.check_task_assignee() from public, anon, authenticated;

create trigger check_task_assignee
  before insert or update of assignee_id on public.tasks
  for each row execute function public.check_task_assignee();

revoke all on public.tasks from anon;
revoke insert, update, delete, truncate, references, trigger on public.tasks from authenticated;
grant insert (household_id, title, description, schedule_type, frequency, interval_count, start_on,
              next_due_on, assignee_id, provider_id, default_category_id, reminder_days_before, is_active)
  on public.tasks to authenticated;
grant update (title, description, schedule_type, frequency, interval_count, start_on, next_due_on,
              assignee_id, provider_id, default_category_id, reminder_days_before, is_active, deleted_at)
  on public.tasks to authenticated;

alter table public.tasks enable row level security;

create policy "Members manage tasks: select" on public.tasks
  for select to authenticated using (public.is_household_member(household_id));
create policy "Members manage tasks: insert" on public.tasks
  for insert to authenticated with check (public.is_household_member(household_id));
create policy "Members manage tasks: update" on public.tasks
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- Completions (written only by complete_task / undo_task_completion)
-- ---------------------------------------------------------------------------

create table public.task_completions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  task_id uuid not null,
  -- The due date this completion satisfied (the task's next_due_on at the time).
  due_on date not null,
  completed_on date not null,
  completed_by uuid references public.profiles on delete set null,
  notes text check (char_length(notes) <= 2000),
  -- clock_timestamp so completions made in one transaction still have a well-defined order.
  created_at timestamptz not null default clock_timestamp(),
  unique (household_id, id),
  foreign key (household_id, task_id) references public.tasks (household_id, id) on delete cascade
);

create index task_completions_task_idx on public.task_completions (task_id, completed_on desc);

revoke all on public.task_completions from anon;
revoke insert, update, delete, truncate, references, trigger on public.task_completions from authenticated;

alter table public.task_completions enable row level security;

create policy "Members view task completions" on public.task_completions
  for select to authenticated using (public.is_household_member(household_id));

-- Records a completion and moves the task on:
--   fixed            → the next date on the schedule after the completion date
--   after_completion → completion date + interval
--   once             → the task becomes inactive
-- Returns the completion id (for linking an expense).
create function public.complete_task(
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

  return v_completion_id;
end;
$$;

-- Reverses the latest completion of a task: removes it and restores the due date (and, for
-- one-off tasks, makes the task active again). Linked expenses are kept, unlinked.
create function public.undo_task_completion(p_completion_id uuid)
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
  update public.tasks
  set next_due_on = v_completion.due_on, is_active = true
  where id = v_completion.task_id;
end;
$$;

revoke execute on function public.complete_task(uuid, date, text) from public, anon;
revoke execute on function public.undo_task_completion(uuid) from public, anon;
grant execute on function public.complete_task(uuid, date, text) to authenticated;
grant execute on function public.undo_task_completion(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Expenses logged for a completion
-- ---------------------------------------------------------------------------

alter table public.expenses
  add column task_completion_id uuid,
  add foreign key (household_id, task_completion_id)
    references public.task_completions (household_id, id) on delete set null (task_completion_id);
create index expenses_task_completion_idx on public.expenses (task_completion_id)
  where task_completion_id is not null;
grant insert (task_completion_id) on public.expenses to authenticated;

create or replace view public.expense_list
with (security_invoker = true)
as
select
  e.id, e.household_id, e.amount_minor, e.currency, e.occurred_on, e.category_id,
  e.description, e.notes, e.paid_by, e.status, e.created_by, e.updated_by,
  e.created_at, e.updated_at, e.deleted_at,
  e.description || ' ' || coalesce(e.notes, '') as search_text,
  (select count(*)::int
   from public.expense_receipts r
   where r.expense_id = e.id and r.deleted_at is null) as receipt_count,
  e.recurring_expense_id,
  e.provider_id,
  e.task_completion_id
from public.expenses e;
