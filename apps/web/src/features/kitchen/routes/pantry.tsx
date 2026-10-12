import {
  isPantryLocation,
  LOCATION_LABELS,
  PANTRY_LOCATIONS,
  todayIn,
  itemsToUseSoon,
  type KitchenItem,
  type PantryItem,
  type PantryLocation,
} from '@home/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import { ClockAlertIcon, PackageOpenIcon } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { EmptyState } from '@/components/empty-state'
import { useActiveHousehold } from '@/hooks/use-household'
import { cn } from '@/lib/utils'
import { ItemAutocomplete } from '../components/item-autocomplete'
import { ManageItemsLink } from '../components/manage-items-link'
import { PantryRow } from '../components/pantry-row'
import {
  useAddToPantry,
  useAdjustPantryQty,
  useMarkRunningLow,
  usePantry,
  useRemovePantryItem,
} from '../hooks/use-pantry'
import { shoppingListQuery } from '../lib/queries'

type Tab = PantryLocation | 'all'

export function PantryPage() {
  const household = useActiveHousehold()
  const pantry = usePantry(household.id)
  const list = useSuspenseQuery(shoppingListQuery(household.id)).data
  const step = useAdjustPantryQty(household.id)
  const add = useAddToPantry(household.id)
  const remove = useRemovePantryItem(household.id)
  const runningLow = useMarkRunningLow(household.id)
  const [params, setParams] = useSearchParams()
  const where = params.get('in') ?? ''
  const tab: Tab = isPantryLocation(where) ? where : 'all'
  const today = todayIn(household.timezone)

  const onList = new Set(list.map((e) => e.itemId))
  const here = tab === 'all' ? pantry : pantry.filter((i) => i.location === tab)
  const soon = itemsToUseSoon(here, today)
  const soonIds = new Set(soon.map((i) => i.id))
  const rest = here.filter((i) => !soonIds.has(i.id))

  function setTab(next: Tab) {
    const p = new URLSearchParams(params)
    if (next === 'all') p.delete('in')
    else p.set('in', next)
    setParams(p, { replace: true })
  }

  function onAdd(item: KitchenItem) {
    add.mutate(
      { item, location: tab === 'all' ? 'pantry' : tab },
      {
        onSuccess: ({ status, item: added }) => {
          if (status === 'exists') toast(`${added.name} is already in the pantry`)
        },
      },
    )
  }

  const row = (item: PantryItem) => (
    <PantryRow
      key={item.id}
      item={item}
      today={today}
      onList={onList.has(item.itemId)}
      showLocation={tab === 'all'}
      onStep={(quantity) => step(item, quantity)}
      onRunningLow={() => runningLow.mutate(item)}
      onRemove={() => remove.mutate(item)}
    />
  )

  return (
    <div className="flex flex-col gap-4">
      <ItemAutocomplete
        onSelect={onAdd}
        label="Add to the pantry"
        placeholder="Add something you have…"
      />

      <div
        className="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 md:mx-0 md:px-0"
        role="group"
        aria-label="Where it's kept"
      >
        {(['all', ...PANTRY_LOCATIONS] as const).map((t) => {
          const count = t === 'all' ? pantry.length : pantry.filter((i) => i.location === t).length
          return (
            <button
              key={t}
              type="button"
              aria-pressed={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap transition-colors hover:bg-accent',
                tab === t && 'border-primary bg-primary/10 text-primary hover:bg-primary/15',
              )}
            >
              {t === 'all' ? 'All' : LOCATION_LABELS[t]}
              <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
            </button>
          )
        })}
      </div>

      {pantry.length === 0 ? (
        <EmptyState icon={PackageOpenIcon} title="Track what's in your kitchen">
          Add what you have above. Shopping trips fill it in too, and anything that runs low goes on
          the shopping list.
        </EmptyState>
      ) : here.length === 0 ? (
        <EmptyState
          icon={PackageOpenIcon}
          title={`Nothing in the ${LOCATION_LABELS[tab as PantryLocation].toLowerCase()}`}
          size="sm"
        >
          Add something above, or move an item here from its page.
        </EmptyState>
      ) : (
        <>
          {soon.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                <ClockAlertIcon className="size-4 text-muted-foreground" aria-hidden />
                Use soon
              </h2>
              <ul className="list-surface">{soon.map(row)}</ul>
            </section>
          )}
          {rest.length > 0 && (
            <section className="flex flex-col gap-2">
              {soon.length > 0 && <h2 className="text-sm font-semibold">Everything else</h2>}
              <ul className="list-surface">{rest.map(row)}</ul>
            </section>
          )}
        </>
      )}
      <ManageItemsLink />
    </div>
  )
}
