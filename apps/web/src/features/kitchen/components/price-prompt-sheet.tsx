import {
  amountInputSchema,
  formatMoney,
  formatQuantity,
  unitLabel,
  unitPriceMinor,
  type ShoppingListItem,
} from '@home/shared'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useMediaQuery } from '@/hooks/use-lookups'
import { formatAmountInput } from '@/lib/amount'
import { PriceInput } from './price-input'

/**
 * "How much did you pay?" after checking something off: the price for the whole line as
 * bought. Skip leaves it without a price.
 */
export function PricePromptSheet({
  entry,
  onSave,
  onClose,
}: {
  entry: ShoppingListItem | null
  /** The price in kobo, or null to clear it. */
  onSave: (priceMinor: number | null) => void
  onClose: () => void
}) {
  const wide = useMediaQuery('(min-width: 768px)')
  return (
    <Sheet open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side={wide ? 'right' : 'bottom'}
        className={wide ? '' : 'pb-[env(safe-area-inset-bottom)]'}
      >
        {entry && <PriceForm key={entry.id} entry={entry} onSave={onSave} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  )
}

function PriceForm({
  entry,
  onSave,
  onClose,
}: {
  entry: ShoppingListItem
  onSave: (priceMinor: number | null) => void
  onClose: () => void
}) {
  const [text, setText] = useState(
    entry.pricePaidMinor === null ? '' : formatAmountInput(entry.pricePaidMinor),
  )
  const [error, setError] = useState<string | null>(null)
  const parsed = amountInputSchema.safeParse(text)
  const perUnit = parsed.success ? unitPriceMinor(parsed.data, entry.quantity) : null

  function save() {
    if (text.trim() === '') {
      // Saving an empty price clears one that was entered before.
      if (entry.pricePaidMinor !== null) onSave(null)
      onClose()
      return
    }
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter an amount')
      return
    }
    onSave(parsed.data)
    onClose()
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4 px-4 pb-4"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <SheetHeader className="px-0">
        <SheetTitle>{entry.name}</SheetTitle>
        <SheetDescription>
          {formatQuantity(entry.quantity, entry.unit)}. What did you pay for all of it?
        </SheetDescription>
      </SheetHeader>
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor="price-paid" className="sr-only">
          Price paid
        </FieldLabel>
        <PriceInput
          id="price-paid"
          autoFocus
          value={text}
          invalid={!!error}
          onChange={(value) => {
            setText(value)
            setError(null)
          }}
        />
        {perUnit !== null && (
          <FieldDescription>
            {formatMoney(perUnit)} per {unitLabel(entry.unit)}
          </FieldDescription>
        )}
        <FieldError>{error}</FieldError>
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="lg" className="flex-1">
          Save price
        </Button>
        <Button type="button" size="lg" variant="ghost" onClick={onClose}>
          Skip
        </Button>
      </div>
    </form>
  )
}
