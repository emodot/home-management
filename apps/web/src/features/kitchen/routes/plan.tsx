import {
  addDays,
  formatDate,
  formatWeek,
  householdSlots,
  leftoversOf,
  MEAL_SLOTS,
  potServings,
  SLOT_LABELS,
  todayIn,
  weekDays,
  weekStartOf,
  type MealEntry,
  type MealSlot,
} from '@home/shared'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  PlusIcon,
  RepeatIcon,
  Settings2Icon,
  ShoppingBasketIcon,
} from 'lucide-react'
import { useRef, useState, type PointerEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useActiveHousehold, useIsHouseholdAdmin } from '@/hooks/use-household'
import { useMediaQuery } from '@/hooks/use-lookups'
import { cn } from '@/lib/utils'
import { MealSheet, type MealSheetTarget } from '../components/meal-sheet'
import { PlanShoppingSheet } from '../components/plan-shopping-sheet'
import { useCopyMealWeek, useSetMealSlots, useWeekMeals } from '../hooks/use-meals'
import { recipesQuery, weekMealsQuery } from '../lib/queries'

/** The week's meal plan: a grid of days and slots on wide screens, a day at a time on phones. */
export function PlanPage() {
  const household = useActiveHousehold()
  const weekStart = useParams().weekStart ?? ''
  const today = todayIn(household.timezone)
  const meals = useWeekMeals(household.id, weekStart)
  const lastWeekStart = addDays(weekStart, -7)
  const lastWeek = useQuery(weekMealsQuery(household.id, lastWeekStart)).data ?? []
  const recipes = useSuspenseQuery(recipesQuery(household.id)).data
  const isAdmin = useIsHouseholdAdmin()
  // The week grid needs room for seven columns beside the sidebar.
  const wide = useMediaQuery('(min-width: 1024px)')
  const copy = useCopyMealWeek(household.id)
  const [target, setTarget] = useState<MealSheetTarget | null>(null)
  const [editingSlots, setEditingSlots] = useState(false)
  const [shopping, setShopping] = useState(false)

  const slots = householdSlots(household.meal_slots)
  // A slot that's been turned off still shows while it has meals this week.
  const shownSlots = MEAL_SLOTS.filter((s) => slots.includes(s) || meals.some((m) => m.slot === s))
  const days = weekDays(weekStart)
  const thisWeek = weekStartOf(today)

  const open = {
    add: (date: string, slot: MealSlot) => setTarget({ kind: 'add', date, slot }),
    edit: (meal: MealEntry) => setTarget({ kind: 'edit', meal }),
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="icon" aria-label="Previous week">
            <Link to={`/kitchen/plan/${lastWeekStart}`}>
              <ChevronLeftIcon aria-hidden />
            </Link>
          </Button>
          <h2 className="min-w-36 text-center font-semibold tabular-nums">
            {formatWeek(weekStart)}
          </h2>
          <Button asChild variant="ghost" size="icon" aria-label="Next week">
            <Link to={`/kitchen/plan/${addDays(weekStart, 7)}`}>
              <ChevronRightIcon aria-hidden />
            </Link>
          </Button>
          {weekStart !== thisWeek && (
            <Button asChild variant="link" size="sm">
              <Link to={`/kitchen/plan/${thisWeek}`}>This week</Link>
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1">
          {meals.some((m) => m.recipeId) && (
            <Button size="sm" onClick={() => setShopping(true)}>
              <ShoppingBasketIcon aria-hidden />
              Shopping list
            </Button>
          )}
          {isAdmin && (
            <Button variant="ghost" size="sm" onClick={() => setEditingSlots(true)}>
              <Settings2Icon aria-hidden />
              Meal slots
            </Button>
          )}
        </div>
      </div>

      {meals.length === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Nothing planned for this week yet. Tap a slot to add a meal.
          </p>
          {lastWeek.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              disabled={copy.isPending}
              onClick={() =>
                copy.mutate(
                  { from: lastWeekStart, to: weekStart },
                  {
                    onSuccess: (count) =>
                      toast.success(
                        `Copied ${count} ${count === 1 ? 'meal' : 'meals'} from last week`,
                      ),
                  },
                )
              }
            >
              <CopyIcon aria-hidden />
              Copy last week ({lastWeek.length})
            </Button>
          )}
        </div>
      )}

      {wide ? (
        <WeekGrid
          days={days}
          slots={shownSlots}
          meals={meals}
          today={today}
          onAdd={open.add}
          onEdit={open.edit}
        />
      ) : (
        <DayView
          days={days}
          slots={shownSlots}
          meals={meals}
          today={today}
          weekStart={weekStart}
          onAdd={open.add}
          onEdit={open.edit}
        />
      )}

      <MealSheet
        target={target}
        meals={meals}
        slots={slots}
        recipes={recipes}
        onClose={() => setTarget(null)}
      />
      <PlanShoppingSheet
        open={shopping}
        weekStart={weekStart}
        // Meals on days already gone are cooked; a later week counts from its start.
        from={today > weekStart ? today : weekStart}
        meals={meals}
        onClose={() => setShopping(false)}
      />
      {isAdmin && (
        <SlotsDialog
          // Starts from the saved slots each time it opens.
          key={String(editingSlots)}
          open={editingSlots}
          slots={slots}
          onClose={() => setEditingSlots(false)}
        />
      )}
    </div>
  )
}

interface ViewProps {
  days: string[]
  slots: MealSlot[]
  meals: MealEntry[]
  today: string
  onAdd: (date: string, slot: MealSlot) => void
  onEdit: (meal: MealEntry) => void
}

const mealsAt = (meals: MealEntry[], date: string, slot: MealSlot) =>
  meals.filter((m) => m.date === date && m.slot === slot)

function WeekGrid({ days, slots, meals, today, onAdd, onEdit }: ViewProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] table-fixed border-separate border-spacing-1">
        <caption className="sr-only">Meals by day and slot</caption>
        <thead>
          <tr>
            <th scope="col" className="w-20">
              <span className="sr-only">Slot</span>
            </th>
            {days.map((d) => (
              <th
                key={d}
                scope="col"
                className={cn(
                  'rounded-lg py-1.5 text-sm font-medium',
                  d === today ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
                )}
                aria-current={d === today ? 'date' : undefined}
              >
                {formatDate(d, { weekday: 'short' })}{' '}
                <span className="tabular-nums">{formatDate(d, { day: 'numeric' })}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slots.map((slot) => (
            <tr key={slot}>
              <th scope="row" className="py-2 pr-2 text-left align-top text-sm font-medium">
                {SLOT_LABELS[slot]}
              </th>
              {days.map((d) => (
                <td key={d} className="group h-24 rounded-lg bg-muted/50 p-1.5 align-top">
                  <SlotMeals
                    date={d}
                    slot={slot}
                    meals={meals}
                    onAdd={onAdd}
                    onEdit={onEdit}
                    compact
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Phones: a strip of the week's days and one day's meals, swiped through. */
function DayView({
  days,
  slots,
  meals,
  today,
  weekStart,
  onAdd,
  onEdit,
}: ViewProps & { weekStart: string }) {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const asked = params.get('day') ?? ''
  const day = days.includes(asked) ? asked : days.includes(today) ? today : (days[0] ?? weekStart)
  const index = days.indexOf(day)
  const swipe = useRef<{ x: number; y: number } | null>(null)

  function go(offset: number) {
    const next = addDays(day, offset)
    if (days.includes(next)) {
      const p = new URLSearchParams(params)
      p.set('day', next)
      setParams(p, { replace: true })
    } else {
      void navigate(`/kitchen/plan/${weekStartOf(next)}?day=${next}`)
    }
  }

  function onPointerUp(e: PointerEvent) {
    const start = swipe.current
    swipe.current = null
    if (!start || e.pointerType !== 'touch') return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-7 gap-1" role="group" aria-label="Day">
        {days.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={d === day}
            aria-current={d === today ? 'date' : undefined}
            onClick={() => go(days.indexOf(d) - index)}
            className={cn(
              'flex flex-col items-center rounded-lg py-1.5 text-xs transition-colors',
              d === day ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
              d === today && d !== day && 'text-primary',
            )}
          >
            {formatDate(d, { weekday: 'narrow' })}
            <span className="text-sm font-medium tabular-nums">
              {formatDate(d, { day: 'numeric' })}
            </span>
            <span
              className={cn(
                'mt-0.5 size-1 rounded-full',
                meals.some((m) => m.date === d) ? 'bg-current' : 'bg-transparent',
              )}
              aria-hidden
            />
          </button>
        ))}
      </div>
      <section
        className="flex touch-pan-y flex-col gap-4"
        aria-label={formatDate(day, { weekday: 'long', day: 'numeric', month: 'long' })}
        onPointerDown={(e) => {
          swipe.current = { x: e.clientX, y: e.clientY }
        }}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          swipe.current = null
        }}
      >
        <h3 className="font-semibold">
          {formatDate(day, { weekday: 'long', day: 'numeric', month: 'long' })}
        </h3>
        {slots.map((slot) => (
          <div key={slot} className="flex flex-col gap-1.5">
            <h4 className="text-sm font-medium text-muted-foreground">{SLOT_LABELS[slot]}</h4>
            <SlotMeals date={day} slot={slot} meals={meals} onAdd={onAdd} onEdit={onEdit} />
          </div>
        ))}
      </section>
    </div>
  )
}

function SlotMeals({
  date,
  slot,
  meals,
  onAdd,
  onEdit,
  compact,
}: {
  date: string
  slot: MealSlot
  meals: MealEntry[]
  onAdd: (date: string, slot: MealSlot) => void
  onEdit: (meal: MealEntry) => void
  compact?: boolean
}) {
  const here = mealsAt(meals, date, slot)
  const label = `${SLOT_LABELS[slot]} on ${formatDate(date, { weekday: 'long', day: 'numeric' })}`
  return (
    <div className="flex flex-col gap-1">
      {here.map((m) => (
        <MealChip key={m.id} meal={m} meals={meals} onClick={() => onEdit(m)} compact={compact} />
      ))}
      <button
        type="button"
        aria-label={`Add to ${label}`}
        onClick={() => onAdd(date, slot)}
        className={cn(
          'flex items-center justify-center gap-1 rounded-md border border-dashed text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary',
          compact ? 'h-7' : 'h-10',
          here.length > 0 &&
            compact &&
            'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
        )}
      >
        <PlusIcon className="size-3.5" aria-hidden />
        {!compact && 'Add'}
      </button>
    </div>
  )
}

function MealChip({
  meal,
  meals,
  onClick,
  compact,
}: {
  meal: MealEntry
  meals: MealEntry[]
  onClick: () => void
  compact?: boolean
}) {
  const pot = meal.leftoverOf ? meals.find((m) => m.id === meal.leftoverOf) : null
  const covers = leftoversOf(meal, meals).length
  const total = potServings(meal, meals)
  const detail = pot
    ? `Leftovers from ${formatDate(pot.date, { weekday: 'short' })}`
    : covers > 0 && total !== null
      ? `Pot for ${total}, ${covers} more ${covers === 1 ? 'meal' : 'meals'}`
      : meal.servings !== null
        ? `For ${meal.servings}`
        : null

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full flex-col rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent',
        // On the grid's muted cells a card is the page colour; in the day view, the other way round.
        compact ? 'bg-background' : 'bg-muted',
        pot && 'text-muted-foreground',
        compact ? 'text-xs' : 'text-sm',
      )}
    >
      <span className="flex items-center gap-1 font-medium">
        {pot && <RepeatIcon className="size-3 shrink-0" aria-hidden />}
        <span className={cn(compact && 'line-clamp-2')}>{meal.title}</span>
      </span>
      {detail && <span className="text-[0.7rem] text-muted-foreground">{detail}</span>}
    </button>
  )
}

function SlotsDialog({
  open,
  slots,
  onClose,
}: {
  open: boolean
  slots: MealSlot[]
  onClose: () => void
}) {
  const household = useActiveHousehold()
  const save = useSetMealSlots(household.id)
  const [picked, setPicked] = useState(new Set(slots))

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Meal slots</DialogTitle>
          <DialogDescription>
            The meals your household plans each day. Meals already in a slot you turn off stay on
            the plan.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {MEAL_SLOTS.map((s) => (
            <li key={s} className="flex items-center gap-3">
              <input
                id={`slot-${s}`}
                type="checkbox"
                className="size-5 accent-primary"
                checked={picked.has(s)}
                onChange={(e) => {
                  const next = new Set(picked)
                  if (e.target.checked) next.add(s)
                  else next.delete(s)
                  setPicked(next)
                }}
              />
              <label htmlFor={`slot-${s}`}>{SLOT_LABELS[s]}</label>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={picked.size === 0 || save.isPending}
            onClick={() =>
              save.mutate(
                MEAL_SLOTS.filter((s) => picked.has(s)),
                {
                  onSuccess: () => {
                    toast.success('Meal slots saved')
                    onClose()
                  },
                },
              )
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
