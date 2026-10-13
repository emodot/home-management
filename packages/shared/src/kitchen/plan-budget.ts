import { topLevelId, type CategoryTotalLike } from '../category-tree.ts'
import { monthRange, type IsoDate } from '../dates.ts'
import { recipeCost, type ItemUnitConversion, type PurchasePrice } from './cook.ts'
import type { Pot } from './plan-list.ts'

/** What the week's pots cost, from the latest prices: optional extras and unpriced items aside. */
export function weekCost(
  pots: readonly Pot[],
  prices: readonly PurchasePrice[],
  conversions: readonly ItemUnitConversion[],
): { totalMinor: number; unpriced: string[] } {
  let totalMinor = 0
  const unpriced = new Set<string>()
  for (const pot of pots) {
    const cost = recipeCost(
      pot.recipe.ingredients,
      pot.recipe.servings,
      pot.servings,
      prices,
      conversions,
    )
    totalMinor += cost.totalMinor
    for (const i of cost.unpriced) unpriced.add(i.name)
  }
  return { totalMinor, unpriced: [...unpriced].sort((a, b) => a.localeCompare(b)) }
}

interface CategoryLike {
  id: string
  name: string
  parent_id: string | null
}

interface BudgetLike {
  category_id: string
  monthly_amount_minor: number
}

/**
 * The Groceries budget for a month and what's been spent against it: the budget on the
 * top-level "Groceries" category, or its sub-categories' budgets added up when it has none
 * itself. Null budget when there's none (or no Groceries category).
 */
export function groceriesBudget(
  categories: readonly CategoryLike[],
  budgets: readonly BudgetLike[],
  totals: readonly CategoryTotalLike[],
): { categoryId: string | null; budgetMinor: number | null; spentMinor: number } {
  const groceries = categories.find(
    (c) => c.parent_id === null && c.name.trim().toLowerCase() === 'groceries',
  )
  if (!groceries) return { categoryId: null, budgetMinor: null, spentMinor: 0 }
  const byId = new Map(categories.map((c) => [c.id, c]))
  const own = budgets.find((b) => b.category_id === groceries.id)
  const subs = budgets.filter(
    (b) => b.category_id !== groceries.id && topLevelId(b.category_id, byId) === groceries.id,
  )
  const budgetMinor = own
    ? own.monthly_amount_minor
    : subs.length > 0
      ? subs.reduce((sum, b) => sum + b.monthly_amount_minor, 0)
      : null
  const spentMinor = totals
    .filter((t) => topLevelId(t.categoryId, byId) === groceries.id)
    .reduce((sum, t) => sum + t.totalMinor, 0)
  return { categoryId: groceries.id, budgetMinor, spentMinor }
}

/** A week's share of a monthly amount: × 7 ÷ the days in the month `date` is in, to the naira. */
export function weekShareOf(monthlyMinor: number, date: IsoDate): number {
  const days = Number(monthRange(date).to.slice(8, 10))
  return Math.round((monthlyMinor * 7) / days / 100) * 100
}
