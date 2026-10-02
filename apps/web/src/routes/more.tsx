import { ChevronRightIcon, LogOutIcon, UserRoundIcon } from 'lucide-react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { ThemeSwitcher } from '@/components/theme-menu'
import { useIsHouseholdAdmin } from '@/hooks/use-household'
import { SIDEBAR_ITEMS } from '@/lib/nav'
import { signOut } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'

const rowClass =
  'flex w-full items-center gap-3 px-4 py-3.5 text-left font-medium transition-colors hover:bg-accent'

export function MorePage() {
  const isAdmin = useIsHouseholdAdmin()
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">More</h1>
      <ul className="list-surface">
        <li>
          <Link to="/profile" className={rowClass}>
            <UserRoundIcon className="size-5 text-muted-foreground" aria-hidden />
            <span className="flex-1">Profile</span>
            <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      </ul>
      <ul className="list-surface">
        {SIDEBAR_ITEMS.filter(
          (item) =>
            !['/', '/tasks', '/providers'].includes(item.to) && (isAdmin || !item.adminOnly),
        ).map((item) => (
          <li key={item.to}>
            <Link to={item.to} className={rowClass}>
              <item.icon className="size-5 text-muted-foreground" aria-hidden />
              <span className="flex-1">{item.label}</span>
              <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Appearance</h2>
        <ThemeSwitcher />
      </section>
      <ul className="list-surface">
        <li>
          <button
            type="button"
            className={rowClass}
            onClick={() =>
              void signOut().catch((error: unknown) => toast.error(errorMessage(error)))
            }
          >
            <LogOutIcon className="size-5 text-muted-foreground" aria-hidden />
            Sign out
          </button>
        </li>
      </ul>
    </div>
  )
}
