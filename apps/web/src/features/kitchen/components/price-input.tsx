import { Input } from '@/components/ui/input'
import { tidyAmountInput } from '@/lib/amount'
import { cn } from '@/lib/utils'

/** Naira with the number keypad; the caller turns the text into kobo with amountInputSchema. */
export function PriceInput({
  id,
  value,
  onChange,
  invalid,
  autoFocus,
  className,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  invalid?: boolean
  autoFocus?: boolean
  className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-2xl font-semibold text-muted-foreground">
        ₦
      </span>
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        autoFocus={autoFocus}
        aria-invalid={invalid}
        className="h-14 pl-9 text-2xl font-semibold tabular-nums md:text-2xl"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onChange(tidyAmountInput(e.target.value))}
      />
    </div>
  )
}
