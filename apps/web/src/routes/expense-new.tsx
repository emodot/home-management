import { formatDate, todayIn } from '@home/shared'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { ClipboardCheckIcon } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { ExpenseForm } from '@/components/expense-form'
import { useCreateExpense } from '@/hooks/use-expenses'
import { useActiveHousehold, useCurrentUser } from '@/hooks/use-household'
import { errorMessage } from '@/lib/errors'
import { categoriesQuery, membersQuery, taskCompletionQuery } from '@/lib/queries'

export function NewExpensePage() {
  const household = useActiveHousehold()
  const user = useCurrentUser()
  const categories = useSuspenseQuery(categoriesQuery(household.id)).data
  const members = useSuspenseQuery(membersQuery(household.id)).data
  const create = useCreateExpense(household.id)
  const navigate = useNavigate()

  // "Log an expense for this?" after completing a task: prefill from the task and link it.
  const completionId = useSearchParams()[0].get('completion')
  const linked = useQuery({
    ...taskCompletionQuery(household.id, completionId ?? ''),
    enabled: completionId !== null,
  }).data
  const task = linked?.task
  const categoryId =
    task?.default_category_id &&
    categories.some((c) => c.id === task.default_category_id && !c.is_archived)
      ? task.default_category_id
      : ''

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Add expense</h1>
      {linked && (
        <p className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-sm">
          <ClipboardCheckIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          For “{linked.task.title}”, done {formatDate(linked.completion.completed_on)}
        </p>
      )}
      <ExpenseForm
        // Remount once the linked task has loaded so its values become the defaults.
        key={linked?.completion.id ?? 'new'}
        withReceipts
        categories={categories}
        members={members}
        submitLabel="Save expense"
        defaultValues={{
          amount: '',
          occurredOn: linked?.completion.completed_on ?? todayIn(household.timezone),
          categoryId,
          description: task?.title ?? '',
          paidBy: user.id,
          providerId: task?.provider_id ?? null,
          notes: null,
        }}
        onCancel={() => void navigate(-1)}
        onSubmit={async (input, files) => {
          try {
            const id = await create.mutateAsync({
              input,
              files,
              taskCompletionId: linked?.completion.id,
            })
            toast.success('Expense added', {
              action: { label: 'View', onClick: () => void navigate(`/expenses/${id}`) },
            })
            await navigate(linked ? `/tasks/${linked.task.id}` : '/', { replace: true })
          } catch (error) {
            toast.error(`Couldn't save the expense. ${errorMessage(error)}`)
          }
        }}
      />
    </div>
  )
}
