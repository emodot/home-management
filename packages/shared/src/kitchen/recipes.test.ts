import { describe, expect, it } from 'vitest'
import {
  formatMinutes,
  recipeTagSuggestions,
  scaleAmount,
  STARTER_RECIPE_TAGS,
  totalMinutes,
} from './recipes.ts'
import type { KitchenUnit } from './units.ts'

describe('scaleAmount', () => {
  // Jollof rice for 4, made for 10 (× 2.5).
  const jollof: [number, KitchenUnit, string][] = [
    [3, 'derica', '7.5 derica'],
    [500, 'g', '1.25 kg'],
    [1.5, 'kg', '3.75 kg'],
    [400, 'ml', '1 litre'],
    [2, 'tin', '5 tin'],
    [3, 'pcs', '7.5 pcs'],
    [1, 'sachet', '2.5 sachet'],
    [5, 'pcs', '12.5 pcs'],
  ]

  it('scales a recipe with 8 ingredients from 4 to 10 servings', () => {
    const scaled = jollof.map(([q, u]) => scaleAmount(q, u, 4, 10))
    expect(scaled.map((s) => `${s.quantity} ${s.unit}`)).toEqual(jollof.map(([, , want]) => want))
    expect(scaled.every((s) => !s.rounded)).toBe(true)
  })

  it('rounds counted things to the nearest half, never below a half', () => {
    expect(scaleAmount(3, 'tin', 4, 6)).toMatchObject({ quantity: 4.5, rounded: false })
    expect(scaleAmount(1, 'tin', 3, 4)).toMatchObject({
      quantity: 1.5,
      exact: 4 / 3,
      rounded: true,
    })
    expect(scaleAmount(1, 'pcs', 10, 1)).toMatchObject({ quantity: 0.5, rounded: true })
  })

  it('keeps weights and volumes to two decimals, in the unit that reads better', () => {
    expect(scaleAmount(1, 'kg', 4, 1)).toMatchObject({ quantity: 250, unit: 'g', rounded: false })
    expect(scaleAmount(100, 'g', 3, 4)).toMatchObject({
      quantity: 133.33,
      unit: 'g',
      rounded: true,
    })
    expect(scaleAmount(750, 'ml', 2, 4)).toMatchObject({ quantity: 1.5, unit: 'litre' })
  })

  it('leaves the same servings alone', () => {
    expect(scaleAmount(2, 'bunch', 4, 4)).toMatchObject({
      quantity: 2,
      unit: 'bunch',
      rounded: false,
    })
  })
})

describe('recipeTagSuggestions', () => {
  it("offers the starter tags, then the household's own by use", () => {
    const tags = recipeTagSuggestions([
      { tags: ['Soup', 'Sunday'] },
      { tags: ['sunday', 'Quick'] },
      { tags: ['Christmas'] },
    ])
    expect(tags).toEqual([...STARTER_RECIPE_TAGS, 'Sunday', 'Christmas', 'Quick'])
  })
})

describe('times', () => {
  it('formats minutes', () => {
    expect(formatMinutes(45)).toBe('45 min')
    expect(formatMinutes(60)).toBe('1 hr')
    expect(formatMinutes(75)).toBe('1 hr 15 min')
  })

  it('adds prep and cook time', () => {
    expect(totalMinutes({ prepMinutes: 15, cookMinutes: null })).toBe(15)
    expect(totalMinutes({ prepMinutes: null, cookMinutes: null })).toBeNull()
  })
})
