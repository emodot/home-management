import { cookLines, formatQuantity, type CookLine, type RecipeIngredient } from '@home/shared'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
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
import { useCookRecipe } from '../hooks/use-recipes'
import { conversionsQuery, pantryQuery } from '../lib/queries'

export interface CookTarget {
  title: string
  ingredients: RecipeIngredient[]
  /** The recipe's servings, and how many this pot was for. */
  from: number
  to: number
  /** From the meal plan: the meal to mark cooked. */
  mealId?: string
}

/**
 * "Cooked it": what the pot used, against the pantry, before it comes out. Optional ingredients
 * start unticked; anything not in the pantry, or held in a unit that doesn't convert, can't be.
 */
export function CookSheet({ target, onClose }: { target: CookTarget | null; onClose: () => void }) {
  const wide = useMediaQuery('(min-width: 768px)')
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
        {shown && <Review key={`${shown.title}:${shown.to}`} target={shown} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  )
}

const usable = (l: CookLine) => l.stock !== null && l.left !== null

function Review({ target, onClose }: { target: CookTarget; onClose: () => void }) {
  const household = useActiveHousehold()
  const pantry = useQuery(pantryQuery(household.id)).data
  const conversions = useQuery(conversionsQuery(household.id)).data
  const cook = useCookRecipe(household.id)
  const lines =
    pantry && conversions
      ? cookLines(target.ingredients, target.from, target.to, pantry, conversions)
      : []
  // Ticked unless unticked; optional ones only when ticked.
  const [unticked, setUnticked] = useState(() => new Set<string>())
  const [ticked, setTicked] = useState(() => new Set<string>())
  const picked = (l: CookLine) =>
    usable(l) && !unticked.has(l.itemId) && (!l.optional || ticked.has(l.itemId))
  const chosen = lines.filter(picked)

  function toggle(l: CookLine, on: boolean) {
    const add = (set: Set<string>) => new Set(set).add(l.itemId)
    const drop = (set: Set<string>) => {
      const next = new Set(set)
      next.delete(l.itemId)
      return next
    }
    if (l.optional) setTicked(on ? add : drop)
    else setUnticked(on ? drop : add)
  }

  function confirm() {
    cook.mutate(
      {
        title: target.title,
        lines: chosen.map((l) => ({ itemId: l.itemId, quantity: l.quantity, unit: l.unit })),
        mealId: target.mealId,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <SheetHeader className="pb-0">
        <SheetTitle>Cooked {target.title}</SheetTitle>
        <SheetDescription>
          What a pot for {target.to} used, taken out of the pantry. Untick anything you didn&apos;t
          use, or had from elsewhere.
        </SheetDescription>
      </SheetHeader>
      {lines.length > 0 && (
        <ul className="mx-4 list-surface">
          {lines.map((l) => {
            const id = `cook-${l.itemId}`
            const detail = !l.stock
              ? 'not in the pantry'
              : l.left === null
                ? `you have ${formatQuantity(l.stock.quantity, l.stock.unit)}: doesn't convert`
                : `${formatQuantity(l.stock.quantity, l.stock.unit)} → ${formatQuantity(l.left, l.stock.unit)}`
            return (
              <li key={l.itemId} className="flex items-center gap-3 px-3 py-2.5">
                <input
                  id={id}
                  type="checkbox"
                  className="size-5 shrink-0 accent-primary"
                  checked={picked(l)}
                  disabled={!usable(l)}
                  onChange={(e) => toggle(l, e.target.checked)}
                />
                <label htmlFor={id} className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{l.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[l.optional && 'optional', detail].filter(Boolean).join(' · ')}
                  </span>
                </label>
                <span className="shrink-0 text-sm font-medium tabular-nums">
                  −{formatQuantity(Math.round(l.quantity * 100) / 100, l.unit)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      <SheetFooter className="gap-2">
        <Button
          size="lg"
          onClick={confirm}
          disabled={cook.isPending || !pantry || (chosen.length === 0 && !target.mealId)}
        >
          {cook.isPending
            ? 'Saving…'
            : chosen.length > 0
              ? `Take ${chosen.length} out of the pantry`
              : target.mealId
                ? 'Mark as cooked'
                : 'Nothing to take out'}
        </Button>
        <Button variant="ghost" onClick={onClose} disabled={cook.isPending}>
          Cancel
        </Button>
      </SheetFooter>
    </div>
  )
}
