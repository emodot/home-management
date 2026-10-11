import { isNetworkError, updateShoppingListItem, type ListEntryPatch } from '@home/shared'
import type { QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { shoppingListKey } from './queries'

export interface ListEntryUpdate {
  householdId: string
  id: string
  patch: ListEntryPatch
}

/** ['shopping-list-change', kind, householdId] */
export const listChangeKey = (kind: 'add' | 'update' | 'edit' | 'remove', householdId: string) => [
  'shopping-list-change',
  kind,
  householdId,
]

/** Whether a list change for this household is in flight (or waiting for a connection). */
export const isListChange = (key: readonly unknown[] | undefined, householdId: string) =>
  key?.[0] === 'shopping-list-change' && key[2] === householdId

/**
 * Reloads the list from the server once the last of its pending changes has settled. Reloading
 * after each one would briefly undo, on screen, the changes still on their way (e.g. a price
 * entered offline, after its check-off has synced).
 */
export function refreshListWhenSettled(queryClient: QueryClient, householdId: string) {
  const pending = queryClient.isMutating({
    // The change settling now still counts as pending.
    predicate: (mutation) => isListChange(mutation.options.mutationKey, householdId),
  })
  if (pending <= 1) {
    void queryClient.invalidateQueries({ queryKey: shoppingListKey(householdId) })
  }
}

/**
 * Checking entries off and entering prices work offline: these changes are applied on screen at
 * once, wait for a connection when there isn't one, and are retried while the network is flaky.
 * They run one at a time, in order. The function lives here (not in a component) so changes
 * saved on the device can be sent after the app restarts.
 */
export function registerOfflineListChanges(queryClient: QueryClient) {
  queryClient.setMutationDefaults(['shopping-list-change', 'update'], {
    mutationFn: ({ id, patch }: ListEntryUpdate) => updateShoppingListItem(supabase, id, patch),
    networkMode: 'offlineFirst',
    retry: (_failures, error) => isNetworkError(error),
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
    scope: { id: 'shopping-list' },
    onSettled: (_data, _error, { householdId }: ListEntryUpdate) => {
      refreshListWhenSettled(queryClient, householdId)
    },
  })
}
