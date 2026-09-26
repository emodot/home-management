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

export const AVATAR_BUCKET = 'avatars'

/**
 * Uploads a (prepared, square JPEG) profile photo to {userId}/avatar.jpg and saves its public
 * URL on the profile. The URL carries a version so browsers don't show the previous photo.
 */
export async function uploadAvatar(
  client: HomeClient,
  userId: string,
  image: Blob,
): Promise<Profile> {
  const path = `${userId}/avatar.jpg`
  const { error } = await client.storage
    .from(AVATAR_BUCKET)
    .upload(path, image, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' })
  if (error) throw error
  const { publicUrl } = client.storage.from(AVATAR_BUCKET).getPublicUrl(path).data
  return setAvatarUrl(client, userId, `${publicUrl}?v=${Date.now().toString()}`)
}

/** Removes the profile photo (and the uploaded file, if there is one). */
export async function removeAvatar(client: HomeClient, userId: string): Promise<Profile> {
  const { error } = await client.storage.from(AVATAR_BUCKET).remove([`${userId}/avatar.jpg`])
  if (error) throw error
  return setAvatarUrl(client, userId, null)
}

async function setAvatarUrl(client: HomeClient, userId: string, url: string | null) {
  return unwrap(
    await client.from('profiles').update({ avatar_url: url }).eq('id', userId).select('*').single(),
  )
}
