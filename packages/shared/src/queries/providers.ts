import { unwrap, type HomeClient } from '../client.ts'
import type { Tables } from '../database.types.ts'
import {
  providerInputSchema,
  type ProviderInput,
  type ProviderTrade,
} from '../schemas/providers.ts'

export type Provider = Omit<Tables<'providers'>, 'trade'> & { trade: ProviderTrade }

/** All providers, deleted ones included (callers filter; old expenses still show their names). */
export async function listProviders(client: HomeClient, householdId: string): Promise<Provider[]> {
  const rows = unwrap(
    await client.from('providers').select('*').eq('household_id', householdId).order('name'),
  )
  return rows as Provider[]
}

function toColumns(input: ProviderInput) {
  const p = providerInputSchema.parse(input)
  return {
    name: p.name,
    trade: p.trade,
    phone: p.phone,
    whatsapp: p.whatsapp,
    email: p.email,
    area: p.area,
    notes: p.notes,
    rating: p.rating,
  }
}

export async function createProvider(
  client: HomeClient,
  householdId: string,
  input: ProviderInput,
): Promise<Provider> {
  const row = unwrap(
    await client
      .from('providers')
      .insert({ household_id: householdId, ...toColumns(input) })
      .select('*')
      .single(),
  )
  return row as Provider
}

export async function updateProvider(
  client: HomeClient,
  id: string,
  input: ProviderInput,
): Promise<void> {
  unwrap(await client.from('providers').update(toColumns(input)).eq('id', id))
}

/** Soft delete (deleted = true) or restore. Deleted providers are purged after 30 days. */
export async function setProviderDeleted(
  client: HomeClient,
  id: string,
  deleted: boolean,
): Promise<void> {
  unwrap(
    await client
      .from('providers')
      .update({ deleted_at: deleted ? new Date().toISOString() : null })
      .eq('id', id),
  )
}

export interface ProviderTotal {
  providerId: string
  totalMinor: number
  expenseCount: number
}

/** Confirmed spending per provider; omit the range for all time. */
export async function getProviderTotals(
  client: HomeClient,
  householdId: string,
  range: { from?: string; to?: string } = {},
): Promise<ProviderTotal[]> {
  const rows = unwrap(
    await client.rpc('expense_provider_totals', {
      p_household_id: householdId,
      ...(range.from && { p_from: range.from }),
      ...(range.to && { p_to: range.to }),
    }),
  )
  return rows.map((r) => ({
    providerId: r.provider_id,
    totalMinor: r.total_minor,
    expenseCount: r.expense_count,
  }))
}
