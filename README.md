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

Magic-link emails are caught locally by Mailpit at http://127.0.0.1:54324.

### Google sign-in (optional locally)

1. Create a Google OAuth client with redirect URI `http://127.0.0.1:54321/auth/v1/callback`.
2. `cp supabase/.env.example supabase/.env` and fill in the client ID and secret.
3. Set `enabled = true` under `[auth.external.google]` in `supabase/config.toml` and restart Supabase.

In the hosted project, configure Google under Authentication → Providers, and add the app's
`/auth/callback` URL to the redirect allow-list.

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

## Layout

```
apps/web          Vite + React SPA (React Router, TanStack Query, Tailwind, shadcn/ui)
packages/shared   Platform-agnostic logic shared with the future mobile app
packages/emails   React Email templates
supabase/         config, migrations, edge functions, seed
```
