import { addDays, formatDate, type IsoDate } from '../dates.ts'

/** Meal slots in the day's order; a household shows some of them (households.meal_slots). */
export const MEAL_SLOTS = ['breakfast', 'lunch', 'snack', 'dinner'] as const
export type MealSlot = (typeof MEAL_SLOTS)[number]

export const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snack: 'Snack',
  dinner: 'Dinner',
}

export function isMealSlot(value: string): value is MealSlot {
  return (MEAL_SLOTS as readonly string[]).includes(value)
}

/** The household's slots, known ones only, in the day's order (breakfast, lunch, dinner if none). */
export function householdSlots(slots: readonly string[] | null | undefined): MealSlot[] {
  const known = MEAL_SLOTS.filter((s) => slots?.includes(s))
  return known.length > 0 ? known : ['breakfast', 'lunch', 'dinner']
}

/** A planned meal. */
export interface MealEntry {
  id: string
  planId: string
  date: IsoDate
  slot: MealSlot
  /** Null for something written in, or a recipe that's since been deleted. */
  recipeId: string | null
  title: string
  /** How many are eating (null when it doesn't matter, e.g. "Eat out"). */
  servings: number | null
  /** For leftovers: the meal whose pot covers this one. */
  leftoverOf: string | null
  createdAt: string
}

/** The Sunday starting the week `date` is in (weeks run Sunday to Saturday). */
export function weekStartOf(date: IsoDate): IsoDate {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return addDays(date, -day)
}

/** The week's seven days, Sunday first. */
export function weekDays(weekStart: IsoDate): IsoDate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

export function isWeekStart(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && weekStartOf(value) === value
}

/** "11–17 Oct 2026", "28 Sept – 4 Oct 2026". */
export function formatWeek(weekStart: IsoDate): string {
  const end = addDays(weekStart, 6)
  const sameMonth = weekStart.slice(0, 7) === end.slice(0, 7)
  const from = formatDate(
    weekStart,
    sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' },
  )
  return `${from}${sameMonth ? '–' : ' – '}${formatDate(end, { day: 'numeric', month: 'short', year: 'numeric' })}`
}

const slotIndex = (slot: MealSlot) => MEAL_SLOTS.indexOf(slot)

/** Meals in the order they're eaten: by day, then slot, then when they were planned. */
export function byMealTime(a: MealEntry, b: MealEntry): number {
  return (
    a.date.localeCompare(b.date) ||
    slotIndex(a.slot) - slotIndex(b.slot) ||
    a.createdAt.localeCompare(b.createdAt)
  )
}

/** The meals of the week after `date`'s `slot` that a pot cooked then could cover. */
export function laterMeals(
  date: IsoDate,
  slot: MealSlot,
  slots: readonly MealSlot[],
): { date: IsoDate; slot: MealSlot }[] {
  return weekDays(weekStartOf(date)).flatMap((day) =>
    slots
      .filter((s) => day > date || (day === date && slotIndex(s) > slotIndex(slot)))
      .map((s) => ({ date: day, slot: s })),
  )
}

/** A meal's leftovers, in the order they're eaten. */
export function leftoversOf(meal: MealEntry, meals: readonly MealEntry[]): MealEntry[] {
  return meals.filter((m) => m.leftoverOf === meal.id).sort(byMealTime)
}

/** Everyone a pot feeds: the meal it's cooked for and its leftovers (null if none is counted). */
export function potServings(meal: MealEntry, meals: readonly MealEntry[]): number | null {
  const all = [meal, ...leftoversOf(meal, meals)].map((m) => m.servings)
  return all.some((s) => s !== null) ? all.reduce<number>((sum, s) => sum + (s ?? 0), 0) : null
}

/** "Mon 12 · Lunch" */
export function mealTimeLabel(date: IsoDate, slot: MealSlot): string {
  return `${formatDate(date, { weekday: 'short', day: 'numeric' })} · ${SLOT_LABELS[slot]}`
}
