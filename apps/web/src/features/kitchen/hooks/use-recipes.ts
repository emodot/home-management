import {
  addRecipeToList,
  cookRecipe,
  deleteRecipe,
  removeRecipePhoto,
  saveRecipe,
  setRecipePhoto,
  uncook,
  type CookChange,
  type KitchenUnit,
  type Recipe,
  type RecipeFormValues,
} from '@home/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { mealsKey, pantryKey, recipeQuery, recipesKey, shoppingListKey } from '../lib/queries'

/** What to do with the photo when saving: leave it, take it off, or use a new (prepared) one. */
export type PhotoChange =
  | { kind: 'keep' }
  | { kind: 'remove' }
  /** `preview` is an object URL for showing it before it's saved. */
  | { kind: 'set'; photo: Blob; preview: string }

/**
 * Saves a recipe, then its photo. A photo that fails to upload doesn't undo the recipe: it says
 * so, and the recipe is saved without it.
 */
export function useSaveRecipe(householdId: string, recipe: Recipe | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ values, photo }: { values: RecipeFormValues; photo: PhotoChange }) => {
      const id = await saveRecipe(supabase, householdId, recipe?.id ?? null, values)
      try {
        const current = { id, householdId, photoPath: recipe?.photoPath ?? null }
        if (photo.kind === 'set') await setRecipePhoto(supabase, current, photo.photo)
        if (photo.kind === 'remove' && current.photoPath) await removeRecipePhoto(supabase, current)
      } catch (error) {
        toast.error(`Saved, but the photo didn't change. ${errorMessage(error)}`)
      }
      return id
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: recipesKey(householdId) }),
  })
}

export function useDeleteRecipe(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (recipe: Recipe) => deleteRecipe(supabase, recipe),
    onSuccess: (_, recipe) => {
      queryClient.removeQueries({ queryKey: recipeQuery(householdId, recipe.id).queryKey })
      toast(`${recipe.title} deleted`)
    },
    onError: (error) => toast.error(`Couldn't delete it. ${errorMessage(error)}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: recipesKey(householdId) }),
  })
}

/** "Add missing to list": what the recipe is short of, onto the list for it. */
export function useAddRecipeToList(householdId: string, recipeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (lines: { itemId: string; quantity: number; unit: KitchenUnit }[]) =>
      addRecipeToList(supabase, householdId, recipeId, lines),
    onError: (error) => toast.error(`Couldn't add them. ${errorMessage(error)}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: shoppingListKey(householdId) }),
  })
}

/**
 * "Cooked it": takes what the pot used out of the pantry (and marks a planned meal cooked), with
 * Undo on the toast. Running low on something puts it on the list, as usual.
 */
export function useCookRecipe(householdId: string) {
  const queryClient = useQueryClient()
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: pantryKey(householdId) }),
      queryClient.invalidateQueries({ queryKey: shoppingListKey(householdId) }),
      queryClient.invalidateQueries({ queryKey: mealsKey(householdId) }),
    ])
  const undo = useMutation({
    mutationFn: ({ changes, mealId }: { changes: CookChange[]; mealId?: string }) =>
      uncook(supabase, householdId, changes, mealId),
    onSuccess: () => toast('Put back in the pantry'),
    onError: (error) => toast.error(`Couldn't undo it. ${errorMessage(error)}`),
    onSettled: refresh,
  })
  return useMutation({
    mutationFn: ({
      lines,
      mealId,
    }: {
      title: string
      lines: { itemId: string; quantity: number; unit: KitchenUnit }[]
      mealId?: string
    }) => cookRecipe(supabase, householdId, lines, mealId),
    onSuccess: (changes, { title, mealId }) => {
      const used = changes.filter((c) => c.used > 0).length
      toast.success(
        used > 0
          ? `${title} cooked: took ${used} ${used === 1 ? 'item' : 'items'} out of the pantry`
          : `${title} marked cooked`,
        { action: { label: 'Undo', onClick: () => undo.mutate({ changes, mealId }) } },
      )
    },
    onError: (error) => toast.error(`Couldn't update the pantry. ${errorMessage(error)}`),
    onSettled: refresh,
  })
}
