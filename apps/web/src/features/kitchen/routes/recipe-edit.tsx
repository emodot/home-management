import { recipeTagSuggestions } from '@home/shared'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useActiveHousehold } from '@/hooks/use-household'
import { FROM_THE_TOP } from '@/lib/scroll'
import { ItemHeading } from '../components/item-heading'
import { RecipeForm } from '../components/recipe-form'
import { recipePhotosQuery, recipeQuery, recipesQuery } from '../lib/queries'

/** After saving: the recipe, from the top (not where it was last scrolled to). */
function useOpenRecipe() {
  const navigate = useNavigate()
  return useCallback(
    (id: string) => void navigate(`/kitchen/recipes/${id}`, { replace: true, state: FROM_THE_TOP }),
    [navigate],
  )
}

export function NewRecipePage() {
  const household = useActiveHousehold()
  const recipes = useSuspenseQuery(recipesQuery(household.id)).data
  const open = useOpenRecipe()
  return (
    <div className="flex flex-col gap-6">
      <ItemHeading name="New recipe" back="/kitchen/recipes" backLabel="Back to recipes" />
      <RecipeForm
        recipe={null}
        tagSuggestions={recipeTagSuggestions(recipes)}
        photoUrl={undefined}
        onSaved={open}
      />
    </div>
  )
}

export function EditRecipePage() {
  const household = useActiveHousehold()
  const recipeId = useParams().recipeId ?? ''
  const recipe = useSuspenseQuery(recipeQuery(household.id, recipeId)).data
  const recipes = useSuspenseQuery(recipesQuery(household.id)).data
  const paths = recipe?.photoPath ? [recipe.photoPath] : []
  const photos = useQuery(recipePhotosQuery(household.id, paths)).data ?? {}
  const open = useOpenRecipe()
  if (!recipe) return null
  return (
    <div className="flex flex-col gap-6">
      <ItemHeading
        name={`Edit ${recipe.title}`}
        back={`/kitchen/recipes/${recipe.id}`}
        backLabel="Back to the recipe"
      />
      <RecipeForm
        key={recipe.id}
        recipe={recipe}
        tagSuggestions={recipeTagSuggestions(recipes)}
        photoUrl={recipe.photoPath ? photos[recipe.photoPath] : undefined}
        onSaved={open}
      />
    </div>
  )
}
