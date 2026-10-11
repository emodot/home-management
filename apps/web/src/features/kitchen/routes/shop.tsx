import { formatMoney, groupByStore, shoppingProgress, type ShoppingListItem } from '@home/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import { ArrowLeftIcon, ShoppingCartIcon, StoreIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { useActiveHousehold } from '@/hooks/use-household'
import { categoriesQuery, membersQuery } from '@/lib/queries'
import { FinishShoppingSheet } from '../components/finish-shopping-sheet'
import { OfflineBanner } from '../components/offline-banner'
import { PricePromptSheet } from '../components/price-prompt-sheet'
import { ShoppingModeRow } from '../components/shopping-mode-row'
import { useIsOnline } from '../hooks/use-is-online'
import { useShoppingList, useUpdateListEntry } from '../hooks/use-shopping-list'

/**
 * Shopping mode: the list as a checklist for the market, full screen. Checking something off
 * asks what was paid (skippable); the total so far stays at the bottom. Works offline.
 */
export function ShoppingModePage() {
  const household = useActiveHousehold()
  const list = useShoppingList(household.id)
  const entries = useUpdateListEntry(household.id)
  const categories = useSuspenseQuery(categoriesQuery(household.id)).data
  const members = useSuspenseQuery(membersQuery(household.id)).data
  const online = useIsOnline()
  const [pricingId, setPricingId] = useState<string | null>(null)
  // The checked entries when Finish was tapped (the sheet works on those, even if the list moves).
  const [finishing, setFinishing] = useState<ShoppingListItem[] | null>(null)

  const toBuy = list.filter((e) => !e.isChecked)
  const done = list.filter((e) => e.isChecked)
  const progress = shoppingProgress(list)
  const pricing = list.find((e) => e.id === pricingId) ?? null

  function check(id: string, checked: boolean) {
    entries.update(id, { isChecked: checked })
    if (checked) setPricingId(id)
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5 pb-24">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="-ml-2">
          <Link to="/kitchen/list" aria-label="Back to the list">
            <ArrowLeftIcon aria-hidden />
          </Link>
        </Button>
        <h1 className="flex-1 text-2xl font-semibold tracking-tight">Shopping</h1>
        {list.length > 0 && (
          <span className="text-sm text-muted-foreground tabular-nums">
            {progress.checked} of {progress.count}
          </span>
        )}
      </div>

      <OfflineBanner />

      {list.length === 0 ? (
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
      ) : (
        <>
          {toBuy.length === 0 && (
            <p className="rounded-xl bg-muted px-4 py-6 text-center font-medium">
              Everything's in the basket.
            </p>
          )}
          {groupByStore(toBuy).map((group) => (
            <section key={group.store ?? ''} className="flex flex-col gap-2">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                <StoreIcon className="size-4 text-muted-foreground" aria-hidden />
                {group.store ?? 'Anywhere'}
              </h2>
              <ul className="list-surface">
                {group.items.map((entry) => (
                  <ShoppingModeRow
                    key={entry.id}
                    entry={entry}
                    onCheck={(checked) => check(entry.id, checked)}
                    onPrice={() => setPricingId(entry.id)}
                  />
                ))}
              </ul>
            </section>
          ))}
          {done.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold">Done ({done.length})</h2>
              <ul className="list-surface">
                {done.map((entry) => (
                  <ShoppingModeRow
                    key={entry.id}
                    entry={entry}
                    onCheck={(checked) => check(entry.id, checked)}
                    onPrice={() => setPricingId(entry.id)}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {list.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto flex max-w-lg items-center gap-4 px-4 py-3">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-xs text-muted-foreground">Total so far</span>
              <span
                className="text-xl font-semibold tracking-tight tabular-nums"
                aria-live="polite"
              >
                {formatMoney(progress.totalMinor)}
              </span>
            </div>
            <span className="text-right text-xs text-muted-foreground">
              {progress.checked} of {progress.count} bought
              {progress.unpriced > 0 && (
                <span className="block">{progress.unpriced} without a price</span>
              )}
            </span>
            <Button
              size="lg"
              disabled={progress.checked === 0 || !online}
              onClick={() => setFinishing(done)}
            >
              Finish
            </Button>
          </div>
        </div>
      )}

      {!online && progress.checked > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          Finish shopping when you're back online: it saves the expense in one go.
        </p>
      )}

      <FinishShoppingSheet
        open={finishing !== null}
        entries={finishing ?? []}
        categories={categories}
        members={members}
        onClose={() => setFinishing(null)}
      />

      <PricePromptSheet
        entry={pricing}
        onSave={(price) => {
          if (pricing) entries.update(pricing.id, { pricePaidMinor: price })
        }}
        onClose={() => setPricingId(null)}
      />
    </div>
  )
}
