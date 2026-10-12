import { useEffect, useRef } from 'react'
import { NavLink, useLocation } from 'react-router'
import { cn } from '@/lib/utils'

const TABS = [
  { to: '/kitchen', label: 'Overview', end: true },
  { to: '/kitchen/list', label: 'List' },
  { to: '/kitchen/pantry', label: 'Pantry' },
  { to: '/kitchen/prices', label: 'Prices' },
  { to: '/kitchen/gas', label: 'Gas' },
  { to: '/kitchen/recipes', label: 'Recipes' },
]

/**
 * The module's sections, as a row of tabs under the Kitchen heading. On a narrow screen the row
 * scrolls, kept so the current tab is in view.
 */
export function KitchenTabs() {
  const nav = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  useEffect(() => {
    const row = nav.current
    const active = row?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!row || !active) return
    const left = active.offsetLeft - row.offsetLeft
    const right = left + active.offsetWidth
    if (left < row.scrollLeft) row.scrollLeft = left - 16
    else if (right > row.scrollLeft + row.clientWidth) row.scrollLeft = right - row.clientWidth + 16
  }, [pathname])

  return (
    <nav
      ref={nav}
      aria-label="Kitchen"
      className="-mx-4 [scrollbar-width:none] overflow-x-auto overflow-y-hidden border-b px-4 md:mx-0 md:px-0"
    >
      <ul className="flex gap-1">
        {TABS.map((tab) => (
          <li key={tab.to}>
            <NavLink
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cn(
                  '-mb-px flex h-11 items-center border-b-2 border-transparent px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
                  isActive && 'border-primary text-primary hover:text-primary',
                )
              }
            >
              {tab.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
