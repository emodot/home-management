import { Outlet } from 'react-router'
import { KitchenTabs } from '../components/kitchen-tabs'

/** Kitchen heading and section tabs around each section's page. */
export function KitchenLayout() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Kitchen</h1>
        <KitchenTabs />
      </div>
      <Outlet />
    </div>
  )
}
