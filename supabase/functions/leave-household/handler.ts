import {
  leaveHouseholdSchema,
  type LeaveHouseholdResult,
} from '../../../packages/shared/src/schemas/invites.ts'
import { fromDbError } from '../_shared/db-errors.ts'
import type { Deps } from '../_shared/deps.ts'
import { endpoint } from '../_shared/http.ts'

/**
 * Leaves a household. It is never deleted here (only super-admins delete households); the last
 * household admin can't leave while other members remain (last_admin).
 */
export const handler = endpoint(
  leaveHouseholdSchema,
  async ({ householdId }, user, deps: Deps): Promise<LeaveHouseholdResult> => {
    const { error } = await deps.admin.rpc('leave_household', {
      p_household_id: householdId,
      p_user_id: user.id,
    })
    if (error) throw fromDbError(error)
    return { result: 'left' }
  },
)
