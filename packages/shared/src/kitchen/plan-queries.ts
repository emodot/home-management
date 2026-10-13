import { unwrap, type HomeClient } from '../client.ts'
import { addDays, type IsoDate } from '../dates.ts'
import type { Tables } from '../database.types.ts'
import { isMealSlot, type MealEntry, type MealSlot } from './plan.ts'

export function toMealEntry(row: Tables<'meal_plan_entries'>): MealEntry {
  return {
    id: row.id,
    planId: row.plan_id,
    date: row.date,
    slot: isMealSlot(row.slot) ? row.slot : 'dinner',
    recipeId: row.recipe_id,
    title: row.title,
    servings: row.servings,
    leftoverOf: row.leftover_of,
    cookedAt: row.cooked_at,
    createdAt: row.created_at,
  }
}

/** The meals planned for the week starting `weekStart` (a Sunday). */
export async function listWeekMeals(
  client: HomeClient,
  householdId: string,
  weekStart: IsoDate,
): Promise<MealEntry[]> {
  const rows = unwrap(
    await client
      .from('meal_plan_entries')
      .select('*')
      .eq('household_id', householdId)
      .gte('date', weekStart)
      .lte('date', addDays(weekStart, 6))
      .order('date')
      .order('created_at'),
  )
  return rows.map(toMealEntry)
}

export interface MealInput {
  date: IsoDate
  slot: MealSlot
  /** A recipe, or null for something written in (then `title` is needed). */
  recipeId: string | null
  title: string | null
  servings: number | null
  /** Later meals that week its pot also covers. */
  leftovers: LeftoverInput[]
}

export interface LeftoverInput {
  date: IsoDate
  slot: MealSlot
  servings: number | null
}

const toJson = (leftovers: LeftoverInput[]) =>
  leftovers.map((l) => ({ date: l.date, slot: l.slot, servings: l.servings }))

/** Plans a meal (with any leftovers it covers); returns its id. */
export async function addMeal(
  client: HomeClient,
  householdId: string,
  meal: MealInput,
): Promise<string> {
  return unwrap(
    await client.rpc('add_meal', {
      p_household_id: householdId,
      p_date: meal.date,
      p_slot: meal.slot,
      p_recipe_id: meal.recipeId,
      p_title: meal.title,
      p_servings: meal.servings,
      p_leftovers: toJson(meal.leftovers),
    }),
  )
}

/** Changes which later meals a meal's pot covers. */
export async function setMealLeftovers(
  client: HomeClient,
  mealId: string,
  leftovers: LeftoverInput[],
): Promise<void> {
  unwrap(
    await client.rpc('set_meal_leftovers', { p_entry_id: mealId, p_leftovers: toJson(leftovers) }),
  )
}

export async function updateMeal(
  client: HomeClient,
  mealId: string,
  patch: { servings?: number | null; title?: string },
): Promise<void> {
  unwrap(await client.from('meal_plan_entries').update(patch).eq('id', mealId))
}

/** Removes a meal (and, for a pot, the leftovers it covered). */
export async function removeMeal(client: HomeClient, mealId: string): Promise<void> {
  unwrap(await client.from('meal_plan_entries').delete().eq('id', mealId))
}

/** Copies one week's meals into another, empty, week; returns how many. */
export async function copyMealWeek(
  client: HomeClient,
  householdId: string,
  from: IsoDate,
  to: IsoDate,
): Promise<number> {
  return unwrap(
    await client.rpc('copy_meal_week', { p_household_id: householdId, p_from: from, p_to: to }),
  )
}

/** Which slots the household's plan shows (household admins). */
export async function setMealSlots(
  client: HomeClient,
  householdId: string,
  slots: MealSlot[],
): Promise<void> {
  unwrap(await client.rpc('set_meal_slots', { p_household_id: householdId, p_slots: slots }))
}
