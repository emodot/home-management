-- Runs the daily-jobs edge function at 07:00 Africa/Lagos (06:00 UTC) every day.
--
-- The URL and shared secret come from Vault so they differ per environment and never live in
-- git. Set them once per project (SQL editor), matching the CRON_SECRET function secret:
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<same value as CRON_SECRET>', 'daily_jobs_secret');
-- Until both exist the scheduled call does nothing.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create function public.invoke_daily_jobs()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'daily_jobs_secret';
  if v_url is null or v_secret is null then
    raise warning 'daily-jobs not invoked: set the project_url and daily_jobs_secret vault secrets';
    return;
  end if;

  perform net.http_post(
    url := v_url || '/functions/v1/daily-jobs',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function public.invoke_daily_jobs() from public, anon, authenticated;

select cron.schedule('daily-jobs', '0 6 * * *', 'select public.invoke_daily_jobs()');
