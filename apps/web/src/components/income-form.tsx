import {
  incomeFormSchema,
  monthOf,
  type IncomeFormInput,
  type IncomeInput,
  type Member,
} from '@home/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { BudgetMonthField } from '@/components/budget-month-field'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { tidyAmountInput } from '@/lib/amount'

const NOBODY = '__nobody__'
const IS_DATE = /^\d{4}-\d{2}-\d{2}$/

export function IncomeForm({
  defaultValues,
  members,
  submitLabel,
  onSubmit,
  onCancel,
  extraActions,
}: {
  defaultValues: IncomeFormInput
  members: Member[]
  submitLabel: string
  onSubmit: (input: IncomeInput) => Promise<void>
  onCancel: () => void
  /** E.g. a delete button on the edit page. */
  extraActions?: React.ReactNode
}) {
  const form = useForm({ resolver: zodResolver(incomeFormSchema), defaultValues })
  const { errors, isSubmitting } = form.formState
  const [receivedOn, budgetMonth] = useWatch({
    control: form.control,
    name: ['receivedOn', 'budgetMonth'],
  })
  const paidMonth = IS_DATE.test(receivedOn) ? monthOf(receivedOn) : budgetMonth

  // The month it counts toward follows the received date until it's set to a different month.
  const [followsDate, setFollowsDate] = useState(
    defaultValues.budgetMonth === monthOf(defaultValues.receivedOn),
  )
  const receivedByIsFormerMember =
    defaultValues.receivedBy !== null &&
    !members.some((m) => m.user_id === defaultValues.receivedBy)

  const submit = form.handleSubmit((input) => onSubmit(input))

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-6">
      <FieldGroup className="gap-4">
        <Field data-invalid={!!errors.amount}>
          <FieldLabel htmlFor="amount">Amount</FieldLabel>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-2xl font-semibold text-muted-foreground">
              ₦
            </span>
            <Input
              id="amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              autoFocus={!defaultValues.amount}
              className="h-14 pl-9 text-2xl font-semibold md:text-2xl"
              aria-invalid={!!errors.amount}
              {...form.register('amount', {
                onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
                  form.setValue('amount', tidyAmountInput(e.target.value))
                },
              })}
            />
          </div>
          <FieldError errors={[errors.amount]} />
        </Field>

        <Field data-invalid={!!errors.source}>
          <FieldLabel htmlFor="source">Where did it come from?</FieldLabel>
          <Input
            id="source"
            placeholder="e.g. Salary from Acme Ltd"
            autoComplete="off"
            aria-invalid={!!errors.source}
            {...form.register('source')}
          />
          <FieldError errors={[errors.source]} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field data-invalid={!!errors.receivedOn}>
            <FieldLabel htmlFor="receivedOn">Received on</FieldLabel>
            <Input
              id="receivedOn"
              type="date"
              aria-invalid={!!errors.receivedOn}
              {...form.register('receivedOn', {
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                  if (followsDate && IS_DATE.test(e.target.value)) {
                    form.setValue('budgetMonth', monthOf(e.target.value))
                  }
                },
              })}
            />
            <FieldError errors={[errors.receivedOn]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="receivedBy">Received by</FieldLabel>
            <Controller
              control={form.control}
              name="receivedBy"
              render={({ field }) => (
                <Select
                  value={field.value ?? NOBODY}
                  onValueChange={(value) => field.onChange(value === NOBODY ? null : value)}
                >
                  <SelectTrigger id="receivedBy" className="w-full" onBlur={field.onBlur}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.profile.full_name ?? m.profile.email}
                      </SelectItem>
                    ))}
                    <SelectItem value={NOBODY}>
                      {receivedByIsFormerMember ? 'Former member' : 'Not recorded'}
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </div>

        <BudgetMonthField
          paidMonth={paidMonth}
          value={budgetMonth}
          disabled={isSubmitting}
          hint="For monthly net, e.g. a salary paid at the end of one month for the next."
          onChange={(month) => {
            form.setValue('budgetMonth', month, { shouldDirty: true })
            setFollowsDate(month === paidMonth)
          }}
        />

        <Field data-invalid={!!errors.notes}>
          <FieldLabel htmlFor="notes">Notes (optional)</FieldLabel>
          <Textarea
            id="notes"
            rows={2}
            placeholder="Anything worth remembering"
            aria-invalid={!!errors.notes}
            {...form.register('notes')}
          />
          <FieldError errors={[errors.notes]} />
        </Field>
      </FieldGroup>

      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 flex gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <Button type="submit" className="flex-1 md:flex-none" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        {extraActions}
      </div>
    </form>
  )
}
