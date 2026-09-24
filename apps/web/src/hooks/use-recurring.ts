import {
  createRecurringExpense,
  deleteRecurringExpense,
  setRecurringExpenseActive,
  updateRecurringExpense,
  type RecurringExpense,
  type RecurringExpenseInput,
} from '@home/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import { expensesKey, recurringExpensesQuery } from '@/lib/queries'
import { supabase } from '@/lib/supabase'

/** Saving a bill can create pending expenses right away, so refresh both lists. */
function useRefresh(householdId: string) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries(recurringExpensesQuery(householdId)),
      queryClient.invalidateQueries({ queryKey: expensesKey(householdId) }),
    ])
}

export function useSaveRecurringExpense(householdId: string, existing?: RecurringExpense) {
  const refresh = useRefresh(householdId)
  return useMutation({
    mutationFn: (input: RecurringExpenseInput) =>
      existing
        ? updateRecurringExpense(supabase, existing, input)
        : createRecurringExpense(supabase, householdId, input),
    onSettled: refresh,
  })
}

export function useSetRecurringActive(householdId: string) {
  const queryClient = useQueryClient()
  const refresh = useRefresh(householdId)
  const { queryKey } = recurringExpensesQuery(householdId)
  return useMutation({
    mutationFn: ({ bill, isActive }: { bill: RecurringExpense; isActive: boolean }) =>
      setRecurringExpenseActive(supabase, bill.id, isActive),
    onMutate: async ({ bill, isActive }) => {
      await queryClient.cancelQueries({ queryKey })
      queryClient.setQueryData(queryKey, (old) =>
        old?.map((b) => (b.id === bill.id ? { ...b, is_active: isActive } : b)),
      )
    },
    onSuccess: (_data, { bill, isActive }) =>
      toast.success(isActive ? `Resumed ${bill.description}` : `Paused ${bill.description}`),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: refresh,
  })
}

export function useDeleteRecurringExpense(householdId: string) {
  const refresh = useRefresh(householdId)
  return useMutation({
    mutationFn: (bill: RecurringExpense) => deleteRecurringExpense(supabase, bill.id),
    onSuccess: (_data, bill) => toast.success(`Deleted ${bill.description}`),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: refresh,
  })
}
