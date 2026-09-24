import { formatDate, formatMoney, formatRelativeTime } from '@home/shared'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import {
  ArrowLeftIcon,
  CalendarIcon,
  CheckIcon,
  ClipboardCheckIcon,
  RepeatIcon,
  PencilIcon,
  RotateCcwIcon,
  Trash2Icon,
  UserIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ItemHistory } from '@/components/activity'
import { CategoryIcon } from '@/components/category-icon'
import { ContactButtons } from '@/components/contact-buttons'
import { ConfirmExpenseDialog } from '@/components/pending-expenses'
import { ReceiptGallery } from '@/components/receipt-gallery'
import { Button } from '@/components/ui/button'
import { useDeleteExpense, useRestoreExpense, useSkipExpense } from '@/hooks/use-expenses'
import { useActiveHousehold } from '@/hooks/use-household'
import { useCategoryLookup, useMemberNames } from '@/hooks/use-lookups'
import { useProviderLookup } from '@/hooks/use-providers'
import { expenseQuery, receiptsQuery, taskCompletionQuery } from '@/lib/queries'

export function ExpenseDetailPage() {
  const { expenseId = '' } = useParams()
  const household = useActiveHousehold()
  const expense = useSuspenseQuery(expenseQuery(household.id, expenseId)).data
  const receipts = useSuspenseQuery(receiptsQuery(household.id, expenseId)).data
  const categories = useCategoryLookup(household.id)
  const memberNames = useMemberNames(household.id)
  const providers = useProviderLookup(household.id)
  const deleteExpense = useDeleteExpense(household.id)
  const restoreExpense = useRestoreExpense(household.id)
  const skipExpense = useSkipExpense(household.id)
  const [confirming, setConfirming] = useState(false)
  const linkedTask = useQuery({
    ...taskCompletionQuery(household.id, expense?.taskCompletionId ?? ''),
    enabled: !!expense?.taskCompletionId,
  }).data
  const navigate = useNavigate()

  if (!expense) throw new Response('Expense not found', { status: 404 })

  const category = categories.get(expense.categoryId)
  const provider = expense.providerId ? providers.get(expense.providerId) : undefined
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

      {!deleted && expense.status === 'pending' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed bg-muted/30 px-4 py-3">
          <p className="flex items-center gap-2 text-sm">
            <RepeatIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            Created from a recurring bill. It isn&apos;t counted until you confirm it was paid.
          </p>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                skipExpense.mutate(expense)
                void navigate('/', { replace: true })
              }}
            >
              Skip
            </Button>
            <Button size="sm" onClick={() => setConfirming(true)}>
              <CheckIcon aria-hidden />
              Confirm
            </Button>
          </div>
          {confirming && (
            <ConfirmExpenseDialog
              expense={expense}
              open={confirming}
              onOpenChange={setConfirming}
            />
          )}
        </div>
      )}

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
          {linkedTask && (
            <Link
              to={`/tasks/${linkedTask.task.id}`}
              className="flex items-center gap-1.5 underline-offset-4 hover:underline"
            >
              <ClipboardCheckIcon className="size-4" aria-hidden />
              Task: {linkedTask.task.title}
            </Link>
          )}
          {expense.recurringExpenseId && (
            <Link
              to="/recurring"
              className="flex items-center gap-1.5 underline-offset-4 hover:underline"
            >
              <RepeatIcon className="size-4" aria-hidden />
              Recurring bill
            </Link>
          )}
          {expense.paidBy && (
            <span className="flex items-center gap-1.5">
              <UserIcon className="size-4" aria-hidden />
              Paid by {nameOf(expense.paidBy)}
            </span>
          )}
        </div>
      </div>

      {provider && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Provider</p>
            <Link
              to={`/providers/${provider.id}`}
              className="font-medium underline-offset-4 hover:underline"
            >
              {provider.name}
              {provider.deleted_at ? ' (deleted)' : ''}
            </Link>
          </div>
          {!provider.deleted_at && <ContactButtons provider={provider} iconOnly />}
        </section>
      )}

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

      <ItemHistory householdId={household.id} entityType="expense" entityId={expense.id} />

      <footer className="border-t pt-4 text-xs text-muted-foreground">
        <p>
          {expense.createdBy === null && expense.recurringExpenseId
            ? 'Added automatically from a recurring bill'
            : `Added by ${nameOf(expense.createdBy)}`}{' '}
          {formatRelativeTime(expense.createdAt)}
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
