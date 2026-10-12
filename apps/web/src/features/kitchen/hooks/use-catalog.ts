import {
  addItemConversion,
  mergeKitchenItems,
  removeItemConversion,
  updateKitchenItem,
  type KitchenItem,
  type KitchenItemInput,
  type UnitConversion,
} from '@home/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { conversionsQuery, kitchenItemQuery, kitchenKey } from '../lib/queries'

/** Renames an item and sets its usual unit and store. */
export function useUpdateKitchenItem(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ item, input }: { item: KitchenItem; input: KitchenItemInput }) =>
      updateKitchenItem(supabase, item, input),
    // The new name shows on the list, in the pantry and in prices too.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: kitchenKey(householdId) }),
  })
}

export function useAddItemConversion(householdId: string, item: KitchenItem) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (conversion: UnitConversion) => addItemConversion(supabase, item, conversion),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: conversionsQuery(householdId).queryKey }),
  })
}

export function useRemoveItemConversion(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => removeItemConversion(supabase, id),
    onError: (error) => toast.error(`Couldn't remove it. ${errorMessage(error)}`),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: conversionsQuery(householdId).queryKey }),
  })
}

/** Folds `merge` into `keep`: prices, stock, list entry and units move, then `merge` is deleted. */
export function useMergeKitchenItems(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ keep, merge }: { keep: KitchenItem; merge: KitchenItem }) =>
      mergeKitchenItems(supabase, keep.id, merge.id),
    onSuccess: (_, { keep, merge }) => {
      // The merged item is gone: don't refetch its page on the way out.
      queryClient.removeQueries({ queryKey: kitchenItemQuery(householdId, merge.id).queryKey })
      toast.success(`Merged ${merge.name} into ${keep.name}`)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: kitchenKey(householdId) }),
  })
}
