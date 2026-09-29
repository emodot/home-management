import { formatMonth, monthOf } from '@home/shared'

/**
 * "For October" (or "For October 2027" in another year) when an expense counts toward a month
 * other than its payment date's; null otherwise.
 */
export function countsTowardLabel(expense: { occurredOn: string; budgetMonth: string }) {
  if (expense.budgetMonth === monthOf(expense.occurredOn)) return null
  const name = formatMonth(expense.budgetMonth)
  return `For ${expense.budgetMonth.slice(0, 4) === expense.occurredOn.slice(0, 4) ? name.replace(/ \d{4}$/, '') : name}`
}
