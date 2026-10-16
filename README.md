# Lintel

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

### Receipt scanning

"Scan receipt" on Add expense reads a photo or PDF on the device and fills in the amount, date,
shop and (from the household's past expenses) category, leaving anything already typed alone.
Nothing is sent anywhere: PDFs with a text layer are read with pdf.js, and photos and scanned PDFs
with Tesseract.js OCR. The parser is `packages/shared/src/receipt-parser.ts`.

Picking several files at once (up to 20) opens a review screen with one draft expense per receipt
(`apps/web/src/components/receipt-batch.tsx`). They're read one after another with a single OCR
engine, likely duplicates (same amount and date as a logged expense or another receipt) are
flagged, and Save inserts them all in one request, so either every expense is saved or none is.
Receipts then upload in the background. Drafts live in memory only; leaving asks first.

The OCR engine and English data are copied from `node_modules` into
`apps/web/public/ocr/<versions>/` by a plugin in `apps/web/vite.config.ts` when the dev server or
a build starts. A browser downloads about 7 MB of it once (one 4 MB engine build for its
WebAssembly support, plus the 3 MB language model). These files and pdf.js aren't precached by
the service worker, so installs stay small; they're cached the first time someone scans.

### My Kitchen

`/kitchen` (code in `apps/web/src/features/kitchen/` and `packages/shared/src/kitchen/`) is built in
milestones. Everything hangs off the household's item catalogue (`kitchen_items`): one row per
item, matched by a normalised name so "Tomatoes" and "tomato" are the same item, with the unit
and store it's usually bought in. The shopping list (`shopping_list_items`) holds each item at
most once and updates live for everyone through Supabase Realtime (the table is in the
`supabase_realtime` publication). Changing an entry's unit or store makes it the item's default.

Shopping mode (`/kitchen/list/shop`, full screen) asks for the price of each line as it's checked
off; that whole-line price is what's stored (`price_paid_minor`), and a per-unit price is shown
where the quantity allows. It works without signal once open: checking off and pricing are applied
on screen at once and queued, one at a time, until the connection is back. The list and any queued
changes are saved on the device (IndexedDB, `apps/web/src/lib/persist.ts`), so changes made offline
are sent even if the app is closed first; signing out clears them. Opening the app from cold with no
signal isn't supported.

**Finish shopping** (shopping mode's footer) confirms the prices, the total actually paid, who
paid, the date, category (Groceries by default), store and an optional receipt photo, and which
lines go into the pantry. One database function, `finish_shopping_trip`, then does it all in one
transaction: the expense, a `shopping_trips` row, `item_prices` for priced lines, pantry stock in
`pantry_items` (added when the units combine, g↔kg and ml↔litre included, otherwise replaced by
what was bought), and removing the bought entries from the list. It refuses if any of them changed
meanwhile (e.g. someone else finished first), and needs a connection. The receipt uploads to the
new expense afterwards.

The **pantry** (`pantry_items`, live like the list) has location filters, a "Use soon" section
(expired or expiring within 3 days), and − / + steppers that save 500 ms after the last tap. Each
item can have a low-stock threshold: when its stock falls to or below it, a database trigger
(`pantry_low_stock_to_list`) puts it on the shopping list with its usual unit and store, once — if
it's already there, nothing changes.

**Prices** lists every item bought with a price: its latest per-unit price, the store, and the change
since the previous purchase, sortable by biggest increase. Prices are compared in the unit each
item is usually bought in; purchases in other units join in where they convert (see Items below),
and the rest are left out of the comparison. An item's page shows the cheapest store over the last 90 days and a line chart
of the per-unit price by store (`price-chart.tsx`, hand-drawn SVG: up to four stores, colours from
the `--series-*` tokens, a crosshair that also works with the arrow keys) above the full purchases
table, which is the chart's text alternative.

**Cooking gas** logs refills (date, cylinder kg, amount, vendor) through `log_gas_refill`, which
also records a "Cooking Gas" expense — a default category since this milestone, added to existing
households after Groceries — and, if asked, keeps one "Refill cooking gas" task (remembered in
`gas_reminders`) due 3 days before the predicted refill. The prediction (`kitchen/gas.ts`) is the
mean, over the last 3 intervals, of days between refills per kg of the earlier cylinder, times the
last cylinder's kg. Removing a refill (`remove_gas_refill`) sends its expense to Recently deleted.

**Items** (`/kitchen/items`, linked as "Manage items" from Pantry and Prices) is the catalogue
itself: rename an item (a name another item already has offers to merge the two instead), set its
usual unit and store, and say how its units relate ("1 bag = 50 kg", in `kitchen_item_units`).
Conversion (`kitchen_convert(item, …)` in the database, `convert()` in
`packages/shared/src/kitchen/units.ts`) follows g↔kg, ml↔litre and the item's own conversions both
ways, up to four steps, so a bag bought into a pantry kept in kg adds up. The page suggests pairs
that look like the same item (the same words in another order, or a one-letter typo). Merging
(`merge_kitchen_items`, one transaction) moves the other item's prices, conversions it doesn't
clash with, list entry and pantry stock to the item kept: quantities add up where the units
convert, otherwise the kept one's stays, notes are joined and the sooner use-by date wins. The
other item is then deleted, which can't be undone.

**Recipes** (`/kitchen/recipes`, the sixth tab) is the household's recipe box: title, one photo
(a private `recipe-photos` bucket, `{household_id}/{recipe_id}/{file}.jpg`, shrunk to 1600px on
the device), servings, prep and cook time, tags (a starter set — Soup, Stew, Swallow, Rice,
Breakfast, Snack, Party — plus the household's own), notes, steps and ingredients. Ingredients are
catalogue items with a quantity and unit (empty for "to taste"), an optional note and an "optional"
flag; merging catalogue items moves them too. `save_recipe` writes a recipe with its ingredients
and steps in one transaction. A recipe's page scales the ingredients to any number of servings
(`scaleAmount` in `packages/shared/src/kitchen/recipes.ts`): weights and volumes to two decimals in
g or kg (ml or litres), whichever reads better; counted things to the nearest half, marked ≈ with
the exact amount a tap away.

Each recipe's page also says whether you can cook it (`checkPantry` in
`packages/shared/src/kitchen/cook.ts`): every ingredient, for the servings shown, against the
pantry — in it, short (and by how much), not in it, or "check it" when the pantry holds it in a unit
that doesn't convert (not counted missing; the item's page can say how its units relate). "Add
missing to list" reviews what's short (optional ingredients unticked, anything the list already
covers unticked) and `add_recipe_to_list` puts it on the list for that recipe (source `recipe`,
shown as "for Jollof rice"): an item already on the list is topped up to what's needed when the
units convert, never added twice. The **cost per pot** comes from each ingredient's latest price in
a unit that converts, for the servings shown, with the change since 3 months ago (over the
ingredients priced both times) and a chart of the estimate at the end of each of the last six
months; ingredients without a price are listed rather than guessed.

The **meal plan** (`/kitchen/plan`, the seventh tab; `/kitchen/plan/:weekStart` for a week) runs
Sunday to Saturday (`meal_plans`, one per household and week). Each meal (`meal_plan_entries`) is a
recipe or something written in ("Eat out"), in one of the household's slots — breakfast, lunch and
dinner by default; household admins can turn snack on or any slot off (`households.meal_slots`,
`set_meal_slots`). Wide screens get the week as a grid; phones get a day at a time, swiped through.
**Batch cooking**: a recipe meal can also cover later meals that week, as leftovers (`leftover_of`
points at the meal whose pot feeds them), so its ingredients count once and its pot is for everyone
it feeds. Meals are added, given leftovers and copied from last week (into an empty week, batches
and all) through `add_meal`, `set_meal_leftovers` and `copy_meal_week`, which keep each meal in its
week and leftovers after their pot; the plan updates live for everyone through Realtime.

**Shopping list** on the plan reviews what the week still needs (`planNeeds` in
`packages/shared/src/kitchen/plan-list.ts`): the pots still to cook — from today on for this week,
the whole of a later week — each for everyone it feeds (leftovers counted in their pot, so a pot's
ingredients count once), with the pantry taken off once across them, one line per item and the
recipes it's for. Stock in a unit that doesn't convert is listed to check rather than counted.
`add_plan_to_list` puts what's ticked on the list for that week's plan (shown as "for the meal
plan"), merging with the list exactly as a recipe's "Add missing to list" does (both use
`put_on_list`): an item already there is topped up to what's needed, never added twice.

**Cooked it** — on a recipe's page (for the servings shown) and on a planned pot (for everyone it
feeds) — reviews what comes out of the pantry (`cookLines` in `kitchen/cook.ts`; optional
ingredients unticked; anything not in the pantry, or held in a unit that doesn't convert, can't be
taken) and `cook_recipe` takes it out, never below zero, marking a planned pot cooked
(`meal_plan_entries.cooked_at`) so the week's shopping stops counting it. Running low puts items on
the list as usual. The toast's Undo (`uncook`) puts the amounts back and unmarks the pot. The plan
also weighs the week against the budget (`kitchen/plan-budget.ts`): its pots' cost from the latest
prices against a week's share (× 7 ÷ days in the month) of the Groceries budget — the budget on
Groceries itself, or its sub-categories' added up — and how much of that month's Groceries budget
is spent.

## Deployment

The backend is a hosted Supabase project; the frontend is a static site on Vercel.

### 1. Supabase

```bash
supabase link --project-ref <ref>
supabase db push                 # apply supabase/migrations
supabase functions deploy        # send-invite, accept-invite, revoke-invite, leave-household, daily-jobs
supabase secrets set APP_URL=https://<your-domain> RESEND_API_KEY=<key> \
  EMAIL_FROM="Lintel <no-reply@your-verified-domain>" CRON_SECRET=<long random string>
```

Then add the two Vault secrets from [Daily jobs](#daily-jobs), and under Authentication → URL
Configuration set the site URL to `https://<your-domain>` and add
`https://<your-domain>/auth/callback` to the redirect URLs. Resend only delivers from a verified
domain.

### 2. Vercel

Import the GitHub repo into Vercel and set the root directory to `apps/web` (Vercel installs
the whole pnpm workspace and builds with `vite build`). `apps/web/vercel.json` sets the SPA
fallback, security headers and cache headers. Add these environment
variables (Production):

| Variable                 | Value                           |
| ------------------------ | ------------------------------- |
| `VITE_SUPABASE_URL`      | `https://<ref>.supabase.co`     |
| `VITE_SUPABASE_ANON_KEY` | the project's anon (public) key |

The build fails if either is missing. Sign-in links return to whichever site sent them, so a
deployment's domain must be in Supabase's redirect URLs (see step 1) for sign-in to work there.

## Scripts

| Command          | What it does                                                                          |
| ---------------- | ------------------------------------------------------------------------------------- |
| `pnpm dev`       | Run the web app                                                                       |
| `pnpm build`     | Production build of all packages                                                      |
| `pnpm lint`      | ESLint (type-aware) across the repo                                                   |
| `pnpm format`    | Prettier write (`format:check` to verify)                                             |
| `pnpm typecheck` | `tsc` in every package                                                                |
| `pnpm test`      | Vitest: `packages/shared`, and component tests in `apps/web` (jsdom, Testing Library) |
| `pnpm check`     | format:check + lint + typecheck + test                                                |
| `pnpm db:start`  | Start local Supabase (`db:stop` to stop)                                              |
| `pnpm db:reset`  | Re-apply migrations + `supabase/seed.sql`                                             |
| `pnpm db:lint`   | Lint the database schema                                                              |
| `pnpm db:types`  | Generate DB types into `packages/shared`                                              |
| `pnpm e2e`       | Playwright smoke tests (see below)                                                    |

### Smoke tests

`pnpm e2e` runs the Playwright smoke test against the local stack: a super-admin creates a
household and an admin invite → the household admin signs up through it → the welcome tour shows, is
skipped and stays away after a reload, with the Expenses tour taking its turn → the getting-started checklist ticks off from the household's data → expense with receipt →
invites by email and by link, with a member joining (and seeing no invite controls) → that member sees the shopping list change live, including changes made in shopping mode while offline, and finishing the trip into an expense → running low in the pantry adds to the list once → a second trip shows the price change → two gas refills predict the next with a reminder task → task →
complete → scan a receipt PDF to log the expense → scan two at once → profile and password change → sign back in. It needs `pnpm db:start`, the
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
