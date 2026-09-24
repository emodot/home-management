import { Suspense } from 'react'
import { Outlet } from 'react-router'
import {
  ActiveHouseholdContext,
  pickActiveHousehold,
  useHouseholds,
  useProfile,
} from '@/hooks/use-household'
import { AccountMenu } from './account-menu'
import { AddExpenseButton, BottomNav, Sidebar } from './app-nav'
import { FullPageSpinner } from './full-page-spinner'
import { PageSkeleton } from './page-skeleton'
import { HouseholdSwitcher } from './household-switcher'

export function AppLayout() {
  const profile = useProfile()
  const households = useHouseholds()
  const active = pickActiveHousehold(profile, households)

  // Momentarily undefined after leaving the last household, until the loader redirects.
  if (!active) return <FullPageSpinner />

  return (
    <ActiveHouseholdContext value={active}>
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-2 px-4">
          <HouseholdSwitcher />
          <AccountMenu />
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-6xl">
        <Sidebar />
        <main className="min-w-0 flex-1 px-4 pt-6 pb-28 md:px-8 md:pb-10">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <BottomNav />
      <AddExpenseButton />
    </ActiveHouseholdContext>
  )
}
