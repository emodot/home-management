import {
  describeSchedule,
  formatDate,
  TASK_FREQUENCIES,
  taskInputSchema,
  todayIn,
  upcomingDueDates,
  type Task,
  type TaskFrequency,
  type TaskInput,
  type TaskScheduleType,
  type TaskValues,
} from '@home/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { ProviderCombobox } from '@/components/provider-combobox'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useActiveHousehold } from '@/hooks/use-household'
import { useSaveTask } from '@/hooks/use-tasks'
import { errorMessage } from '@/lib/errors'
import { categoriesQuery, membersQuery, taskQuery } from '@/lib/queries'

const NONE = '__none__'
const SCHEDULE_LABELS: Record<TaskScheduleType, string> = {
  fixed: 'On a fixed schedule',
  after_completion: 'A while after each time it’s done',
  once: 'Just once',
}
const FREQUENCY_LABELS: Record<TaskFrequency, string> = {
  daily: 'Days',
  weekly: 'Weeks',
  monthly: 'Months',
  quarterly: 'Quarters',
  yearly: 'Years',
}
const REMINDER_OPTIONS = [0, 1, 2, 3, 7, 14, 30]

function TaskForm({ existing }: { existing?: Task }) {
  const household = useActiveHousehold()
  const categories = useSuspenseQuery(categoriesQuery(household.id)).data
  const members = useSuspenseQuery(membersQuery(household.id)).data
  const save = useSaveTask(household.id, existing)
  const navigate = useNavigate()

  const form = useForm<TaskInput, unknown, TaskValues>({
    resolver: zodResolver(taskInputSchema),
    defaultValues: existing
      ? {
          title: existing.title,
          description: existing.description ?? '',
          scheduleType: existing.schedule_type,
          frequency: existing.frequency ?? 'monthly',
          intervalCount: String(existing.interval_count),
          nextDueOn: existing.next_due_on,
          assigneeId: existing.assignee_id,
          providerId: existing.provider_id,
          defaultCategoryId: existing.default_category_id,
          reminderDaysBefore: String(existing.reminder_days_before),
        }
      : {
          title: '',
          description: '',
          scheduleType: 'fixed',
          frequency: 'monthly',
          intervalCount: '1',
          nextDueOn: todayIn(household.timezone),
          assigneeId: null,
          providerId: null,
          defaultCategoryId: null,
          reminderDaysBefore: '1',
        },
  })
  const { errors, isSubmitting } = form.formState
  const [scheduleType, frequency, intervalCount, nextDueOn] = useWatch({
    control: form.control,
    name: ['scheduleType', 'frequency', 'intervalCount', 'nextDueOn'],
  })
  const interval = Number(intervalCount)
  const repeats = scheduleType !== 'once'
  const anchor =
    existing?.next_due_on === nextDueOn &&
    existing.schedule_type === scheduleType &&
    existing.frequency === frequency &&
    existing.interval_count === interval
      ? existing.start_on
      : nextDueOn
  const preview =
    scheduleType === 'fixed' &&
    frequency &&
    Number.isInteger(interval) &&
    interval >= 1 &&
    interval <= 99 &&
    /^\d{4}-\d{2}-\d{2}$/.test(nextDueOn)
      ? upcomingDueDates(nextDueOn, frequency, interval, anchor, 4)
      : []

  const submit = form.handleSubmit(async (values) => {
    try {
      const id = await save.mutateAsync(values)
      toast.success(existing ? 'Task updated' : 'Task added')
      await navigate(`/tasks/${id}`, { replace: true })
    } catch (error) {
      toast.error(`Couldn't save the task. ${errorMessage(error)}`)
    }
  })

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-6">
      <FieldGroup className="gap-4">
        <Field data-invalid={!!errors.title}>
          <FieldLabel htmlFor="title">Task</FieldLabel>
          <Input
            id="title"
            placeholder="e.g. Service the generator"
            autoFocus={!existing}
            aria-invalid={!!errors.title}
            {...form.register('title')}
          />
          <FieldError errors={[errors.title]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="scheduleType">Repeats</FieldLabel>
          <Controller
            control={form.control}
            name="scheduleType"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="scheduleType" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SCHEDULE_LABELS) as TaskScheduleType[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {SCHEDULE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldDescription>
            {scheduleType === 'fixed'
              ? 'Same dates whenever it gets done, e.g. the 1st of every month.'
              : scheduleType === 'after_completion'
                ? 'Counts from when it was last done, e.g. every 3 months after the last service.'
                : 'A one-off job.'}
          </FieldDescription>
        </Field>

        {repeats && (
          <div className="grid grid-cols-[auto_1fr] gap-3">
            <Field data-invalid={!!errors.intervalCount} className="w-24">
              <FieldLabel htmlFor="intervalCount">Every</FieldLabel>
              <Input
                id="intervalCount"
                type="number"
                inputMode="numeric"
                min={1}
                max={99}
                aria-invalid={!!errors.intervalCount}
                {...form.register('intervalCount')}
              />
            </Field>
            <Field data-invalid={!!errors.frequency}>
              <FieldLabel htmlFor="frequency" className="invisible">
                Unit
              </FieldLabel>
              <Controller
                control={form.control}
                name="frequency"
                render={({ field }) => (
                  <Select value={field.value ?? 'monthly'} onValueChange={field.onChange}>
                    <SelectTrigger id="frequency" className="w-full" aria-label="Repeat unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_FREQUENCIES.map((f) => (
                        <SelectItem key={f} value={f}>
                          {FREQUENCY_LABELS[f]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <div className="col-span-2">
              <FieldError errors={[errors.intervalCount, errors.frequency]} />
            </div>
          </div>
        )}

        <Field data-invalid={!!errors.nextDueOn}>
          <FieldLabel htmlFor="nextDueOn">
            {existing ? 'Next due' : repeats ? 'First due' : 'Due'}
          </FieldLabel>
          <Input
            id="nextDueOn"
            type="date"
            aria-invalid={!!errors.nextDueOn}
            {...form.register('nextDueOn')}
          />
          <FieldError errors={[errors.nextDueOn]} />
        </Field>
        {preview.length > 0 && frequency && (
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            {describeSchedule(scheduleType, frequency, interval)}:{' '}
            {preview
              .map((d) => formatDate(d, { day: 'numeric', month: 'short', year: 'numeric' }))
              .join(', ')}
            …
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="assigneeId">Assigned to</FieldLabel>
            <Controller
              control={form.control}
              name="assigneeId"
              render={({ field }) => (
                <Select
                  value={field.value ?? NONE}
                  onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                >
                  <SelectTrigger id="assigneeId" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Anyone (remind everyone)</SelectItem>
                    {members.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.profile.full_name ?? m.profile.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="reminderDaysBefore">Reminder email</FieldLabel>
            <Controller
              control={form.control}
              name="reminderDaysBefore"
              render={({ field }) => (
                <Select value={String(field.value)} onValueChange={field.onChange}>
                  <SelectTrigger id="reminderDaysBefore" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REMINDER_OPTIONS.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d === 0 ? 'On the day' : `${d} ${d === 1 ? 'day' : 'days'} before`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="providerId">Provider (optional)</FieldLabel>
          <Controller
            control={form.control}
            name="providerId"
            render={({ field }) => (
              <ProviderCombobox
                id="providerId"
                householdId={household.id}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="defaultCategoryId">Expense category (optional)</FieldLabel>
          <Controller
            control={form.control}
            name="defaultCategoryId"
            render={({ field }) => (
              <Select
                value={field.value ?? NONE}
                onValueChange={(v) => field.onChange(v === NONE ? null : v)}
              >
                <SelectTrigger id="defaultCategoryId" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not set</SelectItem>
                  {categories
                    .filter((c) => !c.is_archived || c.id === existing?.default_category_id)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldDescription>
            Used to fill in the expense when you log one after doing the task.
          </FieldDescription>
        </Field>

        <Field data-invalid={!!errors.description}>
          <FieldLabel htmlFor="description">Details (optional)</FieldLabel>
          <Textarea
            id="description"
            rows={2}
            aria-invalid={!!errors.description}
            {...form.register('description')}
          />
          <FieldError errors={[errors.description]} />
        </Field>
      </FieldGroup>

      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : existing ? 'Save changes' : 'Add task'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => void navigate(-1)}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}

export function NewTaskPage() {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Add task</h1>
      <TaskForm />
    </div>
  )
}

export function EditTaskPage() {
  const { taskId = '' } = useParams()
  const household = useActiveHousehold()
  const task = useSuspenseQuery(taskQuery(household.id, taskId)).data
  if (!task) throw new Response('Not found', { status: 404, statusText: 'Not found' })
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Edit task</h1>
      <TaskForm existing={task} />
    </div>
  )
}
