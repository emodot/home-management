import { z } from 'zod'
import { MAX_AMOUNT_MINOR } from '../money.ts'
import { amountInputSchema, isoDateSchema, monthSchema } from './expenses.ts'
import { RECURRING_FREQUENCIES } from './recurring.ts'

const sourceSchema = z
  .string()
  .trim()
  .min(1, 'Say where it came from')
  .max(200, 'Keep it under 200 characters')

const notesSchema = z
  .string()
  .trim()
  .max(2000, 'Keep notes under 2,000 characters')
  .nullable()
  .transform((value) => (value === '' ? null : value))

/** What gets written to the income table. */
export const incomeInputSchema = z.object({
  amountMinor: z.number().int().positive().max(MAX_AMOUNT_MINOR),
  receivedOn: isoDateSchema,
  /** The month it counts toward; the received date's month if omitted. */
  budgetMonth: monthSchema.optional(),
  source: sourceSchema,
  receivedBy: z.uuid().nullable(),
  notes: notesSchema,
})
export type IncomeInput = z.input<typeof incomeInputSchema>

/** The add/edit form: amount as typed. */
export const incomeFormSchema = z
  .object({
    amount: amountInputSchema,
    receivedOn: isoDateSchema,
    budgetMonth: monthSchema,
    source: sourceSchema,
    receivedBy: z.uuid().nullable(),
    notes: notesSchema,
  })
  .transform(({ amount, ...rest }) => ({ amountMinor: amount, ...rest }))
export type IncomeFormInput = z.input<typeof incomeFormSchema>

const intervalCount = z.coerce
  .number<string | number>()
  .int('Use a whole number')
  .min(1, 'At least 1')
  .max(99, 'At most 99')

/** What gets written to recurring_income. */
export const recurringIncomeInputSchema = z.object({
  source: sourceSchema,
  amountMinor: z.number().int().positive().max(MAX_AMOUNT_MINOR),
  receivedBy: z.uuid().nullable(),
  frequency: z.enum(RECURRING_FREQUENCIES),
  intervalCount,
  nextDueOn: isoDateSchema,
  /** Each payment counts toward the month after it's paid (e.g. a salary paid on the 28th). */
  forNextMonth: z.boolean().default(false),
})
export type RecurringIncomeInput = z.input<typeof recurringIncomeInputSchema>

/** The add/edit form (amount as typed). */
export const recurringIncomeFormSchema = z
  .object({
    source: sourceSchema,
    amount: amountInputSchema,
    receivedBy: z.uuid().nullable(),
    frequency: z.enum(RECURRING_FREQUENCIES),
    intervalCount,
    nextDueOn: isoDateSchema,
    forNextMonth: z.boolean(),
  })
  .transform(({ amount, ...rest }) => ({ amountMinor: amount, ...rest }))
export type RecurringIncomeFormInput = z.input<typeof recurringIncomeFormSchema>
export type RecurringIncomeFormValues = z.output<typeof recurringIncomeFormSchema>
