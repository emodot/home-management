import { renderInviteEmail } from '../../../packages/emails/generated/index.ts'
import {
  sendInviteSchema,
  type SendInviteResult,
} from '../../../packages/shared/src/schemas/invites.ts'
import { fromDbError } from '../_shared/db-errors.ts'
import { formatDate, type Deps } from '../_shared/deps.ts'
import { endpoint } from '../_shared/http.ts'
import { generateToken, hashToken } from '../_shared/tokens.ts'

/**
 * Creates a shareable invite link, optionally emailing it, or makes a new link for a pending
 * invite. The link is returned so it can be copied; only its hash is stored.
 */
export const handler = endpoint(
  sendInviteSchema,
  async ({ householdId, email, inviteId }, user, deps: Deps): Promise<SendInviteResult> => {
    const token = generateToken()
    const tokenHash = await hashToken(token)
    const { data, error } = inviteId
      ? await deps.admin.rpc('invite_rotate', {
          p_invite_id: inviteId,
          p_user_id: user.id,
          p_token_hash: tokenHash,
        })
      : await deps.admin.rpc('invite_upsert', {
          p_household_id: householdId,
          // Empty means "no email": a link to share.
          p_email: email ?? '',
          p_token_hash: tokenHash,
          p_invited_by: user.id,
        })
    if (error) throw fromDbError(error)
    const invite = data[0]
    if (!invite) throw new Error('invite function returned no rows')

    const inviteUrl = new URL(`/invite/${token}`, deps.appUrl).toString()
    let emailed = false
    // Only email when asked to; a new link for an existing invite is for copying.
    if (email && invite.email) {
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
        emailed = true
      } catch (emailError) {
        // The invite exists and the link works; the app offers it to copy instead.
        console.error(emailError)
      }
    }

    return {
      inviteId: invite.invite_id,
      email: invite.email,
      inviteUrl,
      expiresAt: invite.expires_at,
      resent: invite.resent,
      emailed,
    }
  },
)
