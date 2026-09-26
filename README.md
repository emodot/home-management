# Home Management

Household expenses, tasks and providers. See [SPEC.md](SPEC.md) for the Phase 1 build spec.

## Requirements

- Node 24 (see `.nvmrc`) and pnpm 10
- Docker (for the local Supabase stack)

## Setup

```bash
pnpm install
pnpm db:start                          # starts local Supabase; prints API URL + anon key
cp apps/web/.env.example apps/web/.env # paste the anon key
pnpm dev                               # http://localhost:5173
```

Auth emails (sign-in links, confirmations, password resets) are caught locally by Mailpit at
http://127.0.0.1:54324.

### Sign-in and invites

People sign in with email and password, or with an emailed sign-in link. "Forgot password?" emails
a link to `/reset-password`. Locally new accounts can sign in straight away; the hosted project
requires confirming the email first (`[remotes.production.auth.email]` in `supabase/config.toml`).

Supabase's built-in email sender only allows a few emails an hour and is meant for testing. For
real use, set custom SMTP (e.g. Resend: `smtp.resend.com`, port 465, user `resend`, your API key
as the password) under Authentication → Emails → SMTP Settings in the dashboard.

Members invite people from the Members page by creating a link to share (WhatsApp, SMS…) or by
email. Anyone who opens a valid link and signs in can join; each link works once and expires
after 7 days. Only a hash of the token is stored, so a link is shown once; "New link" replaces it.

### Daily jobs

`pg_cron` calls the `daily-jobs` edge function at 06:00 UTC (07:00 in Lagos). It is safe to run
more than once. In order, it:

1. turns due recurring bills into pending expenses;
2. emails task reminders (upcoming and overdue), logging each in `reminder_logs` first so none is
   sent twice; failed sends are released and retried the next day;
3. hard-deletes expenses, receipts, providers and tasks soft-deleted over 30 days ago, and their
   receipt files;
4. deletes invites that expired over 30 days ago.

Set up per project:

1. `supabase secrets set CRON_SECRET=<long random string>` (locally: `supabase/functions/.env`).
2. In the SQL editor, store the URL and the same secret in Vault:
   `select vault.create_secret('https://<ref>.supabase.co', 'project_url');`
   `select vault.create_secret('<CRON_SECRET>', 'daily_jobs_secret');`

Run it by hand with `select public.invoke_daily_jobs();`.

## Deployment

The backend is a hosted Supabase project; the frontend is a static site on Vercel.

### 1. Supabase

```bash
supabase link --project-ref <ref>
supabase db push                 # apply supabase/migrations
supabase functions deploy        # send-invite, accept-invite, revoke-invite, leave-household, daily-jobs
supabase secrets set APP_URL=https://<your-domain> RESEND_API_KEY=<key> \
  EMAIL_FROM="Home <home@your-verified-domain>" CRON_SECRET=<long random string>
```

Then add the two Vault secrets from [Daily jobs](#daily-jobs), and under Authentication → URL
Configuration set the site URL to `https://<your-domain>` and add
`https://<your-domain>/auth/callback` to the redirect URLs. Resend only delivers from a verified
domain.

### 2. Vercel

Import the GitHub repo into Vercel and leave the root directory as the repo root; `vercel.json`
sets the build command, output directory, SPA fallback and cache headers. Add these environment
variables (Production):

| Variable                 | Value                           |
| ------------------------ | ------------------------------- |
| `VITE_SUPABASE_URL`      | `https://<ref>.supabase.co`     |
| `VITE_SUPABASE_ANON_KEY` | the project's anon (public) key |

The build fails if either is missing. Sign-in links return to whichever site sent them, so a
deployment's domain must be in Supabase's redirect URLs (see step 1) for sign-in to work there.

## Scripts

| Command          | What it does                              |
| ---------------- | ----------------------------------------- |
| `pnpm dev`       | Run the web app                           |
| `pnpm build`     | Production build of all packages          |
| `pnpm lint`      | ESLint (type-aware) across the repo       |
| `pnpm format`    | Prettier write (`format:check` to verify) |
| `pnpm typecheck` | `tsc` in every package                    |
| `pnpm test`      | Vitest (`packages/shared`)                |
| `pnpm check`     | format:check + lint + typecheck + test    |
| `pnpm db:start`  | Start local Supabase (`db:stop` to stop)  |
| `pnpm db:reset`  | Re-apply migrations + `supabase/seed.sql` |
| `pnpm db:lint`   | Lint the database schema                  |
| `pnpm db:types`  | Generate DB types into `packages/shared`  |
| `pnpm e2e`       | Playwright smoke tests (see below)        |

### Smoke tests

`pnpm e2e` runs the Playwright smoke test (sign up → household → expense with receipt → invite by
email and by link, with a second person joining through the link → task → complete → log expense →
sign back in) against the local stack. It needs `pnpm db:start`, the edge functions (`supabase
functions serve --env-file supabase/functions/.env`), `apps/web/.env` pointing at the local API,
and Chromium once: `pnpm --filter @home/web exec playwright install chromium`. The dev server is
started for you.

App icons are generated from `apps/web/public/icon.svg` with `pnpm --filter @home/web icons`.

## Layout

```
apps/web          Vite + React SPA (React Router, TanStack Query, Tailwind, shadcn/ui)
packages/shared   Platform-agnostic logic shared with the future mobile app
packages/emails   React Email templates
supabase/         config, migrations, edge functions, seed
```
