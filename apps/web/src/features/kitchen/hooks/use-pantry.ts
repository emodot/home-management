import {
  addToPantry,
  addToShoppingList,
  isLowStock,
  removePantryItem,
  restorePantryItem,
  updatePantryItem,
  type KitchenItem,
  type PantryItem,
  type PantryLocation,
  type PantryPatch,
} from '@home/shared'
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
  type QueryClient,
} from '@tanstack/react-query'
import { useRef } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { pantryKey, pantryQuery, shoppingListKey } from '../lib/queries'
import { useLiveTable } from './use-live-table'

const pantryChangeKey = (householdId: string) => ['pantry-change', householdId]

/** Stepper taps waiting to be saved, by pantry item id (shared by every component). */
const pendingSteps = new Map<string, ReturnType<typeof setTimeout>>()

function pantryBusy(queryClient: QueryClient, householdId: string) {
  return (
    pendingSteps.size > 0 ||
    queryClient.isMutating({ mutationKey: pantryChangeKey(householdId) }) > 0
  )
}

/** The pantry, live: anyone's changes show up as they happen. */
export function usePantry(householdId: string) {
  const queryClient = useQueryClient()
  const pantry = useSuspenseQuery(pantryQuery(householdId))
  useLiveTable({
    table: 'pantry_items',
    householdId,
    queryKey: pantryKey(householdId),
    busy: () => pantryBusy(queryClient, householdId),
  })
  return pantry.data
}

function patchPantry(
  queryClient: QueryClient,
  householdId: string,
  change: (items: PantryItem[]) => PantryItem[],
) {
  queryClient.setQueryData<PantryItem[]>(pantryKey(householdId), (items) => items && change(items))
}

/**
 * When a change settles: reload the list (low stock may have added to it), and the pantry once no
 * other change is on its way (the one settling still counts as in flight).
 */
function refresh(queryClient: QueryClient, householdId: string) {
  void queryClient.invalidateQueries({ queryKey: shoppingListKey(householdId) })
  const inFlight = queryClient.isMutating({ mutationKey: pantryChangeKey(householdId) })
  if (pendingSteps.size === 0 && inFlight <= 1) {
    void queryClient.invalidateQueries({ queryKey: pantryKey(householdId) })
  }
}

/**
 * The − / + stepper: the number changes at once, and the new quantity is saved 500 ms after the
 * last tap, so a run of taps is one write. Falling to the low-stock threshold puts the item on the
 * shopping list (the database does that) and says so.
 */
export function useAdjustPantryQty(householdId: string) {
  const queryClient = useQueryClient()
  // Quantity before the current run of taps, by item, to tell when it crosses the threshold.
  const before = useRef(new Map<string, number>())
  const save = useMutation({
    mutationKey: pantryChangeKey(householdId),
    mutationFn: ({ item, quantity }: { item: PantryItem; quantity: number }) =>
      updatePantryItem(supabase, item.id, { quantity }),
    onSuccess: (_data, { item, quantity }) => {
      const was = before.current.get(item.id) ?? item.quantity
      before.current.delete(item.id)
      const crossed =
        isLowStock({ quantity, lowStockThreshold: item.lowStockThreshold }) &&
        !isLowStock({ quantity: was, lowStockThreshold: item.lowStockThreshold })
      if (crossed) toast(`${item.name} is running low, so it's on the shopping list`)
    },
    onError: (error, { item }) => {
      before.current.delete(item.id)
      toast.error(`Couldn't update ${item.name}. ${errorMessage(error)}`)
    },
    onSettled: () => refresh(queryClient, householdId),
  })

  return (item: PantryItem, quantity: number) => {
    if (!before.current.has(item.id)) before.current.set(item.id, item.quantity)
    patchPantry(queryClient, householdId, (items) =>
      items.map((i) => (i.id === item.id ? { ...i, quantity } : i)),
    )
    clearTimeout(pendingSteps.get(item.id))
    pendingSteps.set(
      item.id,
      setTimeout(() => {
        pendingSteps.delete(item.id)
        save.mutate({ item, quantity })
      }, 500),
    )
  }
}

/** Saves the item page's edits (quantity, unit, place, expiry, threshold). */
export function useUpdatePantryItem(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: pantryChangeKey(householdId),
    mutationFn: ({ item, patch }: { item: PantryItem; patch: PantryPatch }) =>
      updatePantryItem(supabase, item.id, patch),
    onMutate: ({ item, patch }) => {
      patchPantry(queryClient, householdId, (items) =>
        items.map((i) => (i.id === item.id ? { ...i, ...patch } : i)),
      )
    },
    onSuccess: (_data, { item, patch }) => {
      const next = { ...item, ...patch }
      if (isLowStock(next) && !isLowStock(item)) {
        toast(`${item.name} is running low, so it's on the shopping list`)
      }
    },
    onError: (error) => toast.error(`Couldn't save. ${errorMessage(error)}`),
    onSettled: () => refresh(queryClient, householdId),
  })
}

/** Starts tracking an item in the pantry (or reports that it's already there). */
export function useAddToPantry(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: pantryChangeKey(householdId),
    mutationFn: ({ item, location }: { item: KitchenItem; location: PantryLocation }) =>
      addToPantry(supabase, householdId, item, location),
    onError: (error) => toast.error(`Couldn't add it. ${errorMessage(error)}`),
    onSettled: () => refresh(queryClient, householdId),
  })
}

/** Stops tracking an item, with Undo in the toast. */
export function useRemovePantryItem(householdId: string) {
  const queryClient = useQueryClient()
  const restore = useMutation({
    mutationKey: pantryChangeKey(householdId),
    mutationFn: (item: PantryItem) => restorePantryItem(supabase, item),
    onError: (error) => toast.error(`Couldn't put it back. ${errorMessage(error)}`),
    onSettled: () => refresh(queryClient, householdId),
  })
  return useMutation({
    mutationKey: pantryChangeKey(householdId),
    mutationFn: (item: PantryItem) => removePantryItem(supabase, item.id),
    onMutate: (item) => {
      patchPantry(queryClient, householdId, (items) => items.filter((i) => i.id !== item.id))
    },
    onSuccess: (_data, item) => {
      toast(`Removed ${item.name} from the pantry`, {
        action: { label: 'Undo', onClick: () => restore.mutate(item) },
      })
    },
    onError: (error) => toast.error(`Couldn't remove it. ${errorMessage(error)}`),
    onSettled: () => refresh(queryClient, householdId),
  })
}

/** "Running low": puts the item on the shopping list unless it's already there. */
export function useMarkRunningLow(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (item: PantryItem) =>
      addToShoppingList(supabase, householdId, item.catalogItem, {
        source: 'pantry',
        reopen: false,
      }),
    onSuccess: ({ status }, item) => {
      toast(
        status === 'added'
          ? `Added ${item.name} to the shopping list`
          : `${item.name} is already on the shopping list`,
      )
    },
    onError: (error) => toast.error(`Couldn't add it to the list. ${errorMessage(error)}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: shoppingListKey(householdId) }),
  })
}
