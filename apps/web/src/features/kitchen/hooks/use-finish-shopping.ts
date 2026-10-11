import { finishShoppingTrip, type FinishTripInput } from '@home/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { uploadReceiptsInBackground } from '@/hooks/use-expenses'
import type { PreparedReceipt } from '@/lib/images'
import { expensesKey } from '@/lib/queries'
import { supabase } from '@/lib/supabase'
import { kitchenKey } from '../lib/queries'

/**
 * Finishes the trip in one go (expense, prices, pantry, list), then uploads the receipt photos
 * to the new expense in the background. Needs a connection: it's all or nothing on the server.
 */
export function useFinishShopping(householdId: string) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: ({ input }: { input: FinishTripInput; receipts: PreparedReceipt[] }) =>
      finishShoppingTrip(supabase, householdId, input),
    onSuccess: async ({ expenseId }, { receipts }) => {
      await Promise.all([
        // The list, pantry, prices and catalogue all changed.
        queryClient.invalidateQueries({ queryKey: kitchenKey(householdId) }),
        queryClient.invalidateQueries({ queryKey: expensesKey(householdId) }),
      ])
      void uploadReceiptsInBackground(queryClient, householdId, expenseId, receipts, (id) => {
        void navigate(`/expenses/${id}`)
      })
    },
  })
}
