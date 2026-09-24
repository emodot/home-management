import { createHousehold, type CreateHouseholdInput } from '@home/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { householdsQuery, profileQuery } from '@/lib/queries'
import { supabase } from '@/lib/supabase'
import { useCurrentUser } from './use-household'

/** Creates a household and writes it straight into the cache as the active one. */
export function useCreateHousehold() {
  const user = useCurrentUser()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateHouseholdInput) => createHousehold(supabase, input),
    onSuccess: (household) => {
      queryClient.setQueryData(householdsQuery(user.id).queryKey, (old = []) =>
        [...old, household].sort((a, b) => a.name.localeCompare(b.name)),
      )
      queryClient.setQueryData(profileQuery(user.id).queryKey, (old) =>
        old ? { ...old, active_household_id: household.id } : old,
      )
    },
  })
}
