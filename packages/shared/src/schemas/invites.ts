import { z } from 'zod'
import { emailSchema } from './auth.ts'

export const inviteFormSchema = z.object({
  email: emailSchema,
})
export type InviteFormInput = z.input<typeof inviteFormSchema>

/**
 * Body of the send-invite edge function:
 * - `{ householdId }` creates a shareable link;
 * - `{ householdId, email }` also emails it (to a pending address: resends with a new link);
 * - `{ householdId, inviteId }` makes a new link for a pending invite (the old one stops working).
 */
export const sendInviteSchema = z
  .object({
    householdId: z.uuid(),
    email: emailSchema.optional(),
    inviteId: z.uuid().optional(),
  })
  .refine((input) => !(input.email && input.inviteId), 'Pass an email or an inviteId, not both')
export type SendInviteInput = z.input<typeof sendInviteSchema>

export interface SendInviteResult {
  inviteId: string
  email: string | null
  /** The link to share. Only returned now: the token isn't stored, so it can't be shown again. */
  inviteUrl: string
  expiresAt: string
  /** An existing invite got a new link (its previous link no longer works). */
  resent: boolean
  /** False when there was no email to send, or sending it failed (the link still works). */
  emailed: boolean
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
  alreadyMember: boolean
}

export const revokeInviteSchema = z.object({
  inviteId: z.uuid(),
})
export type RevokeInviteInput = z.input<typeof revokeInviteSchema>

/** Body of the leave-household edge function. Leaving never deletes the household. */
export const leaveHouseholdSchema = z.object({
  householdId: z.uuid(),
})
export type LeaveHouseholdInput = z.input<typeof leaveHouseholdSchema>

export interface LeaveHouseholdResult {
  result: 'left'
}
