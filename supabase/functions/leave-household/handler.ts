import {
  leaveHouseholdSchema,
  type LeaveHouseholdResult,
} from '../../../packages/shared/src/schemas/invites.ts'
import { fromDbError } from '../_shared/db-errors.ts'
import type { Deps } from '../_shared/deps.ts'
import { endpoint } from '../_shared/http.ts'
import { removeHouseholdFiles } from '../_shared/storage.ts'

/**
 * Leaves a household. The last member must pass deleteIfLast, which deletes the household, all of
 * its rows (cascade) and then its storage objects.
 */
export const handler = endpoint(
  leaveHouseholdSchema,
  async ({ householdId, deleteIfLast }, user, deps: Deps): Promise<LeaveHouseholdResult> => {
    const { data, error } = await deps.admin.rpc('leave_household', {
      p_household_id: householdId,
      p_user_id: user.id,
      p_delete_if_last: deleteIfLast,
    })
    if (error) throw fromDbError(error)

    if (data === 'deleted') {
      // The rows are already gone; a failure here only leaves orphaned files, so log it.
      try {
        await removeHouseholdFiles(deps.admin, householdId)
      } catch (storageError) {
        console.error(`Failed to remove files for deleted household ${householdId}`, storageError)
      }
      return { result: 'deleted' }
    }
    return { result: 'left' }
  },
)
