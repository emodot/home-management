import { EmptyState } from '@/components/empty-state'
import {
  describeDue,
  describeSchedule,
  formatDate,
  taskDueState,
  todayIn,
  type Task,
} from '@home/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import { CheckIcon, ClipboardCheckIcon, PlusIcon, TriangleAlertIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { LogExpensePrompt } from '@/components/log-expense-prompt'
import { Button } from '@/components/ui/button'
import { useActiveHousehold } from '@/hooks/use-household'
import { useMemberNames } from '@/hooks/use-lookups'
import { useProviderLookup } from '@/hooks/use-providers'
import { useCompleteTask } from '@/hooks/use-tasks'
import { tasksQuery } from '@/lib/queries'
import { cn } from '@/lib/utils'

function TaskRow({
  task,
  today,
  onComplete,
}: {
  task: Task
  today: string
  onComplete?: (task: Task) => void
}) {
  const household = useActiveHousehold()
  const memberNames = useMemberNames(household.id)
  const providers = useProviderLookup(household.id)
  const { state } = taskDueState({ nextDueOn: task.next_due_on, isActive: task.is_active }, today)
  const details = [
    task.is_active
      ? state === 'later'
        ? `Due ${formatDate(task.next_due_on, { day: 'numeric', month: 'short' })}`
        : describeDue({ nextDueOn: task.next_due_on, isActive: task.is_active }, today)
      : 'Done',
    describeSchedule(task.schedule_type, task.frequency, task.interval_count),
    task.assignee_id ? memberNames.get(task.assignee_id) : null,
    task.provider_id ? providers.get(task.provider_id)?.name : null,
  ].filter(Boolean)

  return (
    <li className="flex items-center gap-3 px-3 py-3">
      {onComplete && task.is_active ? (
        <button
          type="button"
          onClick={() => onComplete(task)}
          aria-label={`Mark ${task.title} done`}
          className="group flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/40 transition-colors hover:border-primary hover:bg-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <CheckIcon
            className="size-4 text-primary-foreground opacity-0 group-hover:opacity-100"
            aria-hidden
          />
        </button>
      ) : (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <CheckIcon className="size-4 text-muted-foreground" aria-hidden />
        </span>
      )}
      <Link to={`/tasks/${task.id}`} className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate font-medium',
            !task.is_active && 'text-muted-foreground line-through',
          )}
        >
          {task.title}
        </p>
        <p className="truncate text-sm text-muted-foreground">
          {state === 'overdue' && task.is_active && (
            <span className="mr-1 inline-flex items-center gap-1 font-medium text-delta-bad">
              <TriangleAlertIcon className="size-3.5" aria-hidden />
            </span>
          )}
          {details.join(' · ')}
        </p>
      </Link>
    </li>
  )
}

function Section({
  title,
  tone,
  children,
}: {
  title: string
  tone?: 'bad'
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className={cn('text-sm font-semibold', tone === 'bad' && 'text-delta-bad')}>{title}</h2>
      <ul className="divide-y rounded-xl border">{children}</ul>
    </section>
  )
}

export function TasksPage() {
  const household = useActiveHousehold()
  const tasks = useSuspenseQuery(tasksQuery(household.id)).data
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'all' ? 'all' : 'upcoming'
  const today = todayIn(household.timezone)
  const [completed, setCompleted] = useState<{ task: Task; completionId: string } | null>(null)
  const complete = useCompleteTask(household.id, today, (task, completionId) =>
    setCompleted({ task, completionId }),
  )
  const onComplete = (task: Task) => complete.mutate({ task })

  const stateOf = (t: Task) =>
    taskDueState({ nextDueOn: t.next_due_on, isActive: t.is_active }, today).state
  const active = tasks.filter((t) => t.is_active)
  const overdue = active.filter((t) => stateOf(t) === 'overdue')
  const dueToday = active.filter((t) => stateOf(t) === 'today')
  const upcoming = active.filter((t) => stateOf(t) === 'upcoming')
  const later = active.filter((t) => stateOf(t) === 'later')
  const done = tasks.filter((t) => !t.is_active)

  const header = (
    <div className="flex items-center justify-between gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
      {tasks.length > 0 && (
        <Button asChild size="sm">
          <Link to="/tasks/new">
            <PlusIcon aria-hidden />
            Add
          </Link>
        </Button>
      )}
    </div>
  )

  if (tasks.length === 0) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        {header}
        <EmptyState
          icon={ClipboardCheckIcon}
          title="Keep the house running"
          action={
            <Button asChild>
              <Link to="/tasks/new">
                <PlusIcon aria-hidden />
                Add task
              </Link>
            </Button>
          }
        >
          Add jobs that come round again, like servicing the generator every 3 months, fumigation or
          cleaning the water tank, and get reminded before they&apos;re due.
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      {header}
      <div
        className="inline-flex w-fit rounded-lg border p-0.5"
        role="tablist"
        aria-label="Which tasks"
      >
        {(['upcoming', 'all'] as const).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => setParams(v === 'all' ? { view: 'all' } : {}, { replace: true })}
            className={cn(
              'rounded-md px-3 py-1 text-sm font-medium transition-colors',
              view === v
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {v === 'upcoming' ? 'Upcoming' : 'All tasks'}
          </button>
        ))}
      </div>

      {view === 'upcoming' ? (
        overdue.length + dueToday.length + upcoming.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nothing due in the next 30 days.{' '}
            <button
              className="underline underline-offset-4"
              onClick={() => setParams({ view: 'all' }, { replace: true })}
            >
              See all tasks
            </button>
          </p>
        ) : (
          <>
            {overdue.length > 0 && (
              <Section title={`Overdue (${overdue.length})`} tone="bad">
                {overdue.map((t) => (
                  <TaskRow key={t.id} task={t} today={today} onComplete={onComplete} />
                ))}
              </Section>
            )}
            {dueToday.length > 0 && (
              <Section title="Due today">
                {dueToday.map((t) => (
                  <TaskRow key={t.id} task={t} today={today} onComplete={onComplete} />
                ))}
              </Section>
            )}
            {upcoming.length > 0 && (
              <Section title="Next 30 days">
                {upcoming.map((t) => (
                  <TaskRow key={t.id} task={t} today={today} onComplete={onComplete} />
                ))}
              </Section>
            )}
          </>
        )
      ) : (
        <>
          {active.length > 0 && (
            <Section title="Active">
              {[...overdue, ...dueToday, ...upcoming, ...later].map((t) => (
                <TaskRow key={t.id} task={t} today={today} onComplete={onComplete} />
              ))}
            </Section>
          )}
          {done.length > 0 && (
            <Section title="Done (one-off)">
              {done.map((t) => (
                <TaskRow key={t.id} task={t} today={today} />
              ))}
            </Section>
          )}
        </>
      )}

      <LogExpensePrompt completed={completed} onClose={() => setCompleted(null)} />
    </div>
  )
}
