import { unwrap, type HomeClient } from '../client.ts'
import type { Tables } from '../database.types.ts'
import { expenseInputSchema, type ExpenseFilters, type ExpenseInput } from '../schemas/expenses.ts'

export const EXPENSE_PAGE_SIZE = 50

export interface Expense {
  id: string
  householdId: string
  amountMinor: number
  currency: string
  occurredOn: string
  categoryId: string
  description: string
  notes: string | null
  paidBy: string | null
  status: 'confirmed' | 'pending'
  createdBy: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  receiptCount: number
  /** Set when the expense was generated from a recurring bill. */
  recurringExpenseId: string | null
}

type ExpenseListRow = Tables<'expense_list'>

// View columns are nullable in the generated types; these are never null for real rows.
function required<T>(value: T | null, column: string): T {
  if (value === null) throw new Error(`expense_list.${column} was null`)
  return value
}

export function toExpense(row: ExpenseListRow): Expense {
  return {
    id: required(row.id, 'id'),
    householdId: required(row.household_id, 'household_id'),
    amountMinor: required(row.amount_minor, 'amount_minor'),
    currency: required(row.currency, 'currency'),
    occurredOn: required(row.occurred_on, 'occurred_on'),
    categoryId: required(row.category_id, 'category_id'),
    description: required(row.description, 'description'),
    notes: row.notes,
    paidBy: row.paid_by,
    status: row.status === 'pending' ? 'pending' : 'confirmed',
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: required(row.created_at, 'created_at'),
    updatedAt: required(row.updated_at, 'updated_at'),
    deletedAt: row.deleted_at,
    receiptCount: row.receipt_count ?? 0,
    recurringExpenseId: row.recurring_expense_id,
  }
}

/** Escapes LIKE wildcards so a search for "50%" matches literally. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/** One page of the household's confirmed, non-deleted expenses, newest first. */
export async function listExpenses(
  client: HomeClient,
  householdId: string,
  filters: ExpenseFilters,
  page: { offset: number; limit?: number } = { offset: 0 },
): Promise<Expense[]> {
  const limit = page.limit ?? EXPENSE_PAGE_SIZE
  let query = client
    .from('expense_list')
    .select('*')
    .eq('household_id', householdId)
    .eq('status', 'confirmed')
    .is('deleted_at', null)

  if (filters.from) query = query.gte('occurred_on', filters.from)
  if (filters.to) query = query.lte('occurred_on', filters.to)
  if (filters.category) query = query.eq('category_id', filters.category)
  if (filters.paidBy) query = query.eq('paid_by', filters.paidBy)
  if (filters.receipt === 'with') query = query.gt('receipt_count', 0)
  if (filters.receipt === 'without') query = query.eq('receipt_count', 0)
  if (filters.q) query = query.ilike('search_text', `%${escapeLike(filters.q)}%`)

  const rows = unwrap(
    await query
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id')
      .range(page.offset, page.offset + limit - 1),
  )
  return rows.map(toExpense)
}

/** Pending expenses generated from recurring bills, oldest due first. */
export async function listPendingExpenses(
  client: HomeClient,
  householdId: string,
): Promise<Expense[]> {
  const rows = unwrap(
    await client
      .from('expense_list')
      .select('*')
      .eq('household_id', householdId)
      .eq('status', 'pending')
      .is('deleted_at', null)
      .order('occurred_on')
      .order('description'),
  )
  return rows.map(toExpense)
}

/** Confirms a pending expense, optionally correcting the amount. */
export async function confirmExpense(
  client: HomeClient,
  id: string,
  amountMinor?: number,
): Promise<void> {
  unwrap(
    await client
      .from('expenses')
      .update({
        status: 'confirmed',
        ...(amountMinor !== undefined && { amount_minor: amountMinor }),
      })
      .eq('id', id),
  )
}

/** An expense by id, including deleted ones (for restore and the detail page). */
export async function getExpense(client: HomeClient, id: string): Promise<Expense | null> {
  const row = unwrap(await client.from('expense_list').select('*').eq('id', id).maybeSingle())
  return row ? toExpense(row) : null
}

function toColumns(input: ExpenseInput) {
  const parsed = expenseInputSchema.parse(input)
  return {
    amount_minor: parsed.amountMinor,
    occurred_on: parsed.occurredOn,
    category_id: parsed.categoryId,
    description: parsed.description,
    paid_by: parsed.paidBy,
    notes: parsed.notes,
  }
}

/** Creates an expense and returns its id. */
export async function createExpense(
  client: HomeClient,
  householdId: string,
  input: ExpenseInput,
): Promise<string> {
  const row = unwrap(
    await client
      .from('expenses')
      .insert({ household_id: householdId, ...toColumns(input) })
      .select('id')
      .single(),
  )
  return row.id
}

export async function updateExpense(
  client: HomeClient,
  id: string,
  input: ExpenseInput,
): Promise<void> {
  unwrap(await client.from('expenses').update(toColumns(input)).eq('id', id))
}

/** Soft delete (deleted = true) or restore. Deleted expenses are purged after 30 days. */
export async function setExpenseDeleted(
  client: HomeClient,
  id: string,
  deleted: boolean,
): Promise<void> {
  unwrap(
    await client
      .from('expenses')
      .update({ deleted_at: deleted ? new Date().toISOString() : null })
      .eq('id', id),
  )
}

export interface DeletedItems {
  expenses: Expense[]
  receipts: (Tables<'expense_receipts'> & { expense: { description: string } })[]
}

/** Expenses and receipts deleted in the last `days` days, most recent first. */
export async function listRecentlyDeleted(
  client: HomeClient,
  householdId: string,
  days = 30,
): Promise<DeletedItems> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const [expenses, receipts] = await Promise.all([
    client
      .from('expense_list')
      .select('*')
      .eq('household_id', householdId)
      .gte('deleted_at', since)
      .order('deleted_at', { ascending: false }),
    client
      .from('expense_receipts')
      // Only receipts whose expense still exists; a deleted expense brings its receipts back.
      .select('*, expense:expenses!inner(description, deleted_at)')
      .eq('household_id', householdId)
      .gte('deleted_at', since)
      .is('expense.deleted_at', null)
      .order('deleted_at', { ascending: false }),
  ])
  return {
    expenses: unwrap(expenses).map(toExpense),
    receipts: unwrap(receipts).map((r) => ({
      ...r,
      expense: { description: r.expense.description },
    })),
  }
}
