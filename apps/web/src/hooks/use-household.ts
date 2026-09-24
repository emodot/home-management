import { setActiveHousehold, type Household, type Profile } from '@home/shared'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createContext, useContext } from 'react'
import { useRouteLoaderData } from 'react-router'
import { householdsQuery, profileQuery } from '@/lib/queries'
import { supabase } from '@/lib/supabase'
import type { authedLoader } from '@/routes/loaders'

export function useCurrentUser() {
  const data = useRouteLoaderData<typeof authedLoader>('authed')
  if (!data) throw new Error('useCurrentUser must be used inside the signed-in routes')
  return data.user
}

export function useProfile() {
  const user = useCurrentUser()
  return useSuspenseQuery(profileQuery(user.id)).data
}

export function useHouseholds() {
  const user = useCurrentUser()
  return useSuspenseQuery(householdsQuery(user.id)).data
}

/** The saved active household, falling back to the first one (e.g. right after leaving). */
export function pickActiveHousehold(profile: Profile, households: Household[]) {
  return households.find((h) => h.id === profile.active_household_id) ?? households[0]
}

/**
 * Provided by AppLayout, which renders nothing below it until there is a household. Reading it
 * from context (not from the query cache in each component) means children never see a state
 * where the list has just become empty.
 */
export const ActiveHouseholdContext = createContext<Household | null>(null)

/** The household the app is showing. Only usable inside AppLayout. */
export function useActiveHousehold(): Household {
  const household = useContext(ActiveHouseholdContext)
  if (!household) throw new Error('useActiveHousehold must be used inside AppLayout')
  return household
}

export function useSwitchHousehold() {
  const user = useCurrentUser()
  const queryClient = useQueryClient()
  const { queryKey } = profileQuery(user.id)

  return useMutation({
    mutationFn: (householdId: string) => setActiveHousehold(supabase, user.id, householdId),
    onMutate: async (householdId) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData(queryKey)
      if (previous) {
        queryClient.setQueryData(queryKey, { ...previous, active_household_id: householdId })
      }
      return { previous }
    },
    onError: (_error, _householdId, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })
}
