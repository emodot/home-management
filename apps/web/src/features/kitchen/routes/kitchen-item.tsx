import {
  cheapestRecentStore,
  formatDate,
  formatMoney,
  formatQuantity,
  inMainUnits,
  mainUnit,
  priceSeries,
  summarizePrices,
  todayIn,
  unitLabel,
} from '@home/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import { ChartLineIcon } from 'lucide-react'
import { useId } from 'react'
import { EmptyState } from '@/components/empty-state'
import { useActiveHousehold } from '@/hooks/use-household'
import { ItemHeading } from '../components/item-heading'
import { PriceChange } from '../components/price-change'
import { PriceChart } from '../components/price-chart'
import { useCatalogItem } from '../hooks/use-catalog-item'
import { conversionsQuery, householdPricesQuery } from '../lib/queries'

/** One item's prices: the latest, the change, the cheapest store lately, a chart and the table. */
export function PriceHistoryPage() {
  const household = useActiveHousehold()
  const { itemId, item } = useCatalogItem()
  const all = useSuspenseQuery(householdPricesQuery(household.id)).data
  const conversions = useSuspenseQuery(conversionsQuery(household.id)).data
  const bought = all.filter((p) => p.itemId === itemId)
  const tableId = useId()
  const name = item?.name ?? 'Item'
  // Charted and compared in the unit it's usually bought in; other units join in where the
  // item's conversions allow (1 bag = 50 kg).
  const unit = mainUnit(bought)
  const points = inMainUnits(bought, conversions)
  const [summary] = summarizePrices(points)

  if (!summary || !unit) {
    return (
      <div className="flex flex-col gap-4">
        <ItemHeading
          name={name}
          back="/kitchen/prices"
          backLabel="Back to prices"
          itemId={itemId}
        />
        <EmptyState icon={ChartLineIcon} title="No prices yet" size="sm">
          Prices appear after you buy it on a shopping trip.
        </EmptyState>
      </div>
    )
  }

  const { latest } = summary
  const per = unitLabel(unit)
  const cheapest = cheapestRecentStore(points, unit, todayIn(household.timezone))
  const { series, otherStores, otherUnits } = priceSeries(points, unit)

  return (
    <div className="flex flex-col gap-6">
      <ItemHeading name={name} back="/kitchen/prices" backLabel="Back to prices" itemId={itemId} />

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        <div className="flex flex-col gap-0.5">
          <dt className="text-sm text-muted-foreground">Latest, per {unitLabel(latest.unit)}</dt>
          <dd className="text-2xl font-semibold tracking-tight tabular-nums">
            {formatMoney(latest.unitPriceMinor)}
          </dd>
          <dd>
            <PriceChange change={summary.change} />
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-sm text-muted-foreground">Last bought</dt>
          <dd className="font-medium">{formatDate(latest.boughtOn)}</dd>
          <dd className="text-sm text-muted-foreground">{latest.storeTag ?? 'No store'}</dd>
        </div>
        {cheapest && (
          <div className="flex flex-col gap-0.5">
            <dt className="text-sm text-muted-foreground">Cheapest lately</dt>
            <dd className="font-medium">{cheapest.store}</dd>
            <dd className="text-sm text-muted-foreground tabular-nums">
              {formatMoney(cheapest.unitPriceMinor)}/{per}
            </dd>
          </div>
        )}
      </dl>

      {points.filter((p) => p.unit === unit).length > 1 ? (
        <PriceChart series={series} unit={unit} tableId={tableId} />
      ) : (
        <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          The chart starts after you've bought it twice.
        </p>
      )}
      {(otherStores > 0 || otherUnits > 0) && (
        <p className="-mt-3 text-xs text-muted-foreground">
          {[
            otherStores > 0 &&
              `${otherStores} more ${otherStores === 1 ? 'store is' : 'stores are'} only in the table`,
            otherUnits > 0 &&
              `${otherUnits} ${otherUnits === 1 ? 'purchase' : 'purchases'} in other units ${otherUnits === 1 ? "isn't" : "aren't"} charted`,
          ]
            .filter(Boolean)
            .join('; ')}
          .
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Purchases</h3>
        <div className="overflow-x-auto rounded-xl bg-muted">
          <table id={tableId} className="w-full text-sm">
            <caption className="sr-only">Every time {name} was bought, most recent first</caption>
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  When and where
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Paid
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Per {per}
                </th>
              </tr>
            </thead>
            <tbody className="[&>tr]:border-t [&>tr]:border-background">
              {points.map((p, i) => (
                <tr key={p.id}>
                  <td className="px-3 py-2">
                    <span className="block whitespace-nowrap">{formatDate(p.boughtOn)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {p.storeTag ?? 'No store'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                    {formatMoney(p.priceMinor)}
                    <span className="block text-xs text-muted-foreground">
                      {formatQuantity(bought[i]?.quantity ?? p.quantity, bought[i]?.unit ?? p.unit)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                    {p.unit === unit ? (
                      formatMoney(p.unitPriceMinor)
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {formatMoney(p.unitPriceMinor)}/{unitLabel(p.unit)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
