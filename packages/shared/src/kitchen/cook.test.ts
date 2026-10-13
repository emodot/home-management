import { describe, expect, it } from 'vitest'
import {
  checkPantry,
  cookLines,
  costByMonth,
  costChange,
  isBlocking,
  linesToBuy,
  recipeCost,
  type PurchasePrice,
} from './cook.ts'
import type { RecipeIngredient } from './recipes.ts'
import type { KitchenUnit } from './units.ts'

const ing = (
  itemId: string,
  quantity: number | null,
  unit: KitchenUnit,
  isOptional = false,
): RecipeIngredient => ({
  id: `${itemId}-${unit}`,
  itemId,
  name: itemId,
  quantity,
  unit,
  isOptional,
  note: null,
})

const rice = ing('rice', 3, 'derica')
const tomatoes = ing('tomatoes', 500, 'g')
const oil = ing('oil', 200, 'ml')
const pepper = ing('pepper', 4, 'pcs')
const salt = ing('salt', null, 'pcs')
const shrimp = ing('shrimp', 1, 'pack')

describe('checkPantry', () => {
  const conversions = [{ itemId: 'rice', unit: 'bag' as const, factor: 50, toUnit: 'kg' as const }]

  it('says what you have, what is short or missing, and what to check', () => {
    const checks = checkPantry(
      [rice, tomatoes, oil, pepper, salt],
      4,
      8,
      [
        { itemId: 'rice', quantity: 1, unit: 'bag' }, // bag ↔ derica doesn't convert
        { itemId: 'tomatoes', quantity: 0.4, unit: 'kg' },
        { itemId: 'oil', quantity: 1, unit: 'litre' },
        { itemId: 'salt', quantity: 1, unit: 'pcs' },
      ],
      conversions,
    )
    expect(checks.map((c) => [c.ingredient.itemId, c.status.kind, c.toBuy])).toEqual([
      ['rice', 'check', null],
      ['tomatoes', 'short', { quantity: 600, unit: 'g' }],
      ['oil', 'have', null],
      ['pepper', 'missing', { quantity: 8, unit: 'pcs' }],
      ['salt', 'have', null],
    ])
    expect(checks.filter(isBlocking).map((c) => c.ingredient.itemId)).toEqual([
      'tomatoes',
      'pepper',
    ])
  })

  it('uses stock up across an item listed twice', () => {
    const checks = checkPantry(
      [ing('onion', 2, 'pcs'), ing('onion', 2, 'pcs')],
      4,
      4,
      [{ itemId: 'onion', quantity: 3, unit: 'pcs' }],
      [],
    )
    expect(checks.map((c) => c.status)).toEqual([{ kind: 'have' }, { kind: 'short', shortBy: 1 }])
  })

  it("rounds what to buy up to something you can buy, and asks for one of a 'to taste' you're out of", () => {
    const checks = checkPantry([ing('egg', 1, 'pcs'), salt], 3, 4, [], [])
    expect(checks.map((c) => c.toBuy)).toEqual([
      { quantity: 1.5, unit: 'pcs' },
      { quantity: 1, unit: 'pcs' },
    ])
  })

  it("doesn't block on optional ingredients", () => {
    const [check] = checkPantry([ing('crayfish', 1, 'derica', true)], 4, 4, [], [])
    expect(check && isBlocking(check)).toBe(false)
  })
})

const bought = (
  itemId: string,
  boughtOn: string,
  quantity: number,
  unit: KitchenUnit,
  priceMinor: number,
): PurchasePrice => ({
  itemId,
  boughtOn,
  quantity,
  unit,
  priceMinor,
})

describe('recipeCost', () => {
  const prices = [
    bought('rice', '2026-06-01', 1, 'bag', 7500000),
    bought('rice', '2026-09-01', 1, 'bag', 9000000),
    bought('tomatoes', '2026-09-10', 2, 'kg', 300000),
    bought('oil', '2026-09-10', 1, 'litre', 250000),
    bought('pepper', '2026-09-10', 1, 'paint_bucket', 200000), // doesn't convert to pieces
  ]
  // 1 derica of rice = 1.25 kg here.
  const conversions = [
    { itemId: 'rice', unit: 'bag' as const, factor: 50, toUnit: 'kg' as const },
    { itemId: 'rice', unit: 'derica' as const, factor: 1.25, toUnit: 'kg' as const },
  ]

  it('prices each ingredient from its latest purchase in a unit that converts', () => {
    const cost = recipeCost([rice, tomatoes, oil, pepper, salt], 4, 4, prices, conversions)
    // rice 3 derica = 3.75 kg = 0.075 bag × ₦90,000; tomatoes 0.5 kg × ₦1,500; oil 0.2 l × ₦2,500
    expect(cost.lines.map((l) => l.costMinor)).toEqual([675000, 75000, 50000, null, null])
    expect(cost.totalMinor).toBe(800000)
    expect(cost.unpriced.map((i) => i.itemId)).toEqual(['pepper'])
  })

  it('scales with servings and keeps optional ingredients apart', () => {
    const cost = recipeCost([tomatoes, ing('oil', 200, 'ml', true)], 4, 8, prices, conversions)
    expect(cost.totalMinor).toBe(150000)
    expect(cost.optionalMinor).toBe(100000)
  })

  it('uses only prices known by a date', () => {
    expect(recipeCost([rice], 4, 4, prices, conversions, '2026-07-01').totalMinor).toBe(562500)
    expect(recipeCost([rice], 4, 4, prices, conversions, '2026-05-01').unpriced).toHaveLength(1)
  })

  it('compares with 3 months ago over what was priced both times', () => {
    const change = costChange([rice, tomatoes, shrimp], 4, 4, prices, conversions, '2026-10-12')
    // Only rice had a price on 2026-07-14: ₦5,625 then, ₦6,750 now.
    expect(change).toEqual({ thenMinor: 562500, nowMinor: 675000, change: 0.2 })
    expect(costChange([tomatoes], 4, 4, prices, conversions, '2026-10-12')).toBeNull()
  })

  it('estimates the cost at the end of each month', () => {
    expect(costByMonth([rice, tomatoes], 4, 4, prices, conversions, '2026-10-12', 6)).toEqual([
      { date: '2026-06-30', totalMinor: 562500 },
      { date: '2026-07-31', totalMinor: 562500 },
      { date: '2026-08-31', totalMinor: 562500 },
      { date: '2026-09-30', totalMinor: 750000 },
      { date: '2026-10-12', totalMinor: 750000 },
    ])
  })
})

describe('linesToBuy', () => {
  it('adds up an item the recipe uses twice', () => {
    const checks = checkPantry(
      [
        ing('onion', 2, 'pcs'),
        ing('pepper', 1, 'pcs', true),
        ing('onion', 1, 'pcs', true),
        ing('beef', 500, 'g'),
        ing('beef', 1, 'kg'),
      ],
      4,
      4,
      [],
      [],
    )
    expect(linesToBuy(checks, [])).toEqual([
      { itemId: 'onion', name: 'onion', quantity: 3, unit: 'pcs', optional: false, short: false },
      { itemId: 'pepper', name: 'pepper', quantity: 1, unit: 'pcs', optional: true, short: false },
      { itemId: 'beef', name: 'beef', quantity: 1500, unit: 'g', optional: false, short: false },
    ])
  })
})

describe('cookLines', () => {
  it('works out what comes out of the pantry, and what will be left', () => {
    const lines = cookLines(
      [
        ing('egusi', 2, 'derica'),
        ing('oil', 200, 'ml'),
        ing('oil', 100, 'ml', true),
        ing('salt', null, 'pcs'),
        ing('rice', 1, 'derica'),
        ing('crayfish', 1, 'derica'),
      ],
      4,
      8,
      [
        { itemId: 'egusi', quantity: 10, unit: 'derica' },
        { itemId: 'oil', quantity: 0.5, unit: 'litre' },
        { itemId: 'rice', quantity: 1, unit: 'bag' },
      ],
      [],
    )
    expect(lines.map((l) => [l.itemId, l.quantity, l.unit, l.optional, l.left])).toEqual([
      ['egusi', 4, 'derica', false, 6],
      // 400 ml + 200 ml (optional too) of a 0.5 l bottle: down to nothing.
      ['oil', 600, 'ml', false, 0],
      // Held in bags: can't say.
      ['rice', 2, 'derica', false, null],
      ['crayfish', 2, 'derica', false, null],
    ])
    expect(lines.find((l) => l.itemId === 'crayfish')?.stock).toBeNull()
  })
})
