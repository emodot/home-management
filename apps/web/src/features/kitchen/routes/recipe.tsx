import {
  checkPantry,
  formatMinutes,
  formatQuantity,
  isBlocking,
  linesToBuy,
  scaleAmount,
  todayIn,
  type IngredientCheck,
  type Recipe,
  type RecipeIngredient,
} from '@home/shared'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import {
  CheckIcon,
  MinusIcon,
  PencilIcon,
  PlusIcon,
  ShoppingBasketIcon,
  Trash2Icon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useActiveHousehold } from '@/hooks/use-household'
import { AddMissingSheet } from '../components/add-missing-sheet'
import { ItemHeading } from '../components/item-heading'
import { RecipeCost } from '../components/recipe-cost'
import { RecipePhoto } from '../components/recipe-photo'
import { usePantry } from '../hooks/use-pantry'
import { useDeleteRecipe } from '../hooks/use-recipes'
import {
  conversionsQuery,
  householdPricesQuery,
  recipePhotosQuery,
  recipeQuery,
  shoppingListQuery,
} from '../lib/queries'

const MAX_SERVINGS = 100

/**
 * One recipe: photo, times, tags, ingredients scaled to the servings chosen (with what the pantry
 * has of each, and adding what's missing to the list), the cost of a pot, steps and notes.
 */
export function RecipePage() {
  const household = useActiveHousehold()
  const recipeId = useParams().recipeId ?? ''
  const recipe = useSuspenseQuery(recipeQuery(household.id, recipeId)).data
  const paths = recipe?.photoPath ? [recipe.photoPath] : []
  const photo = useQuery(recipePhotosQuery(household.id, paths)).data ?? {}
  const pantry = usePantry(household.id)
  const list = useSuspenseQuery(shoppingListQuery(household.id)).data
  const prices = useSuspenseQuery(householdPricesQuery(household.id)).data
  const conversions = useSuspenseQuery(conversionsQuery(household.id)).data
  const [params, setParams] = useSearchParams()
  const [adding, setAdding] = useState(false)

  if (!recipe) return null
  const asked = Number(params.get('servings'))
  const servings =
    Number.isInteger(asked) && asked >= 1 && asked <= MAX_SERVINGS ? asked : recipe.servings
  const setServings = (n: number) => {
    const next = new URLSearchParams(params)
    if (n === recipe.servings) next.delete('servings')
    else next.set('servings', String(n))
    setParams(next, { replace: true })
  }

  const checks = checkPantry(recipe.ingredients, recipe.servings, servings, pantry, conversions)
  const toBuy = linesToBuy(checks, conversions)

  const times = [
    recipe.prepMinutes !== null && `Prep ${formatMinutes(recipe.prepMinutes)}`,
    recipe.cookMinutes !== null && `Cook ${formatMinutes(recipe.cookMinutes)}`,
  ].filter(Boolean)

  return (
    <article className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <ItemHeading name={recipe.title} back="/kitchen/recipes" backLabel="Back to recipes" />
        {recipe.photoPath && (
          <RecipePhoto
            url={photo[recipe.photoPath]}
            className="aspect-[16/9] w-full rounded-xl md:max-w-2xl"
          />
        )}
        {(times.length > 0 || recipe.tags.length > 0) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
            {times.length > 0 && <span>{times.join(' · ')}</span>}
            {recipe.tags.map((t) => (
              <Link
                key={t}
                to={`/kitchen/recipes?tag=${encodeURIComponent(t)}`}
                className="rounded-full bg-muted px-2.5 py-0.5 text-xs hover:bg-accent"
              >
                {t}
              </Link>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to={`/kitchen/recipes/${recipe.id}/edit`}>
              <PencilIcon aria-hidden />
              Edit
            </Link>
          </Button>
          <DeleteRecipeButton recipe={recipe} />
        </div>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="ingredients-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="ingredients-heading" className="font-semibold">
            Ingredients
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground" id="servings-label">
              Servings
            </span>
            <div
              className="flex items-center rounded-full border"
              role="group"
              aria-labelledby="servings-label"
            >
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full"
                aria-label="Fewer servings"
                disabled={servings <= 1}
                onClick={() => setServings(servings - 1)}
              >
                <MinusIcon aria-hidden />
              </Button>
              <output className="w-8 text-center font-medium tabular-nums" aria-live="polite">
                {servings}
              </output>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full"
                aria-label="More servings"
                disabled={servings >= MAX_SERVINGS}
                onClick={() => setServings(servings + 1)}
              >
                <PlusIcon aria-hidden />
              </Button>
            </div>
            {servings !== recipe.servings && (
              <Button variant="link" size="sm" onClick={() => setServings(recipe.servings)}>
                Back to {recipe.servings}
              </Button>
            )}
          </div>
        </div>
        {recipe.ingredients.length === 0 ? (
          <p className="text-sm text-muted-foreground">No ingredients yet.</p>
        ) : (
          <>
            <CanICook checks={checks} canAdd={toBuy.length > 0} onAdd={() => setAdding(true)} />
            <ul className="list-surface">
              {checks.map((check) => (
                <IngredientRow
                  key={check.ingredient.id}
                  check={check}
                  from={recipe.servings}
                  to={servings}
                  onList={list.some((e) => e.itemId === check.ingredient.itemId && !e.isChecked)}
                />
              ))}
            </ul>
          </>
        )}
        {servings !== recipe.servings && recipe.ingredients.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Scaled from {recipe.servings} servings. ≈ marks a rounded amount: tap it for the exact
            one.
          </p>
        )}
      </section>

      <RecipeCost
        recipe={recipe}
        servings={servings}
        prices={prices}
        conversions={conversions}
        today={todayIn(household.timezone)}
      />

      {recipe.steps.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="font-semibold">Steps</h3>
          <ol className="flex flex-col gap-4">
            {recipe.steps.map((step, index) => (
              <li key={index} className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary tabular-nums">
                  {index + 1}
                </span>
                <p className="pt-0.5 leading-relaxed whitespace-pre-line">{step}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {recipe.notes && (
        <section className="flex flex-col gap-2">
          <h3 className="font-semibold">Notes</h3>
          <p className="leading-relaxed whitespace-pre-line text-muted-foreground">
            {recipe.notes}
          </p>
        </section>
      )}
      <AddMissingSheet
        open={adding}
        recipeId={recipe.id}
        recipeTitle={recipe.title}
        lines={toBuy}
        list={list}
        onClose={() => setAdding(false)}
      />
    </article>
  )
}

/** "Can I cook this?": a line on what the pantry is short of, and the way to the list. */
function CanICook({
  checks,
  canAdd,
  onAdd,
}: {
  checks: IngredientCheck[]
  canAdd: boolean
  onAdd: () => void
}) {
  const blocking = checks.filter(isBlocking)
  const missing = blocking.filter((c) => c.status.kind === 'missing').length
  const short = blocking.length - missing
  const toCheck = checks.filter((c) => c.status.kind === 'check').length
  const parts = [
    missing > 0 && `${missing} not in the pantry`,
    short > 0 && `${short} short`,
    toCheck > 0 && `${toCheck} to check`,
  ].filter(Boolean)

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5">
      <p className="flex items-center gap-2 text-sm" role="status">
        {blocking.length === 0 ? (
          <CheckIcon className="size-4 shrink-0 text-primary" aria-hidden />
        ) : (
          <ShoppingBasketIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <span>
          <span className="font-medium">
            {blocking.length === 0 ? 'You can cook this' : "You can't cook this yet"}
          </span>
          {parts.length > 0 && <span className="text-muted-foreground">: {parts.join(', ')}</span>}
        </span>
      </p>
      {canAdd && (
        <Button size="sm" variant={blocking.length > 0 ? 'default' : 'outline'} onClick={onAdd}>
          <ShoppingBasketIcon aria-hidden />
          Add missing to list
        </Button>
      )}
    </div>
  )
}

/** What the pantry has of one ingredient, under its name. */
function stockNote(check: IngredientCheck, onList: boolean): ReactNode {
  const { status, toBuy, ingredient } = check
  const listed = onList ? ' · on the list' : ''
  switch (status.kind) {
    case 'have':
      return (
        <span className="flex items-center gap-1 text-primary">
          <CheckIcon className="size-3" aria-hidden />
          In the pantry
        </span>
      )
    case 'short':
      return `Short: need ${toBuy ? formatQuantity(toBuy.quantity, toBuy.unit) : 'more'} more${listed}`
    case 'missing':
      return `Not in the pantry${listed}`
    case 'check':
      return (
        <>
          You have {formatQuantity(status.have.quantity, status.have.unit)}: check it&apos;s enough,
          or{' '}
          <Link
            to={`/kitchen/items/${ingredient.itemId}`}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            say how its units relate
          </Link>
        </>
      )
  }
}

function IngredientRow({
  check,
  from,
  to,
  onList,
}: {
  check: IngredientCheck
  from: number
  to: number
  onList: boolean
}) {
  const i: RecipeIngredient = check.ingredient
  const [showExact, setShowExact] = useState(false)
  const scaled = i.quantity === null ? null : scaleAmount(i.quantity, i.unit, from, to)
  const exact = scaled && `${formatQuantity(scaled.exact, i.unit)} exactly`

  return (
    <li className="flex items-baseline gap-3 px-3 py-2.5">
      <span className="w-28 shrink-0 text-right font-medium tabular-nums sm:w-40">
        {scaled === null ? (
          <span className="font-normal text-muted-foreground">to taste</span>
        ) : scaled.rounded ? (
          <button
            type="button"
            title={exact ?? undefined}
            aria-label={`About ${formatQuantity(scaled.quantity, scaled.unit)}, ${exact}`}
            onClick={() => setShowExact((v) => !v)}
            className="underline decoration-dotted underline-offset-4"
          >
            {showExact
              ? formatQuantity(scaled.exact, i.unit)
              : `≈ ${formatQuantity(scaled.quantity, scaled.unit)}`}
          </button>
        ) : (
          formatQuantity(scaled.quantity, scaled.unit)
        )}
      </span>
      <span className="min-w-0 flex-1">
        {i.name}
        {i.note && <span className="text-muted-foreground">, {i.note}</span>}
        {i.isOptional && (
          <span className="ml-2 rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
            optional
          </span>
        )}
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {stockNote(check, onList)}
        </span>
      </span>
    </li>
  )
}

function DeleteRecipeButton({ recipe }: { recipe: Recipe }) {
  const household = useActiveHousehold()
  const navigate = useNavigate()
  const remove = useDeleteRecipe(household.id)
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2Icon aria-hidden />
        Delete
      </Button>
      <AlertDialog open={open} onOpenChange={(o) => !remove.isPending && setOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {recipe.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its ingredients, steps and photo go too. This can't be undone. The items stay in your
              catalogue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(recipe, {
                  onSuccess: () => void navigate('/kitchen/recipes', { replace: true }),
                })
              }
            >
              {remove.isPending ? 'Deleting…' : 'Delete recipe'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
