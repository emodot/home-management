import { expenseFiltersToParams, parseExpenseFilters, type ExpenseFilters } from '@home/shared'

/**
 * The Expenses page shows one month at a time (what counts toward it), like Income, or every
 * month when asked (`?view=all`) or when filtering by dates. The URL leaves out the current month.
 */
export interface ExpenseView {
  /** The filters the list is loaded with: in month view they include `month`. */
  filters: ExpenseFilters
  /** The month shown, "2026-10"; null for all months. */
  month: string | null
}

export function expenseView(params: URLSearchParams, thisMonth: string): ExpenseView {
  const filters = parseExpenseFilters(Object.fromEntries(params))
  if (filters.month) return { filters, month: filters.month }
  if (params.get('view') === 'all' || filters.from || filters.to) {
    return { filters, month: null }
  }
  return { filters: { ...filters, month: thisMonth }, month: thisMonth }
}

/** Search params for filters shown for `month` (null for all months). */
export function expenseViewParams(
  filters: ExpenseFilters,
  month: string | null,
  thisMonth: string,
): Record<string, string> {
  const params = expenseFiltersToParams({
    ...filters,
    month: month === null || month === thisMonth ? undefined : month,
  })
  if (month === null && !filters.from && !filters.to) params.view = 'all'
  return params
}
