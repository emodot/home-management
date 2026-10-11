import { ArrowLeftIcon, ShoppingCartIcon } from 'lucide-react'
import { Link } from 'react-router'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'

/** Shopping mode: the list as a checklist for the market, without the module's tabs. */
export function ShoppingModePage() {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="-ml-2">
          <Link to="/kitchen/list" aria-label="Back to the list">
            <ArrowLeftIcon aria-hidden />
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Shopping</h1>
      </div>
      <EmptyState
        icon={ShoppingCartIcon}
        title="Nothing to buy"
        action={
          <Button asChild variant="outline">
            <Link to="/kitchen/list">Go to the list</Link>
          </Button>
        }
      >
        Add items to your shopping list first.
      </EmptyState>
    </div>
  )
}
