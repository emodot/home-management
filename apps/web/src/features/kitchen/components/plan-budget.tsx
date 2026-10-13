import {
  addDays,
  formatMoney,
  formatMonth,
  groceriesBudget,
  monthRange,
  weekCost,
  weekPots,
  weekShareOf,
  type MealEntry,
} from '@home/shared'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { BudgetMeter } from '@/components/budget-meter'
import { useActiveHousehold } from '@/hooks/use-household'
import { budgetsQuery, categoriesQuery, categoryTotalsQuery } from '@/lib/queries'
import { conversionsQuery, householdPricesQuery, planRecipesQuery } from '../lib/queries'

/**
 * The week's food: what its pots cost from the latest prices, against a week's share of the
 * Groceries budget, and how much of the month's Groceries budget is already spent.
 */
export function PlanBudget({ weekStart, meals }: { weekStart: string; meals: MealEntry[] }) {
  const household = useActiveHousehold()
  // The week counts toward the month its middle falls in.
  const midweek = addDays(weekStart, 3)
  const month = monthRange(midweek)
  const ids = [...new Set(meals.flatMap((m) => (m.recipeId && !m.leftoverOf ? [m.recipeId] : [])))]
  const recipes = useQuery(planRecipesQuery(household.id, ids)).data
  const prices = useQuery(householdPricesQuery(household.id)).data
  const conversions = useQuery(conversionsQuery(household.id)).data
  const categories = useQuery(categoriesQuery(household.id)).data
  const budgets = useQuery(budgetsQuery(household.id, month.from.slice(0, 7))).data
  const totals = useQuery(categoryTotalsQuery(household.id, month)).data

  if (
    ids.length === 0 ||
    !recipes ||
    !prices ||
    !conversions ||
    !categories ||
    !budgets ||
    !totals
  ) {
    return null
  }
  const pots = weekPots(meals, recipes)
  const cost = weekCost(pots, prices, conversions)
  const groceries = groceriesBudget(categories, budgets, totals)
  const share = groceries.budgetMinor === null ? null : weekShareOf(groceries.budgetMinor, midweek)
  const monthName = formatMonth(month.from.slice(0, 7)).split(' ')[0]

  return (
    <section
      className="grid gap-4 rounded-xl border px-4 py-3 sm:grid-cols-2"
      aria-labelledby="plan-budget-heading"
    >
      <div className="flex flex-col gap-1">
        <h3 id="plan-budget-heading" className="text-sm text-muted-foreground">
          This week&apos;s food, from the latest prices
        </h3>
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-xl font-semibold tabular-nums">
            {formatMoney(cost.totalMinor, household.currency)}
          </span>
          <span className="text-sm text-muted-foreground">
            for {pots.length} {pots.length === 1 ? 'pot' : 'pots'}
          </span>
        </p>
        {cost.unpriced.length > 0 && (
          <p className="text-xs text-muted-foreground">
            No price yet for {cost.unpriced.slice(0, 3).join(', ')}
            {cost.unpriced.length > 3 ? ` and ${cost.unpriced.length - 3} more` : ''}.
          </p>
        )}
        {share !== null && (
          <div className="mt-1 flex flex-col gap-1">
            <BudgetMeter
              spentMinor={cost.totalMinor}
              budgetMinor={share}
              currency={household.currency}
            />
            <p className="text-xs text-muted-foreground">
              Against a week&apos;s share of the Groceries budget:{' '}
              {formatMoney(share, household.currency)}
            </p>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-sm text-muted-foreground">Groceries in {monthName}</h3>
        {groceries.budgetMinor === null ? (
          <p className="text-sm">
            {formatMoney(groceries.spentMinor, household.currency)} spent; no Groceries budget.{' '}
            <Link
              to="/budgets"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Set one
            </Link>
          </p>
        ) : (
          <>
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-xl font-semibold tabular-nums">
                {formatMoney(groceries.spentMinor, household.currency)}
              </span>
              <span className="text-sm text-muted-foreground">
                spent of {formatMoney(groceries.budgetMinor, household.currency)}
              </span>
            </p>
            <BudgetMeter
              spentMinor={groceries.spentMinor}
              budgetMinor={groceries.budgetMinor}
              currency={household.currency}
            />
          </>
        )}
      </div>
    </section>
  )
}
