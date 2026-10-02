import { amountInputSchema, formatDate, formatMoney, type Income } from '@home/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import { CheckIcon, RepeatIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useActiveHousehold } from '@/hooks/use-household'
import { useConfirmIncome, useSkipIncome } from '@/hooks/use-income'
import { formatAmountInput, tidyAmountInput } from '@/lib/amount'
import { countsTowardLabel } from '@/lib/budget-month'
import { pendingIncomeQuery } from '@/lib/queries'

/** Confirm with an optionally corrected amount (e.g. a salary with overtime). */
function ConfirmIncomeDialog({
  income,
  open,
  onOpenChange,
}: {
  income: Income
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const household = useActiveHousehold()
  const confirm = useConfirmIncome(household.id)
  const [amount, setAmount] = useState(() => formatAmountInput(income.amountMinor))
  const [error, setError] = useState<string | null>(null)

  function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const parsed = amountInputSchema.safeParse(amount)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a valid amount')
      return
    }
    confirm.mutate({ income, amountMinor: parsed.data })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm {income.source}</DialogTitle>
          <DialogDescription>
            Due {formatDate(income.receivedOn)}. Correct the amount if what came in was different.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor={`confirm-income-${income.id}`}>Amount received</FieldLabel>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-lg font-semibold text-muted-foreground">
                ₦
              </span>
              <Input
                id={`confirm-income-${income.id}`}
                inputMode="decimal"
                className="h-12 pl-8 text-lg font-semibold"
                value={amount}
                aria-invalid={!!error}
                onChange={(e) => setAmount(e.target.value)}
                onBlur={(e) => setAmount(tidyAmountInput(e.target.value))}
              />
            </div>
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">
              <CheckIcon aria-hidden />
              Confirm
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function PendingRow({ income }: { income: Income }) {
  const household = useActiveHousehold()
  const skip = useSkipIncome(household.id)
  const [confirming, setConfirming] = useState(false)
  const label = countsTowardLabel({
    occurredOn: income.receivedOn,
    budgetMonth: income.budgetMonth,
  })

  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-3">
      <div className="min-w-0 flex-1 basis-56">
        <p className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{income.source}</span>
          {label && (
            <Badge variant="secondary" className="shrink-0">
              {label}
            </Badge>
          )}
        </p>
        <p className="truncate text-sm text-muted-foreground">
          Due {formatDate(income.receivedOn, { day: 'numeric', month: 'short' })} ·{' '}
          {formatMoney(income.amountMinor, income.currency)}
        </p>
      </div>
      <div className="ml-auto flex gap-1">
        <Button size="sm" variant="ghost" onClick={() => skip.mutate(income)}>
          Skip
        </Button>
        <Button size="sm" onClick={() => setConfirming(true)}>
          <CheckIcon aria-hidden />
          Confirm
        </Button>
      </div>
      {confirming && (
        <ConfirmIncomeDialog income={income} open={confirming} onOpenChange={setConfirming} />
      )}
    </li>
  )
}

/** Income generated from recurring income that still needs a yes or no. */
export function PendingIncome() {
  const household = useActiveHousehold()
  const pending = useSuspenseQuery(pendingIncomeQuery(household.id)).data
  if (pending.length === 0) return null

  return (
    <section aria-labelledby="pending-income-heading" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 id="pending-income-heading" className="flex items-center gap-2 text-sm font-semibold">
          <RepeatIcon className="size-4 text-muted-foreground" aria-hidden />
          To confirm ({pending.length})
        </h2>
        <Link
          to="/income/recurring"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Regular income
        </Link>
      </div>
      <ul className="divide-y rounded-xl border border-dashed bg-muted/30">
        {pending.map((income) => (
          <PendingRow key={income.id} income={income} />
        ))}
      </ul>
    </section>
  )
}
