import { createKitchenItem, searchKitchenItems, type KitchenItemInput } from '@home/shared'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { householdKey } from '@/lib/queries'
import { supabase } from '@/lib/supabase'

export const kitchenKey = (householdId: string) =>
  [...householdKey(householdId), 'kitchen'] as const
export const kitchenItemsKey = (householdId: string) =>
  [...kitchenKey(householdId), 'items'] as const

/** Catalogue items matching `search` (recent items when empty), for autocomplete. */
export function useKitchenItems(householdId: string, search: string) {
  return useQuery({
    queryKey: [...kitchenItemsKey(householdId), search.trim().toLowerCase()],
    queryFn: () => searchKitchenItems(supabase, householdId, search),
    staleTime: 5 * 60_000,
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
