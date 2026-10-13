import type { IsoDate } from '../dates.ts'
import {
  checkPantry,
  linesToBuy,
  type BuyLine,
  type IngredientCheck,
  type ItemUnitConversion,
  type Stock,
} from './cook.ts'
import { potServings, type MealEntry } from './plan.ts'
import type { Recipe, RecipeIngredient } from './recipes.ts'

/** A pot to shop for: a recipe meal that's cooked (not leftovers), for everyone it feeds. */
export interface Pot {
  meal: MealEntry
  recipe: Recipe
  servings: number
}

/**
 * The week's pots still to cook: recipe meals on or after `from` (today, for this week), each for
 * the servings of the meal and its leftovers (the recipe's own servings when none are given).
 * Meals whose recipe is gone are left out.
 */
export function potsToShopFor(
  meals: readonly MealEntry[],
  recipes: readonly Recipe[],
  from: IsoDate,
): Pot[] {
  return meals.flatMap((meal) => {
    if (meal.leftoverOf || !meal.recipeId || meal.date < from) return []
    const recipe = recipes.find((r) => r.id === meal.recipeId)
    if (!recipe) return []
    return [{ meal, recipe, servings: potServings(meal, meals) ?? recipe.servings }]
  })
}

export interface PlanLine extends BuyLine {
  /** The recipes it's for, A–Z. */
  recipes: string[]
}

export interface PlanNeeds {
  /** What to buy, one line per item, with the pantry taken off. */
  lines: PlanLine[]
  /** Ingredients the pantry holds in a unit that doesn't convert: worth a look, not counted. */
  toCheck: IngredientCheck[]
}

/**
 * Everything the pots need, against the pantry: each pot's ingredients scaled to its servings,
 * the pantry used up across them (so two pots share what's there), and one line per item to buy.
 */
export function planNeeds(
  pots: readonly Pot[],
  pantry: readonly Stock[],
  conversions: readonly ItemUnitConversion[],
): PlanNeeds {
  const titles = new Map<string, Set<string>>()
  const ingredients: RecipeIngredient[] = pots.flatMap(({ meal, recipe, servings }) =>
    recipe.ingredients.map((i) => {
      titles.set(i.itemId, (titles.get(i.itemId) ?? new Set()).add(recipe.title))
      return {
        ...i,
        id: `${meal.id}:${i.id}`,
        quantity: i.quantity === null ? null : (i.quantity * servings) / recipe.servings,
      }
    }),
  )
  // A "to taste" item in several pots needs buying once.
  const seen = new Set<string>()
  const unique = ingredients.filter((i) => {
    if (i.quantity !== null) return true
    if (seen.has(i.itemId)) return false
    seen.add(i.itemId)
    return true
  })
  const checks = checkPantry(unique, 1, 1, pantry, conversions)
  return {
    lines: linesToBuy(checks, conversions).map((line) => ({
      ...line,
      recipes: [...(titles.get(line.itemId) ?? [])].sort((a, b) => a.localeCompare(b)),
    })),
    toCheck: checks.filter((c) => c.status.kind === 'check'),
  }
}
