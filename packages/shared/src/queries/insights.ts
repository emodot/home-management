import { unwrap, type HomeClient } from '../client.ts'
import { toCsv } from '../csv.ts'
import type { Tables } from '../database.types.ts'
import { fromMinor } from '../money.ts'
import type { ExpenseFilters } from '../schemas/expenses.ts'
import { listExpenses, type Expense } from './expenses.ts'

export type Budget = Tables<'budgets'>

export interface CategoryTotal {
  categoryId: string
  totalMinor: number
  expenseCount: number
}

/** Confirmed spending per category between two dates (inclusive). */
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

export async function listBudgets(client: HomeClient, householdId: string): Promise<Budget[]> {
  return unwrap(await client.from('budgets').select('*').eq('household_id', householdId))
}

/** Sets a category's monthly budget, or removes it with `null`. */
export async function setBudget(
  client: HomeClient,
  householdId: string,
  categoryId: string,
  amountMinor: number | null,
): Promise<void> {
  unwrap(
    await client.rpc('set_budget', {
      p_household_id: householdId,
      p_category_id: categoryId,
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
