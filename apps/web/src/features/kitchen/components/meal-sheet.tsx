import {
  itemSearchKey,
  laterMeals,
  leftoversOf,
  mealTimeLabel,
  potServings,
  type LeftoverInput,
  type MealEntry,
  type MealSlot,
  type RecipeSummary,
} from '@home/shared'
import { CheckIcon, MinusIcon, PlusIcon, SearchIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
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
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useActiveHousehold } from '@/hooks/use-household'
import { useMediaQuery } from '@/hooks/use-lookups'
import { cn } from '@/lib/utils'
import { useAddMeal, useEditMeal, useRemoveMeal } from '../hooks/use-meals'

export type MealSheetTarget =
  { kind: 'add'; date: string; slot: MealSlot } | { kind: 'edit'; meal: MealEntry }

const mealTime = mealTimeLabel

const QUICK_MEALS = ['Eat out', 'Takeaway', 'Leftovers', 'Something light']

/** Adding a meal to a slot, or changing one: a sheet from the side (desktop) or bottom (phone). */
export function MealSheet({
  target,
  meals,
  slots,
  recipes,
  onClose,
}: {
  target: MealSheetTarget | null
  /** The week's meals. */
  meals: MealEntry[]
  /** The household's slots. */
  slots: MealSlot[]
  recipes: RecipeSummary[]
  onClose: () => void
}) {
  const wide = useMediaQuery('(min-width: 768px)')
  // What it showed last, kept while it slides away after closing.
  const [last, setLast] = useState(target)
  if (target && target !== last) setLast(target)
  const shown = target ?? last
  return (
    <Sheet open={!!target} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side={wide ? 'right' : 'bottom'}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className={
          wide
            ? 'w-full overflow-y-auto sm:max-w-md'
            : 'max-h-[92dvh] overflow-y-auto pb-[env(safe-area-inset-bottom)]'
        }
      >
        {shown?.kind === 'add' && (
          <AddMeal
            key={`${shown.date}-${shown.slot}`}
            date={shown.date}
            slot={shown.slot}
            slots={slots}
            recipes={recipes}
            onClose={onClose}
          />
        )}
        {shown?.kind === 'edit' && (
          <EditMeal
            key={shown.meal.id}
            meal={shown.meal}
            meals={meals}
            slots={slots}
            onClose={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (n: number) => void
}) {
  return (
    <div className="flex items-center rounded-full border" role="group" aria-label={label}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="rounded-full"
        aria-label={`Fewer: ${label}`}
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
      >
        <MinusIcon aria-hidden />
      </Button>
      <output className="w-8 text-center font-medium tabular-nums">{value}</output>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="rounded-full"
        aria-label={`More: ${label}`}
        disabled={value >= 100}
        onClick={() => onChange(value + 1)}
      >
        <PlusIcon aria-hidden />
      </Button>
    </div>
  )
}

const key = (m: { date: string; slot: MealSlot }) => `${m.date}|${m.slot}`

/**
 * Batch cooking: tick the later meals this pot also covers. Each covered meal eats `servings`
 * unless changed.
 */
function CoversPicker({
  date,
  slot,
  slots,
  servings,
  value,
  onChange,
}: {
  date: string
  slot: MealSlot
  slots: MealSlot[]
  servings: number
  value: Map<string, number>
  onChange: (next: Map<string, number>) => void
}) {
  const later = laterMeals(date, slot, slots)
  if (later.length === 0) return null
  const total = servings + [...value.values()].reduce((sum, n) => sum + n, 0)

  return (
    <section className="flex flex-col gap-2" aria-labelledby="covers-heading">
      <div className="flex flex-col gap-0.5">
        <h3 id="covers-heading" className="text-sm font-semibold">
          Cook extra for later meals
        </h3>
        <p className="text-xs text-muted-foreground">
          {value.size === 0
            ? 'Tick the meals this pot also covers. Its ingredients count once.'
            : `One pot for ${total}: this meal and ${value.size} more.`}
        </p>
      </div>
      <ul className="max-h-72 list-surface overflow-y-auto">
        {later.map((m) => {
          const id = `covers-${key(m)}`
          const on = value.has(key(m))
          return (
            <li key={key(m)} className="flex min-h-12 items-center gap-3 px-3 py-1.5">
              <input
                id={id}
                type="checkbox"
                className="size-5 shrink-0 accent-primary"
                checked={on}
                onChange={(e) => {
                  const next = new Map(value)
                  if (e.target.checked) next.set(key(m), servings)
                  else next.delete(key(m))
                  onChange(next)
                }}
              />
              <label htmlFor={id} className="min-w-0 flex-1 text-sm">
                {mealTime(m.date, m.slot)}
              </label>
              {on && (
                <Stepper
                  label={`Servings for ${mealTime(m.date, m.slot)}`}
                  value={value.get(key(m)) ?? servings}
                  onChange={(n) => onChange(new Map(value).set(key(m), n))}
                />
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const toLeftovers = (value: Map<string, number>): LeftoverInput[] =>
  [...value.entries()].map(([k, servings]) => {
    const [date = '', slot = 'dinner'] = k.split('|')
    return { date, slot: slot as MealSlot, servings }
  })

function AddMeal({
  date,
  slot,
  slots,
  recipes,
  onClose,
}: {
  date: string
  slot: MealSlot
  slots: MealSlot[]
  recipes: RecipeSummary[]
  onClose: () => void
}) {
  const household = useActiveHousehold()
  const add = useAddMeal(household.id)
  const [kind, setKind] = useState<'recipe' | 'other'>(recipes.length > 0 ? 'recipe' : 'other')
  const [search, setSearch] = useState('')
  const [recipeId, setRecipeId] = useState<string | null>(null)
  const [servings, setServings] = useState(4)
  const [covers, setCovers] = useState(new Map<string, number>())
  const [title, setTitle] = useState('')

  const needle = itemSearchKey(search)
  const shown = recipes.filter((r) => !needle || itemSearchKey(r.title).includes(needle))
  const recipe = recipes.find((r) => r.id === recipeId)
  const ready = kind === 'recipe' ? !!recipe : title.trim() !== ''

  function pick(r: RecipeSummary) {
    setRecipeId(r.id)
    setServings(r.servings)
    setCovers(new Map())
  }

  function save() {
    add.mutate(
      kind === 'recipe' && recipe
        ? {
            date,
            slot,
            recipeId: recipe.id,
            title: null,
            servings,
            leftovers: toLeftovers(covers),
          }
        : { date, slot, recipeId: null, title: title.trim(), servings: null, leftovers: [] },
      {
        onSuccess: () => {
          toast.success(
            `${kind === 'recipe' ? recipe?.title : title.trim()} planned for ${mealTime(date, slot)}`,
          )
          onClose()
        },
      },
    )
  }

  const tab = (value: 'recipe' | 'other', label: string) => (
    <button
      type="button"
      aria-pressed={kind === value}
      onClick={() => setKind(value)}
      className={cn(
        'h-9 flex-1 rounded-full text-sm font-medium transition-colors',
        kind === value ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  )

  return (
    <div className="flex flex-col gap-4">
      <SheetHeader className="pb-0">
        <SheetTitle>Plan {mealTime(date, slot)}</SheetTitle>
        <SheetDescription>A recipe from your box, or anything else.</SheetDescription>
      </SheetHeader>
      <div
        className="mx-4 flex gap-1 rounded-full bg-muted p-1"
        role="group"
        aria-label="Kind of meal"
      >
        {tab('recipe', 'Recipe')}
        {tab('other', 'Something else')}
      </div>

      {kind === 'recipe' ? (
        <div className="flex flex-col gap-4 px-4">
          {recipes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No recipes yet.{' '}
              <Link to="/kitchen/recipes/new" className="font-medium text-primary hover:underline">
                Add one
              </Link>{' '}
              or plan something else.
            </p>
          ) : (
            <>
              <div className="relative">
                <SearchIcon
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  type="search"
                  placeholder="Search recipes"
                  aria-label="Search recipes"
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <ul className="max-h-56 list-surface overflow-y-auto" aria-label="Recipes">
                {shown.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      aria-pressed={r.id === recipeId}
                      onClick={() => pick(r)}
                      className={cn(
                        'flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                        r.id === recipeId && 'font-medium text-primary',
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{r.title}</span>
                      {r.id === recipeId && <CheckIcon className="size-4 shrink-0" aria-hidden />}
                    </button>
                  </li>
                ))}
                {shown.length === 0 && (
                  <li className="px-3 py-2 text-sm text-muted-foreground">No matching recipes</li>
                )}
              </ul>
            </>
          )}
          {recipe && (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm">Eating at this meal</span>
                <Stepper label="Servings" value={servings} onChange={setServings} />
              </div>
              <CoversPicker
                date={date}
                slot={slot}
                slots={slots}
                servings={servings}
                value={covers}
                onChange={setCovers}
              />
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-4">
          <Input
            aria-label="What's for this meal"
            placeholder="e.g. Eat out"
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {QUICK_MEALS.map((q) => (
              <button
                key={q}
                type="button"
                className="inline-flex h-8 items-center rounded-full border px-3 text-sm transition-colors hover:bg-accent"
                onClick={() => setTitle(q)}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      <SheetFooter className="gap-2">
        <Button size="lg" onClick={save} disabled={!ready || add.isPending}>
          {add.isPending ? 'Adding…' : 'Add to the plan'}
        </Button>
        <Button variant="ghost" onClick={onClose} disabled={add.isPending}>
          Cancel
        </Button>
      </SheetFooter>
    </div>
  )
}

function EditMeal({
  meal,
  meals,
  slots,
  onClose,
}: {
  meal: MealEntry
  meals: MealEntry[]
  slots: MealSlot[]
  onClose: () => void
}) {
  const household = useActiveHousehold()
  const edit = useEditMeal(household.id)
  const remove = useRemoveMeal(household.id)
  const pot = meal.leftoverOf ? meals.find((m) => m.id === meal.leftoverOf) : null
  const leftovers = leftoversOf(meal, meals)
  const [servings, setServings] = useState(meal.servings ?? 4)
  const [covers, setCovers] = useState(
    () => new Map(leftovers.map((l) => [key(l), l.servings ?? meal.servings ?? 4])),
  )
  const [confirming, setConfirming] = useState(false)
  const counted = meal.servings !== null || meal.recipeId !== null
  const isPot = !meal.leftoverOf && meal.recipeId !== null

  function save() {
    edit.mutate(
      {
        id: meal.id,
        servings: counted ? servings : null,
        leftovers: isPot ? toLeftovers(covers) : null,
      },
      { onSuccess: onClose },
    )
  }

  function removeNow() {
    remove.mutate(meal.id, {
      onSuccess: () => {
        toast(`${meal.title} taken off the plan`)
        onClose()
      },
    })
  }

  const total = potServings(meal, meals)

  return (
    <div className="flex flex-col gap-4">
      <SheetHeader className="pb-0">
        <SheetTitle>{meal.title}</SheetTitle>
        <SheetDescription>
          {mealTime(meal.date, meal.slot)}
          {pot
            ? `. Leftovers from the pot cooked ${mealTime(pot.date, pot.slot)}.`
            : leftovers.length > 0 && total !== null
              ? `. One pot for ${total}, covering ${leftovers.length} more ${leftovers.length === 1 ? 'meal' : 'meals'}.`
              : '.'}
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-4 px-4">
        {meal.recipeId && (
          <Link
            to={`/kitchen/recipes/${meal.recipeId}${total ? `?servings=${total}` : ''}`}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Open the recipe{total && !pot ? ` for ${total}` : ''}
          </Link>
        )}
        {counted && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">Eating at this meal</span>
            <Stepper label="Servings" value={servings} onChange={setServings} />
          </div>
        )}
        {isPot && (
          <CoversPicker
            date={meal.date}
            slot={meal.slot}
            slots={slots}
            servings={servings}
            value={covers}
            onChange={setCovers}
          />
        )}
      </div>
      <SheetFooter className="gap-2">
        {counted && (
          <Button size="lg" onClick={save} disabled={edit.isPending}>
            {edit.isPending ? 'Saving…' : 'Save'}
          </Button>
        )}
        <Button
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={() => (leftovers.length > 0 ? setConfirming(true) : removeNow())}
          disabled={remove.isPending}
        >
          Take off the plan
        </Button>
      </SheetFooter>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Take {meal.title} off the plan?</AlertDialogTitle>
            <AlertDialogDescription>
              Its {leftovers.length} leftover {leftovers.length === 1 ? 'meal goes' : 'meals go'}{' '}
              too.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <Button variant="destructive" onClick={removeNow} disabled={remove.isPending}>
              Take them off
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
