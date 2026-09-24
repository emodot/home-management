import {
  acceptInviteSchema,
  type InviteDetails,
} from '../../../packages/shared/src/schemas/invites.ts'
import { fromDbError } from '../_shared/db-errors.ts'
import type { Deps } from '../_shared/deps.ts'
import { endpoint } from '../_shared/http.ts'
import { hashToken } from '../_shared/tokens.ts'

/**
 * With preview: returns the invite's details without changing anything (for the "Join X?" screen).
 * Otherwise: joins the household (email must match) and makes it the caller's active household.
 */
export const handler = endpoint(
  acceptInviteSchema,
  async ({ token, preview }, user, deps: Deps): Promise<InviteDetails> => {
    const { data, error } = await deps.admin.rpc('invite_accept', {
      p_token_hash: await hashToken(token),
      p_user_id: user.id,
      p_preview: preview,
    })
    if (error) throw fromDbError(error)
    const row = data[0]
    if (!row) throw new Error('invite_accept returned no rows')

    return {
      householdId: row.household_id,
      householdName: row.household_name,
      inviterName: row.inviter_name,
      email: row.email,
      emailMatches: row.email_matches,
      alreadyMember: row.already_member,
    }
  },
)
