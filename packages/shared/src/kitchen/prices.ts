import { addDays, type IsoDate } from '../dates.ts'
import type { KitchenUnit } from './units.ts'

/** One purchase of an item, from a finished shopping trip. */
export interface PricePoint {
  id: string
  itemId: string
  name: string
  boughtOn: IsoDate
  quantity: number
  unit: KitchenUnit
  /** What was paid for the whole line. */
  priceMinor: number
  /** Per one unit: the figure that's compared over time. */
  unitPriceMinor: number
  storeTag: string | null
  createdAt: string
}

export interface PriceSummary {
  itemId: string
  name: string
  latest: PricePoint
  /** The purchase before it in the same unit (prices in different units don't compare). */
  previous: PricePoint | null
  /** Change in the per-unit price since `previous`, as a fraction (0.12 = up 12%). */
  change: number | null
  purchases: number
}

const newestFirst = (a: PricePoint, b: PricePoint) =>
  b.boughtOn.localeCompare(a.boughtOn) || b.createdAt.localeCompare(a.createdAt)

/** Each item's latest price and how it moved since the time before. */
export function summarizePrices(points: PricePoint[]): PriceSummary[] {
  const byItem = new Map<string, PricePoint[]>()
  for (const p of points) byItem.set(p.itemId, [...(byItem.get(p.itemId) ?? []), p])
  return [...byItem.values()].flatMap((all) => {
    const sorted = [...all].sort(newestFirst)
    const latest = sorted[0]
    if (!latest) return []
    const previous = sorted.slice(1).find((p) => p.unit === latest.unit) ?? null
    return {
      itemId: latest.itemId,
      name: latest.name,
      latest,
      previous,
      change: previous
        ? (latest.unitPriceMinor - previous.unitPriceMinor) / previous.unitPriceMinor
        : null,
      purchases: sorted.length,
    }
  })
}

export type PriceSort = 'recent' | 'increase' | 'name'

/** Most recently bought, biggest increase first (unknown changes last), or A–Z. */
export function sortPriceSummaries(summaries: PriceSummary[], sort: PriceSort): PriceSummary[] {
  const byName = (a: PriceSummary, b: PriceSummary) => a.name.localeCompare(b.name)
  return [...summaries].sort((a, b) => {
    if (sort === 'name') return byName(a, b)
    if (sort === 'increase') {
      if (a.change === null || b.change === null) {
        return a.change === b.change ? byName(a, b) : a.change === null ? 1 : -1
      }
      return b.change - a.change || byName(a, b)
    }
    return newestFirst(a.latest, b.latest) || byName(a, b)
  })
}

/** How far back "recently" reaches when comparing stores. */
export const RECENT_DAYS = 90

/**
 * The store with the lowest per-unit price lately: each store's most recent price in `unit`
 * from the last RECENT_DAYS, lowest first. Null when fewer than two stores have one.
 */
export function cheapestRecentStore(
  points: PricePoint[],
  unit: KitchenUnit,
  today: IsoDate,
): { store: string; unitPriceMinor: number } | null {
  const since = addDays(today, -RECENT_DAYS)
  const latestByStore = new Map<string, PricePoint>()
  for (const p of [...points].sort(newestFirst)) {
    if (p.unit !== unit || !p.storeTag || p.boughtOn < since) continue
    if (!latestByStore.has(p.storeTag)) latestByStore.set(p.storeTag, p)
  }
  if (latestByStore.size < 2) return null
  const cheapest = [...latestByStore.entries()].sort(
    (a, b) => a[1].unitPriceMinor - b[1].unitPriceMinor,
  )[0]
  if (!cheapest) return null
  return { store: cheapest[0], unitPriceMinor: cheapest[1].unitPriceMinor }
}

export interface PriceSeries {
  /** "Mile 12", or null for purchases without a store. */
  store: string | null
  points: { date: IsoDate; unitPriceMinor: number }[]
}

/** Stores past this many are left to the table (more lines than this can't be told apart). */
export const MAX_CHART_STORES = 4

/**
 * The chart's lines: per-unit prices over time in `unit`, one line per store (the stores bought
 * from most, in a stable order), oldest first. Also says what was left out.
 */
export function priceSeries(
  points: PricePoint[],
  unit: KitchenUnit,
): { series: PriceSeries[]; otherStores: number; otherUnits: number } {
  const inUnit = points.filter((p) => p.unit === unit)
  const byStore = new Map<string | null, PricePoint[]>()
  for (const p of inUnit) byStore.set(p.storeTag, [...(byStore.get(p.storeTag) ?? []), p])
  // Most purchases first; ties by name, with "no store" last.
  const ranked = [...byStore.entries()].sort(
    (a, b) =>
      b[1].length - a[1].length ||
      (a[0] === null ? 1 : b[0] === null ? -1 : a[0].localeCompare(b[0])),
  )
  const shown = ranked.slice(0, MAX_CHART_STORES)
  return {
    series: shown.map(([store, ps]) => ({
      store,
      points: [...ps]
        .sort(
          (a, b) => a.boughtOn.localeCompare(b.boughtOn) || a.createdAt.localeCompare(b.createdAt),
        )
        .map((p) => ({ date: p.boughtOn, unitPriceMinor: p.unitPriceMinor })),
    })),
    otherStores: ranked.length - shown.length,
    otherUnits: points.length - inUnit.length,
  }
}

/**
 * The unit an item is usually bought in (prices only compare within a unit): the most common one,
 * the latest purchase's on a tie. Null without purchases.
 */
export function mainUnit(points: PricePoint[]): KitchenUnit | null {
  const latest = [...points].sort(newestFirst)[0]
  if (!latest) return null
  const counts = new Map<KitchenUnit, number>()
  for (const p of points) counts.set(p.unit, (counts.get(p.unit) ?? 0) + 1)
  const best = Math.max(...counts.values())
  return (counts.get(latest.unit) ?? 0) === best
    ? latest.unit
    : ([...counts.entries()].find(([, n]) => n === best)?.[0] ?? latest.unit)
}
