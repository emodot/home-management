import { unwrap, type HomeClient } from '../client.ts'
import { invokeFunction } from '../functions.ts'
import {
  acceptInviteSchema,
  leaveHouseholdSchema,
  revokeInviteSchema,
  sendInviteSchema,
  type AcceptInviteInput,
  type InviteDetails,
  type LeaveHouseholdInput,
  type LeaveHouseholdResult,
  type RevokeInviteInput,
  type SendInviteInput,
  type SendInviteResult,
} from '../schemas/invites.ts'

export async function listMembers(client: HomeClient, householdId: string) {
  return unwrap(
    await client
      .from('household_members')
      .select(
        'user_id, joined_at, role, profile:profiles!household_members_user_id_fkey(id, full_name, email, avatar_url)',
      )
      .eq('household_id', householdId)
      .order('joined_at'),
  )
}
export type Member = Awaited<ReturnType<typeof listMembers>>[number]

/** Invites that haven't been accepted or revoked (including expired ones, which can be resent). */
export async function listPendingInvites(client: HomeClient, householdId: string) {
  return unwrap(
    await client
      .from('invites')
      .select(
        'id, email, expires_at, created_at, inviter:profiles!invites_invited_by_fkey(full_name, email)',
      )
      .eq('household_id', householdId)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .order('created_at', { ascending: false }),
  )
}
export type PendingInvite = Awaited<ReturnType<typeof listPendingInvites>>[number]

export function sendInvite(client: HomeClient, input: SendInviteInput) {
  return invokeFunction<SendInviteResult>(client, 'send-invite', sendInviteSchema.parse(input))
}

export function acceptInvite(client: HomeClient, input: AcceptInviteInput) {
  return invokeFunction<InviteDetails>(client, 'accept-invite', acceptInviteSchema.parse(input))
}

export function revokeInvite(client: HomeClient, input: RevokeInviteInput) {
  return invokeFunction<{ ok: true }>(client, 'revoke-invite', revokeInviteSchema.parse(input))
}

export function leaveHousehold(client: HomeClient, input: LeaveHouseholdInput) {
  return invokeFunction<LeaveHouseholdResult>(
    client,
    'leave-household',
    leaveHouseholdSchema.parse(input),
  )
}
