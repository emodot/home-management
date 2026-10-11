import { ShoppingBasketIcon } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'

export function ShoppingListPage() {
  return (
    <EmptyState icon={ShoppingBasketIcon} title="Your list is empty">
      Add what you need. Everyone in the household sees the same list.
    </EmptyState>
  )
}
