import { logGasRefill, removeGasRefill, type LogGasRefillInput } from '@home/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import { expensesKey, householdKey, tasksKey } from '@/lib/queries'
import { supabase } from '@/lib/supabase'
import { gasKey } from '../lib/queries'

/** Everything a refill touches: the refills, its expense, the reminder task and categories. */
function refreshAfterGas(queryClient: ReturnType<typeof useQueryClient>, householdId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: gasKey(householdId) }),
    queryClient.invalidateQueries({ queryKey: expensesKey(householdId) }),
    queryClient.invalidateQueries({ queryKey: tasksKey(householdId) }),
    // The Cooking Gas category is created on first use if it was missing.
    queryClient.invalidateQueries({ queryKey: [...householdKey(householdId), 'categories'] }),
  ])
}

export function useLogGasRefill(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: LogGasRefillInput) => logGasRefill(supabase, householdId, input),
    onSettled: () => refreshAfterGas(queryClient, householdId),
  })
}

/** Removes a refill logged by mistake, along with its expense (to Recently deleted). */
export function useRemoveGasRefill(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => removeGasRefill(supabase, id),
    onSuccess: () => toast('Refill removed. Its expense is in Recently deleted.'),
    onError: (error) => toast.error(`Couldn't remove it. ${errorMessage(error)}`),
    onSettled: () => refreshAfterGas(queryClient, householdId),
  })
}
