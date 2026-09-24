import {
  describeFrequency,
  formatDate,
  recurringExpenseFormSchema,
  RECURRING_FREQUENCIES,
  todayIn,
  upcomingDueDates,
  type RecurringExpense,
  type RecurringExpenseFormInput,
  type RecurringExpenseFormValues,
  type RecurringFrequency,
} from '@home/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { CategoryIcon } from '@/components/category-icon'
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
import { useActiveHousehold, useCurrentUser } from '@/hooks/use-household'
import { useSaveRecurringExpense } from '@/hooks/use-recurring'
import { formatAmountInput, tidyAmountInput } from '@/lib/amount'
import { errorMessage } from '@/lib/errors'
import { categoriesQuery, membersQuery, recurringExpensesQuery } from '@/lib/queries'

const NOBODY = '__nobody__'
const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
}

function RecurringExpenseForm({ existing }: { existing?: RecurringExpense }) {
  const household = useActiveHousehold()
  const user = useCurrentUser()
  const categories = useSuspenseQuery(categoriesQuery(household.id)).data
  const members = useSuspenseQuery(membersQuery(household.id)).data
  const save = useSaveRecurringExpense(household.id, existing)
  const navigate = useNavigate()

  const form = useForm<RecurringExpenseFormInput, unknown, RecurringExpenseFormValues>({
    resolver: zodResolver(recurringExpenseFormSchema),
    defaultValues: existing
      ? {
          description: existing.description,
          amount: formatAmountInput(existing.amount_minor),
          categoryId: existing.category_id,
          paidBy: existing.paid_by,
          providerId: existing.provider_id,
          frequency: existing.frequency,
          intervalCount: String(existing.interval_count),
          nextDueOn: existing.next_due_on,
        }
      : {
          description: '',
          amount: '',
          categoryId: '',
          paidBy: user.id,
          providerId: null,
          frequency: 'monthly',
          intervalCount: '1',
          nextDueOn: todayIn(household.timezone),
        },
  })
  const { errors, isSubmitting } = form.formState
  const [frequency, intervalCount, nextDueOn] = useWatch({
    control: form.control,
    name: ['frequency', 'intervalCount', 'nextDueOn'],
  })

  const interval = Number(intervalCount)
  // Same rule as updateRecurringExpense: an unchanged schedule keeps its original month-end anchor.
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
  const categoryOptions = categories.filter((c) => !c.is_archived || c.id === existing?.category_id)

  const submit = form.handleSubmit(async (input) => {
    try {
      await save.mutateAsync(input)
      toast.success(existing ? 'Bill updated' : 'Recurring bill added')
      await navigate('/recurring', { replace: true })
    } catch (error) {
      toast.error(`Couldn't save the bill. ${errorMessage(error)}`)
    }
  })

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-6">
      <FieldGroup className="gap-4">
        <Field data-invalid={!!errors.description}>
          <FieldLabel htmlFor="description">What is it?</FieldLabel>
          <Input
            id="description"
            placeholder="e.g. Spectranet internet"
            autoFocus={!existing}
            aria-invalid={!!errors.description}
            {...form.register('description')}
          />
          <FieldError errors={[errors.description]} />
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
              className="pl-8"
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

        <Field data-invalid={!!errors.categoryId}>
          <FieldLabel htmlFor="categoryId">Category</FieldLabel>
          <Controller
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger
                  id="categoryId"
                  className="w-full"
                  aria-invalid={!!errors.categoryId}
                >
                  <SelectValue placeholder="Choose a category" />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <CategoryIcon icon={c.icon} className="size-6 bg-transparent" />
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError errors={[errors.categoryId]} />
        </Field>

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
            <FieldLabel htmlFor="nextDueOn">{existing ? 'Next due' : 'First due'}</FieldLabel>
            <Input
              id="nextDueOn"
              type="date"
              aria-invalid={!!errors.nextDueOn}
              {...form.register('nextDueOn')}
            />
            <FieldError errors={[errors.nextDueOn]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="paidBy">Usually paid by</FieldLabel>
            <Controller
              control={form.control}
              name="paidBy"
              render={({ field }) => (
                <Select
                  value={field.value ?? NOBODY}
                  onValueChange={(v) => field.onChange(v === NOBODY ? null : v)}
                >
                  <SelectTrigger id="paidBy" className="w-full">
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
          {isSubmitting ? 'Saving…' : existing ? 'Save changes' : 'Add bill'}
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

export function NewRecurringPage() {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Add recurring bill</h1>
      <RecurringExpenseForm />
    </div>
  )
}

export function EditRecurringPage() {
  const { billId = '' } = useParams()
  const household = useActiveHousehold()
  const bill = useSuspenseQuery(recurringExpensesQuery(household.id)).data.find(
    (b) => b.id === billId,
  )
  if (!bill) throw new Response('Not found', { status: 404, statusText: 'Not found' })

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Edit {bill.description}</h1>
      <RecurringExpenseForm existing={bill} />
    </div>
  )
}
