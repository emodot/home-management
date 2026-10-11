import {
  getKitchenItem,
  listItemPrices,
  listPantry,
  listShoppingList,
  recentStoreTags,
  searchKitchenItems,
} from '@home/shared'
import { queryOptions } from '@tanstack/react-query'
import { householdKey } from '@/lib/queries'
import { supabase } from '@/lib/supabase'

export const kitchenKey = (householdId: string) =>
  [...householdKey(householdId), 'kitchen'] as const
export const kitchenItemsKey = (householdId: string) =>
  [...kitchenKey(householdId), 'items'] as const

/** Catalogue items matching `search`, best first (recent items when it's empty). */
export const kitchenItemSearchQuery = (householdId: string, search: string) =>
  queryOptions({
    queryKey: [...kitchenItemsKey(householdId), search.trim().toLowerCase()],
    queryFn: () => searchKitchenItems(supabase, householdId, search),
    staleTime: 5 * 60_000,
  })

/** One catalogue item (null if it isn't this household's). */
export const kitchenItemQuery = (householdId: string, itemId: string) =>
  queryOptions({
    queryKey: [...kitchenItemsKey(householdId), 'item', itemId],
    queryFn: () => getKitchenItem(supabase, itemId),
  })

export const shoppingListKey = (householdId: string) =>
  [...kitchenKey(householdId), 'list'] as const

/** ['household', id, 'kitchen', 'list'] */
export const isShoppingListKey = (key: readonly unknown[]) =>
  key[0] === 'household' && key[2] === 'kitchen' && key[3] === 'list' && key.length === 4

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

export const pantryKey = (householdId: string) => [...kitchenKey(householdId), 'pantry'] as const

/** Everything in the kitchen. Kept fresh by Realtime (see usePantry) and on refocus. */
export const pantryQuery = (householdId: string) =>
  queryOptions({
    queryKey: pantryKey(householdId),
    queryFn: () => listPantry(supabase, householdId),
    refetchOnWindowFocus: true,
  })

export const pricesKey = (householdId: string) => [...kitchenKey(householdId), 'prices'] as const

/** What one item has cost, most recent first. */
export const itemPricesQuery = (householdId: string, itemId: string) =>
  queryOptions({
    queryKey: [...pricesKey(householdId), 'item', itemId],
    queryFn: () => listItemPrices(supabase, itemId),
  })
