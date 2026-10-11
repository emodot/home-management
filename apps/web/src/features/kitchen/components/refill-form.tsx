import {
  formatDate,
  gasReminderOn,
  gasRefillFormSchema,
  predictNextRefill,
  todayIn,
  type GasRefillFormInput,
  type GasRefillFormValues,
  type GasRefillRecord,
  type Member,
} from '@home/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router'
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
import { useActiveHousehold, useCurrentUser } from '@/hooks/use-household'
import { errorMessage } from '@/lib/errors'
import { useLogGasRefill } from '../hooks/use-gas'
import { PriceInput } from './price-input'

/**
 * Logging a refill: date, cylinder size, amount, vendor (a provider), who paid, and whether to
 * keep a "Refill cooking gas" task due a few days before the next predicted refill.
 */
export function RefillForm({
  refills,
  members,
  onDone,
  onCancel,
}: {
  /** Earlier refills (for defaults and the prediction the reminder uses). */
  refills: GasRefillRecord[]
  members: Member[]
  onDone: () => void
  onCancel?: () => void
}) {
  const household = useActiveHousehold()
  const user = useCurrentUser()
  const navigate = useNavigate()
  const log = useLogGasRefill(household.id)
  const last = refills[0]
  const form = useForm<GasRefillFormInput, unknown, GasRefillFormValues>({
    resolver: zodResolver(gasRefillFormSchema),
    defaultValues: {
      refilledOn: todayIn(household.timezone),
      cylinderKg: last ? String(last.cylinderKg) : '12.5',
      amount: '',
      paidBy: user.id,
      providerId: last?.providerId ?? null,
      addReminder: true,
    },
  })
  const { errors, isSubmitting } = form.formState
  const [refilledOn, cylinderKg] = useWatch({
    control: form.control,
    name: ['refilledOn', 'cylinderKg'],
  })
  // What the prediction will be once this refill is in (needs one before it).
  const kg = Number(cylinderKg.replace(',', '.'))
  const prediction =
    /^\d{4}-\d{2}-\d{2}$/.test(refilledOn) && kg > 0
      ? predictNextRefill([...refills, { refilledOn, cylinderKg: kg }])
      : null

  const submit = form.handleSubmit(async (values) => {
    try {
      const { expenseId, taskId } = await log.mutateAsync({
        refilledOn: values.refilledOn,
        cylinderKg: values.cylinderKg,
        amountMinor: values.amount,
        paidBy: values.paidBy,
        providerId: values.providerId,
        reminderOn: values.addReminder && prediction ? gasReminderOn(prediction) : null,
      })
      onDone()
      toast.success(
        taskId && prediction
          ? `Refill logged. Reminder set for ${formatDate(gasReminderOn(prediction))}.`
          : 'Refill logged',
        {
          action: { label: 'View expense', onClick: () => void navigate(`/expenses/${expenseId}`) },
        },
      )
    } catch (error) {
      toast.error(`Couldn't log the refill. ${errorMessage(error)}`)
    }
  })

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-5">
      <FieldGroup className="gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field data-invalid={!!errors.refilledOn}>
            <FieldLabel htmlFor="refill-date">Refilled on</FieldLabel>
            <Input id="refill-date" type="date" {...form.register('refilledOn')} />
            <FieldError errors={[errors.refilledOn]} />
          </Field>
          <Field data-invalid={!!errors.cylinderKg}>
            <FieldLabel htmlFor="refill-kg">Cylinder</FieldLabel>
            <div className="relative">
              <Input
                id="refill-kg"
                inputMode="decimal"
                autoComplete="off"
                className="pr-9 tabular-nums"
                aria-invalid={!!errors.cylinderKg}
                {...form.register('cylinderKg')}
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
                kg
              </span>
            </div>
            <FieldError errors={[errors.cylinderKg]} />
          </Field>
        </div>

        <Field data-invalid={!!errors.amount}>
          <FieldLabel htmlFor="refill-amount">Amount paid</FieldLabel>
          <Controller
            control={form.control}
            name="amount"
            render={({ field }) => (
              <PriceInput
                id="refill-amount"
                value={field.value}
                onChange={field.onChange}
                invalid={!!errors.amount}
              />
            )}
          />
          <FieldError errors={[errors.amount]} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="refill-vendor">Vendor (optional)</FieldLabel>
            <Controller
              control={form.control}
              name="providerId"
              render={({ field }) => (
                <ProviderCombobox
                  id="refill-vendor"
                  householdId={household.id}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="refill-paid-by">Paid by</FieldLabel>
            <Controller
              control={form.control}
              name="paidBy"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="refill-paid-by" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
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
        </div>

        <Field orientation="horizontal">
          <input
            id="refill-reminder"
            type="checkbox"
            className="mt-0.5 size-4 accent-primary"
            {...form.register('addReminder')}
          />
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor="refill-reminder">Remind us before it runs out</FieldLabel>
            <FieldDescription>
              {prediction
                ? `A "Refill cooking gas" task, due ${formatDate(gasReminderOn(prediction))} (3 days before the predicted refill on ${formatDate(prediction.nextOn)}).`
                : 'Needs one more refill to predict when the gas will run out.'}
            </FieldDescription>
          </div>
        </Field>
      </FieldGroup>

      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Log refill'}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}
