import { addDays, monthRange, type IsoDate } from '../dates.ts'
import type { RecipeIngredient } from './recipes.ts'
import { convert, type KitchenUnit, type UnitConversion } from './units.ts'

/** Pantry stock as far as cooking cares. */
export interface Stock {
  itemId: string
  quantity: number
  unit: KitchenUnit
}

/** A purchase as far as costing cares (PricePoint has these). */
export interface PurchasePrice {
  itemId: string
  boughtOn: IsoDate
  quantity: number
  unit: KitchenUnit
  priceMinor: number
}

/** A conversion and the item it belongs to. */
export type ItemUnitConversion = UnitConversion & { itemId: string }

const conversionsOf = (all: readonly ItemUnitConversion[], itemId: string) =>
  all.filter((c) => c.itemId === itemId)

const METRIC = new Set<KitchenUnit>(['g', 'kg', 'ml', 'litre'])

/** Up to something you can buy: a half of anything counted, a hundredth of a kg or litre. */
function roundUp(quantity: number, unit: KitchenUnit): number {
  const step = METRIC.has(unit) ? 0.01 : 0.5
  return Math.max(step, Math.ceil(quantity / step - 1e-9) * step)
}

export type StockStatus =
  /** Enough in the pantry. */
  | { kind: 'have' }
  /** Some, but `shortBy` (in the ingredient's unit) too little. */
  | { kind: 'short'; shortBy: number }
  | { kind: 'missing' }
  /** Some, in a unit that doesn't convert to the recipe's: worth a look. */
  | { kind: 'check'; have: { quantity: number; unit: KitchenUnit } }

export interface IngredientCheck {
  ingredient: RecipeIngredient
  /** For the servings asked, exact; null for "to taste". */
  needed: number | null
  status: StockStatus
  /** What to put on the list for it (in the ingredient's unit), or null when nothing's short. */
  toBuy: { quantity: number; unit: KitchenUnit } | null
}

/**
 * "Can I cook this?": each ingredient, scaled to `servings`, against the pantry. Stock is used up
 * in order, so an item listed twice needs enough for both. "To taste" needs some of it in the
 * pantry (one of the recipe's unit to buy if not). Stock in a unit that doesn't convert is
 * "check": it's not counted missing.
 */
export function checkPantry(
  ingredients: readonly RecipeIngredient[],
  fromServings: number,
  toServings: number,
  pantry: readonly Stock[],
  conversions: readonly ItemUnitConversion[],
): IngredientCheck[] {
  // What's left of each item, in its pantry unit, as ingredients take from it.
  const left = new Map(pantry.map((s) => [s.itemId, { ...s }]))

  return ingredients.map((ingredient): IngredientCheck => {
    const stock = left.get(ingredient.itemId)
    const some = !!stock && stock.quantity > 0
    if (ingredient.quantity === null) {
      return some
        ? { ingredient, needed: null, status: { kind: 'have' }, toBuy: null }
        : {
            ingredient,
            needed: null,
            status: { kind: 'missing' },
            toBuy: { quantity: 1, unit: ingredient.unit },
          }
    }

    const needed = (ingredient.quantity * toServings) / fromServings
    const buy = (quantity: number) => ({
      quantity: roundUp(quantity, ingredient.unit),
      unit: ingredient.unit,
    })
    if (!stock || !some) {
      return { ingredient, needed, status: { kind: 'missing' }, toBuy: buy(needed) }
    }
    const own = conversionsOf(conversions, ingredient.itemId)
    const have = convert(stock.quantity, stock.unit, ingredient.unit, own)
    if (have === null) {
      return {
        ingredient,
        needed,
        status: { kind: 'check', have: { quantity: stock.quantity, unit: stock.unit } },
        toBuy: null,
      }
    }
    if (have >= needed - 1e-9) {
      stock.quantity -= convert(needed, ingredient.unit, stock.unit, own) ?? 0
      return { ingredient, needed, status: { kind: 'have' }, toBuy: null }
    }
    stock.quantity = 0
    const shortBy = needed - have
    return { ingredient, needed, status: { kind: 'short', shortBy }, toBuy: buy(shortBy) }
  })
}

/** Missing or short, and not optional: what stops you cooking it. */
export function isBlocking(check: IngredientCheck): boolean {
  return (
    !check.ingredient.isOptional &&
    (check.status.kind === 'missing' || check.status.kind === 'short')
  )
}

export interface CostLine {
  ingredient: RecipeIngredient
  /** Null when there's no price for it (in a unit that converts). */
  costMinor: number | null
  /** The purchase the cost is based on. */
  basedOn: PurchasePrice | null
}

export interface RecipeCost {
  /** The ingredients with a price, not counting optional ones. */
  totalMinor: number
  /** Optional ingredients with a price, on top. */
  optionalMinor: number
  lines: CostLine[]
  /** Ingredients (with a quantity, not optional) that have no usable price. */
  unpriced: RecipeIngredient[]
}

/**
 * What a pot costs at `servings`, from the latest price of each ingredient bought on or before
 * `asOf` (in a unit that converts to the recipe's, through the item's conversions). "To taste"
 * ingredients aren't counted.
 */
export function recipeCost(
  ingredients: readonly RecipeIngredient[],
  fromServings: number,
  toServings: number,
  prices: readonly PurchasePrice[],
  conversions: readonly ItemUnitConversion[],
  asOf?: IsoDate,
): RecipeCost {
  const newestFirst = [...prices]
    .filter((p) => !asOf || p.boughtOn <= asOf)
    .sort((a, b) => b.boughtOn.localeCompare(a.boughtOn))
  const lines = ingredients.map((ingredient): CostLine => {
    if (ingredient.quantity === null) return { ingredient, costMinor: null, basedOn: null }
    const needed = (ingredient.quantity * toServings) / fromServings
    const own = conversionsOf(conversions, ingredient.itemId)
    for (const p of newestFirst) {
      if (p.itemId !== ingredient.itemId) continue
      const inPriceUnit = convert(needed, ingredient.unit, p.unit, own)
      if (inPriceUnit === null) continue
      return { ingredient, costMinor: (inPriceUnit * p.priceMinor) / p.quantity, basedOn: p }
    }
    return { ingredient, costMinor: null, basedOn: null }
  })
  const sum = (optional: boolean) =>
    Math.round(
      lines
        .filter((l) => l.ingredient.isOptional === optional)
        .reduce((total, l) => total + (l.costMinor ?? 0), 0),
    )
  return {
    totalMinor: sum(false),
    optionalMinor: sum(true),
    lines,
    unpriced: lines
      .filter(
        (l) => l.costMinor === null && l.ingredient.quantity !== null && !l.ingredient.isOptional,
      )
      .map((l) => l.ingredient),
  }
}

/** How far back "then" is when comparing a pot's cost. */
export const COST_COMPARE_DAYS = 90

/**
 * The pot's cost now against COST_COMPARE_DAYS ago, over the ingredients that had a price both
 * times (so a newly priced ingredient isn't mistaken for a rise). Null when none did.
 */
export function costChange(
  ingredients: readonly RecipeIngredient[],
  fromServings: number,
  toServings: number,
  prices: readonly PurchasePrice[],
  conversions: readonly ItemUnitConversion[],
  today: IsoDate,
): { thenMinor: number; nowMinor: number; change: number } | null {
  const required = ingredients.filter((i) => !i.isOptional)
  const now = recipeCost(required, fromServings, toServings, prices, conversions, today)
  const then = recipeCost(
    required,
    fromServings,
    toServings,
    prices,
    conversions,
    addDays(today, -COST_COMPARE_DAYS),
  )
  let nowMinor = 0
  let thenMinor = 0
  now.lines.forEach((line, i) => {
    const earlier = then.lines[i]?.costMinor
    if (line.costMinor === null || earlier === null || earlier === undefined) return
    nowMinor += line.costMinor
    thenMinor += earlier
  })
  if (thenMinor <= 0) return null
  return {
    thenMinor: Math.round(thenMinor),
    nowMinor: Math.round(nowMinor),
    change: (nowMinor - thenMinor) / thenMinor,
  }
}

/**
 * The pot's estimated cost at the end of each of the last `months` months (the current one up to
 * `today`), oldest first, using the prices known by then. Months before anything had a price are
 * left out.
 */
export function costByMonth(
  ingredients: readonly RecipeIngredient[],
  fromServings: number,
  toServings: number,
  prices: readonly PurchasePrice[],
  conversions: readonly ItemUnitConversion[],
  today: IsoDate,
  months = 6,
): { date: IsoDate; totalMinor: number }[] {
  const required = ingredients.filter((i) => !i.isOptional)
  const points: { date: IsoDate; totalMinor: number }[] = []
  for (let offset = months - 1; offset >= 0; offset--) {
    const end = monthRange(today, -offset).to
    const date = end > today ? today : end
    const cost = recipeCost(required, fromServings, toServings, prices, conversions, date)
    if (cost.lines.some((l) => l.costMinor !== null)) {
      points.push({ date, totalMinor: cost.totalMinor })
    }
  }
  return points
}

/** One item to put on the list for a recipe. */
export interface BuyLine {
  itemId: string
  name: string
  quantity: number
  unit: KitchenUnit
  /** Every ingredient it's for is optional. */
  optional: boolean
  /** Some is in the pantry, just not enough. */
  short: boolean
}

/**
 * What to put on the list, one line per item: an item the recipe uses twice is added up (in the
 * first one's unit when they convert, otherwise kept as separate lines).
 */
export function linesToBuy(
  checks: readonly IngredientCheck[],
  conversions: readonly ItemUnitConversion[],
): BuyLine[] {
  const lines: BuyLine[] = []
  for (const check of checks) {
    if (!check.toBuy) continue
    const { ingredient, toBuy } = check
    const own = conversionsOf(conversions, ingredient.itemId)
    const line = lines.find(
      (l) =>
        l.itemId === ingredient.itemId && convert(toBuy.quantity, toBuy.unit, l.unit, own) !== null,
    )
    const short = check.status.kind === 'short'
    if (line) {
      line.quantity = roundUp(
        line.quantity + (convert(toBuy.quantity, toBuy.unit, line.unit, own) ?? 0),
        line.unit,
      )
      line.optional &&= ingredient.isOptional
      line.short ||= short
    } else {
      lines.push({
        itemId: ingredient.itemId,
        name: ingredient.name,
        quantity: toBuy.quantity,
        unit: toBuy.unit,
        optional: ingredient.isOptional,
        short,
      })
    }
  }
  return lines
}
