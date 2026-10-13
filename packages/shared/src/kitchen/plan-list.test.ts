import { describe, expect, it } from 'vitest'
import type { MealEntry } from './plan.ts'
import { weekCost } from './plan-budget.ts'
import { planNeeds, potsToShopFor } from './plan-list.ts'
import type { Recipe, RecipeIngredient } from './recipes.ts'
import type { KitchenUnit } from './units.ts'

const ing = (
  itemId: string,
  quantity: number | null,
  unit: KitchenUnit,
  isOptional = false,
): RecipeIngredient => ({
  id: itemId,
  itemId,
  name: itemId,
  quantity,
  unit,
  isOptional,
  note: null,
})

const recipe = (
  id: string,
  title: string,
  servings: number,
  ingredients: RecipeIngredient[],
): Recipe => ({
  id,
  householdId: 'h1',
  title,
  servings,
  prepMinutes: null,
  cookMinutes: null,
  tags: [],
  notes: null,
  photoPath: null,
  updatedAt: '',
  ingredients,
  steps: [],
})

const egusi = recipe('egusi', 'Egusi soup', 4, [
  ing('egusi', 2, 'derica'),
  ing('palm oil', 200, 'ml'),
  ing('salt', null, 'pcs'),
])
const jollof = recipe('jollof', 'Jollof rice', 4, [
  ing('rice', 3, 'derica'),
  ing('palm oil', 100, 'ml'),
  ing('salt', null, 'pcs'),
])

const meal = (
  id: string,
  date: string,
  recipeId: string | null,
  servings: number | null,
  leftoverOf: string | null = null,
): MealEntry => ({
  id,
  planId: 'p1',
  date,
  slot: leftoverOf ? 'lunch' : 'dinner',
  recipeId,
  title: id,
  servings,
  leftoverOf,
  cookedAt: null,
  createdAt: '',
})

describe('potsToShopFor', () => {
  const meals = [
    meal('sun', '2026-10-11', 'egusi', 4),
    meal('mon-lunch', '2026-10-12', 'egusi', 4, 'sun'),
    meal('tue', '2026-10-13', 'jollof', 4),
    meal('wed', '2026-10-14', 'jollof', 2),
    meal('wed-lunch', '2026-10-15', 'jollof', 2, 'wed'),
    meal('fri', '2026-10-16', null, null),
    meal('sat', '2026-10-17', 'deleted', 4),
  ]

  it('takes the pots still to cook, for everyone they feed', () => {
    const pots = potsToShopFor(meals, [egusi, jollof], '2026-10-13')
    expect(pots.map((p) => [p.meal.id, p.servings])).toEqual([
      ['tue', 4],
      ['wed', 4],
    ])
  })

  it('leaves out pots already cooked', () => {
    const cooked = meals.map((m) =>
      m.id === 'tue' ? { ...m, cookedAt: '2026-10-13T19:00:00Z' } : m,
    )
    expect(potsToShopFor(cooked, [egusi, jollof], '2026-10-13').map((p) => p.meal.id)).toEqual([
      'wed',
    ])
  })

  it("counts a whole future week, and a pot's leftovers once", () => {
    const pots = potsToShopFor(meals, [egusi, jollof], '2026-10-01')
    expect(pots.map((p) => [p.meal.id, p.servings])).toEqual([
      ['sun', 8],
      ['tue', 4],
      ['wed', 4],
    ])
  })
})

describe('planNeeds', () => {
  const pots = [
    { meal: meal('sun', '2026-10-11', 'egusi', 8), recipe: egusi, servings: 8 },
    { meal: meal('tue', '2026-10-13', 'jollof', 4), recipe: jollof, servings: 4 },
  ]

  it('adds up what the pots need and takes the pantry off once', () => {
    const { lines } = planNeeds(
      pots,
      [
        { itemId: 'palm oil', quantity: 0.25, unit: 'litre' },
        { itemId: 'egusi', quantity: 1, unit: 'derica' },
      ],
      [],
    )
    expect(lines.map((l) => [l.itemId, l.quantity, l.unit, l.recipes])).toEqual([
      // 4 derica for 8, 1 in the pantry.
      ['egusi', 3, 'derica', ['Egusi soup']],
      // 400 ml + 100 ml, 250 ml in the pantry.
      ['palm oil', 250, 'ml', ['Egusi soup', 'Jollof rice']],
      // To taste in both pots: one to buy.
      ['salt', 1, 'pcs', ['Egusi soup', 'Jollof rice']],
      ['rice', 3, 'derica', ['Jollof rice']],
    ])
  })

  it("leaves stock in units that don't convert to be checked", () => {
    const { lines, toCheck } = planNeeds(pots, [{ itemId: 'rice', quantity: 1, unit: 'bag' }], [])
    expect(lines.some((l) => l.itemId === 'rice')).toBe(false)
    expect(toCheck.map((c) => c.ingredient.itemId)).toEqual(['rice'])
  })
})

describe('weekCost', () => {
  it("adds up each pot's cost for everyone it feeds", () => {
    const pots = [
      { meal: meal('sun', '2026-10-11', 'egusi', 8), recipe: egusi, servings: 8 },
      { meal: meal('tue', '2026-10-13', 'jollof', 4), recipe: jollof, servings: 4 },
    ]
    const prices = [
      {
        itemId: 'egusi',
        boughtOn: '2026-10-01',
        quantity: 1,
        unit: 'derica' as const,
        priceMinor: 150000,
      },
      {
        itemId: 'palm oil',
        boughtOn: '2026-10-01',
        quantity: 1,
        unit: 'litre' as const,
        priceMinor: 300000,
      },
    ]
    // Egusi: 4 derica ₦6,000 + 0.4 l oil ₦1,200. Jollof: 0.1 l oil ₦300; rice has no price.
    expect(weekCost(pots, prices, [])).toEqual({ totalMinor: 750000, unpriced: ['rice'] })
  })
})
