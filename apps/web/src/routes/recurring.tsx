import { describeFrequency, formatDate, formatMoney, type RecurringExpense } from '@home/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import { PauseIcon, PencilIcon, PlayIcon, PlusIcon, RepeatIcon, Trash2Icon } from 'lucide-react'
import { Link } from 'react-router'
import { CategoryIcon } from '@/components/category-icon'
import { EmptyState } from '@/components/empty-state'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useActiveHousehold } from '@/hooks/use-household'
import { useCategoryLookup, useMemberNames } from '@/hooks/use-lookups'
import { useDeleteRecurringExpense, useSetRecurringActive } from '@/hooks/use-recurring'
import { recurringExpensesQuery } from '@/lib/queries'

function BillRow({ bill }: { bill: RecurringExpense }) {
  const household = useActiveHousehold()
  const categories = useCategoryLookup(household.id)
  const memberNames = useMemberNames(household.id)
  const setActive = useSetRecurringActive(household.id)
  const remove = useDeleteRecurringExpense(household.id)
  const category = categories.get(bill.category_id)

  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-3">
      <CategoryIcon icon={category?.icon} />
      <div className="min-w-0 flex-1 basis-48">
        <p className="flex items-center gap-2 truncate font-medium">
          <span className="truncate">{bill.description}</span>
          {!bill.is_active && <Badge variant="secondary">Paused</Badge>}
        </p>
        <p className="truncate text-sm text-muted-foreground">
          {formatMoney(bill.amount_minor, bill.currency)} ·{' '}
          {describeFrequency(bill.frequency, bill.interval_count).toLowerCase()}
          {bill.is_active &&
            ` · next ${formatDate(bill.next_due_on, { day: 'numeric', month: 'short', year: 'numeric' })}`}
          {bill.paid_by && ` · ${memberNames.get(bill.paid_by) ?? 'former member'}`}
        </p>
      </div>
      <div className="ml-auto flex gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setActive.mutate({ bill, isActive: !bill.is_active })}
          aria-label={bill.is_active ? `Pause ${bill.description}` : `Resume ${bill.description}`}
        >
          {bill.is_active ? <PauseIcon aria-hidden /> : <PlayIcon aria-hidden />}
        </Button>
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to={`/recurring/${bill.id}/edit`} aria-label={`Edit ${bill.description}`}>
            <PencilIcon aria-hidden />
          </Link>
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Delete ${bill.description}`}>
              <Trash2Icon aria-hidden />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {bill.description}?</AlertDialogTitle>
              <AlertDialogDescription>
                No more pending expenses will be created for it. Expenses it already created are
                kept. To stop it for a while instead, pause it.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => remove.mutate(bill)}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  )
}

export function RecurringPage() {
  const household = useActiveHousehold()
  const bills = useSuspenseQuery(recurringExpensesQuery(household.id)).data

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Recurring bills</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Bills that repeat, like internet or estate dues. When one is due it appears at the top
            of your expenses to confirm or skip.
          </p>
        </div>
        {bills.length > 0 && (
          <Button asChild>
            <Link to="/recurring/new">
              <PlusIcon aria-hidden />
              Add bill
            </Link>
          </Button>
        )}
      </div>

      {bills.length === 0 ? (
        <EmptyState
          icon={RepeatIcon}
          title="No recurring bills yet"
          action={
            <Button asChild>
              <Link to="/recurring/new">
                <PlusIcon aria-hidden />
                Add recurring bill
              </Link>
            </Button>
          }
        >
          Add bills like Spectranet, DStv or estate service charge once, and they&apos;ll show up
          for confirmation every time they&apos;re due.
        </EmptyState>
      ) : (
        <ul className="divide-y rounded-xl border">
          {bills.map((bill) => (
            <BillRow key={bill.id} bill={bill} />
          ))}
        </ul>
      )}
    </div>
  )
}
