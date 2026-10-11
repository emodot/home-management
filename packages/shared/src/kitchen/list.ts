import type { KitchenUnit } from './units.ts'

export type ListItemSource = 'manual' | 'pantry' | 'meal_plan'

/** An entry on the household's shopping list, with its catalogue item's name. */
export interface ShoppingListItem {
  id: string
  householdId: string
  itemId: string
  name: string
  quantity: number
  unit: KitchenUnit
  storeTag: string | null
  notes: string | null
  isChecked: boolean
  checkedBy: string | null
  source: ListItemSource
  /** Who put it on the list. */
  addedBy: string | null
  createdAt: string
}

export interface StoreGroup<T> {
  /** Null for entries without a store. */
  store: string | null
  items: T[]
}

const storeKey = (store: string | null) => store?.trim().toLowerCase() ?? ''

/**
 * Entries grouped by store: stores alphabetically (spelling differences in case ignored, first
 * spelling shown), entries without a store last, each group in the order the entries were added.
 */
export function groupByStore<T extends { storeTag: string | null; createdAt: string }>(
  items: T[],
): StoreGroup<T>[] {
  const groups = new Map<string, StoreGroup<T>>()
  const sorted = [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  for (const item of sorted) {
    const key = storeKey(item.storeTag)
    const group = groups.get(key) ?? {
      store: item.storeTag?.trim() ? item.storeTag.trim() : null,
      items: [],
    }
    group.items.push(item)
    groups.set(key, group)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
    .map(([, group]) => group)
}

/** Store tags in order of preference, without repeats (case ignored), at most `limit`. */
export function mergeStoreTags(lists: (string | null | undefined)[][], limit = 8): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const tag of lists.flat()) {
    const trimmed = tag?.trim()
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue
    seen.add(trimmed.toLowerCase())
    out.push(trimmed)
    if (out.length === limit) break
  }
  return out
}
