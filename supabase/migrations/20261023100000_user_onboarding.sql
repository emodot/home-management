-- Tour guide, T0: what each user has seen of the onboarding (product tours, the getting-started
-- checklist, feature hints), so it follows them across devices. Per user, not per household:
-- someone in two households sees each tour once. Whether a tour should show is worked out in the
-- app (packages/shared/src/onboarding/onboarding.ts).

create table public.user_onboarding (
  user_id uuid not null references auth.users on delete cascade,
  -- 'tour:welcome', 'tour:kitchen', 'checklist', 'hint:price-tracker'
  key text not null check (key ~ '^((tour|hint):[a-z0-9]+(-[a-z0-9]+)*|checklist)$'),
  version int not null default 1 check (version > 0),
  status text not null check (status in ('completed', 'dismissed')),
  -- The step a tour was dismissed on (0-based).
  last_step int check (last_step >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- Read directly; written only through mark_onboarding.
revoke all on public.user_onboarding from anon;
revoke insert, update, delete, truncate, references, trigger on public.user_onboarding from authenticated;

alter table public.user_onboarding enable row level security;

create policy "Users read their own onboarding" on public.user_onboarding
  for select to authenticated using (user_id = (select auth.uid()));

-- Records that the caller finished or skipped a tour (or the checklist, or a hint), replacing what
-- was there: replaying a tour and skipping it this time records the skip.
create function public.mark_onboarding(
  p_key text,
  p_version int,
  p_status text,
  p_last_step int default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  insert into public.user_onboarding (user_id, key, version, status, last_step)
  values (v_user, p_key, p_version, p_status, case when p_status = 'dismissed' then p_last_step end)
  on conflict (user_id, key) do update set
    version = excluded.version,
    status = excluded.status,
    last_step = excluded.last_step,
    updated_at = now();
end;
$$;

revoke execute on function public.mark_onboarding(text, int, text, int) from public, anon;
grant execute on function public.mark_onboarding(text, int, text, int) to authenticated;
