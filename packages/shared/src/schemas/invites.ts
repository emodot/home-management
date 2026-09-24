import { z } from 'zod'
import { emailSchema } from './auth.ts'

export const inviteFormSchema = z.object({
  email: emailSchema,
})
export type InviteFormInput = z.input<typeof inviteFormSchema>

/** Body of the send-invite edge function. Sending to a pending address resends (new token). */
export const sendInviteSchema = z.object({
  householdId: z.uuid(),
  email: emailSchema,
})
export type SendInviteInput = z.input<typeof sendInviteSchema>

export interface SendInviteResult {
  inviteId: string
  email: string
  resent: boolean
}

/** Invite tokens are 32 random bytes, base64url-encoded. */
export const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid invite link')

/** Body of the accept-invite edge function. `preview` looks the invite up without accepting. */
export const acceptInviteSchema = z.object({
  token: inviteTokenSchema,
  preview: z.boolean().default(false),
})
export type AcceptInviteInput = z.input<typeof acceptInviteSchema>

export interface InviteDetails {
  householdId: string
  householdName: string
  inviterName: string | null
  email: string
  emailMatches: boolean
  alreadyMember: boolean
}

export const revokeInviteSchema = z.object({
  inviteId: z.uuid(),
})
export type RevokeInviteInput = z.input<typeof revokeInviteSchema>

/** Body of the leave-household edge function. The last member must pass deleteIfLast. */
export const leaveHouseholdSchema = z.object({
  householdId: z.uuid(),
  deleteIfLast: z.boolean().default(false),
})
export type LeaveHouseholdInput = z.input<typeof leaveHouseholdSchema>

export interface LeaveHouseholdResult {
  result: 'left' | 'deleted'
}
