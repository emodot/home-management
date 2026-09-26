import {
  leaveHousehold,
  revokeInvite,
  sendInvite,
  type Household,
  type PendingInvite,
} from '@home/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRevalidator } from 'react-router'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import { householdKey, householdsQuery, pendingInvitesQuery, profileQuery } from '@/lib/queries'
import { supabase } from '@/lib/supabase'
import { useCurrentUser } from './use-household'

/**
 * Creates an invite link (optionally emailing it; an address with a pending invite gets a new
 * link) or makes a new link for a pending invite. Resolves with the link to share.
 */
export function useSendInvite(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { email?: string; inviteId?: string } = {}) =>
      sendInvite(supabase, { householdId, ...input }),
    onSettled: () => queryClient.invalidateQueries(pendingInvitesQuery(householdId)),
  })
}

/** Removes the row immediately; toasts live here because the row unmounts before it settles. */
export function useRevokeInvite(householdId: string) {
  const queryClient = useQueryClient()
  const { queryKey } = pendingInvitesQuery(householdId)

  return useMutation({
    mutationFn: (invite: PendingInvite) => revokeInvite(supabase, { inviteId: invite.id }),
    onMutate: async (invite) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData(queryKey)
      queryClient.setQueryData(queryKey, (old: PendingInvite[] | undefined) =>
        old?.filter((i) => i.id !== invite.id),
      )
      return { previous }
    },
    onSuccess: (_data, invite) =>
      toast.success(invite.email ? `Invite to ${invite.email} cancelled` : 'Invite link cancelled'),
    onError: (error, _invite, context) => {
      queryClient.setQueryData(queryKey, context?.previous)
      toast.error(errorMessage(error))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })
}

export function useLeaveHousehold(household: Household) {
  const user = useCurrentUser()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const revalidator = useRevalidator()

  return useMutation({
    mutationFn: () => leaveHousehold(supabase, { householdId: household.id }),
    onError: (error) => toast.error(errorMessage(error)),
    onSuccess: async () => {
      toast.success(`You left ${household.name}`)
      // Leave the page first so nothing renders the old household while caches change.
      await navigate('/', { replace: true })
      queryClient.removeQueries({ queryKey: householdKey(household.id) })
      await Promise.all([
        queryClient.invalidateQueries({ ...householdsQuery(user.id), refetchType: 'none' }),
        queryClient.invalidateQueries({ ...profileQuery(user.id), refetchType: 'none' }),
      ])
      // The app loader refetches, then picks another household or redirects to onboarding.
      await revalidator.revalidate()
    },
  })
}
