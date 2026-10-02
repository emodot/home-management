import { useSyncExternalStore } from 'react'

const KEY = 'home.hide-income'
const listeners = new Set<() => void>()

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  // Another tab changing it.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function setIncomeHidden(hidden: boolean) {
  try {
    if (hidden) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    // Storage unavailable (private mode): the choice lasts until reload.
  }
  for (const listener of listeners) listener()
}

/**
 * Whether income figures are hidden on this device (e.g. when showing the app to someone).
 * Every income amount follows the same switch.
 */
export function useIncomeHidden(): boolean {
  return useSyncExternalStore(subscribe, read, () => false)
}
