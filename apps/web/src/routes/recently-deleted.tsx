import { EmptyState } from '@/components/empty-state'
import { formatMoney, formatRelativeTime } from '@home/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import { FileTextIcon, RotateCcwIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRestoreExpense, useRestoreReceipt } from '@/hooks/use-expenses'
import { useRestoreProvider } from '@/hooks/use-providers'
import { useRestoreTask } from '@/hooks/use-tasks'
import { useActiveHousehold } from '@/hooks/use-household'
import { recentlyDeletedQuery } from '@/lib/queries'

export function RecentlyDeletedPage() {
  const household = useActiveHousehold()
  const { expenses, receipts, providers, tasks } = useSuspenseQuery(
    recentlyDeletedQuery(household.id),
  ).data
  const restoreExpense = useRestoreExpense(household.id)
  const restoreReceipt = useRestoreReceipt(household.id)
  const restoreProvider = useRestoreProvider(household.id)
  const restoreTask = useRestoreTask(household.id)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Recently deleted</h1>
        <p className="text-sm text-muted-foreground">
          Deleted items can be restored for 30 days, then they&apos;re removed permanently.
        </p>
      </div>

      {expenses.length === 0 &&
      receipts.length === 0 &&
      providers.length === 0 &&
      tasks.length === 0 ? (
        <EmptyState icon={Trash2Icon} title="Nothing here" size="sm">
          Expenses, receipts, providers and tasks you delete will show up here for 30 days.
        </EmptyState>
      ) : (
        <>
          {expenses.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="font-semibold">Expenses</h2>
              <ul className="divide-y rounded-xl border">
                {expenses.map((expense) => (
                  <li key={expense.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{expense.description}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatMoney(expense.amountMinor, expense.currency)} · deleted{' '}
                        {formatRelativeTime(expense.deletedAt ?? '')}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => restoreExpense.mutate(expense)}
                    >
                      <RotateCcwIcon aria-hidden />
                      Restore
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {tasks.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="font-semibold">Tasks</h2>
              <ul className="divide-y rounded-xl border">
                {tasks.map((task) => (
                  <li key={task.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{task.title}</p>
                      <p className="text-sm text-muted-foreground">
                        deleted {formatRelativeTime(task.deleted_at ?? '')}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => restoreTask.mutate(task)}>
                      <RotateCcwIcon aria-hidden />
                      Restore
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {providers.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="font-semibold">Providers</h2>
              <ul className="divide-y rounded-xl border">
                {providers.map((provider) => (
                  <li key={provider.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{provider.name}</p>
                      <p className="text-sm text-muted-foreground">
                        deleted {formatRelativeTime(provider.deleted_at ?? '')}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => restoreProvider.mutate(provider)}
                    >
                      <RotateCcwIcon aria-hidden />
                      Restore
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {receipts.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="font-semibold">Receipts</h2>
              <ul className="divide-y rounded-xl border">
                {receipts.map((receipt) => (
                  <li key={receipt.id} className="flex items-center gap-3 px-4 py-3">
                    <FileTextIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{receipt.file_name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        From “{receipt.expense.description}” · deleted{' '}
                        {formatRelativeTime(receipt.deleted_at ?? '')}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => restoreReceipt.mutate(receipt)}
                    >
                      <RotateCcwIcon aria-hidden />
                      Restore
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
