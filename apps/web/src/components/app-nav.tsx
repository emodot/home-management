import { PlusIcon } from 'lucide-react'
import { Link, NavLink, useLocation } from 'react-router'
import { BOTTOM_ITEMS, SIDEBAR_ITEMS, type NavItem } from '@/lib/nav'
import { cn } from '@/lib/utils'

function useIsActive() {
  const { pathname } = useLocation()
  return (item: NavItem) => (item.matches ? item.matches(pathname) : pathname.startsWith(item.to))
}

export function Sidebar() {
  const isActive = useIsActive()
  return (
    <nav
      aria-label="Main"
      className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-56 shrink-0 flex-col gap-1 border-r p-3 md:flex"
    >
      {SIDEBAR_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
            isActive(item) && 'bg-accent text-accent-foreground',
          )}
        >
          <item.icon className="size-4" aria-hidden />
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

export function BottomNav() {
  const isActive = useIsActive()
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <div className="flex h-16">
        {BOTTOM_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground',
              isActive(item) && 'text-foreground',
            )}
          >
            <item.icon className="size-5" aria-hidden />
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

/** Floating "add expense" button, hidden where it would be redundant. */
export function AddExpenseButton() {
  const { pathname } = useLocation()
  if (pathname === '/expenses/new' || pathname.endsWith('/edit')) return null
  return (
    <Link
      to="/expenses/new"
      aria-label="Add expense"
      className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus-visible:ring-4 focus-visible:ring-ring/50 focus-visible:outline-none md:right-8 md:bottom-8"
    >
      <PlusIcon className="size-6" aria-hidden />
    </Link>
  )
}
