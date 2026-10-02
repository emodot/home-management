import {
  confirmIncome,
  createIncome,
  createRecurringIncome,
  deleteRecurringIncome,
  setIncomeDeleted,
  setRecurringIncomeActive,
  updateIncome,
  updateRecurringIncome,
  type Income,
  type IncomeInput,
  type RecurringIncome,
  type RecurringIncomeInput,
} from '@home/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import { expensesKey, incomeKey, recurringIncomeQuery } from '@/lib/queries'
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

export function useConfirmIncome(householdId: string) {
  const invalidate = useInvalidateIncome(householdId)
  return useMutation({
    mutationFn: ({ income, amountMinor }: { income: Income; amountMinor: number }) =>
      confirmIncome(supabase, income.id, amountMinor),
    onSuccess: (_data, { income }) => toast.success(`Confirmed "${income.source}"`),
    onError: (error) => toast.error(`Couldn't confirm. ${errorMessage(error)}`),
    onSettled: invalidate,
  })
}

/** Skipping pending income is a soft delete, so it can be undone (and isn't created again). */
export function useSkipIncome(householdId: string) {
  const invalidate = useInvalidateIncome(householdId)
  const restore = useRestoreIncome(householdId)
  return useMutation({
    mutationFn: (income: Income) => setIncomeDeleted(supabase, income.id, true),
    onSuccess: (_data, income) =>
      toast.success(`Skipped "${income.source}"`, {
        action: { label: 'Undo', onClick: () => restore.mutate(income) },
      }),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: invalidate,
  })
}

export function useSaveRecurringIncome(householdId: string, existing?: RecurringIncome) {
  const invalidate = useInvalidateIncome(householdId)
  return useMutation({
    mutationFn: (input: RecurringIncomeInput) =>
      existing
        ? updateRecurringIncome(supabase, existing, input)
        : createRecurringIncome(supabase, householdId, input),
    onSettled: invalidate,
  })
}

export function useSetRecurringIncomeActive(householdId: string) {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateIncome(householdId)
  const { queryKey } = recurringIncomeQuery(householdId)
  return useMutation({
    mutationFn: ({ item, isActive }: { item: RecurringIncome; isActive: boolean }) =>
      setRecurringIncomeActive(supabase, item.id, isActive),
    onMutate: async ({ item, isActive }) => {
      await queryClient.cancelQueries({ queryKey })
      queryClient.setQueryData(queryKey, (old) =>
        old?.map((r) => (r.id === item.id ? { ...r, is_active: isActive } : r)),
      )
    },
    onSuccess: (_data, { item, isActive }) =>
      toast.success(isActive ? `Resumed ${item.source}` : `Paused ${item.source}`),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: invalidate,
  })
}

export function useDeleteRecurringIncome(householdId: string) {
  const invalidate = useInvalidateIncome(householdId)
  return useMutation({
    mutationFn: (item: RecurringIncome) => deleteRecurringIncome(supabase, item.id),
    onSuccess: (_data, item) => toast.success(`Deleted ${item.source}`),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: invalidate,
  })
}
