import { unwrap, type HomeClient } from '../client.ts'
import type { Tables } from '../database.types.ts'
import { createHouseholdSchema, type CreateHouseholdInput } from '../schemas/household.ts'

export type Household = Tables<'households'>

/** Households the signed-in user belongs to (RLS limits rows to their memberships). */
export async function listMyHouseholds(client: HomeClient): Promise<Household[]> {
  return unwrap(await client.from('households').select('*').order('name'))
}

/** Creates a household, adds the caller as its first member and makes it their active one. */
export async function createHousehold(
  client: HomeClient,
  input: CreateHouseholdInput,
): Promise<Household> {
  const { name } = createHouseholdSchema.parse(input)
  return unwrap(await client.rpc('create_household', { household_name: name }))
}
