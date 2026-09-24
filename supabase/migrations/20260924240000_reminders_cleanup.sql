-- M8: task reminder log and the remaining daily-job steps (reminders, purging soft-deleted rows,
-- expiring invites). Everything here is service-role only; the daily-jobs edge function calls it.

-- ---------------------------------------------------------------------------
-- Reminders
-- ---------------------------------------------------------------------------

create table public.reminder_logs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  task_id uuid not null references public.tasks on delete cascade,
  due_on date not null,
  recipient_user_id uuid not null references public.profiles on delete cascade,
  kind text not null check (kind in ('upcoming', 'overdue')),
  sent_at timestamptz not null default now(),
  -- A reminder is never sent twice.
  unique (task_id, due_on, recipient_user_id, kind)
);

create index reminder_logs_household_idx on public.reminder_logs (household_id);

revoke all on public.reminder_logs from anon, authenticated;
alter table public.reminder_logs enable row level security;
create policy "Members view their household's reminder log" on public.reminder_logs
  for select to authenticated using (public.is_household_member(household_id));
grant select on public.reminder_logs to authenticated;

-- Claims the reminders due today by inserting them into reminder_logs (duplicates are skipped by
-- the unique constraint) and returns only the newly claimed ones, with what the email needs.
--   upcoming: from next_due_on - reminder_days_before up to the due date (so a missed run still
--             reminds before the task is due)
--   overdue:  any day after next_due_on while the task is still not done (once per due date)
-- Recipients: the assignee if they are still a member, otherwise every member.
-- "Today" is each household's local date unless p_today is given.
create function public.claim_task_reminders(p_today date default null)
returns table (
  log_id uuid,
  kind text,
  household_id uuid,
  household_name text,
  task_id uuid,
  task_title text,
  due_on date,
  recipient_user_id uuid,
  recipient_email text,
  recipient_name text,
  assigned_to_recipient boolean,
  provider_name text,
  provider_phone text
)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select t.*, h.name as household_name,
           coalesce(p_today, (now() at time zone h.timezone)::date) as today
    from public.tasks t
    join public.households h on h.id = t.household_id
    where t.is_active and t.deleted_at is null
  ),
  candidates as (
    select d.*, 'upcoming'::text as kind from due d
    where d.today between d.next_due_on - d.reminder_days_before and d.next_due_on
    union all
    select d.*, 'overdue'::text from due d
    where d.today > d.next_due_on
  ),
  recipients as (
    select c.*, m.user_id as recipient_id,
           (c.assignee_id is not null and m.user_id = c.assignee_id) as assigned
    from candidates c
    join public.household_members m on m.household_id = c.household_id
    where c.assignee_id is null
       or m.user_id = c.assignee_id
       or not public.is_member_of(c.household_id, c.assignee_id)
  ),
  claimed as (
    insert into public.reminder_logs (household_id, task_id, due_on, recipient_user_id, kind)
    select r.household_id, r.id, r.next_due_on, r.recipient_id, r.kind from recipients r
    on conflict (task_id, due_on, recipient_user_id, kind) do nothing
    returning *
  )
  select cl.id, cl.kind, cl.household_id, r.household_name, cl.task_id, r.title, cl.due_on,
         cl.recipient_user_id, pr.email, coalesce(pr.full_name, pr.email), r.assigned,
         pv.name, pv.phone
  from claimed cl
  join recipients r
    on r.id = cl.task_id and r.recipient_id = cl.recipient_user_id and r.kind = cl.kind
  join public.profiles pr on pr.id = cl.recipient_user_id
  left join public.providers pv on pv.id = r.provider_id and pv.deleted_at is null;
$$;

-- Gives a claimed reminder back when its email couldn't be sent, so the next run retries it.
create function public.release_task_reminder(p_log_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.reminder_logs where id = p_log_id;
$$;

-- ---------------------------------------------------------------------------
-- Purging soft-deleted rows older than 30 days
-- ---------------------------------------------------------------------------

-- Hard-deletes expenses, receipts, providers and tasks soft-deleted before p_before, and returns
-- the counts plus the storage paths of every receipt removed (the caller deletes those files).
create function public.purge_deleted_rows(p_before timestamptz default now() - interval '30 days')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paths text[];
  v_receipts int;
  v_expenses int;
  v_providers int;
  v_tasks int;
begin
  -- Receipts deleted on their own, or belonging to an expense being purged.
  with gone as (
    delete from public.expense_receipts r
    where r.deleted_at < p_before
       or exists (select 1 from public.expenses e where e.id = r.expense_id and e.deleted_at < p_before)
    returning r.storage_path
  )
  select coalesce(array_agg(storage_path), '{}'), count(*) into v_paths, v_receipts from gone;

  delete from public.expenses where deleted_at < p_before;
  get diagnostics v_expenses = row_count;
  delete from public.tasks where deleted_at < p_before;
  get diagnostics v_tasks = row_count;
  delete from public.providers where deleted_at < p_before;
  get diagnostics v_providers = row_count;

  return jsonb_build_object(
    'receipts', v_receipts,
    'expenses', v_expenses,
    'tasks', v_tasks,
    'providers', v_providers,
    'storage_paths', to_jsonb(v_paths)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Expiring invites
-- ---------------------------------------------------------------------------

-- Invites past expires_at can't be accepted already (invite_accept checks). Members still see
-- recently expired ones so they can resend; ones expired over 30 days ago are removed.
create function public.delete_expired_invites(p_before timestamptz default now() - interval '30 days')
returns int
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.invites
    where accepted_at is null and expires_at < p_before
    returning 1
  )
  select count(*)::int from gone;
$$;

revoke execute on function public.claim_task_reminders(date) from public, anon, authenticated;
revoke execute on function public.release_task_reminder(uuid) from public, anon, authenticated;
revoke execute on function public.purge_deleted_rows(timestamptz) from public, anon, authenticated;
revoke execute on function public.delete_expired_invites(timestamptz) from public, anon, authenticated;
grant execute on function public.claim_task_reminders(date) to service_role;
grant execute on function public.release_task_reminder(uuid) to service_role;
grant execute on function public.purge_deleted_rows(timestamptz) to service_role;
grant execute on function public.delete_expired_invites(timestamptz) to service_role;
