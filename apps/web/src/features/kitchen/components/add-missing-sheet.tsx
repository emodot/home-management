import {
  formatQuantity,
  type BuyLine,
  type KitchenUnit,
  type RecipeListStatus,
  type ShoppingListItem,
} from '@home/shared'
import type { UseMutationResult } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useMediaQuery } from '@/hooks/use-lookups'

/** What "Add to list" sends, and what it says happened to each item. */
export type AddToListMutation = Pick<
  UseMutationResult<
    { itemId: string; status: RecipeListStatus }[],
    Error,
    { itemId: string; quantity: number; unit: KitchenUnit }[]
  >,
  'mutate' | 'isPending'
>

/** A line to review: an item and how much, and (for a plan) the recipes it's for. */
type Line = BuyLine & { recipes?: string[] }

/**
 * Review before putting what's short on the list: each item, how much, and what's on the list
 * already. Optional ingredients, and anything the list already covers, start unticked.
 */
export function AddMissingSheet({
  open,
  title,
  description,
  lines,
  list,
  add,
  footnote,
  onClose,
}: {
  open: boolean
  title: string
  description: ReactNode
  /** What's short, one line per item (linesToBuy). */
  lines: Line[]
  list: ShoppingListItem[]
  add: AddToListMutation
  /** Under the lines, e.g. what wasn't counted. */
  footnote?: ReactNode
  onClose: () => void
}) {
  const wide = useMediaQuery('(min-width: 768px)')
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side={wide ? 'right' : 'bottom'}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className={
          wide
            ? 'w-full overflow-y-auto sm:max-w-md'
            : 'max-h-[92dvh] overflow-y-auto pb-[env(safe-area-inset-bottom)]'
        }
      >
        {open && (
          <Review
            // Ticks start from the lines: start again if they arrive (or change) while it's open.
            key={lines.map((l) => `${l.itemId}:${l.unit}:${l.quantity}`).join('|')}
            title={title}
            description={description}
            lines={lines}
            list={list}
            add={add}
            footnote={footnote}
            onClose={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "Added 2 items to the list and topped up 1. Tomatoes was already on it." */
function summary(results: { name: string; status: RecipeListStatus }[]): string {
  const count = (status: RecipeListStatus) => results.filter((r) => r.status === status)
  const added = count('added').length
  const toppedUp = count('topped_up').length
  const already = [...count('covered'), ...count('kept')].map((r) => r.name)
  const did =
    added > 0 && toppedUp > 0
      ? `Added ${plural(added, 'item')} to the list and topped up ${toppedUp}.`
      : added > 0
        ? `Added ${plural(added, 'item')} to the list.`
        : toppedUp > 0
          ? `Topped up ${plural(toppedUp, 'item')} on the list.`
          : ''
  const rest =
    already.length > 0
      ? `${already.join(', ')} ${already.length === 1 ? 'was' : 'were'} already on it.`
      : ''
  return [did, rest].filter(Boolean).join(' ') || 'Nothing to add.'
}

function Review({
  title,
  description,
  lines,
  list,
  add,
  footnote,
  onClose,
}: {
  title: string
  description: ReactNode
  lines: Line[]
  list: ShoppingListItem[]
  add: AddToListMutation
  footnote?: ReactNode
  onClose: () => void
}) {
  const key = (l: BuyLine) => `${l.itemId}:${l.unit}`
  const onListFor = (l: BuyLine) => list.find((e) => e.itemId === l.itemId)
  // Already on the list (not yet bought) in at least that amount: nothing to add.
  const covered = (l: BuyLine) => {
    const entry = onListFor(l)
    return !!entry && !entry.isChecked && entry.unit === l.unit && entry.quantity >= l.quantity
  }
  const [picked, setPicked] = useState(
    () => new Set(lines.filter((l) => !l.optional && !covered(l)).map(key)),
  )
  const chosen = lines.filter((l) => picked.has(key(l)))

  function toggle(id: string, on: boolean) {
    setPicked((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function confirm() {
    add.mutate(
      chosen.map((l) => ({ itemId: l.itemId, quantity: l.quantity, unit: l.unit })),
      {
        onSuccess: (results) => {
          toast.success(
            summary(
              results.map((r) => ({
                name: lines.find((l) => l.itemId === r.itemId)?.name ?? '',
                status: r.status,
              })),
            ),
          )
          onClose()
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <SheetHeader className="pb-0">
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>{description}</SheetDescription>
      </SheetHeader>
      {lines.length > 0 && (
        <ul className="mx-4 list-surface">
          {lines.map((l) => {
            const onList = onListFor(l)
            const id = `missing-${key(l)}`
            return (
              <li key={key(l)} className="flex items-center gap-3 px-3 py-2.5">
                <input
                  id={id}
                  type="checkbox"
                  className="size-5 shrink-0 accent-primary"
                  checked={picked.has(key(l))}
                  onChange={(e) => toggle(key(l), e.target.checked)}
                />
                <label htmlFor={id} className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{l.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[
                      l.short ? 'short' : 'not in the pantry',
                      l.optional && 'optional',
                      l.recipes && l.recipes.length > 0 && `for ${l.recipes.join(', ')}`,
                      onList &&
                        (covered(l)
                          ? 'already on the list'
                          : `on the list: ${formatQuantity(onList.quantity, onList.unit)}`),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </label>
                <span className="shrink-0 text-sm font-medium tabular-nums">
                  {formatQuantity(l.quantity, l.unit)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {footnote && <div className="px-4 text-sm text-muted-foreground">{footnote}</div>}
      <SheetFooter className="gap-2">
        {lines.length === 0 ? (
          <Button size="lg" variant="outline" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button size="lg" onClick={confirm} disabled={chosen.length === 0 || add.isPending}>
              {add.isPending
                ? 'Adding…'
                : chosen.length === 0
                  ? 'Choose what to add'
                  : `Add ${plural(chosen.length, 'item')} to the list`}
            </Button>
            <Button variant="ghost" onClick={onClose} disabled={add.isPending}>
              Cancel
            </Button>
          </>
        )}
      </SheetFooter>
    </div>
  )
}
