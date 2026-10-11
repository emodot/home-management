import { getKitchenItem, listShoppingList, recentStoreTags } from '@home/shared'
import { queryOptions } from '@tanstack/react-query'
import { householdKey } from '@/lib/queries'
import { supabase } from '@/lib/supabase'

export const kitchenKey = (householdId: string) =>
  [...householdKey(householdId), 'kitchen'] as const
export const kitchenItemsKey = (householdId: string) =>
  [...kitchenKey(householdId), 'items'] as const

/** One catalogue item (null if it isn't this household's). */
export const kitchenItemQuery = (householdId: string, itemId: string) =>
  queryOptions({
    queryKey: [...kitchenItemsKey(householdId), 'item', itemId],
    queryFn: () => getKitchenItem(supabase, itemId),
  })

export const shoppingListKey = (householdId: string) =>
  [...kitchenKey(householdId), 'list'] as const

/** The shared shopping list. Kept fresh by Realtime (see useShoppingList) and on refocus. */
export const shoppingListQuery = (householdId: string) =>
  queryOptions({
    queryKey: shoppingListKey(householdId),
    queryFn: () => listShoppingList(supabase, householdId),
    refetchOnWindowFocus: true,
  })

/** Stores the household usually buys from, for the store chips. */
export const storeTagsQuery = (householdId: string) =>
  queryOptions({
    queryKey: [...kitchenItemsKey(householdId), 'store-tags'],
    queryFn: () => recentStoreTags(supabase, householdId),
    staleTime: 5 * 60_000,
  })
