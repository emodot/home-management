import { topLevelId, type CategoryTotalLike } from '../category-tree.ts'

interface CategoryLike {
  id: string
  name: string
  parent_id: string | null
}

/** Expense categories that count as food spending, matched by name (with their sub-categories). */
export const FOOD_CATEGORY_NAMES = ['Groceries', 'Cooking Gas'] as const

/** The household's food categories: top-level ones named in FOOD_CATEGORY_NAMES. */
export function foodCategoryIds(categories: CategoryLike[]): string[] {
  const names = new Set(FOOD_CATEGORY_NAMES.map((n) => n.toLowerCase()))
  return categories
    .filter((c) => c.parent_id === null && names.has(c.name.trim().toLowerCase()))
    .map((c) => c.id)
}

/** Spending in the food categories and their sub-categories. */
export function foodSpendMinor(totals: CategoryTotalLike[], categories: CategoryLike[]): number {
  const food = new Set(foodCategoryIds(categories))
  const byId = new Map(categories.map((c) => [c.id, c]))
  return totals
    .filter((t) => food.has(topLevelId(t.categoryId, byId)))
    .reduce((sum, t) => sum + t.totalMinor, 0)
}
