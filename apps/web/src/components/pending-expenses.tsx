import { amountInputSchema, formatDate, formatMoney, type Expense } from '@home/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import { CheckIcon, RepeatIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { CategoryIcon } from '@/components/category-icon'
import { ReceiptPicker, type PickedReceipt } from '@/components/receipt-picker'
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
import { useConfirmExpense, useSkipExpense } from '@/hooks/use-expenses'
import { useActiveHousehold } from '@/hooks/use-household'
import { useCategoryLookup } from '@/hooks/use-lookups'
import { formatAmountInput, tidyAmountInput } from '@/lib/amount'
import { pendingExpensesQuery } from '@/lib/queries'

/** Confirm with an optionally corrected amount and receipts. */
export function ConfirmExpenseDialog({
  expense,
  open,
  onOpenChange,
}: {
  expense: Expense
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const household = useActiveHousehold()
  const confirm = useConfirmExpense(household.id)
  const [amount, setAmount] = useState(() => formatAmountInput(expense.amountMinor))
  const [receipts, setReceipts] = useState<PickedReceipt[]>([])
  const [error, setError] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)

  function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const parsed = amountInputSchema.safeParse(amount)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a valid amount')
      return
    }
    confirm.mutate({ expense, amountMinor: parsed.data, files: receipts.map((r) => r.file) })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm {expense.description}</DialogTitle>
          <DialogDescription>
            Due {formatDate(expense.occurredOn)}. Correct the amount if the bill was different.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor={`confirm-amount-${expense.id}`}>Amount paid</FieldLabel>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-lg font-semibold text-muted-foreground">
                ₦
              </span>
              <Input
                id={`confirm-amount-${expense.id}`}
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
          <Field>
            <FieldLabel>Receipt (optional)</FieldLabel>
            <ReceiptPicker value={receipts} onChange={setReceipts} onBusyChange={setPreparing} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={preparing}>
              <CheckIcon aria-hidden />
              {preparing ? 'Preparing receipt…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function PendingRow({ expense }: { expense: Expense }) {
  const household = useActiveHousehold()
  const categories = useCategoryLookup(household.id)
  const skip = useSkipExpense(household.id)
  const [confirming, setConfirming] = useState(false)
  const category = categories.get(expense.categoryId)

  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-3">
      <Link
        to={`/expenses/${expense.id}`}
        className="flex min-w-0 flex-1 basis-56 items-center gap-3"
      >
        <CategoryIcon icon={category?.icon} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{expense.description}</p>
          <p className="truncate text-sm text-muted-foreground">
            Due {formatDate(expense.occurredOn, { day: 'numeric', month: 'short' })} ·{' '}
            {formatMoney(expense.amountMinor, expense.currency)}
          </p>
        </div>
      </Link>
      <div className="ml-auto flex gap-1">
        <Button size="sm" variant="ghost" onClick={() => skip.mutate(expense)}>
          Skip
        </Button>
        <Button size="sm" onClick={() => setConfirming(true)}>
          <CheckIcon aria-hidden />
          Confirm
        </Button>
      </div>
      {confirming && (
        <ConfirmExpenseDialog expense={expense} open={confirming} onOpenChange={setConfirming} />
      )}
    </li>
  )
}

/** Bills generated from recurring expenses that still need a yes or no. */
export function PendingExpenses() {
  const household = useActiveHousehold()
  const pending = useSuspenseQuery(pendingExpensesQuery(household.id)).data
  if (pending.length === 0) return null

  return (
    <section aria-labelledby="pending-heading" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 id="pending-heading" className="flex items-center gap-2 text-sm font-semibold">
          <RepeatIcon className="size-4 text-muted-foreground" aria-hidden />
          To confirm ({pending.length})
        </h2>
        <Link
          to="/recurring"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Recurring bills
        </Link>
      </div>
      <ul className="divide-y rounded-xl border border-dashed bg-muted/30">
        {pending.map((expense) => (
          <PendingRow key={expense.id} expense={expense} />
        ))}
      </ul>
    </section>
  )
}
