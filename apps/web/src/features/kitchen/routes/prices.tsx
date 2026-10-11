import { ChartLineIcon } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'

export function PricesPage() {
  return (
    <EmptyState icon={ChartLineIcon} title="No prices yet">
      Prices appear after your first shopping trip, so you can see what's gone up and where it's
      cheapest.
    </EmptyState>
  )
}
