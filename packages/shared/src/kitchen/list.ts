import type { KitchenUnit } from './units.ts'

export type ListItemSource = 'manual' | 'pantry' | 'meal_plan' | 'recipe'

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
  /** What was paid for the whole line (entered in shopping mode), or null if skipped. */
  pricePaidMinor: number | null
  source: ListItemSource
  /** The recipe (source 'recipe') or meal plan it was added for. */
  sourceRef: string | null
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

export interface ShoppingProgress {
  /** Entries on the list. */
  count: number
  /** Entries checked off. */
  checked: number
  /** What's been paid so far: the prices entered for checked entries. */
  totalMinor: number
  /** Checked entries without a price. */
  unpriced: number
}

export function shoppingProgress(
  items: { isChecked: boolean; pricePaidMinor: number | null }[],
): ShoppingProgress {
  const checked = items.filter((item) => item.isChecked)
  return {
    count: items.length,
    checked: checked.length,
    totalMinor: checked.reduce((sum, item) => sum + (item.pricePaidMinor ?? 0), 0),
    unpriced: checked.filter((item) => item.pricePaidMinor === null).length,
  }
}

/**
 * The price per one of `quantity` units, for a whole-line price ("₦5,000 for 2 kg" → ₦2,500 a
 * kg). Null when there's no price or it's a single unit anyway.
 */
export function unitPriceMinor(lineMinor: number | null, quantity: number): number | null {
  if (lineMinor === null || quantity <= 0 || quantity === 1) return null
  return Math.round(lineMinor / quantity)
}
