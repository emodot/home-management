import {
  createIncome,
  setIncomeDeleted,
  updateIncome,
  type Income,
  type IncomeInput,
} from '@home/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import { expensesKey, incomeKey } from '@/lib/queries'
import { supabase } from '@/lib/supabase'

/** Income lists and totals, plus Recently deleted (which lives under the expenses key). */
function useInvalidateIncome(householdId: string) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: incomeKey(householdId) }),
      queryClient.invalidateQueries({ queryKey: [...expensesKey(householdId), 'deleted'] }),
    ])
}

export function useCreateIncome(householdId: string) {
  const invalidate = useInvalidateIncome(householdId)
  return useMutation({
    mutationFn: (input: IncomeInput) => createIncome(supabase, householdId, input),
    onSettled: invalidate,
  })
}

export function useUpdateIncome(householdId: string, id: string) {
  const invalidate = useInvalidateIncome(householdId)
  return useMutation({
    mutationFn: (input: IncomeInput) => updateIncome(supabase, id, input),
    onSettled: invalidate,
  })
}

export function useRestoreIncome(householdId: string) {
  const invalidate = useInvalidateIncome(householdId)
  return useMutation({
    mutationFn: (income: Income) => setIncomeDeleted(supabase, income.id, false),
    onSuccess: (_data, income) => toast.success(`Restored "${income.source}"`),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: invalidate,
  })
}

export function useDeleteIncome(householdId: string) {
  const invalidate = useInvalidateIncome(householdId)
  const restore = useRestoreIncome(householdId)
  return useMutation({
    mutationFn: (income: Income) => setIncomeDeleted(supabase, income.id, true),
    onSuccess: (_data, income) => {
      toast.success(`Deleted "${income.source}"`, {
        action: { label: 'Undo', onClick: () => restore.mutate(income) },
      })
    },
    onError: (error) => toast.error(`Couldn't delete. ${errorMessage(error)}`),
    onSettled: invalidate,
  })
}
