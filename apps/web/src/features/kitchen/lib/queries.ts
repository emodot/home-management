import { getKitchenItem } from '@home/shared'
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
