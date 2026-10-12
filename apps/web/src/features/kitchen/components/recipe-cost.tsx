import {
  costByMonth,
  costChange,
  formatDate,
  formatMoney,
  formatQuantity,
  recipeCost,
  type ItemUnitConversion,
  type PricePoint,
  type Recipe,
} from '@home/shared'
import { useId } from 'react'
import { PriceChange } from './price-change'
import { PriceChart } from './price-chart'

/**
 * Cost per pot: the latest price of each ingredient for the servings shown, the change since 3
 * months ago, a month-by-month chart, and how each ingredient's cost was worked out.
 */
export function RecipeCost({
  recipe,
  servings,
  prices,
  conversions,
  today,
}: {
  recipe: Recipe
  servings: number
  prices: PricePoint[]
  conversions: ItemUnitConversion[]
  today: string
}) {
  const tableId = useId()
  const args = [recipe.ingredients, recipe.servings, servings, prices, conversions] as const
  const cost = recipeCost(...args)
  const priced = cost.lines.filter((l) => l.costMinor !== null)

  if (priced.length === 0) {
    return (
      <section className="flex flex-col gap-1">
        <h3 className="font-semibold">Cost per pot</h3>
        <p className="text-sm text-muted-foreground">
          None of its ingredients has a price yet. Prices come from your shopping trips.
        </p>
      </section>
    )
  }

  const change = costChange(...args, today)
  const months = costByMonth(...args, today)

  return (
    <section className="flex flex-col gap-3" aria-labelledby="cost-heading">
      <h3 id="cost-heading" className="font-semibold">
        Cost per pot
      </h3>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-muted-foreground">
            About, for {servings} {servings === 1 ? 'serving' : 'servings'}
          </span>
          <span className="text-2xl font-semibold tracking-tight tabular-nums">
            {formatMoney(cost.totalMinor)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 text-sm">
          <span className="text-muted-foreground">A serving</span>
          <span className="font-medium tabular-nums">
            {formatMoney(Math.round(cost.totalMinor / servings))}
          </span>
        </div>
        {change && (
          <div className="flex flex-col gap-0.5 text-sm">
            <span className="text-muted-foreground">Since 3 months ago</span>
            <span className="flex items-center gap-2">
              <PriceChange change={change.change} />
              <span className="text-xs text-muted-foreground tabular-nums">
                was {formatMoney(change.thenMinor)}
              </span>
            </span>
          </div>
        )}
      </div>
      {(cost.unpriced.length > 0 || cost.optionalMinor > 0) && (
        <p className="text-sm text-muted-foreground">
          {cost.unpriced.length > 0 &&
            `Not counted, no price yet: ${cost.unpriced.map((i) => i.name).join(', ')}. `}
          {cost.optionalMinor > 0 &&
            `Optional extras add about ${formatMoney(cost.optionalMinor)}.`}
        </p>
      )}

      {months.length > 1 && (
        <>
          <PriceChart
            series={[
              {
                store: null,
                points: months.map((m) => ({ date: m.date, unitPriceMinor: m.totalMinor })),
              },
            ]}
            unit="pcs"
            tableId={tableId}
            caption={`Estimated cost for ${servings} servings, with the prices known at the end of each month`}
          />
          <table id={tableId} className="sr-only">
            <caption>Estimated cost by month</caption>
            <tbody>
              {months.map((m) => (
                <tr key={m.date}>
                  <th scope="row">{formatDate(m.date)}</th>
                  <td>{formatMoney(m.totalMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <details className="group rounded-xl bg-muted px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium">How it&apos;s worked out</summary>
        <ul className="mt-2 flex flex-col gap-2 pb-1">
          {cost.lines
            .filter((l) => l.ingredient.quantity !== null)
            .map((l) => (
              <li key={l.ingredient.id} className="flex items-baseline gap-3">
                <span className="min-w-0 flex-1">
                  {l.ingredient.name}
                  {l.ingredient.isOptional && (
                    <span className="text-muted-foreground"> (optional)</span>
                  )}
                  <span className="block text-xs text-muted-foreground">
                    {l.basedOn
                      ? `${formatMoney(l.basedOn.priceMinor)} for ${formatQuantity(l.basedOn.quantity, l.basedOn.unit)}, ${formatDate(l.basedOn.boughtOn)}`
                      : 'No price in a unit that converts'}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {l.costMinor === null ? '—' : formatMoney(Math.round(l.costMinor))}
                </span>
              </li>
            ))}
        </ul>
      </details>
    </section>
  )
}
