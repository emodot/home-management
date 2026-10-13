import {
  addMeal,
  addPlanToList,
  copyMealWeek,
  removeMeal,
  setMealLeftovers,
  setMealSlots,
  uncook,
  updateMeal,
  type KitchenUnit,
  type LeftoverInput,
  type MealInput,
  type MealSlot,
} from '@home/shared'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useCurrentUser } from '@/hooks/use-household'
import { errorMessage } from '@/lib/errors'
import { householdsQuery } from '@/lib/queries'
import { supabase } from '@/lib/supabase'
import { mealsKey, shoppingListKey, weekMealsQuery } from '../lib/queries'
import { useLiveTable } from './use-live-table'

const mealChangeKey = (householdId: string) => ['meal-change', householdId]

/** A week's meals, live: anyone's changes show up as they happen. */
export function useWeekMeals(householdId: string, weekStart: string) {
  const queryClient = useQueryClient()
  const query = weekMealsQuery(householdId, weekStart)
  const meals = useSuspenseQuery(query)
  useLiveTable({
    table: 'meal_plan_entries',
    householdId,
    queryKey: query.queryKey,
    busy: () => queryClient.isMutating({ mutationKey: mealChangeKey(householdId) }) > 0,
  })
  return meals.data
}

/** Every change to the plan: refresh the weeks shown once it's saved, say so if it isn't. */
function useMealChange<T, R>(householdId: string, change: (input: T) => Promise<R>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: mealChangeKey(householdId),
    mutationFn: change,
    onError: (error) => toast.error(`Couldn't change the plan. ${errorMessage(error)}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: mealsKey(householdId) }),
  })
}

export function useAddMeal(householdId: string) {
  return useMealChange(householdId, (meal: MealInput) => addMeal(supabase, householdId, meal))
}

/** How many a meal is for and, for a pot, which later meals it covers. */
export function useEditMeal(householdId: string) {
  return useMealChange(
    householdId,
    async ({
      id,
      servings,
      leftovers,
    }: {
      id: string
      servings: number | null
      leftovers: LeftoverInput[] | null
    }) => {
      await updateMeal(supabase, id, { servings })
      if (leftovers) await setMealLeftovers(supabase, id, leftovers)
    },
  )
}

export function useRemoveMeal(householdId: string) {
  return useMealChange(householdId, (id: string) => removeMeal(supabase, id))
}

export function useCopyMealWeek(householdId: string) {
  return useMealChange(householdId, ({ from, to }: { from: string; to: string }) =>
    copyMealWeek(supabase, householdId, from, to),
  )
}

/** Household admins choose the slots the plan shows. */
export function useSetMealSlots(householdId: string) {
  const user = useCurrentUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (slots: MealSlot[]) => setMealSlots(supabase, householdId, slots),
    onError: (error) => toast.error(`Couldn't change the slots. ${errorMessage(error)}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: householdsQuery(user.id).queryKey }),
  })
}

/** What the week's plan needs beyond the pantry, onto the list for that week. */
export function useAddPlanToList(householdId: string, weekStart: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (lines: { itemId: string; quantity: number; unit: KitchenUnit }[]) =>
      addPlanToList(supabase, householdId, weekStart, lines),
    onError: (error) => toast.error(`Couldn't add them. ${errorMessage(error)}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: shoppingListKey(householdId) }),
  })
}

/** A pot marked cooked by mistake: unmarks it (the pantry is left as it is). */
export function useMarkNotCooked(householdId: string) {
  return useMealChange(householdId, (mealId: string) => uncook(supabase, householdId, [], mealId))
}
