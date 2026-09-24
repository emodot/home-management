import {
  describeDue,
  describeSchedule,
  formatDate,
  formatMoney,
  taskDueState,
  todayIn,
  type Task,
} from '@home/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import {
  ArrowLeftIcon,
  BellIcon,
  CheckIcon,
  PencilIcon,
  ReceiptTextIcon,
  RotateCcwIcon,
  Trash2Icon,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { CompleteTaskDialog } from '@/components/complete-task-dialog'
import { ContactButtons } from '@/components/contact-buttons'
import { LogExpensePrompt } from '@/components/log-expense-prompt'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useActiveHousehold } from '@/hooks/use-household'
import { useCategoryLookup, useMemberNames } from '@/hooks/use-lookups'
import { useProviderLookup } from '@/hooks/use-providers'
import { useCompleteTask, useDeleteTask, useRestoreTask } from '@/hooks/use-tasks'
import { taskHistoryQuery, taskQuery } from '@/lib/queries'
import { cn } from '@/lib/utils'

function reminderText(days: number) {
  if (days === 0) return 'Reminder on the day it’s due'
  return `Reminder ${days} ${days === 1 ? 'day' : 'days'} before`
}

export function TaskDetailPage() {
  const { taskId = '' } = useParams()
  const household = useActiveHousehold()
  const task = useSuspenseQuery(taskQuery(household.id, taskId)).data
  const history = useSuspenseQuery(taskHistoryQuery(household.id, taskId)).data
  const memberNames = useMemberNames(household.id)
  const providers = useProviderLookup(household.id)
  const categories = useCategoryLookup(household.id)
  const today = todayIn(household.timezone)
  const [completing, setCompleting] = useState(false)
  const [completed, setCompleted] = useState<{ task: Task; completionId: string } | null>(null)
  const complete = useCompleteTask(household.id, today, (t, completionId) =>
    setCompleted({ task: t, completionId }),
  )
  const remove = useDeleteTask(household.id)
  const restore = useRestoreTask(household.id)
  const navigate = useNavigate()

  if (!task) throw new Response('Not found', { status: 404, statusText: 'Not found' })

  const deleted = task.deleted_at !== null
  const provider = task.provider_id ? providers.get(task.provider_id) : undefined
  const category = task.default_category_id ? categories.get(task.default_category_id) : undefined
  const due = { nextDueOn: task.next_due_on, isActive: task.is_active }
  const overdue = taskDueState(due, today).state === 'overdue'
  const nameOf = (id: string | null) =>
    id ? (memberNames.get(id) ?? 'a former member') : 'someone'

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link to="/tasks">
            <ArrowLeftIcon aria-hidden />
            Tasks
          </Link>
        </Button>
        {!deleted && (
          <div className="flex gap-1">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/tasks/${task.id}/edit`}>
                <PencilIcon aria-hidden />
                Edit
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                remove.mutate(task)
                void navigate('/tasks', { replace: true })
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
          <p className="text-sm">This task was deleted.</p>
          <Button size="sm" variant="outline" onClick={() => restore.mutate(task)}>
            <RotateCcwIcon aria-hidden />
            Restore
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{task.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={overdue ? 'destructive' : 'secondary'}>{describeDue(due, today)}</Badge>
          <span className="text-muted-foreground">
            {describeSchedule(task.schedule_type, task.frequency, task.interval_count)}
            {task.is_active && ` · next ${formatDate(task.next_due_on)}`}
          </span>
        </div>
        {task.description && <p className="text-sm whitespace-pre-wrap">{task.description}</p>}
      </div>

      {task.is_active && !deleted && (
        <Button className="w-fit" onClick={() => setCompleting(true)}>
          <CheckIcon aria-hidden />
          Mark done
        </Button>
      )}

      <dl className="grid gap-3 rounded-xl border p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Assigned to</dt>
          <dd className="font-medium">{task.assignee_id ? nameOf(task.assignee_id) : 'Anyone'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Expense category</dt>
          <dd className="font-medium">{category?.name ?? 'Not set'}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Provider</dt>
          <dd className="flex flex-wrap items-center justify-between gap-2">
            {provider ? (
              <>
                <Link
                  to={`/providers/${provider.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {provider.name}
                </Link>
                {!provider.deleted_at && <ContactButtons provider={provider} iconOnly />}
              </>
            ) : (
              <span className="font-medium">Not set</span>
            )}
          </dd>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground sm:col-span-2">
          <BellIcon className="size-4" aria-hidden />
          {reminderText(task.reminder_days_before)}
          {task.assignee_id ? ` to ${nameOf(task.assignee_id)}` : ' to everyone'}
        </div>
      </dl>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">History</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not done yet.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {history.map((entry) => (
              <li key={entry.id} className="rounded-xl border p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">
                    Done {formatDate(entry.completed_on)}
                    <span className="font-normal text-muted-foreground">
                      {' '}
                      by {nameOf(entry.completed_by)}
                    </span>
                  </p>
                  <p className={cn('text-xs text-muted-foreground')}>
                    was due {formatDate(entry.due_on, { day: 'numeric', month: 'short' })}
                  </p>
                </div>
                {entry.notes && <p className="mt-1 text-sm whitespace-pre-wrap">{entry.notes}</p>}
                <div className="mt-2 flex flex-col gap-1">
                  {entry.expenses.map((e) => (
                    <Link
                      key={e.id}
                      to={`/expenses/${e.id}`}
                      className="flex items-center gap-2 text-sm underline-offset-4 hover:underline"
                    >
                      <ReceiptTextIcon className="size-4 text-muted-foreground" aria-hidden />
                      {e.description} · {formatMoney(e.amountMinor, e.currency)}
                    </Link>
                  ))}
                  {entry.expenses.length === 0 && !deleted && (
                    <Button variant="link" size="sm" className="h-auto w-fit px-0" asChild>
                      <Link to={`/expenses/new?completion=${entry.id}`}>Log an expense</Link>
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {completing && (
        <CompleteTaskDialog
          task={task}
          today={today}
          open={completing}
          onOpenChange={setCompleting}
          onComplete={(input) => complete.mutate({ task, input })}
        />
      )}
      <LogExpensePrompt completed={completed} onClose={() => setCompleted(null)} />
    </div>
  )
}
