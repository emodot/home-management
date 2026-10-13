import { formatQuantity, planNeeds, potsToShopFor, type MealEntry } from '@home/shared'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { useActiveHousehold } from '@/hooks/use-household'
import { useAddPlanToList } from '../hooks/use-meals'
import { conversionsQuery, pantryQuery, planRecipesQuery, shoppingListQuery } from '../lib/queries'
import { AddMissingSheet } from './add-missing-sheet'

/**
 * The week's shopping: what the pots still to cook (from `from` on) need beyond the pantry, as a
 * review before it goes on the list for this week's plan.
 */
export function PlanShoppingSheet({
  open,
  weekStart,
  from,
  meals,
  onClose,
}: {
  open: boolean
  weekStart: string
  /** Today for this week (meals before it are cooked); the week's start for a later one. */
  from: string
  meals: MealEntry[]
  onClose: () => void
}) {
  const household = useActiveHousehold()
  const ids = [
    ...new Set(
      meals.flatMap((m) => (m.recipeId && !m.leftoverOf && m.date >= from ? [m.recipeId] : [])),
    ),
  ]
  const recipes = useQuery({ ...planRecipesQuery(household.id, ids), enabled: open })
  const pantry = useQuery({ ...pantryQuery(household.id), enabled: open })
  const list = useQuery({ ...shoppingListQuery(household.id), enabled: open })
  const conversions = useQuery({ ...conversionsQuery(household.id), enabled: open })
  const add = useAddPlanToList(household.id, weekStart)

  const ready = !!(recipes.data && pantry.data && list.data && conversions.data)
  const pots = recipes.data ? potsToShopFor(meals, recipes.data, from) : []
  const needs =
    pantry.data && conversions.data && list.data
      ? planNeeds(pots, pantry.data, conversions.data)
      : { lines: [], toCheck: [] }

  const description = !ready
    ? 'Working out what the week needs…'
    : pots.length === 0
      ? 'There are no recipes left to cook this week, so there’s nothing to buy for them.'
      : needs.lines.length === 0
        ? `The pantry has what ${pots.length === 1 ? 'the recipe' : `all ${pots.length} recipes`} need.`
        : `What ${pots.length === 1 ? 'the recipe' : `the ${pots.length} recipes`} still to cook this week ${pots.length === 1 ? 'needs' : 'need'} beyond what’s in the pantry. Leftovers are counted in their pot; anything already on the list is topped up rather than added twice.`

  return (
    <AddMissingSheet
      open={open}
      title="Shopping for the week"
      description={description}
      lines={needs.lines}
      list={list.data ?? []}
      add={add}
      footnote={
        needs.toCheck.length > 0 && (
          <p>
            Not counted:{' '}
            {needs.toCheck.map((c, i) => (
              <span key={c.ingredient.id}>
                {i > 0 && ', '}
                <Link
                  to={`/kitchen/items/${c.ingredient.itemId}`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {c.ingredient.name}
                </Link>
                {c.status.kind === 'check' &&
                  ` (you have ${formatQuantity(c.status.have.quantity, c.status.have.unit)})`}
              </span>
            ))}
            {needs.toCheck.length === 1
              ? ". The pantry holds it in a unit that doesn't convert, so check it's enough."
              : ". The pantry holds them in units that don't convert, so check they're enough."}
          </p>
        )
      }
      onClose={onClose}
    />
  )
}
