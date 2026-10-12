import {
  deleteRecipe,
  removeRecipePhoto,
  saveRecipe,
  setRecipePhoto,
  type Recipe,
  type RecipeFormValues,
} from '@home/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { recipeQuery, recipesKey } from '../lib/queries'

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
