import { convert, type KitchenUnit } from './units.ts'

export interface RecipeIngredient {
  id: string
  itemId: string
  name: string
  /** Null for "to taste". */
  quantity: number | null
  unit: KitchenUnit
  isOptional: boolean
  /** "chopped", "for frying". */
  note: string | null
}

export interface RecipeSummary {
  id: string
  title: string
  servings: number
  prepMinutes: number | null
  cookMinutes: number | null
  tags: string[]
  photoPath: string | null
  ingredientCount: number
  updatedAt: string
}

export interface Recipe extends Omit<RecipeSummary, 'ingredientCount'> {
  householdId: string
  notes: string | null
  ingredients: RecipeIngredient[]
  steps: string[]
}

/** Offered as chips on every recipe form, before the household's own tags. */
export const STARTER_RECIPE_TAGS = [
  'Soup',
  'Stew',
  'Swallow',
  'Rice',
  'Breakfast',
  'Snack',
  'Party',
] as const

/**
 * Tags to offer: the starter ones, then the household's own, most used first (A–Z on ties). The
 * same tag in another case counts once, spelled as first seen.
 */
export function recipeTagSuggestions(recipes: readonly { tags: readonly string[] }[]): string[] {
  const counts = new Map<string, { tag: string; count: number }>()
  for (const tag of recipes.flatMap((r) => r.tags)) {
    const key = tag.toLowerCase()
    const seen = counts.get(key)
    counts.set(key, { tag: seen?.tag ?? tag, count: (seen?.count ?? 0) + 1 })
  }
  const starter = new Set(STARTER_RECIPE_TAGS.map((t) => t.toLowerCase()))
  const own = [...counts.entries()]
    .filter(([key]) => !starter.has(key))
    .map(([, v]) => v)
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .map((v) => v.tag)
  return [...STARTER_RECIPE_TAGS, ...own]
}

/** "45 min", "1 hr", "1 hr 15 min". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`
}

/** Prep plus cook time, or null when neither is known. */
export function totalMinutes(recipe: Pick<Recipe, 'prepMinutes' | 'cookMinutes'>): number | null {
  if (recipe.prepMinutes === null && recipe.cookMinutes === null) return null
  return (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0)
}

const METRIC: Partial<Record<KitchenUnit, { small: KitchenUnit; large: KitchenUnit }>> = {
  g: { small: 'g', large: 'kg' },
  kg: { small: 'g', large: 'kg' },
  ml: { small: 'ml', large: 'litre' },
  litre: { small: 'ml', large: 'litre' },
}

const round = (n: number, step: number) => Math.round(n / step) * step

export interface ScaledAmount {
  quantity: number
  unit: KitchenUnit
  /** The scaled figure before rounding, in the recipe's own unit. */
  exact: number
  /** Whether `quantity` (in `unit`) isn't exactly `exact`. */
  rounded: boolean
}

/**
 * An ingredient's quantity for `toServings` instead of `fromServings`, rounded to something you
 * can measure: weights and volumes to two decimals in g or kg (ml or litres), whichever reads
 * better (1,250 g → 1.25 kg); anything counted (pieces, tins, mudu…) to the nearest half, never
 * below a half.
 */
export function scaleAmount(
  quantity: number,
  unit: KitchenUnit,
  fromServings: number,
  toServings: number,
): ScaledAmount {
  const exact = (quantity * toServings) / fromServings
  const metric = METRIC[unit]
  if (metric) {
    const small = convert(exact, unit, metric.small) ?? exact
    const shown = small >= 1000 ? metric.large : metric.small
    const value = round(convert(small, metric.small, shown) ?? small, 0.01)
    const back = convert(value, shown, unit) ?? value
    return { quantity: value, unit: shown, exact, rounded: Math.abs(back - exact) > 1e-9 }
  }
  const value = Math.max(0.5, round(exact, 0.5))
  return { quantity: value, unit, exact, rounded: Math.abs(value - exact) > 1e-9 }
}
