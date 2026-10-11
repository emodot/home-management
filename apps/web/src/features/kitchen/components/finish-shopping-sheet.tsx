import {
  amountInputSchema,
  foodCategoryIds,
  formatMoney,
  formatQuantity,
  linesTotalMinor,
  mergeStoreTags,
  todayIn,
  tripDescription,
  tripNotes,
  type Category,
  type Member,
  type ShoppingListItem,
} from '@home/shared'
import { useQuery } from '@tanstack/react-query'
import { CloudOffIcon } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { CategoryOptions } from '@/components/category-options'
import { ReceiptPicker, type PickedReceipt } from '@/components/receipt-picker'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useActiveHousehold, useCurrentUser } from '@/hooks/use-household'
import { useMediaQuery } from '@/hooks/use-lookups'
import { formatAmountInput, tidyAmountInput } from '@/lib/amount'
import { errorMessage } from '@/lib/errors'
import { useFinishShopping } from '../hooks/use-finish-shopping'
import { useIsOnline } from '../hooks/use-is-online'
import { storeTagsQuery } from '../lib/queries'
import { PriceInput } from './price-input'
import { StoreTagChips } from './store-tag-chips'

/** Parses a typed price: kobo, null when empty, or undefined when it isn't a valid amount. */
function parsePrice(text: string): number | null | undefined {
  if (text.trim() === '') return null
  const parsed = amountInputSchema.safeParse(text)
  return parsed.success ? parsed.data : undefined
}

/** The store most of these entries were planned for, as a default for the trip. */
function usualStore(entries: ShoppingListItem[]): string | null {
  const counts = new Map<string, number>()
  for (const e of entries) if (e.storeTag) counts.set(e.storeTag, (counts.get(e.storeTag) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

/**
 * Finish shopping: check the prices, the total actually paid (market totals often differ), who
 * paid, where, when and the category, add a receipt photo, choose what goes into the pantry, and
 * confirm. One confirm makes the expense and clears the bought entries from the list.
 */
export function FinishShoppingSheet({
  open,
  entries,
  categories,
  members,
  onClose,
}: {
  open: boolean
  /** The checked entries, as they were when the sheet opened. */
  entries: ShoppingListItem[]
  categories: Category[]
  members: Member[]
  onClose: () => void
}) {
  const wide = useMediaQuery('(min-width: 768px)')
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side={wide ? 'right' : 'bottom'}
        // It's for reviewing: don't put a phone keyboard over it by focusing the first price.
        onOpenAutoFocus={(e) => e.preventDefault()}
        className={
          wide
            ? 'w-full overflow-y-auto sm:max-w-md'
            : 'max-h-[92dvh] overflow-y-auto pb-[env(safe-area-inset-bottom)]'
        }
      >
        {open && (
          <FinishForm
            entries={entries}
            categories={categories}
            members={members}
            onClose={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

function FinishForm({
  entries,
  categories,
  members,
  onClose,
}: {
  entries: ShoppingListItem[]
  categories: Category[]
  members: Member[]
  onClose: () => void
}) {
  const household = useActiveHousehold()
  const user = useCurrentUser()
  const navigate = useNavigate()
  const online = useIsOnline()
  const finish = useFinishShopping(household.id)
  const stores = useQuery(storeTagsQuery(household.id)).data ?? []

  const [prices, setPrices] = useState(() =>
    entries.map((e) => (e.pricePaidMinor === null ? '' : formatAmountInput(e.pricePaidMinor))),
  )
  const [toPantry, setToPantry] = useState(() => entries.map(() => true))
  const [totalText, setTotalText] = useState<string | null>(null) // null: follow the lines
  const [paidBy, setPaidBy] = useState(user.id)
  const [store, setStore] = useState(() => usualStore(entries))
  const [paidOn, setPaidOn] = useState(() => todayIn(household.timezone))
  const [categoryId, setCategoryId] = useState(() => foodCategoryIds(categories)[0] ?? '')
  const [receipts, setReceipts] = useState<PickedReceipt[]>([])
  const [preparing, setPreparing] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const parsedPrices = prices.map(parsePrice)
  const linesTotal = linesTotalMinor(parsedPrices.map((p) => p ?? null))
  const total = totalText ?? (linesTotal > 0 ? formatAmountInput(linesTotal) : '')
  const categoryOptions = categories.filter((c) => !c.is_archived)

  async function confirm() {
    const next: Record<string, string> = {}
    parsedPrices.forEach((p, i) => {
      if (p === undefined) next[`price-${i}`] = 'Enter a valid amount, or leave it empty'
    })
    const totalParsed = amountInputSchema.safeParse(total)
    if (!totalParsed.success) next.total = 'Enter what you paid in all'
    if (!categoryId) next.category = 'Choose a category'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) next.paidOn = 'Choose a date'
    setErrors(next)
    if (Object.keys(next).length > 0 || !totalParsed.success) return

    const lineMinors = parsedPrices.map((p) => p ?? null)
    try {
      const { expenseId } = await finish.mutateAsync({
        input: {
          lines: entries.map((e, i) => ({
            entryId: e.id,
            priceMinor: lineMinors[i] ?? null,
            toPantry: toPantry[i] ?? true,
          })),
          totalMinor: totalParsed.data,
          categoryId,
          paidOn,
          paidBy,
          store,
          description: tripDescription(store),
          notes: tripNotes(entries, lineMinors),
        },
        receipts: receipts.map((r) => r.file),
      })
      onClose()
      toast.success(`${formatMoney(totalParsed.data)} added to expenses`, {
        action: { label: 'View', onClick: () => void navigate(`/expenses/${expenseId}`) },
      })
      await navigate('/kitchen/list')
    } catch (error) {
      toast.error(`Couldn't finish shopping. ${errorMessage(error)}`)
    }
  }

  const busy = finish.isPending || preparing

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        void confirm()
      }}
    >
      <SheetHeader className="pb-0">
        <SheetTitle>Finish shopping</SheetTitle>
        <SheetDescription>
          {entries.length} {entries.length === 1 ? 'thing' : 'things'} bought. Confirm to add the
          expense; anything not checked off stays on the list.
        </SheetDescription>
      </SheetHeader>

      <FieldGroup className="gap-5 px-4">
        <section className="flex flex-col gap-2" aria-label="What you bought">
          <ul className="list-surface">
            {entries.map((entry, i) => (
              <li key={entry.id} className="flex flex-col gap-2 px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{entry.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {formatQuantity(entry.quantity, entry.unit)}
                    </span>
                  </span>
                  <div className="relative w-32 shrink-0">
                    <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
                      ₦
                    </span>
                    <Input
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="No price"
                      aria-label={`Price paid for ${entry.name}`}
                      aria-invalid={!!errors[`price-${i}`]}
                      className="bg-background pl-6 text-right tabular-nums dark:bg-background"
                      value={prices[i]}
                      onChange={(e) =>
                        setPrices((all) => all.map((p, j) => (j === i ? e.target.value : p)))
                      }
                      onBlur={(e) =>
                        setPrices((all) =>
                          all.map((p, j) => (j === i ? tidyAmountInput(e.target.value) : p)),
                        )
                      }
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={toPantry[i]}
                    onChange={(e) =>
                      setToPantry((all) => all.map((v, j) => (j === i ? e.target.checked : v)))
                    }
                  />
                  Add to pantry
                </label>
                {errors[`price-${i}`] && (
                  <p className="text-xs text-destructive">{errors[`price-${i}`]}</p>
                )}
              </li>
            ))}
          </ul>
        </section>

        <Field data-invalid={!!errors.total}>
          <FieldLabel htmlFor="trip-total">Total paid</FieldLabel>
          <PriceInput
            id="trip-total"
            value={total}
            invalid={!!errors.total}
            onChange={(value) => setTotalText(value)}
          />
          {totalText !== null && linesTotal > 0 && totalText !== formatAmountInput(linesTotal) ? (
            <FieldDescription>
              The prices add up to {formatMoney(linesTotal)}.{' '}
              <button
                type="button"
                className="font-medium text-primary underline-offset-4 hover:underline"
                onClick={() => setTotalText(null)}
              >
                Use that
              </button>
            </FieldDescription>
          ) : (
            <FieldDescription>
              The sum of the prices; change it if you paid a different total.
            </FieldDescription>
          )}
          <FieldError>{errors.total}</FieldError>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="trip-paid-by">Paid by</FieldLabel>
            <Select value={paidBy} onValueChange={setPaidBy}>
              <SelectTrigger id="trip-paid-by" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.profile.full_name ?? m.profile.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field data-invalid={!!errors.paidOn}>
            <FieldLabel htmlFor="trip-date">Date</FieldLabel>
            <Input
              id="trip-date"
              type="date"
              value={paidOn}
              aria-invalid={!!errors.paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
            />
            <FieldError>{errors.paidOn}</FieldError>
          </Field>
        </div>

        <Field data-invalid={!!errors.category}>
          <FieldLabel htmlFor="trip-category">Category</FieldLabel>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger id="trip-category" className="w-full" aria-invalid={!!errors.category}>
              <SelectValue placeholder="Choose a category" />
            </SelectTrigger>
            <SelectContent>
              <CategoryOptions categories={categoryOptions} icons />
            </SelectContent>
          </Select>
          <FieldError>{errors.category}</FieldError>
        </Field>

        <Field>
          <FieldLabel>Where</FieldLabel>
          <StoreTagChips
            value={store}
            onChange={setStore}
            suggestions={mergeStoreTags([entries.map((e) => e.storeTag), stores])}
          />
        </Field>

        <Field>
          <FieldLabel>Receipt (optional)</FieldLabel>
          <ReceiptPicker
            value={receipts}
            onChange={setReceipts}
            onBusyChange={setPreparing}
            disabled={finish.isPending}
          />
        </Field>
      </FieldGroup>

      <SheetFooter className="gap-2">
        {!online && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <CloudOffIcon className="size-4 shrink-0" aria-hidden />
            You're offline. Finishing saves the expense in one go, so it needs a connection.
          </p>
        )}
        <Button type="submit" size="lg" disabled={!online || busy}>
          {finish.isPending
            ? 'Saving…'
            : preparing
              ? 'Preparing receipt…'
              : amountInputSchema.safeParse(total).success
                ? `Add ${formatMoney(amountInputSchema.parse(total))} to expenses`
                : 'Add to expenses'}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose} disabled={finish.isPending}>
          Keep shopping
        </Button>
      </SheetFooter>
    </form>
  )
}
