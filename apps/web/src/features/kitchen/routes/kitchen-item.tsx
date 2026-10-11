import { useSuspenseQuery } from '@tanstack/react-query'
import { ArrowLeftIcon, ChartLineIcon, PackageOpenIcon } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { useActiveHousehold } from '@/hooks/use-household'
import { kitchenItemQuery } from '../lib/queries'

function useItem() {
  const household = useActiveHousehold()
  const itemId = useParams().itemId ?? ''
  // The loader has already returned 404 for items that don't exist.
  return useSuspenseQuery(kitchenItemQuery(household.id, itemId)).data
}

function ItemHeading({ name, back, backLabel }: { name: string; back: string; backLabel: string }) {
  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="ghost" size="icon" className="-ml-2">
        <Link to={back} aria-label={backLabel}>
          <ArrowLeftIcon aria-hidden />
        </Link>
      </Button>
      <h2 className="text-xl font-semibold tracking-tight">{name}</h2>
    </div>
  )
}

export function PantryItemPage() {
  const item = useItem()
  return (
    <div className="flex flex-col gap-4">
      <ItemHeading
        name={item?.name ?? 'Item'}
        back="/kitchen/pantry"
        backLabel="Back to the pantry"
      />
      <EmptyState icon={PackageOpenIcon} title="Not in the pantry" size="sm">
        It shows up here after you buy it, with its expiry, location and price history.
      </EmptyState>
    </div>
  )
}

export function PriceHistoryPage() {
  const item = useItem()
  return (
    <div className="flex flex-col gap-4">
      <ItemHeading name={item?.name ?? 'Item'} back="/kitchen/prices" backLabel="Back to prices" />
      <EmptyState icon={ChartLineIcon} title="No prices yet" size="sm">
        Prices appear after you buy it on a shopping trip.
      </EmptyState>
    </div>
  )
}
