import { unwrap, type HomeClient } from '../client.ts'
import type { Tables } from '../database.types.ts'

export type Household = Tables<'households'>

/** Households the signed-in user belongs to (RLS limits rows to their memberships). */
export async function listMyHouseholds(client: HomeClient): Promise<Household[]> {
  return unwrap(await client.from('households').select('*').order('name'))
}
