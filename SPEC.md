# Home Management App — Phase 1 Build Spec

> **For Claude Code:** This is the source of truth for Phase 1. Work one milestone at a time (see "Milestones"). At the end of each milestone: run migrations, type-check, lint and tests, then stop and summarise what you built and anything you had to assume. Do not build anything listed under "Out of scope". If something here is ambiguous or contradicts itself, ask before choosing.

---

## 1. Product summary

A web app (mobile app later) that helps a household manage the running of a home. Phase 1 covers four features, in priority order:

1. **Expense management with receipt uploads** — the main priority
2. **Households with invites** — no roles; every member is equal
3. **Recurring tasks with email reminders**
4. **Service provider directory** — private to each household, linked to tasks and expenses

The core loop: a **task** is done by a **provider** → completing it prompts the user to log an **expense** → the expense carries the **receipt**.

Primary market is Nigeria: default currency NGN, default timezone `Africa/Lagos`, `en-NG` formatting.

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Web app | Vite + React (SPA), TypeScript (strict), Tailwind CSS, shadcn/ui |
| Routing | React Router (data router) with protected routes |
| Data fetching | TanStack Query + `@supabase/supabase-js` (client-side auth session) |
| Forms & validation | react-hook-form + zod |
| Backend | Supabase: Postgres, Auth (email magic link + Google), Storage, Edge Functions, `pg_cron` |
| Email | Resend (with React Email templates) |
| Testing | Vitest for `packages/shared`; Playwright smoke tests for key flows |
| PWA | `vite-plugin-pwa` (installable manifest) + camera-friendly file input (`accept="image/*,application/pdf" capture`) |
| Hosting | Static hosting (Vercel, Netlify or Cloudflare Pages) with SPA fallback to `index.html` |

The mobile app (Expo / React Native) comes later and must be able to reuse `packages/shared`, so **no web-only code in `packages/shared`** (no DOM, `import.meta.env` or Vite-specific APIs).

There is no app server: the web app is a static SPA. Anything that needs the service role key or must be trusted (invites, emails, scheduled jobs, last-member household deletion) runs in **Supabase Edge Functions** or Postgres functions, never in the browser.

### Repo layout

```
apps/
  web/                 # Vite + React SPA
packages/
  shared/              # zod schemas, TS types, money utils, recurrence utils, API query functions
  emails/              # React Email templates
supabase/
  migrations/          # SQL migrations (schema, RLS, functions, cron)
  functions/           # Edge functions (send-invite, accept-invite, leave-household, daily-jobs)
  seed.sql
```

---

## 3. Conventions

- **Money:** store as `bigint` minor units (kobo) in `amount_minor`, plus `currency char(3) default 'NGN'`. Never use floats. Format with `Intl.NumberFormat('en-NG', { style: 'currency', currency })`. Helpers `toMinor()` / `fromMinor()` / `formatMoney()` live in `packages/shared/money.ts` with tests.
- **Dates:** due dates and expense dates are `date` (no time). Timestamps are `timestamptz`. "Today" for business logic means today in `Africa/Lagos`.
- **IDs:** `uuid` with `gen_random_uuid()`.
- **Every household-owned table** has `household_id uuid not null references households on delete cascade`.
- **Audit columns** on expenses, providers and tasks: `created_by`, `updated_by`, `created_at`, `updated_at` (trigger-maintained).
- **Soft delete** (`deleted_at timestamptz`) for expenses, receipts, providers and tasks. Lists exclude soft-deleted rows. A "Recently deleted" view allows restore within 30 days; a daily job hard-deletes older rows (and their storage objects).
- **Validation:** every write goes through a zod schema from `packages/shared`, used on both client and server.

---

## 4. Data model

### Identity & households

**profiles** — `id` (= `auth.users.id`), `full_name`, `email`, `avatar_url`, `created_at`. Created by trigger on sign-up.

**households** — `id`, `name`, `currency char(3) default 'NGN'`, `timezone text default 'Africa/Lagos'`, `created_at`.

**household_members** — `household_id`, `user_id`, `joined_at`. Primary key `(household_id, user_id)`. **No role column.**

**invites** — `id`, `household_id`, `email`, `token_hash`, `invited_by`, `expires_at` (7 days), `accepted_at`, `revoked_at`, `created_at`. Only the hash of the token is stored.

### Expenses

**expense_categories** — `id`, `household_id`, `name`, `icon`, `is_archived`, `sort_order`. Seeded per household on creation: Utilities, Electricity, Fuel & Generator, Water, Internet & TV, Repairs & Maintenance, Cleaning, Security, Estate Dues & Service Charge, Rent, Groceries, Furniture & Appliances, Other.

**expenses** — `id`, `household_id`, `amount_minor bigint not null check (amount_minor > 0)`, `currency`, `occurred_on date not null`, `category_id`, `description text not null`, `notes`, `paid_by uuid` (a household member), `provider_id` (nullable), `task_completion_id` (nullable), `recurring_expense_id` (nullable), `status text check (status in ('confirmed','pending')) default 'confirmed'`, audit columns, `deleted_at`.

**expense_receipts** — `id`, `household_id`, `expense_id`, `storage_path`, `file_name`, `mime_type`, `size_bytes`, `created_by`, `created_at`, `deleted_at`. An expense can have many receipts.

**recurring_expenses** — `id`, `household_id`, `description`, `amount_minor`, `currency`, `category_id`, `provider_id`, `paid_by`, `frequency` (`weekly | monthly | quarterly | yearly`), `interval_count int default 1`, `next_due_on date`, `is_active`, audit columns.

**budgets** — `id`, `household_id`, `category_id`, `monthly_amount_minor`, `currency`. Unique `(household_id, category_id)`.

### Providers

**providers** — `id`, `household_id`, `name`, `trade` (plumber, electrician, generator technician, cleaner, painter, carpenter, AC technician, fumigator, other), `phone`, `whatsapp`, `email`, `area`, `notes`, `rating smallint check (rating between 1 and 5)`, audit columns, `deleted_at`.

### Tasks

**tasks** — `id`, `household_id`, `title`, `description`, `schedule_type` (`fixed | after_completion | once`), `frequency` (`daily | weekly | monthly | quarterly | yearly`, null for `once`), `interval_count int default 1`, `start_on date`, `next_due_on date`, `assignee_id` (nullable member), `provider_id` (nullable), `default_category_id` (nullable, used to prefill the expense), `reminder_days_before int default 1`, `is_active`, audit columns, `deleted_at`.

- `fixed`: next due date advances from the previous due date (e.g. 1st of every month), regardless of when it was done.
- `after_completion`: next due date = completion date + interval (e.g. service generator every 3 months after last service).
- `once`: no recurrence; becomes inactive when completed.

**task_completions** — `id`, `household_id`, `task_id`, `due_on`, `completed_on`, `completed_by`, `notes`, `created_at`.

**reminder_logs** — `id`, `household_id`, `task_id`, `due_on`, `recipient_user_id`, `kind` (`upcoming | overdue`), `sent_at`. Unique `(task_id, due_on, recipient_user_id, kind)` so a reminder is never sent twice.

### Activity

**activity_log** — `id`, `household_id`, `actor_id`, `entity_type` (`expense | receipt | provider | task | member | invite`), `entity_id`, `action` (`created | updated | deleted | restored | completed | joined | left`), `summary text` (human-readable, e.g. "edited amount ₦45,000 → ₦54,000"), `changes jsonb`, `created_at`. Written by database triggers where practical.

---

## 5. Security

- **RLS on every table.** A `security definer` function `is_household_member(hid uuid) returns boolean` checks `household_members` for `auth.uid()`. Every select/insert/update/delete policy on household-owned tables uses it. There are no roles — membership is the only check.
- **Storage:** private bucket `receipts`. Object path `{household_id}/{expense_id}/{uuid}.{ext}`. Storage policies check `is_household_member` against the first path segment. Files are served via short-lived signed URLs only.
- **Uploads:** allow JPEG, PNG, WebP, HEIC and PDF, max 10 MB each. Compress images client-side (max 2000px long edge) before upload.
- **Invites** are created, accepted and revoked only through edge functions using the service role, never by direct table writes from the client.
- The service role key must never appear in the Vite app or any `VITE_`-prefixed variable.

---

## 6. Features & acceptance criteria

### 6.1 Auth & onboarding
- Sign in with email magic link or Google.
- First-time user with no household → prompted to create one (name) or told to accept an invite.
- A user can belong to multiple households; a switcher in the header sets the active one (persisted per user).

### 6.2 Households & invites (no roles)
- Any member can invite by email. The email contains a link `/invite/{token}`.
- Opening the link: if signed out, sign in / sign up first, then return and accept. Accepting adds the user to `household_members` and marks the invite accepted.
- Tokens are single-use and expire after 7 days. Any member can revoke a pending invite or resend it (resend creates a new token).
- Members page lists members and pending invites.
- **Leave household:** any member can leave. If they are the last member, show a strong confirmation that the household and all its data will be permanently deleted, then delete it (cascade + remove storage objects).
- Members cannot remove other members in Phase 1.
- Every member can view and edit everything in the household.

### 6.3 Expenses (main priority — make this excellent)
- **Add expense:** amount, date (default today), category, description, paid by (default current user), optional provider, optional notes, attach 0–n receipts. Must be fast on a phone: amount field first, numeric keyboard, one-screen form.
- **Receipts:** upload from camera or files; show thumbnails (PDF icon for PDFs); tap to view full size; delete individual receipts.
- **List view:** grouped by month, newest first. Filters: date range, category, provider, paid by, has receipt / no receipt. Text search on description and notes.
- **Detail view:** all fields, receipts gallery, linked provider and task, created/updated by and when.
- **Edit / delete** (soft delete with undo toast and "Recently deleted" restore).
- **Summary dashboard:** total this month vs last month, breakdown by category (bar or donut chart), top providers by spend, budget progress per category.
- **Budgets:** set a monthly budget per category; show progress, amber at 80%, red when over.
- **Categories:** add, rename, archive, reorder. Archived categories stay on old expenses.
- **Recurring expenses:** define bills that repeat (e.g. internet monthly, estate dues quarterly). The daily job creates a **pending** expense when due. Pending expenses appear at the top of the list with "Confirm" (optionally edit amount, add receipt) and "Skip".
- **Export:** CSV of the current filtered list.
- **Out of scope for Phase 1:** splitting costs between members or settling up. `paid_by` is tracking only.

### 6.4 Service providers
- CRUD with fields above; search by name, filter by trade.
- Tap-to-call and tap-to-WhatsApp (`https://wa.me/{number}`) links. Normalise Nigerian numbers to E.164 (`+234…`).
- **Provider page** shows: contact details, rating, notes, tasks linked to them, and all expenses with this provider with a total spend (all time and this year).
- Selecting a provider on an expense or task is a searchable combobox with "Add new provider" inline.

### 6.5 Recurring tasks & reminders
- CRUD with fields above. Show upcoming (next 30 days), overdue, and all tasks.
- **Complete task:** records a `task_completion`, advances `next_due_on` according to `schedule_type`, then immediately shows **"Log an expense for this?"** — opening the expense form prefilled with provider, category (`default_category_id`), description (task title) and date (completion date), linked via `task_completion_id`. User can dismiss.
- Task detail shows completion history and linked expenses.
- **Reminders:** emailed to the assignee, or to all members if unassigned:
  - "upcoming" on `next_due_on - reminder_days_before`
  - "overdue" the day after `next_due_on` if not completed (once only)
- Email includes task title, due date, provider name + phone if set, and a link to the task.

### 6.6 Activity log
- Household activity feed page (paginated), plus a per-item history on expense, provider and task detail pages.

---

## 7. Scheduled jobs

A single edge function `daily-jobs`, triggered by `pg_cron` every day at 07:00 Africa/Lagos (06:00 UTC). It must be idempotent — safe to run twice.

1. Generate pending expenses from active `recurring_expenses` where `next_due_on <= today`; advance `next_due_on`.
2. Send task reminders (upcoming + overdue), writing to `reminder_logs` first and relying on its unique constraint to prevent duplicates.
3. Hard-delete soft-deleted rows older than 30 days, and their storage objects.
4. Expire invites past `expires_at`.

---

## 8. Shared logic (`packages/shared`) — must have unit tests

- `money.ts`: `toMinor`, `fromMinor`, `formatMoney`.
- `recurrence.ts`: `nextDueDate({ scheduleType, frequency, intervalCount, previousDueOn, completedOn })`. Handle month-end correctly (Jan 31 + 1 month → Feb 28/29, then back to 31 where possible if anchored to `start_on`).
- `phone.ts`: normalise Nigerian phone numbers to E.164.
- zod schemas for every create/update payload.
- Typed query functions (e.g. `listExpenses(client, filters)`) that take a Supabase client, so the future mobile app can reuse them.

---

## 9. UI notes

- Mobile-first; must work well at 375px width. Bottom nav on mobile (Expenses, Tasks, Providers, More), sidebar on desktop.
- Expenses is the home screen after sign-in.
- Floating "+" button for adding an expense from anywhere.
- Empty states that explain the feature and offer the primary action.
- Loading skeletons, optimistic updates for create/edit/complete, toasts with undo for deletes.
- Light and dark mode.

---

## 10. Milestones

Complete in order. Stop after each for review.

- **M0 — Scaffold:** monorepo, Vite + React app with React Router, Tailwind + shadcn/ui, Supabase local dev, lint/format/type-check/test scripts, CI workflow.
- **M1 — Auth & households:** profiles, households, members, RLS helper, onboarding, household switcher.
- **M2 — Invites:** invite, accept, revoke, resend, leave household (incl. last-member deletion), Resend emails.
- **M3 — Expenses core:** categories (seeded), expenses CRUD, receipts upload/view/delete, storage policies, list with filters and search, soft delete + restore.
- **M4 — Expense insights:** summary dashboard, budgets, CSV export.
- **M5 — Recurring expenses:** definitions, pending entries, confirm/skip, daily job step 1.
- **M6 — Providers:** CRUD, contact links, provider page with spend totals, linking from expenses.
- **M7 — Tasks:** CRUD, recurrence logic, completion flow, "log an expense" prompt, task history.
- **M8 — Reminders & cleanup jobs:** remaining daily job steps, email templates, `reminder_logs`.
- **M9 — Activity log & polish:** activity feed, per-item history, PWA manifest, empty states, Playwright smoke tests for: sign up → create household → add expense with receipt → invite member → create task → complete → log expense.

---

## 11. Out of scope

### Planned for v2 — do not build in Phase 1
Home inventory · documents vault · floor plans · AI assistant · public provider marketplace · push notifications · the mobile app · payments or subscriptions.

Design Phase 1 so these can be added without rework: keep `packages/shared` platform-agnostic for the mobile app, and keep the storage path convention (`{household_id}/...`) reusable for documents and inventory photos.

### Not planned
Roles or permissions of any kind · removing other members · splitting/settling expenses · receipt OCR · multi-currency conversion.

---

## 12. Environment variables

```
# apps/web/.env  (exposed to the browser — public values only)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_APP_URL=

# Supabase Edge Function secrets (set with `supabase secrets set`)
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
EMAIL_FROM=
APP_URL=
```
