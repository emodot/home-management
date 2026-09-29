import {
  expenseFormSchema,
  monthOf,
  suggestCategoryId,
  type Category,
  type ExpenseFormInput,
  type ExpenseInput,
  type Member,
  type ParsedReceipt,
} from '@home/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { ScanTextIcon } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { BudgetMonthField } from '@/components/budget-month-field'
import { ProviderCombobox } from '@/components/provider-combobox'
import { ReceiptPicker, type PickedReceipt } from '@/components/receipt-picker'
import { ScanReceiptButton } from '@/components/receipt-scan'
import { CategoryOptions } from '@/components/category-options'
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
import { formatAmountInput, tidyAmountInput } from '@/lib/amount'
import { toPickedReceipt, type PreparedReceipt } from '@/lib/images'
import { supabase } from '@/lib/supabase'

const FORMER_MEMBER = '__former__'

/** Fields a receipt scan can fill in. */
type ScanField = 'amount' | 'occurredOn' | 'description' | 'categoryId'
const SCAN_FIELD_NAMES: Record<ScanField, string> = {
  amount: 'amount',
  occurredOn: 'date',
  description: 'shop',
  categoryId: 'category',
}

function listOf(words: string[]): string {
  const last = words.at(-1) ?? ''
  return words.length <= 1 ? last : `${words.slice(0, -1).join(', ')} and ${last}`
}

function FromReceipt() {
  return (
    <FieldDescription className="flex items-center gap-1.5">
      <ScanTextIcon className="size-3.5" aria-hidden />
      From the receipt. Please check it.
    </FieldDescription>
  )
}

export function ExpenseForm({
  defaultValues,
  categories,
  members,
  submitLabel,
  onSubmit,
  withReceipts = false,
  withScan = false,
  keep = [],
  onCancel,
}: {
  defaultValues: ExpenseFormInput
  categories: Category[]
  members: Member[]
  submitLabel: string
  onSubmit: (input: ExpenseInput, files: PreparedReceipt[]) => Promise<void>
  withReceipts?: boolean
  /** Adds "Scan receipt", which fills in fields the user hasn't edited. Needs withReceipts. */
  withScan?: boolean
  /** Prefilled fields a scan must not replace (e.g. a completed task's title). */
  keep?: ScanField[]
  onCancel: () => void
}) {
  const household = useActiveHousehold()
  const [receipts, setReceipts] = useState<PickedReceipt[]>([])
  const [preparing, setPreparing] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [fromReceipt, setFromReceipt] = useState<ReadonlySet<ScanField>>(new Set())
  const form = useForm({
    resolver: zodResolver(expenseFormSchema),
    defaultValues,
  })
  const { errors, isSubmitting } = form.formState
  const [occurredOn, budgetMonth] = useWatch({
    control: form.control,
    name: ['occurredOn', 'budgetMonth'],
  })
  const paidMonth = /^\d{4}-\d{2}-\d{2}$/.test(occurredOn) ? monthOf(occurredOn) : budgetMonth

  // The month it counts toward follows the payment date until it's set to a different month.
  const [followsDate, setFollowsDate] = useState(
    defaultValues.budgetMonth === monthOf(defaultValues.occurredOn),
  )
  function followDate(date: string) {
    if (followsDate && /^\d{4}-\d{2}-\d{2}$/.test(date)) form.setValue('budgetMonth', monthOf(date))
  }

  // Archived categories only appear when the expense already uses one.
  const categoryOptions = categories.filter(
    (c) => !c.is_archived || c.id === defaultValues.categoryId,
  )
  const paidByIsFormerMember =
    defaultValues.paidBy !== null && !members.some((m) => m.user_id === defaultValues.paidBy)

  function unmark(name: ScanField) {
    setFromReceipt((marked) => {
      if (!marked.has(name)) return marked
      const next = new Set(marked)
      next.delete(name)
      return next
    })
  }

  async function applyScan(file: PreparedReceipt, parsed: ParsedReceipt | null) {
    setReceipts((current) => [...current, toPickedReceipt(file)])
    if (!parsed) return

    // Only fields the user hasn't typed into; defaults like today's date can be replaced.
    const canFill = (name: ScanField) => !keep.includes(name) && !form.getFieldState(name).isDirty
    const filled: ScanField[] = []
    const fill = (name: ScanField, value: string | null) => {
      if (value === null || !canFill(name)) return
      form.setValue(name, value, { shouldValidate: true })
      if (name === 'occurredOn') followDate(value)
      filled.push(name)
    }
    fill('amount', parsed.amountMinor === null ? null : formatAmountInput(parsed.amountMinor))
    fill('occurredOn', parsed.occurredOn)
    fill('description', parsed.vendor)
    if (parsed.vendor && canFill('categoryId')) {
      try {
        const id = await suggestCategoryId(supabase, household.id, parsed.vendor)
        fill('categoryId', categories.some((c) => c.id === id && !c.is_archived) ? id : null)
      } catch {
        // A suggestion is optional.
      }
    }

    setFromReceipt((marked) => new Set([...marked, ...filled]))
    if (filled.length > 0) {
      const names = listOf(filled.map((f) => SCAN_FIELD_NAMES[f]))
      toast.success(
        `Filled in the ${names} from the receipt. Please check ${filled.length === 1 ? 'it' : 'them'}.`,
      )
    } else if (parsed.amountMinor === null && parsed.occurredOn === null && !parsed.vendor) {
      toast("Couldn't read much from that receipt. It's attached, so fill in the details yourself.")
    } else {
      toast('Receipt attached. Your own entries were kept.')
    }
  }

  const submit = form.handleSubmit((input) =>
    onSubmit(
      input,
      receipts.map((r) => r.file),
    ),
  )

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-6">
      {withScan && withReceipts && (
        <ScanReceiptButton
          onScanned={applyScan}
          onBusyChange={setScanning}
          disabled={isSubmitting || preparing}
        />
      )}
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
                onChange: () => unmark('amount'),
                onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
                  form.setValue('amount', tidyAmountInput(e.target.value))
                },
              })}
            />
          </div>
          {fromReceipt.has('amount') && <FromReceipt />}
          <FieldError errors={[errors.amount]} />
        </Field>

        <Field data-invalid={!!errors.description}>
          <FieldLabel htmlFor="description">What was it for?</FieldLabel>
          <Input
            id="description"
            placeholder="e.g. Diesel for generator"
            autoComplete="off"
            aria-invalid={!!errors.description}
            {...form.register('description', { onChange: () => unmark('description') })}
          />
          {fromReceipt.has('description') && <FromReceipt />}
          <FieldError errors={[errors.description]} />
        </Field>

        <Field data-invalid={!!errors.categoryId}>
          <FieldLabel htmlFor="categoryId">Category</FieldLabel>
          <Controller
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(value) => {
                  field.onChange(value)
                  unmark('categoryId')
                }}
              >
                <SelectTrigger
                  id="categoryId"
                  className="w-full"
                  aria-invalid={!!errors.categoryId}
                  onBlur={field.onBlur}
                >
                  <SelectValue placeholder="Choose a category" />
                </SelectTrigger>
                <SelectContent>
                  <CategoryOptions categories={categoryOptions} icons />
                </SelectContent>
              </Select>
            )}
          />
          {fromReceipt.has('categoryId') && <FromReceipt />}
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

        <div className="grid grid-cols-2 gap-3">
          <Field data-invalid={!!errors.occurredOn}>
            <FieldLabel htmlFor="occurredOn">Date</FieldLabel>
            <Input
              id="occurredOn"
              type="date"
              aria-invalid={!!errors.occurredOn}
              {...form.register('occurredOn', {
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                  unmark('occurredOn')
                  followDate(e.target.value)
                },
              })}
            />
            {fromReceipt.has('occurredOn') && <FromReceipt />}
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

        <BudgetMonthField
          paidMonth={paidMonth}
          value={budgetMonth}
          disabled={isSubmitting}
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

        {withReceipts && (
          <Field>
            <FieldLabel>Receipts</FieldLabel>
            <ReceiptPicker
              value={receipts}
              onChange={setReceipts}
              onBusyChange={setPreparing}
              disabled={isSubmitting || scanning}
            />
          </Field>
        )}
      </FieldGroup>

      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 flex gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <Button
          type="submit"
          className="flex-1 md:flex-none"
          disabled={isSubmitting || preparing || scanning}
        >
          {isSubmitting
            ? 'Saving…'
            : scanning
              ? 'Reading receipt…'
              : preparing
                ? 'Preparing receipt…'
                : submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
