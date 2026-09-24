import { formatDate, monthRange, yearRange, type Category, type ExpenseFilters } from '@home/shared'

export type Period = 'all' | 'this-month' | 'last-month' | 'this-year' | 'custom'

export function periodRange(period: Period, today: string) {
  switch (period) {
    case 'this-month':
      return monthRange(today)
    case 'last-month':
      return monthRange(today, -1)
    case 'this-year':
      return yearRange(today)
    default:
      return { from: undefined, to: undefined }
  }
}

export function periodOf(filters: ExpenseFilters, today: string): Period {
  if (!filters.from && !filters.to) return 'all'
  for (const period of ['this-month', 'last-month', 'this-year'] as const) {
    const range = periodRange(period, today)
    if (range.from === filters.from && range.to === filters.to) return period
  }
  return 'custom'
}

export const PERIOD_LABELS: Record<Period, string> = {
  all: 'All time',
  'this-month': 'This month',
  'last-month': 'Last month',
  'this-year': 'This year',
  custom: 'Custom dates',
}

export function describeFilters(
  filters: ExpenseFilters,
  {
    categories,
    memberNames,
    today,
  }: { categories: Map<string, Category>; memberNames: Map<string, string>; today: string },
) {
  const chips: { key: keyof ExpenseFilters | 'period'; label: string }[] = []
  const period = periodOf(filters, today)
  if (period === 'custom') {
    const from = filters.from ? formatDate(filters.from) : 'the start'
    const to = filters.to ? formatDate(filters.to) : 'today'
    chips.push({ key: 'period', label: `${from} – ${to}` })
  } else if (period !== 'all') {
    chips.push({ key: 'period', label: PERIOD_LABELS[period] })
  }
  if (filters.category) {
    chips.push({ key: 'category', label: categories.get(filters.category)?.name ?? 'Category' })
  }
  if (filters.paidBy) {
    chips.push({
      key: 'paidBy',
      label: `Paid by ${memberNames.get(filters.paidBy) ?? 'former member'}`,
    })
  }
  if (filters.receipt) {
    chips.push({
      key: 'receipt',
      label: filters.receipt === 'with' ? 'With receipt' : 'No receipt',
    })
  }
  return chips
}
