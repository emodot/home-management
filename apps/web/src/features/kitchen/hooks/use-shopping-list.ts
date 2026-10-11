import {
  addToShoppingList,
  removeShoppingListItem,
  restoreShoppingListItem,
  setKitchenItemDefaults,
  updateShoppingListItem,
  type KitchenItem,
  type ListItemPatch,
  type ShoppingListItem,
} from '@home/shared'
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
  type QueryClient,
} from '@tanstack/react-query'
import { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { useCurrentUser } from '@/hooks/use-household'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { kitchenItemsKey, shoppingListKey, shoppingListQuery } from '../lib/queries'

/** Every list change shares this key, so Realtime can hold back while one is in flight. */
const listMutationKey = (householdId: string) => ['shopping-list-change', householdId]

/**
 * The shopping list, live: changes anyone in the household makes show up here as they happen.
 */
export function useShoppingList(householdId: string) {
  const queryClient = useQueryClient()
  const list = useSuspenseQuery(shoppingListQuery(householdId))

  useEffect(() => {
    // Our own changes refresh the list when they settle; refreshing mid-change would flicker.
    const refresh = () => {
      if (queryClient.isMutating({ mutationKey: listMutationKey(householdId) }) > 0) return
      void queryClient.invalidateQueries({ queryKey: shoppingListKey(householdId) })
    }
    const channel = supabase
      .channel(`shopping-list:${householdId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shopping_list_items',
          filter: `household_id=eq.${householdId}`,
        },
        refresh,
      )
      // Realtime can't filter deletes by household, so check the removed entry is one of ours.
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'shopping_list_items' },
        (payload) => {
          const id = (payload.old as { id?: string }).id
          const cached = queryClient.getQueryData(shoppingListQuery(householdId).queryKey)
          if (id && cached?.some((entry) => entry.id === id)) refresh()
        },
      )
      .subscribe((status) => {
        // Catch up on anything missed while disconnected (e.g. the phone was asleep).
        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) refresh()
      })
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [householdId, queryClient])

  return list.data
}

/** The list before an optimistic update, to roll back to. */
interface Snapshot {
  previous: ShoppingListItem[] | undefined
}

/** Applies `change` to the cached list for an optimistic update. */
async function patchList(
  queryClient: QueryClient,
  householdId: string,
  change: (list: ShoppingListItem[]) => ShoppingListItem[],
): Promise<Snapshot> {
  const key = shoppingListKey(householdId)
  await queryClient.cancelQueries({ queryKey: key })
  const previous = queryClient.getQueryData<ShoppingListItem[]>(key)
  if (previous) queryClient.setQueryData(key, change(previous))
  return { previous }
}

function useListMutationOptions(householdId: string) {
  const queryClient = useQueryClient()
  return {
    queryClient,
    mutationKey: listMutationKey(householdId),
    onError: (error: unknown, _vars: unknown, snapshot: Snapshot | undefined) => {
      if (snapshot?.previous)
        queryClient.setQueryData(shoppingListKey(householdId), snapshot.previous)
      toast.error(`Couldn't update the list. ${errorMessage(error)}`)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: shoppingListKey(householdId) }),
  }
}

/** Quick add: puts a catalogue item on the list (or reports that it's already there). */
export function useAddListItem(householdId: string) {
  const user = useCurrentUser()
  const { queryClient, ...options } = useListMutationOptions(householdId)
  return useMutation({
    ...options,
    mutationFn: (item: KitchenItem) => addToShoppingList(supabase, householdId, item),
    onMutate: (item) =>
      patchList(queryClient, householdId, (list) =>
        list.some((entry) => entry.itemId === item.id)
          ? list
          : [
              ...list,
              {
                id: `pending-${item.id}`,
                householdId,
                itemId: item.id,
                name: item.name,
                quantity: 1,
                unit: item.defaultUnit,
                storeTag: item.defaultStoreTag,
                notes: null,
                isChecked: false,
                checkedBy: null,
                source: 'manual',
                addedBy: user.id,
                createdAt: new Date().toISOString(),
              },
            ],
      ),
  })
}

/** Edits an entry; a new unit or store also becomes the item's default for next time. */
export function useUpdateListItem(householdId: string) {
  const { queryClient, ...options } = useListMutationOptions(householdId)
  return useMutation({
    ...options,
    mutationFn: async ({ entry, patch }: { entry: ShoppingListItem; patch: ListItemPatch }) => {
      await updateShoppingListItem(supabase, entry.id, patch)
      if (patch.unit !== entry.unit || patch.storeTag !== entry.storeTag) {
        await setKitchenItemDefaults(supabase, entry.itemId, {
          defaultUnit: patch.unit,
          defaultStoreTag: patch.storeTag,
        })
        await queryClient.invalidateQueries({ queryKey: kitchenItemsKey(householdId) })
      }
    },
    onMutate: ({ entry, patch }) =>
      patchList(queryClient, householdId, (list) =>
        list.map((e) => (e.id === entry.id ? { ...e, ...patch } : e)),
      ),
  })
}

export function useToggleListItem(householdId: string) {
  const { queryClient, ...options } = useListMutationOptions(householdId)
  return useMutation({
    ...options,
    mutationFn: ({ id, isChecked }: { id: string; isChecked: boolean }) =>
      updateShoppingListItem(supabase, id, { isChecked }),
    onMutate: ({ id, isChecked }) =>
      patchList(queryClient, householdId, (list) =>
        list.map((e) => (e.id === id ? { ...e, isChecked } : e)),
      ),
  })
}

/** Removes an entry, with Undo in the toast. */
export function useRemoveListItem(householdId: string) {
  const { queryClient, ...options } = useListMutationOptions(householdId)
  const restore = useMutation({
    ...options,
    mutationFn: (entry: ShoppingListItem) => restoreShoppingListItem(supabase, entry),
    onMutate: (entry) =>
      patchList(queryClient, householdId, (list) =>
        list.some((e) => e.id === entry.id) ? list : [...list, entry],
      ),
  })
  return useMutation({
    ...options,
    mutationFn: (entry: ShoppingListItem) => removeShoppingListItem(supabase, entry.id),
    onMutate: (entry) =>
      patchList(queryClient, householdId, (list) => list.filter((e) => e.id !== entry.id)),
    onSuccess: (_data, entry) => {
      toast(`Removed ${entry.name}`, {
        action: { label: 'Undo', onClick: () => restore.mutate(entry) },
      })
    },
  })
}
