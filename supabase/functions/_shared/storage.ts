import type { HomeClient } from '../../../packages/shared/src/client.ts'

/** Buckets whose object paths start with `{household_id}/`. Add new ones here (documents, inventory). */
export const HOUSEHOLD_BUCKETS = ['receipts']

async function listFiles(admin: HomeClient, bucket: string, prefix: string): Promise<string[]> {
  const files: string[] = []
  const pageSize = 1000
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await admin.storage
      .from(bucket)
      .list(prefix, { limit: pageSize, offset })
    if (error) throw error
    for (const entry of data) {
      const path = `${prefix}/${entry.name}`
      // Folders have no id.
      if (entry.id === null) files.push(...(await listFiles(admin, bucket, path)))
      else files.push(path)
    }
    if (data.length < pageSize) return files
  }
}

/** Deletes every object under `{householdId}/` in each household bucket. Returns the count. */
export async function removeHouseholdFiles(
  admin: HomeClient,
  householdId: string,
): Promise<number> {
  let removed = 0
  for (const bucket of HOUSEHOLD_BUCKETS) {
    const { error: bucketError } = await admin.storage.getBucket(bucket)
    if (bucketError) continue // bucket not created yet
    const paths = await listFiles(admin, bucket, householdId)
    for (let i = 0; i < paths.length; i += 1000) {
      const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 1000))
      if (error) throw error
    }
    removed += paths.length
  }
  return removed
}
