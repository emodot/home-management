import { unwrap, type HomeClient } from '../client.ts'
import type { Json, Tables } from '../database.types.ts'
import type { Recipe, RecipeSummary } from './recipes.ts'
import type { RecipeFormValues } from './schemas.ts'
import { isKitchenUnit, type KitchenUnit } from './units.ts'

export const RECIPE_PHOTOS_BUCKET = 'recipe-photos'
/** Signed URLs are short-lived; refetch rather than store them. */
export const RECIPE_PHOTO_URL_TTL_SECONDS = 3600

const num = (value: number | string) => (typeof value === 'string' ? Number(value) : value)

/** The household's recipes, A–Z, with how many ingredients each has. */
export async function listRecipes(
  client: HomeClient,
  householdId: string,
): Promise<RecipeSummary[]> {
  const rows = unwrap(
    await client
      .from('recipes')
      .select(
        'id, title, servings, prep_minutes, cook_minutes, tags, photo_path, updated_at, ingredients:recipe_ingredients(count)',
      )
      .eq('household_id', householdId)
      .order('title'),
  )
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    servings: r.servings,
    prepMinutes: r.prep_minutes,
    cookMinutes: r.cook_minutes,
    tags: r.tags,
    photoPath: r.photo_path,
    ingredientCount: r.ingredients[0]?.count ?? 0,
    updatedAt: r.updated_at,
  }))
}

type RecipeRow = Tables<'recipes'> & {
  ingredients: (Tables<'recipe_ingredients'> & { item: { name: string } | null })[]
  steps: Tables<'recipe_steps'>[]
}

export function toRecipe(row: RecipeRow): Recipe {
  return {
    id: row.id,
    householdId: row.household_id,
    title: row.title,
    servings: row.servings,
    prepMinutes: row.prep_minutes,
    cookMinutes: row.cook_minutes,
    tags: row.tags,
    notes: row.notes,
    photoPath: row.photo_path,
    updatedAt: row.updated_at,
    ingredients: [...row.ingredients]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({
        id: i.id,
        itemId: i.item_id,
        name: i.item?.name ?? '',
        quantity: i.quantity === null ? null : num(i.quantity),
        unit: isKitchenUnit(i.unit) ? i.unit : 'pcs',
        isOptional: i.is_optional,
        note: i.note,
      })),
    steps: [...row.steps].sort((a, b) => a.position - b.position).map((s) => s.body),
  }
}

/** One recipe with its ingredients and steps, or null if it isn't this household's. */
export async function getRecipe(client: HomeClient, id: string): Promise<Recipe | null> {
  const row = unwrap(
    await client
      .from('recipes')
      .select(
        '*, ingredients:recipe_ingredients(*, item:kitchen_items(name)), steps:recipe_steps(*)',
      )
      .eq('id', id)
      .maybeSingle(),
  )
  return row ? toRecipe(row) : null
}

/** Several recipes with their ingredients and steps (those that are this household's). */
export async function getRecipes(client: HomeClient, ids: string[]): Promise<Recipe[]> {
  if (ids.length === 0) return []
  const rows = unwrap(
    await client
      .from('recipes')
      .select(
        '*, ingredients:recipe_ingredients(*, item:kitchen_items(name)), steps:recipe_steps(*)',
      )
      .in('id', ids),
  )
  return rows.map(toRecipe)
}

/**
 * Creates a recipe (no `recipeId`) or replaces one's details, ingredients and steps, from the
 * parsed recipe form.
 */
export async function saveRecipe(
  client: HomeClient,
  householdId: string,
  recipeId: string | null,
  v: RecipeFormValues,
): Promise<string> {
  const ingredients: Json = v.ingredients.map((i) => ({
    item_id: i.itemId,
    quantity: i.quantity,
    unit: i.unit,
    is_optional: i.isOptional,
    note: i.note,
  }))
  return unwrap(
    await client.rpc('save_recipe', {
      p_household_id: householdId,
      p_recipe_id: recipeId,
      p_title: v.title,
      p_servings: v.servings,
      p_prep_minutes: v.prepMinutes,
      p_cook_minutes: v.cookMinutes,
      p_tags: v.tags,
      p_notes: v.notes,
      p_ingredients: ingredients,
      p_steps: v.steps,
    }),
  )
}

/** Deletes a recipe (its ingredients and steps go with it) and then its photo. */
export async function deleteRecipe(
  client: HomeClient,
  recipe: Pick<Recipe, 'id' | 'photoPath'>,
): Promise<void> {
  unwrap(await client.from('recipes').delete().eq('id', recipe.id))
  if (recipe.photoPath) await client.storage.from(RECIPE_PHOTOS_BUCKET).remove([recipe.photoPath])
}

/**
 * Uploads a (prepared JPEG) photo as the recipe's photo, then removes the one it replaces.
 * `{householdId}/{recipeId}/{fileId}.jpg`
 */
export async function setRecipePhoto(
  client: HomeClient,
  recipe: Pick<Recipe, 'id' | 'householdId' | 'photoPath'>,
  data: Blob | ArrayBuffer,
): Promise<string> {
  const path = `${recipe.householdId}/${recipe.id}/${crypto.randomUUID()}.jpg`
  const body =
    typeof Blob !== 'undefined' && data instanceof Blob && data.type !== 'image/jpeg'
      ? new Blob([data], { type: 'image/jpeg' })
      : data
  const { error: uploadError } = await client.storage
    .from(RECIPE_PHOTOS_BUCKET)
    .upload(path, body, { contentType: 'image/jpeg', upsert: false })
  if (uploadError) throw uploadError
  const { error } = await client.from('recipes').update({ photo_path: path }).eq('id', recipe.id)
  if (error) {
    await client.storage.from(RECIPE_PHOTOS_BUCKET).remove([path])
    throw error
  }
  if (recipe.photoPath) await client.storage.from(RECIPE_PHOTOS_BUCKET).remove([recipe.photoPath])
  return path
}

export async function removeRecipePhoto(
  client: HomeClient,
  recipe: Pick<Recipe, 'id' | 'photoPath'>,
): Promise<void> {
  unwrap(await client.from('recipes').update({ photo_path: null }).eq('id', recipe.id))
  if (recipe.photoPath) await client.storage.from(RECIPE_PHOTOS_BUCKET).remove([recipe.photoPath])
}

/** Signed URLs for recipe photos, by path (paths that can't be signed are left out). */
export async function recipePhotoUrls(
  client: HomeClient,
  paths: string[],
): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  const signed = unwrap(
    await client.storage
      .from(RECIPE_PHOTOS_BUCKET)
      .createSignedUrls(paths, RECIPE_PHOTO_URL_TTL_SECONDS),
  )
  return Object.fromEntries(
    signed.flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl]] : [])),
  )
}

/** What happened to each line of "Add missing to list" (see add_recipe_to_list). */
export type RecipeListStatus = 'added' | 'topped_up' | 'covered' | 'kept'

/**
 * Puts what a recipe is short of on the shopping list, for that recipe: new entries are added,
 * entries already there are topped up to what's needed when the units convert (never a second
 * entry). Returns what happened to each item.
 */
export async function addRecipeToList(
  client: HomeClient,
  householdId: string,
  recipeId: string,
  lines: { itemId: string; quantity: number; unit: KitchenUnit }[],
): Promise<{ itemId: string; status: RecipeListStatus }[]> {
  const result = unwrap(
    await client.rpc('add_recipe_to_list', {
      p_household_id: householdId,
      p_recipe_id: recipeId,
      p_lines: lines.map((l) => ({ item_id: l.itemId, quantity: l.quantity, unit: l.unit })),
    }),
  ) as { item_id: string; status: RecipeListStatus }[]
  return result.map((r) => ({ itemId: r.item_id, status: r.status }))
}

/**
 * Puts what the week's plan needs on the shopping list, for that week's plan; merges with the
 * list like addRecipeToList.
 */
export async function addPlanToList(
  client: HomeClient,
  householdId: string,
  weekStart: string,
  lines: { itemId: string; quantity: number; unit: KitchenUnit }[],
): Promise<{ itemId: string; status: RecipeListStatus }[]> {
  const result = unwrap(
    await client.rpc('add_plan_to_list', {
      p_household_id: householdId,
      p_week_start: weekStart,
      p_lines: lines.map((l) => ({ item_id: l.itemId, quantity: l.quantity, unit: l.unit })),
    }),
  ) as { item_id: string; status: RecipeListStatus }[]
  return result.map((r) => ({ itemId: r.item_id, status: r.status }))
}

/** What "Cooked it" did to one item (see cook_recipe); uncook takes these back. */
export interface CookChange {
  itemId: string
  status: 'used' | 'ran_out' | 'not_in_pantry' | 'skipped'
  used: number
  unit: KitchenUnit | null
}

/** Takes what a pot used out of the pantry (and marks the planned meal cooked). */
export async function cookRecipe(
  client: HomeClient,
  householdId: string,
  lines: { itemId: string; quantity: number; unit: KitchenUnit }[],
  mealId?: string,
): Promise<CookChange[]> {
  const result = unwrap(
    await client.rpc('cook_recipe', {
      p_household_id: householdId,
      p_lines: lines.map((l) => ({ item_id: l.itemId, quantity: l.quantity, unit: l.unit })),
      ...(mealId ? { p_meal_id: mealId } : {}),
    }),
  ) as { item_id: string; status: CookChange['status']; used: number | string; unit?: string }[]
  return result.map((r) => ({
    itemId: r.item_id,
    status: r.status,
    used: Number(r.used),
    unit: r.unit && isKitchenUnit(r.unit) ? r.unit : null,
  }))
}

/** Undoes cookRecipe: puts the amounts back and unmarks the meal. */
export async function uncook(
  client: HomeClient,
  householdId: string,
  changes: CookChange[],
  mealId?: string,
): Promise<void> {
  unwrap(
    await client.rpc('uncook', {
      p_household_id: householdId,
      p_changes: changes.map((c) => ({ item_id: c.itemId, used: c.used, unit: c.unit })),
      ...(mealId ? { p_meal_id: mealId } : {}),
    }),
  )
}
