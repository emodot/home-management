import { unwrap, type HomeClient } from '../client.ts'
import { toCsv } from '../csv.ts'
import type { Tables } from '../database.types.ts'
import { fromMinor } from '../money.ts'
import type { ExpenseFilters } from '../schemas/expenses.ts'
import { listExpenses, type Expense } from './expenses.ts'

/** A budget in force in a month (from budgets_for_month, so it always has an amount). */
export type Budget = Tables<'budgets'> & { monthly_amount_minor: number }

export interface CategoryTotal {
  categoryId: string
  totalMinor: number
  expenseCount: number
}

/**
 * Confirmed spending per category for the months from `range.from`'s month to `range.to`, by the
 * month each expense counts toward (pass whole months).
 */
export async function getCategoryTotals(
  client: HomeClient,
  householdId: string,
  range: { from: string; to: string },
): Promise<CategoryTotal[]> {
  const rows = unwrap(
    await client.rpc('expense_category_totals', {
      p_household_id: householdId,
      p_from: range.from,
      p_to: range.to,
    }),
  )
  return rows.map((r) => ({
    categoryId: r.category_id,
    totalMinor: r.total_minor,
    expenseCount: r.expense_count,
  }))
}

/** The budgets in force in a month ("2026-10"): each category's latest change up to then. */
export async function listBudgets(
  client: HomeClient,
  householdId: string,
  month: string,
): Promise<Budget[]> {
  const rows = unwrap(
    await client.rpc('budgets_for_month', { p_household_id: householdId, p_month: `${month}-01` }),
  )
  return rows.filter((b): b is Budget => b.monthly_amount_minor !== null)
}

/**
 * Sets a category's budget from `month` onward (until its next change), or removes it from then
 * on with `null`. Only this month and later can be changed.
 */
export async function setBudget(
  client: HomeClient,
  householdId: string,
  categoryId: string,
  month: string,
  amountMinor: number | null,
): Promise<void> {
  unwrap(
    await client.rpc('set_budget', {
      p_household_id: householdId,
      p_category_id: categoryId,
      p_month: `${month}-01`,
      p_amount_minor: amountMinor,
    }),
  )
}

/** Every expense matching the filters (all pages), for export. */
export async function listAllExpenses(
  client: HomeClient,
  householdId: string,
  filters: ExpenseFilters,
): Promise<Expense[]> {
  const pageSize = 1000
  const all: Expense[] = []
  for (let offset = 0; ; offset += pageSize) {
    const page = await listExpenses(client, householdId, filters, { offset, limit: pageSize })
    all.push(...page)
    if (page.length < pageSize) return all
  }
}

export function expensesToCsv(
  expenses: Expense[],
  names: {
    category: (id: string) => string
    person: (userId: string | null) => string
    provider: (id: string | null) => string
  },
): string {
  return toCsv([
    [
      'Date',
      'Counts toward',
      'Description',
      'Category',
      'Amount',
      'Currency',
      'Paid by',
      'Provider',
      'Notes',
      'Receipts',
      'Added by',
      'Added at',
    ],
    ...expenses.map((e) => [
      e.occurredOn,
      e.budgetMonth,
      e.description,
      names.category(e.categoryId),
      fromMinor(e.amountMinor, e.currency, { fixed: true }),
      e.currency,
      names.person(e.paidBy),
      names.provider(e.providerId),
      e.notes,
      e.receiptCount,
      names.person(e.createdBy),
      e.createdAt,
    ]),
  ])
}
