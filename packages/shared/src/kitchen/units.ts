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

/** Units that convert into each other, as multiples of the family's base unit. */
const FAMILIES: Partial<Record<KitchenUnit, { family: 'mass' | 'volume'; factor: number }>> = {
  g: { family: 'mass', factor: 1 },
  kg: { family: 'mass', factor: 1000 },
  ml: { family: 'volume', factor: 1 },
  litre: { family: 'volume', factor: 1000 },
}

/**
 * `quantity` in `from` units expressed in `to` units, or null when they don't convert (a bag of
 * rice has no fixed weight). Only metric mass and volume convert for now; v2 recipes compare
 * ingredient quantities with pantry stock through this.
 */
export function convert(quantity: number, from: KitchenUnit, to: KitchenUnit): number | null {
  if (from === to) return quantity
  const a = FAMILIES[from]
  const b = FAMILIES[to]
  if (!a || !b) return null
  if (a.family !== b.family) return null
  return (quantity * a.factor) / b.factor
}
