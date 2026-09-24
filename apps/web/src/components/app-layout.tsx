import { Outlet } from 'react-router'
import { AccountMenu } from './account-menu'
import { HouseholdSwitcher } from './household-switcher'

export function AppLayout() {
  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-2 px-4">
          <HouseholdSwitcher />
          <AccountMenu />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </>
  )
}
