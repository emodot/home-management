import { addDays, type IsoDate } from '../dates.ts'
import type { KitchenItem } from './queries.ts'
import type { KitchenUnit } from './units.ts'

export const PANTRY_LOCATIONS = ['fridge', 'freezer', 'pantry', 'store_room'] as const
export type PantryLocation = (typeof PANTRY_LOCATIONS)[number]

export const LOCATION_LABELS: Record<PantryLocation, string> = {
  fridge: 'Fridge',
  freezer: 'Freezer',
  pantry: 'Pantry',
  store_room: 'Store room',
}

export function isPantryLocation(value: string): value is PantryLocation {
  return Object.hasOwn(LOCATION_LABELS, value)
}

/** Something in the kitchen, with its catalogue item's name. */
export interface PantryItem {
  id: string
  householdId: string
  itemId: string
  name: string
  /** Its catalogue entry (usual unit and store, for putting it on the list). */
  catalogItem: KitchenItem
  quantity: number
  unit: KitchenUnit
  location: PantryLocation
  expiresOn: IsoDate | null
  /** At or below this, it's running low (and goes on the shopping list). */
  lowStockThreshold: number | null
  updatedAt: string
}

export function isOut(item: Pick<PantryItem, 'quantity'>): boolean {
  return item.quantity <= 0
}

export function isLowStock(item: Pick<PantryItem, 'quantity' | 'lowStockThreshold'>): boolean {
  return item.lowStockThreshold !== null && item.quantity <= item.lowStockThreshold
}

/** Items count as "use soon" this many days before they expire. */
export const USE_SOON_DAYS = 3

export type ExpiryStatus =
  | { kind: 'none' }
  | { kind: 'expired'; days: number }
  | { kind: 'soon'; days: number }
  | { kind: 'later'; days: number }

const DAY_MS = 86_400_000

/** How an expiry date stands against today (both plain dates, so time zones don't shift it). */
export function expiryStatus(expiresOn: IsoDate | null, today: IsoDate): ExpiryStatus {
  if (!expiresOn) return { kind: 'none' }
  const days = Math.round((Date.parse(expiresOn) - Date.parse(today)) / DAY_MS)
  if (days < 0) return { kind: 'expired', days: -days }
  return { kind: days <= USE_SOON_DAYS ? 'soon' : 'later', days }
}

/** "Expired 2 days ago", "Expires today", "Expires tomorrow", "Expires in 3 days". */
export function expiryLabel(status: ExpiryStatus): string | null {
  switch (status.kind) {
    case 'none':
      return null
    case 'expired':
      return status.days === 0
        ? 'Expired'
        : `Expired ${status.days === 1 ? 'yesterday' : `${status.days} days ago`}`
    default:
      return status.days === 0
        ? 'Expires today'
        : status.days === 1
          ? 'Expires tomorrow'
          : `Expires in ${status.days} days`
  }
}

/** Expired items and those expiring within USE_SOON_DAYS, soonest (most overdue) first. */
export function itemsToUseSoon<T extends Pick<PantryItem, 'expiresOn' | 'quantity'>>(
  items: T[],
  today: IsoDate,
): T[] {
  const limit = addDays(today, USE_SOON_DAYS)
  return items
    .filter((item) => item.expiresOn !== null && item.expiresOn <= limit && !isOut(item))
    .sort((a, b) => (a.expiresOn ?? '').localeCompare(b.expiresOn ?? ''))
}

/** One step of the − / + buttons: a whole unit, never below zero. */
export function stepQuantity(quantity: number, direction: 1 | -1): number {
  return Math.max(0, Math.round((quantity + direction) * 100) / 100)
}
