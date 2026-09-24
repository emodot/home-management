import { renderInviteEmail } from '../../../packages/emails/generated/index.ts'
import {
  sendInviteSchema,
  type SendInviteResult,
} from '../../../packages/shared/src/schemas/invites.ts'
import { fromDbError } from '../_shared/db-errors.ts'
import { formatDate, type Deps } from '../_shared/deps.ts'
import { endpoint, HttpError } from '../_shared/http.ts'
import { generateToken, hashToken } from '../_shared/tokens.ts'

/** Invites an email to a household, or resends (new token, new 7-day expiry) if one is pending. */
export const handler = endpoint(
  sendInviteSchema,
  async ({ householdId, email }, user, deps: Deps): Promise<SendInviteResult> => {
    const token = generateToken()
    const { data, error } = await deps.admin.rpc('invite_upsert', {
      p_household_id: householdId,
      p_email: email,
      p_token_hash: await hashToken(token),
      p_invited_by: user.id,
    })
    if (error) throw fromDbError(error)
    const invite = data[0]
    if (!invite) throw new Error('invite_upsert returned no rows')

    const inviteUrl = new URL(`/invite/${token}`, deps.appUrl).toString()
    try {
      await deps.sendEmail(
        invite.email,
        renderInviteEmail({
          inviterName: invite.inviter_name,
          householdName: invite.household_name,
          inviteUrl,
          email: invite.email,
          expiresOn: formatDate(invite.expires_at),
        }),
      )
    } catch (emailError) {
      console.error(emailError)
      throw new HttpError(502, 'email_failed')
    }

    return { inviteId: invite.invite_id, email: invite.email, resent: invite.resent }
  },
)
