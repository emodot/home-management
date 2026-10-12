/**
 * Units for kitchen items, including the local market measures (mudu, derica, paint bucket). The
 * database checks `default_unit` against this list, so adding one needs a migration too.
 */
export const KITCHEN_UNITS = [
  'pcs',
  'kg',
  'g',
  'litre',
  'ml',
  'bag',
  'tuber',
  'crate',
  'tin',
  'sachet',
  'pack',
  'bunch',
  'mudu',
  'paint_bucket',
  'derica',
] as const
export type KitchenUnit = (typeof KITCHEN_UNITS)[number]

/** [one, many] */
const NAMES: Record<KitchenUnit, readonly [string, string]> = {
  pcs: ['piece', 'pieces'],
  kg: ['kg', 'kg'],
  g: ['g', 'g'],
  litre: ['litre', 'litres'],
  ml: ['ml', 'ml'],
  bag: ['bag', 'bags'],
  tuber: ['tuber', 'tubers'],
  crate: ['crate', 'crates'],
  tin: ['tin', 'tins'],
  sachet: ['sachet', 'sachets'],
  pack: ['pack', 'packs'],
  bunch: ['bunch', 'bunches'],
  mudu: ['mudu', 'mudu'],
  paint_bucket: ['paint bucket', 'paint buckets'],
  derica: ['derica', 'dericas'],
}

export function isKitchenUnit(value: string): value is KitchenUnit {
  return Object.hasOwn(NAMES, value)
}

/** "paint bucket" for 1, "paint buckets" otherwise. */
export function unitLabel(unit: KitchenUnit, quantity = 1): string {
  const [one, many] = NAMES[unit]
  return quantity === 1 ? one : many
}

const quantityFormat = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 2 })

/** "2 kg", "1.5 litres", "1 paint bucket", "3 pieces". */
export function formatQuantity(quantity: number, unit: KitchenUnit): string {
  return `${quantityFormat.format(quantity)} ${unitLabel(unit, quantity)}`
}

/** "1 bag = 50 kg" for one item: 1 `unit` is `factor` `toUnit`. */
export interface UnitConversion {
  unit: KitchenUnit
  factor: number
  toUnit: KitchenUnit
}

/** g/kg and ml/litre, true for every item. */
const METRIC: readonly UnitConversion[] = [
  { unit: 'kg', factor: 1000, toUnit: 'g' },
  { unit: 'litre', factor: 1000, toUnit: 'ml' },
]

/** How many steps a conversion may chain (bag → kg → g is two). */
const MAX_STEPS = 4

/**
 * `quantity` in `from` units expressed in `to` units, or null when they don't convert (a bag of
 * rice has no fixed weight unless the item says so). Follows g/kg, ml/litre and the item's own
 * `conversions`, both ways, along the shortest chain. kitchen_convert() in the database does the
 * same.
 */
export function convert(
  quantity: number,
  from: KitchenUnit,
  to: KitchenUnit,
  conversions: readonly UnitConversion[] = [],
): number | null {
  if (from === to) return quantity
  const edges = new Map<KitchenUnit, { to: KitchenUnit; factor: number }[]>()
  const link = (a: KitchenUnit, b: KitchenUnit, factor: number) =>
    edges.set(a, [...(edges.get(a) ?? []), { to: b, factor }])
  for (const c of [...METRIC, ...conversions]) {
    if (!(c.factor > 0) || c.unit === c.toUnit) continue
    link(c.unit, c.toUnit, c.factor)
    link(c.toUnit, c.unit, 1 / c.factor)
  }
  const seen = new Set<KitchenUnit>([from])
  let frontier: { unit: KitchenUnit; factor: number }[] = [{ unit: from, factor: 1 }]
  for (let step = 0; step < MAX_STEPS && frontier.length > 0; step++) {
    const next: typeof frontier = []
    for (const at of frontier) {
      for (const e of edges.get(at.unit) ?? []) {
        if (seen.has(e.to)) continue
        if (e.to === to) return quantity * at.factor * e.factor
        seen.add(e.to)
        next.push({ unit: e.to, factor: at.factor * e.factor })
      }
    }
    frontier = next
  }
  return null
}
