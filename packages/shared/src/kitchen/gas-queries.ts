import { unwrap, type HomeClient } from '../client.ts'
import type { GasRefill } from './gas.ts'

/** A logged refill, with who it was bought from. */
export interface GasRefillRecord extends GasRefill {
  id: string
  amountMinor: number
  providerId: string | null
  providerName: string | null
  expenseId: string | null
}

/** The household's refills, most recent first. */
export async function listGasRefills(
  client: HomeClient,
  householdId: string,
): Promise<GasRefillRecord[]> {
  const rows = unwrap(
    await client
      .from('gas_refills')
      .select('*, provider:providers(name)')
      .eq('household_id', householdId)
      .order('refilled_on', { ascending: false })
      .order('created_at', { ascending: false }),
  )
  return rows.map((r) => ({
    id: r.id,
    refilledOn: r.refilled_on,
    cylinderKg: typeof r.cylinder_kg === 'string' ? Number(r.cylinder_kg) : r.cylinder_kg,
    amountMinor: r.amount_minor,
    providerId: r.provider_id,
    providerName: r.provider?.name ?? null,
    expenseId: r.expense_id,
  }))
}

export interface LogGasRefillInput {
  refilledOn: string
  cylinderKg: number
  amountMinor: number
  paidBy: string
  providerId: string | null
  /** When the reminder task should be due, or null for no reminder. */
  reminderOn: string | null
}

/** Logs a refill with its Cooking Gas expense (and moves the reminder task, if asked). */
export async function logGasRefill(
  client: HomeClient,
  householdId: string,
  input: LogGasRefillInput,
): Promise<{ refillId: string; expenseId: string; taskId: string | null }> {
  const data = unwrap(
    await client.rpc('log_gas_refill', {
      p_household_id: householdId,
      p_refilled_on: input.refilledOn,
      p_cylinder_kg: input.cylinderKg,
      p_amount_minor: input.amountMinor,
      p_paid_by: input.paidBy,
      ...(input.providerId !== null && { p_provider_id: input.providerId }),
      ...(input.reminderOn !== null && { p_reminder_on: input.reminderOn }),
    }),
  ) as { refill_id: string; expense_id: string; task_id: string | null }
  return { refillId: data.refill_id, expenseId: data.expense_id, taskId: data.task_id }
}

/** Removes a refill logged by mistake; its expense goes to Recently deleted. */
export async function removeGasRefill(client: HomeClient, id: string): Promise<void> {
  unwrap(await client.rpc('remove_gas_refill', { p_refill_id: id }))
}
