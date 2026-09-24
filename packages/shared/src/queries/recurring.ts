import { unwrap, type HomeClient } from '../client.ts'
import type { Tables } from '../database.types.ts'
import type { RecurringFrequency } from '../schemas/recurring.ts'
import { recurringExpenseInputSchema, type RecurringExpenseInput } from '../schemas/recurring.ts'

export type RecurringExpense = Omit<Tables<'recurring_expenses'>, 'frequency'> & {
  frequency: RecurringFrequency
}

export async function listRecurringExpenses(
  client: HomeClient,
  householdId: string,
): Promise<RecurringExpense[]> {
  const rows = unwrap(
    await client
      .from('recurring_expenses')
      .select('*')
      .eq('household_id', householdId)
      .order('is_active', { ascending: false })
      .order('next_due_on')
      .order('description'),
  )
  return rows as RecurringExpense[]
}

function toColumns(input: RecurringExpenseInput) {
  const parsed = recurringExpenseInputSchema.parse(input)
  return {
    description: parsed.description,
    amount_minor: parsed.amountMinor,
    category_id: parsed.categoryId,
    paid_by: parsed.paidBy,
    provider_id: parsed.providerId,
    frequency: parsed.frequency,
    interval_count: parsed.intervalCount,
    next_due_on: parsed.nextDueOn,
  }
}

/**
 * Creates a bill whose first occurrence is `nextDueOn` (which also anchors month-end dates), then
 * generates anything already due so it shows up for confirmation straight away.
 */
export async function createRecurringExpense(
  client: HomeClient,
  householdId: string,
  input: RecurringExpenseInput,
): Promise<void> {
  const columns = toColumns(input)
  unwrap(
    await client
      .from('recurring_expenses')
      .insert({ household_id: householdId, ...columns, start_on: columns.next_due_on }),
  )
  await generateDueRecurringExpenses(client, householdId)
}

/**
 * Updates a bill. Changing the next due date or the schedule re-anchors month-end handling to the
 * new next due date; other edits keep the original anchor (so a bill on the 31st stays on it).
 */
export async function updateRecurringExpense(
  client: HomeClient,
  existing: RecurringExpense,
  input: RecurringExpenseInput,
): Promise<void> {
  const columns = toColumns(input)
  const rescheduled =
    columns.next_due_on !== existing.next_due_on ||
    columns.frequency !== existing.frequency ||
    columns.interval_count !== existing.interval_count
  unwrap(
    await client
      .from('recurring_expenses')
      .update({ ...columns, ...(rescheduled && { start_on: columns.next_due_on }) })
      .eq('id', existing.id),
  )
  await generateDueRecurringExpenses(client, existing.household_id)
}

export async function setRecurringExpenseActive(
  client: HomeClient,
  id: string,
  isActive: boolean,
): Promise<void> {
  unwrap(await client.from('recurring_expenses').update({ is_active: isActive }).eq('id', id))
}

/** Deletes a bill. Expenses already created from it are kept. */
export async function deleteRecurringExpense(client: HomeClient, id: string): Promise<void> {
  unwrap(await client.from('recurring_expenses').delete().eq('id', id))
}

/** Creates pending expenses for this household's due bills now (the daily job also does this). */
export async function generateDueRecurringExpenses(
  client: HomeClient,
  householdId: string,
): Promise<number> {
  return unwrap(
    await client.rpc('generate_due_recurring_expenses', { p_household_id: householdId }),
  )
}
