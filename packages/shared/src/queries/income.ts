import { unwrap, type HomeClient } from '../client.ts'
import type { Tables } from '../database.types.ts'
import { incomeInputSchema, type IncomeInput } from '../schemas/income.ts'

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
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

/** Income counting toward a month ("2026-10"), newest first. */
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
