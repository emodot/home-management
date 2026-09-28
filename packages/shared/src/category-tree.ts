/**
 * Sub-categories are one level deep: a category has a parent_id, or is top-level. Insights,
 * filters and a parent's budget roll sub-categories up into their parent.
 */

interface CategoryLike {
  id: string
  name: string
  parent_id: string | null
}

export interface CategoryNode<C extends CategoryLike> {
  category: C
  children: C[]
}

/**
 * Top-level categories, each with its sub-categories, keeping the given order (callers pass
 * categories already in display order). A sub-category whose parent is missing is shown at the
 * top level rather than lost.
 */
export function categoryTree<C extends CategoryLike>(categories: C[]): CategoryNode<C>[] {
  const ids = new Set(categories.map((c) => c.id))
  const nodes = new Map<string, CategoryNode<C>>()
  for (const c of categories) {
    if (c.parent_id === null || !ids.has(c.parent_id))
      nodes.set(c.id, { category: c, children: [] })
  }
  for (const c of categories) {
    if (c.parent_id !== null && ids.has(c.parent_id)) nodes.get(c.parent_id)?.children.push(c)
  }
  return [...nodes.values()]
}

/** The top-level category an id rolls up into (itself when it is top-level). */
export function topLevelId(id: string, byId: ReadonlyMap<string, CategoryLike>): string {
  const parent = byId.get(id)?.parent_id
  return parent && byId.has(parent) ? parent : id
}

/** "Utilities › Borehole" for a sub-category, "Utilities" for a top-level one. */
export function categoryPath(
  id: string,
  byId: ReadonlyMap<string, CategoryLike>,
  unknown = 'Unknown',
): string {
  const category = byId.get(id)
  if (!category) return unknown
  const parent = category.parent_id ? byId.get(category.parent_id) : undefined
  return parent ? `${parent.name} › ${category.name}` : category.name
}

export interface CategoryTotalLike {
  categoryId: string
  totalMinor: number
  expenseCount: number
}

export interface RolledUpTotal extends CategoryTotalLike {
  /** Spending on each sub-category, largest first. Spending on the parent itself isn't listed. */
  children: CategoryTotalLike[]
}

/** Per-category totals rolled up into their top-level categories, largest first. */
export function rollUpTotals(
  totals: CategoryTotalLike[],
  byId: ReadonlyMap<string, CategoryLike>,
): RolledUpTotal[] {
  const rolled = new Map<string, RolledUpTotal>()
  for (const t of totals) {
    const top = topLevelId(t.categoryId, byId)
    const entry = rolled.get(top) ?? {
      categoryId: top,
      totalMinor: 0,
      expenseCount: 0,
      children: [],
    }
    entry.totalMinor += t.totalMinor
    entry.expenseCount += t.expenseCount
    if (top !== t.categoryId) entry.children.push({ ...t })
    rolled.set(top, entry)
  }
  const byTotal = (a: CategoryTotalLike, b: CategoryTotalLike) => b.totalMinor - a.totalMinor
  return [...rolled.values()]
    .map((r) => ({ ...r, children: r.children.sort(byTotal) }))
    .sort(byTotal)
}

/**
 * What counts against each category's budget: a top-level category's own spending plus its
 * sub-categories', and a sub-category's own spending.
 */
export function spendingByCategory(
  totals: CategoryTotalLike[],
  byId: ReadonlyMap<string, CategoryLike>,
): Map<string, number> {
  const spent = new Map<string, number>()
  const add = (id: string, minor: number) => spent.set(id, (spent.get(id) ?? 0) + minor)
  for (const t of totals) {
    const top = topLevelId(t.categoryId, byId)
    add(top, t.totalMinor)
    if (top !== t.categoryId) add(t.categoryId, t.totalMinor)
  }
  return spent
}

/**
 * The household's total monthly budget. A sub-category's budget is part of its parent's when the
 * parent has one too, so it's only counted on its own when the parent has none.
 */
export function totalBudgetMinor(
  budgets: { category_id: string; monthly_amount_minor: number }[],
  byId: ReadonlyMap<string, CategoryLike>,
): number {
  const budgeted = new Set(budgets.map((b) => b.category_id))
  return budgets.reduce((sum, b) => {
    const top = topLevelId(b.category_id, byId)
    return top !== b.category_id && budgeted.has(top) ? sum : sum + b.monthly_amount_minor
  }, 0)
}
