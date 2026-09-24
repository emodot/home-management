import { getProfile, listMembers, listMyHouseholds, listPendingInvites } from '@home/shared'
import { queryOptions } from '@tanstack/react-query'
import { supabase } from './supabase'

export const profileQuery = (userId: string) =>
  queryOptions({
    queryKey: ['profile', userId],
    queryFn: () => getProfile(supabase, userId),
  })

export const householdsQuery = (userId: string) =>
  queryOptions({
    queryKey: ['households', userId],
    queryFn: () => listMyHouseholds(supabase),
  })

/** Everything scoped to one household lives under this key, so it can be dropped in one go. */
export const householdKey = (householdId: string) => ['household', householdId] as const

export const membersQuery = (householdId: string) =>
  queryOptions({
    queryKey: [...householdKey(householdId), 'members'],
    queryFn: () => listMembers(supabase, householdId),
  })

export const pendingInvitesQuery = (householdId: string) =>
  queryOptions({
    queryKey: [...householdKey(householdId), 'invites'],
    queryFn: () => listPendingInvites(supabase, householdId),
  })
