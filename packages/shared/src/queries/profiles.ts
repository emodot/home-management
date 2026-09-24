import { unwrap, type HomeClient } from '../client.ts'
import type { Tables } from '../database.types.ts'
import { updateProfileSchema, type UpdateProfileInput } from '../schemas/household.ts'

export type Profile = Tables<'profiles'>

export async function getProfile(client: HomeClient, userId: string): Promise<Profile> {
  return unwrap(await client.from('profiles').select('*').eq('id', userId).single())
}

export async function updateProfile(
  client: HomeClient,
  userId: string,
  input: UpdateProfileInput,
): Promise<Profile> {
  const { fullName } = updateProfileSchema.parse(input)
  return unwrap(
    await client
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', userId)
      .select('*')
      .single(),
  )
}

/** Persists the household shown in the app. The database rejects households the user isn't in. */
export async function setActiveHousehold(
  client: HomeClient,
  userId: string,
  householdId: string,
): Promise<void> {
  unwrap(
    await client.from('profiles').update({ active_household_id: householdId }).eq('id', userId),
  )
}
