import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client'
import { del, get, set } from 'idb-keyval'
import { isShoppingListKey } from '@/features/kitchen/lib/queries'

/**
 * What's kept on this device (IndexedDB) between visits, so shopping keeps working without
 * signal: the shopping list, and list changes made offline that haven't reached the server yet
 * (they're sent the next time the app is online, even after it was closed). Nothing else.
 */
const persister = createAsyncStoragePersister({
  storage: {
    getItem: async (key) => (await get<string>(key)) ?? null,
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
  key: 'home-offline',
  throttleTime: 500,
})

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  // Bump to drop what devices have saved when its shape changes.
  buster: 'kitchen-1',
  dehydrateOptions: {
    shouldDehydrateQuery: (query) =>
      query.state.status === 'success' && isShoppingListKey(query.queryKey),
    // The default for mutations: keep the ones waiting for a connection.
  },
}

/** Forgets everything saved on this device (on sign-out or a change of account). */
export async function clearOfflineData() {
  await persister.removeClient()
}
