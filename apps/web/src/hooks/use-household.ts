import { setActiveHousehold, type Household } from '@home/shared'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
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

/** The household the app is showing. The app loader guarantees there is one. */
export function useActiveHousehold(): Household {
  const profile = useProfile()
  const households = useHouseholds()
  const active = households.find((h) => h.id === profile.active_household_id) ?? households[0]
  if (!active) throw new Error('No household available')
  return active
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
