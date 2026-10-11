import { ChartLineIcon } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { ItemHeading } from '../components/item-heading'
import { useCatalogItem } from '../hooks/use-catalog-item'

export function PriceHistoryPage() {
  const { item } = useCatalogItem()
  return (
    <div className="flex flex-col gap-4">
      <ItemHeading name={item?.name ?? 'Item'} back="/kitchen/prices" backLabel="Back to prices" />
      <EmptyState icon={ChartLineIcon} title="No prices yet" size="sm">
        Prices appear after you buy it on a shopping trip.
      </EmptyState>
    </div>
  )
}
