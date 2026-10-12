import { itemSearchKey, likelyDuplicates, unitLabel } from '@home/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import { ChevronRightIcon, CopyIcon, PackageIcon, SearchIcon } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { EmptyState } from '@/components/empty-state'
import { Input } from '@/components/ui/input'
import { useActiveHousehold } from '@/hooks/use-household'
import { ItemHeading } from '../components/item-heading'
import { OnListBadge } from '../components/pantry-badges'
import { catalogQuery, pantryQuery, shoppingListQuery } from '../lib/queries'

/** The household's catalogue: every item, to rename, give units to, or merge when duplicated. */
export function ItemsPage() {
  const household = useActiveHousehold()
  const items = useSuspenseQuery(catalogQuery(household.id)).data
  const list = useSuspenseQuery(shoppingListQuery(household.id)).data
  const pantry = useSuspenseQuery(pantryQuery(household.id)).data
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''

  const onList = new Set(list.map((e) => e.itemId))
  const inPantry = new Set(pantry.map((p) => p.itemId))
  const needle = itemSearchKey(q)
  const shown = items.filter((i) => !needle || itemSearchKey(i.name).includes(needle))
  const duplicates = needle ? [] : likelyDuplicates(items)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <ItemHeading name="Items" back="/kitchen/pantry" backLabel="Back to the pantry" />
        <p className="text-sm text-muted-foreground">
          Everything you've put on the list or in the pantry. Rename items, say how their units
          relate, and merge ones that are the same thing.
        </p>
      </div>

      {items.length > 0 && (
        <div className="relative">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            placeholder="Search items"
            aria-label="Search items"
            className="pl-9"
            value={q}
            onChange={(e) => {
              const next = new URLSearchParams(params)
              if (e.target.value) next.set('q', e.target.value)
              else next.delete('q')
              setParams(next, { replace: true })
            }}
          />
        </div>
      )}

      {duplicates.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <CopyIcon className="size-4 text-muted-foreground" aria-hidden />
            Might be the same item
          </h3>
          <ul className="list-surface">
            {duplicates.map(([a, b]) => (
              <li key={`${a.id}-${b.id}`}>
                <Link
                  to={`/kitchen/items/${a.id}?merge=${b.id}`}
                  className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-accent"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {a.name} <span className="text-muted-foreground">and</span> {b.name}
                  </span>
                  <span className="text-sm font-medium text-primary">Review</span>
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {items.length === 0 ? (
        <EmptyState icon={PackageIcon} title="No items yet">
          Items are added the first time you put something on the list or in the pantry.
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState icon={SearchIcon} title="No matching items" size="sm">
          Try another name.
        </EmptyState>
      ) : (
        <section className="flex flex-col gap-2">
          {duplicates.length > 0 && <h3 className="text-sm font-semibold">All items</h3>}
          <ul className="list-surface">
            {shown.map((item) => (
              <li key={item.id}>
                <Link
                  to={`/kitchen/items/${item.id}`}
                  className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-accent"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      By the {unitLabel(item.defaultUnit)}
                      {item.defaultStoreTag ? ` · ${item.defaultStoreTag}` : ''}
                      {item.priceCount > 0 &&
                        ` · ${item.priceCount} ${item.priceCount === 1 ? 'price' : 'prices'}`}
                    </span>
                  </span>
                  <span className="flex flex-wrap justify-end gap-1">
                    {onList.has(item.id) && <OnListBadge />}
                    {inPantry.has(item.id) && (
                      <span className="inline-flex items-center rounded-full bg-background px-2 py-0.5 text-xs font-medium whitespace-nowrap text-muted-foreground">
                        In the pantry
                      </span>
                    )}
                  </span>
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
