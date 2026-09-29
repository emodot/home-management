import { addMonths, formatMonth } from '@home/shared'
import { CalendarRangeIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

/** How far either side of the payment month the "Other month" list goes. */
const OTHER_MONTHS = 12

/**
 * "Counts toward September 2026 · Change": the month an expense counts toward in budgets and
 * insights. Collapsed by default; opens to last / this / next month (around `paidMonth`) and a
 * list of other months.
 */
export function BudgetMonthField({
  paidMonth,
  value,
  onChange,
  disabled,
}: {
  /** The payment date's month, "2026-09". */
  paidMonth: string
  value: string
  onChange: (month: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(value !== paidMonth)
  const quick = [-1, 0, 1].map((offset) => addMonths(paidMonth, offset))
  const others = Array.from({ length: OTHER_MONTHS * 2 + 1 }, (_, i) =>
    addMonths(paidMonth, i - OTHER_MONTHS),
  ).reverse()

  if (!open) {
    return (
      <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
        <CalendarRangeIcon className="size-4" aria-hidden />
        Counts toward <span className="font-medium text-foreground">{formatMonth(value)}</span>
        <span aria-hidden>·</span>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0"
          disabled={disabled}
          onClick={() => setOpen(true)}
          aria-label={`Change the month this counts toward (${formatMonth(value)})`}
        >
          Change
        </Button>
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2" role="group" aria-labelledby="budget-month-label">
      <p id="budget-month-label" className="text-sm font-medium">
        Counts toward
      </p>
      <div className="flex flex-wrap gap-2">
        {quick.map((month) => (
          <Button
            key={month}
            type="button"
            size="sm"
            variant={month === value ? 'default' : 'outline'}
            aria-pressed={month === value}
            disabled={disabled}
            onClick={() => onChange(month)}
          >
            {formatMonth(month)}
          </Button>
        ))}
        <Select value={value} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger
            size="sm"
            className={cn('w-auto', !quick.includes(value) && 'border-primary')}
            aria-label="Other month"
          >
            <SelectValue>{quick.includes(value) ? 'Other month…' : formatMonth(value)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {others.map((month) => (
              <SelectItem key={month} value={month}>
                {formatMonth(month)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-sm text-muted-foreground">
        For budgets and insights, e.g. rent paid at the end of one month for the next.
      </p>
    </div>
  )
}
