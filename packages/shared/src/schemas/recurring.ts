import { z } from 'zod'
import { MAX_AMOUNT_MINOR } from '../money.ts'
import { amountInputSchema, isoDateSchema } from './expenses.ts'

export const RECURRING_FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'yearly'] as const
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number]

const description = z
  .string()
  .trim()
  .min(1, 'Add a short description')
  .max(200, 'Keep it under 200 characters')
const intervalCount = z.coerce
  .number<string | number>()
  .int('Use a whole number')
  .min(1, 'At least 1')
  .max(99, 'At most 99')

/** What gets written to recurring_expenses. */
export const recurringExpenseInputSchema = z.object({
  description,
  amountMinor: z.number().int().positive().max(MAX_AMOUNT_MINOR),
  categoryId: z.uuid('Choose a category'),
  paidBy: z.uuid().nullable(),
  frequency: z.enum(RECURRING_FREQUENCIES),
  intervalCount,
  nextDueOn: isoDateSchema,
})
export type RecurringExpenseInput = z.input<typeof recurringExpenseInputSchema>

/** The add/edit form (amount as typed). */
export const recurringExpenseFormSchema = z
  .object({
    description,
    amount: amountInputSchema,
    categoryId: z.string().min(1, 'Choose a category').pipe(z.uuid('Choose a category')),
    paidBy: z.uuid().nullable(),
    frequency: z.enum(RECURRING_FREQUENCIES),
    intervalCount,
    nextDueOn: isoDateSchema,
  })
  .transform(({ amount, ...rest }) => ({ amountMinor: amount, ...rest }))
export type RecurringExpenseFormInput = z.input<typeof recurringExpenseFormSchema>
export type RecurringExpenseFormValues = z.output<typeof recurringExpenseFormSchema>
