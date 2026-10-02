import {
  describeFrequency,
  formatDate,
  formatMoney,
  recurringIncomeFormSchema,
  RECURRING_FREQUENCIES,
  todayIn,
  upcomingDueDates,
  type RecurringFrequency,
  type RecurringIncome,
  type RecurringIncomeFormInput,
  type RecurringIncomeFormValues,
} from '@home/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useSuspenseQuery } from '@tanstack/react-query'
import {
  ArrowLeftIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RepeatIcon,
  Trash2Icon,
} from 'lucide-react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useActiveHousehold, useCurrentUser } from '@/hooks/use-household'
import {
  useDeleteRecurringIncome,
  useSaveRecurringIncome,
  useSetRecurringIncomeActive,
} from '@/hooks/use-income'
import { useMemberNames } from '@/hooks/use-lookups'
import { formatAmountInput, tidyAmountInput } from '@/lib/amount'
import { errorMessage } from '@/lib/errors'
import { membersQuery, recurringIncomeQuery } from '@/lib/queries'

const NOBODY = '__nobody__'
const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
}

function RecurringIncomeRow({ item }: { item: RecurringIncome }) {
  const household = useActiveHousehold()
  const memberNames = useMemberNames(household.id)
  const setActive = useSetRecurringIncomeActive(household.id)
  const remove = useDeleteRecurringIncome(household.id)

  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-3">
      <div className="min-w-0 flex-1 basis-48">
        <p className="flex items-center gap-2 truncate font-medium">
          <span className="truncate">{item.source}</span>
          {!item.is_active && <Badge variant="secondary">Paused</Badge>}
          {item.for_next_month && <Badge variant="secondary">For next month</Badge>}
        </p>
        <p className="truncate text-sm text-muted-foreground">
          {formatMoney(item.amount_minor, item.currency)} ·{' '}
          {describeFrequency(item.frequency, item.interval_count).toLowerCase()}
          {item.is_active &&
            ` · next ${formatDate(item.next_due_on, { day: 'numeric', month: 'short', year: 'numeric' })}`}
          {item.received_by && ` · ${memberNames.get(item.received_by) ?? 'former member'}`}
        </p>
      </div>
      <div className="ml-auto flex gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setActive.mutate({ item, isActive: !item.is_active })}
          aria-label={item.is_active ? `Pause ${item.source}` : `Resume ${item.source}`}
        >
          {item.is_active ? <PauseIcon aria-hidden /> : <PlayIcon aria-hidden />}
        </Button>
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to={`/income/recurring/${item.id}/edit`} aria-label={`Edit ${item.source}`}>
            <PencilIcon aria-hidden />
          </Link>
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Delete ${item.source}`}>
              <Trash2Icon aria-hidden />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {item.source}?</AlertDialogTitle>
              <AlertDialogDescription>
                No more pending income will be created for it. Income it already created is kept. To
                stop it for a while instead, pause it.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => remove.mutate(item)}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  )
}

/** Salary and other income that repeats. Household admins only. */
export function RecurringIncomePage() {
  const household = useActiveHousehold()
  const items = useSuspenseQuery(recurringIncomeQuery(household.id)).data

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <Button variant="ghost" size="sm" className="-ml-2 self-start" asChild>
        <Link to="/income">
          <ArrowLeftIcon aria-hidden />
          Income
        </Link>
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Regular income</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Income that repeats, like a salary. On each pay day it appears at the top of Income to
            confirm (with the actual amount) or skip.
          </p>
        </div>
        {items.length > 0 && (
          <Button asChild>
            <Link to="/income/recurring/new">
              <PlusIcon aria-hidden />
              Add regular income
            </Link>
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={RepeatIcon}
          title="No regular income yet"
          action={
            <Button asChild>
              <Link to="/income/recurring/new">
                <PlusIcon aria-hidden />
                Add regular income
              </Link>
            </Button>
          }
        >
          Set up a salary once and it&apos;ll show up for confirmation every pay day.
        </EmptyState>
      ) : (
        <ul className="divide-y rounded-xl border">
          {items.map((item) => (
            <RecurringIncomeRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  )
}

function RecurringIncomeForm({ existing }: { existing?: RecurringIncome }) {
  const household = useActiveHousehold()
  const user = useCurrentUser()
  const members = useSuspenseQuery(membersQuery(household.id)).data
  const save = useSaveRecurringIncome(household.id, existing)
  const navigate = useNavigate()

  const form = useForm<RecurringIncomeFormInput, unknown, RecurringIncomeFormValues>({
    resolver: zodResolver(recurringIncomeFormSchema),
    defaultValues: existing
      ? {
          source: existing.source,
          amount: formatAmountInput(existing.amount_minor),
          receivedBy: existing.received_by,
          frequency: existing.frequency,
          intervalCount: String(existing.interval_count),
          nextDueOn: existing.next_due_on,
          forNextMonth: existing.for_next_month,
        }
      : {
          source: '',
          amount: '',
          receivedBy: user.id,
          frequency: 'monthly',
          intervalCount: '1',
          nextDueOn: todayIn(household.timezone),
          forNextMonth: false,
        },
  })
  const { errors, isSubmitting } = form.formState
  const [frequency, intervalCount, nextDueOn] = useWatch({
    control: form.control,
    name: ['frequency', 'intervalCount', 'nextDueOn'],
  })

  const interval = Number(intervalCount)
  // Same rule as updateRecurringIncome: an unchanged schedule keeps its month-end anchor.
  const anchor =
    existing?.next_due_on === nextDueOn &&
    existing.frequency === frequency &&
    existing.interval_count === interval
      ? existing.start_on
      : nextDueOn
  const preview =
    Number.isInteger(interval) &&
    interval >= 1 &&
    interval <= 99 &&
    /^\d{4}-\d{2}-\d{2}$/.test(nextDueOn)
      ? upcomingDueDates(nextDueOn, frequency, interval, anchor, 4)
      : []

  const submit = form.handleSubmit(async (input) => {
    try {
      await save.mutateAsync(input)
      toast.success(existing ? 'Regular income updated' : 'Regular income added')
      await navigate('/income/recurring', { replace: true })
    } catch (error) {
      toast.error(`Couldn't save it. ${errorMessage(error)}`)
    }
  })

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-6">
      <FieldGroup className="gap-4">
        <Field data-invalid={!!errors.source}>
          <FieldLabel htmlFor="source">Where does it come from?</FieldLabel>
          <Input
            id="source"
            placeholder="e.g. Salary – Acme Ltd"
            autoFocus={!existing}
            aria-invalid={!!errors.source}
            {...form.register('source')}
          />
          <FieldError errors={[errors.source]} />
        </Field>

        <Field data-invalid={!!errors.amount}>
          <FieldLabel htmlFor="amount">Usual amount</FieldLabel>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-semibold text-muted-foreground">
              ₦
            </span>
            <Input
              id="amount"
              inputMode="decimal"
              placeholder="0"
              className="pl-7"
              aria-invalid={!!errors.amount}
              {...form.register('amount', {
                onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
                  form.setValue('amount', tidyAmountInput(e.target.value))
                },
              })}
            />
          </div>
          <FieldDescription>You can correct it each time you confirm.</FieldDescription>
          <FieldError errors={[errors.amount]} />
        </Field>

        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field>
            <FieldLabel htmlFor="frequency">Repeats</FieldLabel>
            <Controller
              control={form.control}
              name="frequency"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="frequency" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECURRING_FREQUENCIES.map((f) => (
                      <SelectItem key={f} value={f}>
                        {FREQUENCY_LABELS[f]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
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
        </div>
        <FieldError errors={[errors.intervalCount]} />

        <div className="grid grid-cols-2 gap-3">
          <Field data-invalid={!!errors.nextDueOn}>
            <FieldLabel htmlFor="nextDueOn">
              {existing ? 'Next pay day' : 'First pay day'}
            </FieldLabel>
            <Input
              id="nextDueOn"
              type="date"
              aria-invalid={!!errors.nextDueOn}
              {...form.register('nextDueOn')}
            />
            <FieldError errors={[errors.nextDueOn]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="receivedBy">Received by</FieldLabel>
            <Controller
              control={form.control}
              name="receivedBy"
              render={({ field }) => (
                <Select
                  value={field.value ?? NOBODY}
                  onValueChange={(v) => field.onChange(v === NOBODY ? null : v)}
                >
                  <SelectTrigger id="receivedBy" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.profile.full_name ?? m.profile.email}
                      </SelectItem>
                    ))}
                    <SelectItem value={NOBODY}>Not set</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="forNextMonth">Counts toward</FieldLabel>
          <Controller
            control={form.control}
            name="forNextMonth"
            render={({ field }) => (
              <Select
                value={field.value ? 'next' : 'paid'}
                onValueChange={(v) => field.onChange(v === 'next')}
              >
                <SelectTrigger id="forNextMonth" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="paid">The month it&apos;s paid</SelectItem>
                  <SelectItem value="next">The month after (e.g. paid on the 28th)</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </Field>

        {preview.length > 0 && (
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            {describeFrequency(frequency, interval)}:{' '}
            {preview
              .map((d) => formatDate(d, { day: 'numeric', month: 'short', year: 'numeric' }))
              .join(', ')}
            …
          </p>
        )}
      </FieldGroup>

      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : existing ? 'Save changes' : 'Add regular income'}
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

export function NewRecurringIncomePage() {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Add regular income</h1>
      <RecurringIncomeForm />
    </div>
  )
}

export function EditRecurringIncomePage() {
  const { recurringId = '' } = useParams()
  const household = useActiveHousehold()
  const item = useSuspenseQuery(recurringIncomeQuery(household.id)).data.find(
    (r) => r.id === recurringId,
  )
  if (!item) throw new Response('Not found', { status: 404, statusText: 'Not found' })

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Edit {item.source}</h1>
      <RecurringIncomeForm existing={item} />
    </div>
  )
}
