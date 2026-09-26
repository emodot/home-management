import { formatDate, formatRelativeTime, type AdminAction } from '@home/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import { LogOutIcon, ShieldIcon, UserRoundIcon } from 'lucide-react'
import { Suspense } from 'react'
import { Link, NavLink, Outlet, useRouteLoaderData } from 'react-router'
import { toast } from 'sonner'
import { StatTile } from '@/components/admin'
import { PageSkeleton } from '@/components/page-skeleton'
import { Button } from '@/components/ui/button'
import { signOut } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { adminOverviewQuery } from '@/lib/queries'
import type { adminLoader } from './loaders'

const TABS = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/users', label: 'Users', end: false },
  { to: '/admin/households', label: 'Households', end: false },
  { to: '/admin/admins', label: 'Super-admins', end: false },
]

/** The operator admin area: its own header and tabs, outside any household. */
export function AdminLayout() {
  const admin = useRouteLoaderData<typeof adminLoader>('admin')
  // Until a new admin replaces their temporary password, only the account page is available.
  const locked = admin?.mustChangePassword === true

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 pt-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold">
              <ShieldIcon className="size-5" aria-hidden />
              Admin
            </div>
            <div className="flex items-center gap-1">
              <span className="hidden text-sm text-muted-foreground sm:inline">{admin?.email}</span>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/admin/account">
                  <UserRoundIcon aria-hidden />
                  Account
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void signOut().catch((error: unknown) => toast.error(errorMessage(error)))
                }
              >
                <LogOutIcon aria-hidden />
                Sign out
              </Button>
            </div>
          </div>
          <nav
            className={cn('-mb-px flex gap-4 overflow-x-auto', locked && 'invisible')}
            aria-label="Admin sections"
          >
            {TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  cn(
                    'border-b-2 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'border-foreground text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}

export function AdminOverviewPage() {
  const overview = useSuspenseQuery(adminOverviewQuery()).data

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile
          label="Users"
          value={overview.users}
          note={`${overview.newUsers30d.toLocaleString('en-NG')} new in 30 days`}
        />
        <StatTile
          label="Households"
          value={overview.households}
          note={`${overview.activeHouseholds30d.toLocaleString('en-NG')} active in 30 days`}
        />
        <StatTile label="Expenses" value={overview.expenses} />
        <StatTile label="Tasks" value={overview.tasks} />
        <StatTile label="Providers" value={overview.providers} />
      </div>
      <SignupsChart weeks={overview.signupsByWeek} />
      <section className="flex flex-col gap-3 rounded-xl border p-4 sm:p-5">
        <h2 className="font-semibold">Recent admin actions</h2>
        {overview.recentActions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No admin actions yet.</p>
        ) : (
          <ol className="divide-y">
            {overview.recentActions.map((action) => (
              <li key={action.id} className="flex flex-wrap justify-between gap-x-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{action.adminName ?? 'A former admin'}</span>{' '}
                  {describeAction(action)}
                </span>
                <time className="text-muted-foreground" dateTime={action.createdAt}>
                  {formatRelativeTime(action.createdAt)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

function describeAction({ action, details }: AdminAction): string {
  const text = (key: string) => {
    const value = details?.[key]
    return typeof value === 'string' ? value : 'unknown'
  }
  switch (action) {
    case 'disable_user':
      return `disabled ${text('email')}`
    case 'enable_user':
      return `re-enabled ${text('email')}`
    case 'send_password_reset':
      return `sent a password reset to ${text('email')}`
    case 'delete_user':
      return `deleted the account ${text('email')}`
    case 'rename_household':
      return `renamed a household to “${text('name')}”`
    case 'delete_household':
      return `deleted the household “${text('name')}”`
    default:
      return action.replaceAll('_', ' ')
  }
}

/**
 * Weekly sign-ups as columns: one series, so no legend (the title names it). Each column shows its
 * value on hover or focus, and the same numbers are available as a table.
 */
function SignupsChart({ weeks }: { weeks: { week: string; count: number }[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.count))
  const total = weeks.reduce((sum, w) => sum + w.count, 0)
  const weekLabel = (week: string) => formatDate(week, { day: 'numeric', month: 'short' })
  const signups = (n: number) => `${n.toLocaleString('en-NG')} sign-up${n === 1 ? '' : 's'}`

  return (
    <section className="flex flex-col gap-4 rounded-xl border p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Sign-ups per week</h2>
        <span className="text-sm text-muted-foreground">{signups(total)} in the last 12 weeks</span>
      </div>
      <ol className="flex h-40 items-end gap-0.5 border-b" aria-label="Sign-ups per week">
        {weeks.map((w, i) => (
          <li
            key={w.week}
            tabIndex={0}
            aria-label={`Week of ${weekLabel(w.week)}: ${signups(w.count)}`}
            className="group flex h-full flex-1 flex-col justify-end outline-none"
          >
            <span
              className={cn(
                'relative block rounded-t-[4px] bg-viz-bar transition-opacity group-hover:opacity-80 group-focus-visible:opacity-80',
                w.count > 0 && 'min-h-0.5',
              )}
              style={{ height: `${(w.count / max) * 100}%` }}
            >
              {/* Just above the bar; outer columns align inwards so it stays on screen. */}
              <span
                className={cn(
                  'pointer-events-none absolute bottom-full z-10 mb-1 hidden rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-sm group-hover:block group-focus-visible:block',
                  i < 3 ? 'left-0' : i > weeks.length - 4 ? 'right-0' : 'left-1/2 -translate-x-1/2',
                )}
              >
                Week of {weekLabel(w.week)}: <span className="font-semibold">{w.count}</span>
              </span>
            </span>
          </li>
        ))}
      </ol>
      <div className="-mt-2 flex justify-between text-xs text-muted-foreground" aria-hidden>
        <span>{weeks[0] ? weekLabel(weeks[0].week) : ''}</span>
        <span>This week</span>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Show as a table</summary>
        <table className="mt-2 w-full max-w-xs text-left">
          <thead>
            <tr className="text-muted-foreground">
              <th className="py-1 font-medium">Week of</th>
              <th className="py-1 text-right font-medium">Sign-ups</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.week} className="border-t">
                <td className="py-1">{weekLabel(w.week)}</td>
                <td className="py-1 text-right tabular-nums">{w.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  )
}
