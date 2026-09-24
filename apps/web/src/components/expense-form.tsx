import {
  expenseFormSchema,
  type Category,
  type ExpenseFormInput,
  type ExpenseInput,
  type Member,
} from '@home/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { CategoryIcon } from '@/components/category-icon'
import { ReceiptPicker, type PickedReceipt } from '@/components/receipt-picker'
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
import type { PreparedReceipt } from '@/lib/images'

const FORMER_MEMBER = '__former__'

export function ExpenseForm({
  defaultValues,
  categories,
  members,
  submitLabel,
  onSubmit,
  withReceipts = false,
  onCancel,
}: {
  defaultValues: ExpenseFormInput
  categories: Category[]
  members: Member[]
  submitLabel: string
  onSubmit: (input: ExpenseInput, files: PreparedReceipt[]) => Promise<void>
  withReceipts?: boolean
  onCancel: () => void
}) {
  const [receipts, setReceipts] = useState<PickedReceipt[]>([])
  const form = useForm({
    resolver: zodResolver(expenseFormSchema),
    defaultValues,
  })
  const { errors, isSubmitting } = form.formState

  // Archived categories only appear when the expense already uses one.
  const categoryOptions = categories.filter(
    (c) => !c.is_archived || c.id === defaultValues.categoryId,
  )
  const paidByIsFormerMember =
    defaultValues.paidBy !== null && !members.some((m) => m.user_id === defaultValues.paidBy)

  const submit = form.handleSubmit((input) =>
    onSubmit(
      input,
      receipts.map((r) => r.file),
    ),
  )

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

        <Field data-invalid={!!errors.description}>
          <FieldLabel htmlFor="description">What was it for?</FieldLabel>
          <Input
            id="description"
            placeholder="e.g. Diesel for generator"
            autoComplete="off"
            aria-invalid={!!errors.description}
            {...form.register('description')}
          />
          <FieldError errors={[errors.description]} />
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
                  onBlur={field.onBlur}
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

        <div className="grid grid-cols-2 gap-3">
          <Field data-invalid={!!errors.occurredOn}>
            <FieldLabel htmlFor="occurredOn">Date</FieldLabel>
            <Input
              id="occurredOn"
              type="date"
              aria-invalid={!!errors.occurredOn}
              {...form.register('occurredOn')}
            />
            <FieldError errors={[errors.occurredOn]} />
          </Field>
          <Field data-invalid={!!errors.paidBy}>
            <FieldLabel htmlFor="paidBy">Paid by</FieldLabel>
            <Controller
              control={form.control}
              name="paidBy"
              render={({ field }) => (
                <Select
                  value={field.value ?? FORMER_MEMBER}
                  onValueChange={(value) => field.onChange(value === FORMER_MEMBER ? null : value)}
                >
                  <SelectTrigger id="paidBy" className="w-full" onBlur={field.onBlur}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.profile.full_name ?? m.profile.email}
                      </SelectItem>
                    ))}
                    {(paidByIsFormerMember || defaultValues.paidBy === null) && (
                      <SelectItem value={FORMER_MEMBER}>
                        {paidByIsFormerMember ? 'Former member' : 'Not recorded'}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </div>

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

        {withReceipts && (
          <Field>
            <FieldLabel>Receipts</FieldLabel>
            <ReceiptPicker value={receipts} onChange={setReceipts} disabled={isSubmitting} />
          </Field>
        )}
      </FieldGroup>

      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 flex gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <Button type="submit" className="flex-1 md:flex-none" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
