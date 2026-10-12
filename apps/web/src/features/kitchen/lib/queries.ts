import {
  getKitchenItem,
  getRecipe,
  listCatalogItems,
  listGasRefills,
  listHouseholdPrices,
  listKitchenConversions,
  listItemPrices,
  listPantry,
  listRecipes,
  listShoppingList,
  recentStoreTags,
  recipePhotoUrls,
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
    queryKey: [...kitchenItemsKey(householdId), 'search', search.trim().toLowerCase()],
    queryFn: () => searchKitchenItems(supabase, householdId, search),
    staleTime: 5 * 60_000,
  })

/** One catalogue item (null if it isn't this household's). */
export const kitchenItemQuery = (householdId: string, itemId: string) =>
  queryOptions({
    queryKey: [...kitchenItemsKey(householdId), 'item', itemId],
    queryFn: () => getKitchenItem(supabase, itemId),
  })

/** The whole catalogue, A–Z, for managing it. */
export const catalogQuery = (householdId: string) =>
  queryOptions({
    queryKey: [...kitchenItemsKey(householdId), 'all'],
    queryFn: () => listCatalogItems(supabase, householdId),
  })

/** How the household's items' units relate ("1 bag = 50 kg"). */
export const conversionsQuery = (householdId: string) =>
  queryOptions({
    queryKey: [...kitchenItemsKey(householdId), 'conversions'],
    queryFn: () => listKitchenConversions(supabase, householdId),
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

/** Every priced purchase in the household, for the price tracker. */
export const householdPricesQuery = (householdId: string) =>
  queryOptions({
    queryKey: [...pricesKey(householdId), 'all'],
    queryFn: () => listHouseholdPrices(supabase, householdId),
  })

export const gasKey = (householdId: string) => [...kitchenKey(householdId), 'gas'] as const

/** Cooking gas refills, most recent first. */
export const gasRefillsQuery = (householdId: string) =>
  queryOptions({
    queryKey: gasKey(householdId),
    queryFn: () => listGasRefills(supabase, householdId),
  })

export const recipesKey = (householdId: string) => [...kitchenKey(householdId), 'recipes'] as const

/** The household's recipes, A–Z. */
export const recipesQuery = (householdId: string) =>
  queryOptions({
    queryKey: [...recipesKey(householdId), 'all'],
    queryFn: () => listRecipes(supabase, householdId),
  })

/** One recipe with its ingredients and steps (null if it isn't this household's). */
export const recipeQuery = (householdId: string, recipeId: string) =>
  queryOptions({
    queryKey: [...recipesKey(householdId), 'recipe', recipeId],
    queryFn: () => getRecipe(supabase, recipeId),
  })

/** Signed URLs for recipe photos, by path. They last an hour; refreshed well before. */
export const recipePhotosQuery = (householdId: string, paths: string[]) =>
  queryOptions({
    queryKey: [...recipesKey(householdId), 'photos', [...paths].sort()],
    queryFn: () => recipePhotoUrls(supabase, paths),
    staleTime: 30 * 60_000,
    enabled: paths.length > 0,
  })
