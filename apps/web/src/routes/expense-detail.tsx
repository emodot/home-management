import { formatDate, formatMoney, formatRelativeTime } from '@home/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import {
  ArrowLeftIcon,
  CalendarIcon,
  PencilIcon,
  RotateCcwIcon,
  Trash2Icon,
  UserIcon,
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { CategoryIcon } from '@/components/category-icon'
import { ReceiptGallery } from '@/components/receipt-gallery'
import { Button } from '@/components/ui/button'
import { useDeleteExpense, useRestoreExpense } from '@/hooks/use-expenses'
import { useActiveHousehold } from '@/hooks/use-household'
import { useCategoryLookup, useMemberNames } from '@/hooks/use-lookups'
import { expenseQuery, receiptsQuery } from '@/lib/queries'

export function ExpenseDetailPage() {
  const { expenseId = '' } = useParams()
  const household = useActiveHousehold()
  const expense = useSuspenseQuery(expenseQuery(household.id, expenseId)).data
  const receipts = useSuspenseQuery(receiptsQuery(household.id, expenseId)).data
  const categories = useCategoryLookup(household.id)
  const memberNames = useMemberNames(household.id)
  const deleteExpense = useDeleteExpense(household.id)
  const restoreExpense = useRestoreExpense(household.id)
  const navigate = useNavigate()

  if (!expense) throw new Response('Expense not found', { status: 404 })

  const category = categories.get(expense.categoryId)
  const nameOf = (userId: string | null) =>
    userId ? (memberNames.get(userId) ?? 'a former member') : 'someone'
  const deleted = expense.deletedAt !== null

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link to="/">
            <ArrowLeftIcon aria-hidden />
            Expenses
          </Link>
        </Button>
        {!deleted && (
          <div className="flex gap-1">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/expenses/${expense.id}/edit`}>
                <PencilIcon aria-hidden />
                Edit
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                deleteExpense.mutate(expense)
                void navigate('/', { replace: true })
              }}
            >
              <Trash2Icon aria-hidden />
              Delete
            </Button>
          </div>
        )}
      </div>

      {deleted && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
          <p className="text-sm">
            This expense was deleted {formatRelativeTime(expense.deletedAt ?? '')}. It will be
            removed permanently after 30 days.
          </p>
          <Button size="sm" variant="outline" onClick={() => restoreExpense.mutate(expense)}>
            <RotateCcwIcon aria-hidden />
            Restore
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <p className="text-4xl font-semibold tracking-tight tabular-nums">
          {formatMoney(expense.amountMinor, expense.currency)}
        </p>
        <h1 className="text-xl font-medium">{expense.description}</h1>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CategoryIcon icon={category?.icon} className="size-5 bg-transparent" />
            {category?.name ?? 'Unknown category'}
          </span>
          <span className="flex items-center gap-1.5">
            <CalendarIcon className="size-4" aria-hidden />
            {formatDate(expense.occurredOn, { dateStyle: 'full' })}
          </span>
          {expense.paidBy && (
            <span className="flex items-center gap-1.5">
              <UserIcon className="size-4" aria-hidden />
              Paid by {nameOf(expense.paidBy)}
            </span>
          )}
        </div>
      </div>

      {expense.notes && (
        <section className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold">Notes</h2>
          <p className="text-sm whitespace-pre-wrap">{expense.notes}</p>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">
          Receipts{receipts.length > 0 ? ` (${receipts.length})` : ''}
        </h2>
        <ReceiptGallery
          householdId={household.id}
          expenseId={expense.id}
          receipts={receipts}
          readOnly={deleted}
        />
      </section>

      <footer className="border-t pt-4 text-xs text-muted-foreground">
        <p>
          Added by {nameOf(expense.createdBy)} {formatRelativeTime(expense.createdAt)}
        </p>
        {expense.updatedAt !== expense.createdAt && (
          <p>
            Last edited by {nameOf(expense.updatedBy)} {formatRelativeTime(expense.updatedAt)}
          </p>
        )}
      </footer>
    </div>
  )
}
