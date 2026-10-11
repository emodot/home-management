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
import { toast } from 'sonner'
import { useCurrentUser } from '@/hooks/use-household'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import {
  isListChange,
  listChangeKey,
  refreshListWhenSettled,
  type ListEntryUpdate,
} from '../lib/offline'
import { kitchenItemsKey, shoppingListKey, shoppingListQuery } from '../lib/queries'
import { useLiveTable } from './use-live-table'

/**
 * The shopping list, live: changes anyone in the household makes show up here as they happen.
 */
export function useShoppingList(householdId: string) {
  const queryClient = useQueryClient()
  const list = useSuspenseQuery(shoppingListQuery(householdId))
  useLiveTable({
    table: 'shopping_list_items',
    householdId,
    queryKey: shoppingListKey(householdId),
    busy: () =>
      queryClient.isMutating({
        predicate: (mutation) => isListChange(mutation.options.mutationKey, householdId),
      }) > 0,
  })
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

function useListMutationOptions(householdId: string, kind: Parameters<typeof listChangeKey>[0]) {
  const queryClient = useQueryClient()
  return {
    queryClient,
    mutationKey: listChangeKey(kind, householdId),
    onError: (error: unknown, _vars: unknown, snapshot: Snapshot | undefined) => {
      if (snapshot?.previous)
        queryClient.setQueryData(shoppingListKey(householdId), snapshot.previous)
      toast.error(`Couldn't update the list. ${errorMessage(error)}`)
    },
    onSettled: () => {
      refreshListWhenSettled(queryClient, householdId)
    },
  }
}

/** Quick add: puts a catalogue item on the list (or reports that it's already there). */
export function useAddListItem(householdId: string) {
  const user = useCurrentUser()
  const { queryClient, ...options } = useListMutationOptions(householdId, 'add')
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
                pricePaidMinor: null,
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
  const { queryClient, ...options } = useListMutationOptions(householdId, 'edit')
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

/**
 * Checks an entry off (or back on) and records the price paid. Works offline: see
 * registerOfflineListChanges, which supplies the request and the retry rules.
 */
export function useUpdateListEntry(householdId: string) {
  const { queryClient, ...options } = useListMutationOptions(householdId, 'update')
  const mutation = useMutation<unknown, Error, ListEntryUpdate, Snapshot>({
    ...options,
    onMutate: ({ id, patch }) =>
      patchList(queryClient, householdId, (list) =>
        list.map((e) =>
          e.id === id
            ? {
                ...e,
                ...patch,
                // Unchecking clears the price (the server does the same).
                ...(patch.isChecked === false && { pricePaidMinor: null }),
              }
            : e,
        ),
      ),
  })
  return {
    ...mutation,
    update: (id: string, patch: ListEntryUpdate['patch']) =>
      mutation.mutate({ householdId, id, patch }),
  }
}

/** Removes an entry, with Undo in the toast. */
export function useRemoveListItem(householdId: string) {
  const { queryClient, ...options } = useListMutationOptions(householdId, 'remove')
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
