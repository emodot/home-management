import { revokeInviteSchema } from '../../../packages/shared/src/schemas/invites.ts'
import { fromDbError } from '../_shared/db-errors.ts'
import type { Deps } from '../_shared/deps.ts'
import { endpoint } from '../_shared/http.ts'

/** Cancels a pending invite. Any member of the invite's household can do this. */
export const handler = endpoint(revokeInviteSchema, async ({ inviteId }, user, deps: Deps) => {
  const { error } = await deps.admin.rpc('invite_revoke', {
    p_invite_id: inviteId,
    p_user_id: user.id,
  })
  if (error) throw fromDbError(error)
  return { ok: true as const }
})
