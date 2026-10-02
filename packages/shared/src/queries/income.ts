import { unwrap, type HomeClient } from '../client.ts'
import type { Tables } from '../database.types.ts'
import {
  incomeInputSchema,
  recurringIncomeInputSchema,
  type IncomeInput,
  type RecurringIncomeInput,
} from '../schemas/income.ts'
import type { RecurringFrequency } from '../schemas/recurring.ts'

/** Money coming into the household. Only household admins can see or record it. */
export interface Income {
  id: string
  householdId: string
  amountMinor: number
  currency: string
  receivedOn: string
  /** The month it counts toward, "2026-10". */
  budgetMonth: string
  source: string
  notes: string | null
  receivedBy: string | null
  /** Pending entries come from recurring income and wait to be confirmed or skipped. */
  status: 'confirmed' | 'pending'
  recurringIncomeId: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export function toIncome(row: Tables<'income'>): Income {
  return {
    id: row.id,
    householdId: row.household_id,
    amountMinor: row.amount_minor,
    currency: row.currency,
    receivedOn: row.received_on,
    budgetMonth: row.budget_month.slice(0, 7),
    source: row.source,
    notes: row.notes,
    receivedBy: row.received_by,
    status: row.status === 'pending' ? 'pending' : 'confirmed',
    recurringIncomeId: row.recurring_income_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

/** Confirmed income counting toward a month ("2026-10"), newest first. */
export async function listIncome(
  client: HomeClient,
  householdId: string,
  month: string,
): Promise<Income[]> {
  const rows = unwrap(
    await client
      .from('income')
      .select('*')
      .eq('household_id', householdId)
      .eq('budget_month', `${month}-01`)
      .eq('status', 'confirmed')
      .is('deleted_at', null)
      .order('received_on', { ascending: false })
      .order('created_at', { ascending: false }),
  )
  return rows.map(toIncome)
}

/** One entry by id, including a deleted one. */
export async function getIncome(client: HomeClient, id: string): Promise<Income | null> {
  const row = unwrap(await client.from('income').select('*').eq('id', id).maybeSingle())
  return row ? toIncome(row) : null
}

/** Income deleted since `since` (ISO timestamp), most recent first. */
export async function listDeletedIncome(
  client: HomeClient,
  householdId: string,
  since: string,
): Promise<Income[]> {
  const rows = unwrap(
    await client
      .from('income')
      .select('*')
      .eq('household_id', householdId)
      .gte('deleted_at', since)
      .order('deleted_at', { ascending: false }),
  )
  return rows.map(toIncome)
}

function toColumns(input: IncomeInput) {
  const parsed = incomeInputSchema.parse(input)
  return {
    amount_minor: parsed.amountMinor,
    received_on: parsed.receivedOn,
    source: parsed.source,
    received_by: parsed.receivedBy,
    notes: parsed.notes,
    ...(parsed.budgetMonth && { budget_month: `${parsed.budgetMonth}-01` }),
  }
}

export async function createIncome(
  client: HomeClient,
  householdId: string,
  input: IncomeInput,
): Promise<string> {
  const row = unwrap(
    await client
      .from('income')
      .insert({ household_id: householdId, ...toColumns(input) })
      .select('id')
      .single(),
  )
  return row.id
}

export async function updateIncome(client: HomeClient, id: string, input: IncomeInput) {
  unwrap(await client.from('income').update(toColumns(input)).eq('id', id))
}

/** Soft delete (deleted = true) or restore. Deleted income is purged after 30 days. */
export async function setIncomeDeleted(client: HomeClient, id: string, deleted: boolean) {
  unwrap(
    await client
      .from('income')
      .update({ deleted_at: deleted ? new Date().toISOString() : null })
      .eq('id', id),
  )
}

export interface MonthTotal {
  /** "2026-10" */
  month: string
  totalMinor: number
  count: number
}

/** Income per month it counts toward, for the months from `range.from`'s to `range.to`. */
export async function getIncomeTotals(
  client: HomeClient,
  householdId: string,
  range: { from: string; to: string },
): Promise<MonthTotal[]> {
  const rows = unwrap(
    await client.rpc('income_totals', {
      p_household_id: householdId,
      p_from: range.from,
      p_to: range.to,
    }),
  )
  return rows.map((r) => ({
    month: r.month.slice(0, 7),
    totalMinor: r.total_minor,
    count: r.entry_count,
  }))
}

/** Pending income from recurring income, oldest pay day first. */
export async function listPendingIncome(
  client: HomeClient,
  householdId: string,
): Promise<Income[]> {
  const rows = unwrap(
    await client
      .from('income')
      .select('*')
      .eq('household_id', householdId)
      .eq('status', 'pending')
      .is('deleted_at', null)
      .order('received_on')
      .order('source'),
  )
  return rows.map(toIncome)
}

/** Confirms pending income, optionally correcting the amount. Skipping is a soft delete. */
export async function confirmIncome(
  client: HomeClient,
  id: string,
  amountMinor?: number,
): Promise<void> {
  unwrap(
    await client
      .from('income')
      .update({
        status: 'confirmed',
        ...(amountMinor !== undefined && { amount_minor: amountMinor }),
      })
      .eq('id', id),
  )
}

// ---------------------------------------------------------------- recurring income

export type RecurringIncome = Omit<Tables<'recurring_income'>, 'frequency'> & {
  frequency: RecurringFrequency
}

export async function listRecurringIncome(
  client: HomeClient,
  householdId: string,
): Promise<RecurringIncome[]> {
  const rows = unwrap(
    await client
      .from('recurring_income')
      .select('*')
      .eq('household_id', householdId)
      .order('is_active', { ascending: false })
      .order('next_due_on')
      .order('source'),
  )
  return rows as RecurringIncome[]
}

function toRecurringColumns(input: RecurringIncomeInput) {
  const parsed = recurringIncomeInputSchema.parse(input)
  return {
    source: parsed.source,
    amount_minor: parsed.amountMinor,
    received_by: parsed.receivedBy,
    frequency: parsed.frequency,
    interval_count: parsed.intervalCount,
    next_due_on: parsed.nextDueOn,
    for_next_month: parsed.forNextMonth,
  }
}

/** Creates pending income for this household's due recurring income now (the daily job also does). */
export async function generateDueRecurringIncome(
  client: HomeClient,
  householdId: string,
): Promise<number> {
  return unwrap(await client.rpc('generate_due_recurring_income', { p_household_id: householdId }))
}

/**
 * Creates recurring income whose first pay day is `nextDueOn` (which also anchors month-end
 * dates), then generates anything already due so it shows up for confirmation straight away.
 */
export async function createRecurringIncome(
  client: HomeClient,
  householdId: string,
  input: RecurringIncomeInput,
): Promise<void> {
  const columns = toRecurringColumns(input)
  unwrap(
    await client
      .from('recurring_income')
      .insert({ household_id: householdId, ...columns, start_on: columns.next_due_on }),
  )
  await generateDueRecurringIncome(client, householdId)
}

/** Same re-anchoring rule as updateRecurringExpense. */
export async function updateRecurringIncome(
  client: HomeClient,
  existing: RecurringIncome,
  input: RecurringIncomeInput,
): Promise<void> {
  const columns = toRecurringColumns(input)
  const rescheduled =
    columns.next_due_on !== existing.next_due_on ||
    columns.frequency !== existing.frequency ||
    columns.interval_count !== existing.interval_count
  unwrap(
    await client
      .from('recurring_income')
      .update({ ...columns, ...(rescheduled && { start_on: columns.next_due_on }) })
      .eq('id', existing.id),
  )
  await generateDueRecurringIncome(client, existing.household_id)
}

export async function setRecurringIncomeActive(client: HomeClient, id: string, isActive: boolean) {
  unwrap(await client.from('recurring_income').update({ is_active: isActive }).eq('id', id))
}

/** Deletes recurring income. Entries it already created are kept. */
export async function deleteRecurringIncome(client: HomeClient, id: string) {
  unwrap(await client.from('recurring_income').delete().eq('id', id))
}
