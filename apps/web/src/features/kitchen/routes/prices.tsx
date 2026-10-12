import {
  inMainUnits,
  formatDate,
  formatMoney,
  itemSearchKey,
  sortPriceSummaries,
  summarizePrices,
  unitLabel,
  type PriceSort,
} from '@home/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import { ChartLineIcon, ChevronRightIcon, SearchIcon } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { EmptyState } from '@/components/empty-state'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useActiveHousehold } from '@/hooks/use-household'
import { ManageItemsLink } from '../components/manage-items-link'
import { PriceChange } from '../components/price-change'
import { conversionsQuery, householdPricesQuery } from '../lib/queries'

const SORTS: { value: PriceSort; label: string }[] = [
  { value: 'recent', label: 'Recently bought' },
  { value: 'increase', label: 'Biggest increase' },
  { value: 'name', label: 'A–Z' },
]

export function PricesPage() {
  const household = useActiveHousehold()
  const bought = useSuspenseQuery(householdPricesQuery(household.id)).data
  const conversions = useSuspenseQuery(conversionsQuery(household.id)).data
  // Compared in each item's usual unit, other units joining in where they convert.
  const points = inMainUnits(bought, conversions)
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const sort: PriceSort = SORTS.find((s) => s.value === params.get('sort'))?.value ?? 'recent'

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  if (points.length === 0) {
    return (
      <EmptyState icon={ChartLineIcon} title="No prices yet">
        Prices appear after your first shopping trip, so you can see what's gone up and where it's
        cheapest.
      </EmptyState>
    )
  }

  const needle = itemSearchKey(q)
  const summaries = sortPriceSummaries(summarizePrices(points), sort).filter(
    (s) => !needle || itemSearchKey(s.name).includes(needle),
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
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
            onChange={(e) => set('q', e.target.value)}
          />
        </div>
        <Select
          value={sort}
          onValueChange={(value) => set('sort', value === 'recent' ? '' : value)}
        >
          <SelectTrigger className="w-44 shrink-0" aria-label="Sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {summaries.length === 0 ? (
        <EmptyState icon={SearchIcon} title="No matching items" size="sm">
          Try another name.
        </EmptyState>
      ) : (
        <ul className="stagger list-surface">
          {summaries.map((s) => (
            <li key={s.itemId}>
              <Link
                to={`/kitchen/prices/${s.itemId}`}
                className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-accent"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {s.latest.storeTag ?? 'No store'} · {formatDate(s.latest.boughtOn)}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-0.5">
                  <span className="font-semibold tabular-nums">
                    {formatMoney(s.latest.unitPriceMinor)}
                    <span className="text-xs font-normal text-muted-foreground">
                      /{unitLabel(s.latest.unit)}
                    </span>
                  </span>
                  <PriceChange change={s.change} />
                </span>
                <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <ManageItemsLink />
    </div>
  )
}
