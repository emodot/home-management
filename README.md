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

Auth emails (confirmations, password resets) are caught locally by Mailpit at
http://127.0.0.1:54324.

### Sign-in, households and roles

People sign in with email and password only. "Forgot password?" emails a link to
`/reset-password`. Locally new accounts can sign in straight away; the hosted project requires
confirming the email first (`[remotes.production.auth.email]` in `supabase/config.toml`).

Supabase's built-in email sender only allows a few emails an hour and is meant for testing. For
real use, set custom SMTP (e.g. Resend: `smtp.resend.com`, port 465, user `resend`, your API key
as the password) under Authentication → Emails → SMTP Settings in the dashboard.

There are three kinds of people:

- **Super-admins** run the app from the admin dashboard (`/admin`, below). Only they create
  households, and only they decide who is a household admin.
- **Household admins** invite members from the Members page, with a link to share (WhatsApp,
  SMS…) or by email. Each link lets one person join and expires after 7 days; only a hash of the
  token is stored, so a link is shown once and "New link" replaces it.
- **Members** use the household but can't invite.

A new household starts empty: its page in the dashboard makes a household admin invite link, and
whoever accepts it joins as the household admin. Someone who signs up without an invite sees
"You're not in a household yet". Members can leave a household but never delete it; the last
household admin can't leave while others remain.

### Admin dashboard

Super-admins have their own sign-in page, `/admin/sign-in`, and their own super-admin-only
accounts: signing in there with a household account is refused, and a super-admin account that
signs in to the regular app is sent to the dashboard. The regular app has no admin links.

The dashboard has an overview (totals, weekly sign-ups, recent actions), every user (search, send
a password reset, disable/re-enable, delete), every household (create, members and their roles,
household admin invites, rename, delete) and the super-admins themselves. Deleting a user removes
them from their households; households are only ever deleted from the dashboard. Every action is
recorded in `admin_actions`. Everyone else gets a 404, and the `admin` edge function refuses them.

**Adding super-admins:** Super-admins → Add super-admin creates a separate account (the email must
not already be used for a household account) with a temporary password to share privately; they
must choose their own password when they first sign in. Removing a super-admin deletes a
super-admin-only account; an account that is also in households just loses super-admin access.

**The first super-admin:** create the account in the Supabase dashboard (Authentication → Add user,
with "Auto confirm"), then in the SQL editor:

```sql
insert into public.app_admins (user_id) select id from auth.users where email = 'admin@example.com';
```

Disabling an account stops new sign-ins and token refreshes; a session already open lasts until
its access token expires (up to an hour).

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

`pnpm e2e` runs the Playwright smoke test against the local stack: a super-admin creates a
household and an admin invite → the household admin signs up through it → expense with receipt →
invites by email and by link, with a member joining (and seeing no invite controls) → task →
complete → log expense → profile and password change → sign back in. It needs `pnpm db:start`, the
edge functions (`supabase functions serve --env-file supabase/functions/.env`), `apps/web/.env`
pointing at the local API, a super-admin (`E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`, default
`superadmin@example.com` / `super-admin-e2e`; CI creates it) and Chromium once:
`pnpm --filter @home/web exec playwright install chromium`. The dev server is started for you.

App icons are generated from `apps/web/public/icon.svg` with `pnpm --filter @home/web icons`.

## Layout

```
apps/web          Vite + React SPA (React Router, TanStack Query, Tailwind, shadcn/ui)
packages/shared   Platform-agnostic logic shared with the future mobile app
packages/emails   React Email templates
supabase/         config, migrations, edge functions, seed
```
