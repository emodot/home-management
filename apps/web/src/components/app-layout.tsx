import { Suspense } from 'react'
import { Outlet } from 'react-router'
import {
  ActiveHouseholdContext,
  pickActiveHousehold,
  useHouseholds,
  useProfile,
} from '@/hooks/use-household'
import { AccountMenu } from './account-menu'
import { FullPageSpinner } from './full-page-spinner'
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
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-2 px-4">
          <HouseholdSwitcher />
          <AccountMenu />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <Suspense fallback={<FullPageSpinner />}>
          <Outlet />
        </Suspense>
      </main>
    </ActiveHouseholdContext>
  )
}
