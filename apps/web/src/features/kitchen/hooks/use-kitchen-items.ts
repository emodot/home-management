import { createKitchenItem, type KitchenItemInput } from '@home/shared'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { kitchenItemsKey, kitchenItemSearchQuery } from '../lib/queries'

/** Catalogue items matching `search` (recent items when empty), for autocomplete. */
export function useKitchenItems(householdId: string, search: string) {
  return useQuery({
    ...kitchenItemSearchQuery(householdId, search),
    placeholderData: keepPreviousData,
  })
}

/** Adds an item to the catalogue (or finds the one already there under that name). */
export function useCreateKitchenItem(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: KitchenItemInput) => createKitchenItem(supabase, householdId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: kitchenItemsKey(householdId) }),
  })
}
