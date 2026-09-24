import { z } from 'zod'
import { MAX_AMOUNT_MINOR, toMinor } from '../money.ts'

export const isoDateSchema = z.iso.date('Enter a valid date')

/** A user-typed amount ("45,000.50") → positive integer minor units. */
export const amountInputSchema = z
  .string()
  .trim()
  .min(1, 'Enter an amount')
  .transform((value, ctx) => {
    let minor: number
    try {
      minor = toMinor(value)
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid amount, like 45,000 or 1,250.50' })
      return z.NEVER
    }
    if (minor <= 0) {
      ctx.addIssue({ code: 'custom', message: 'Enter an amount above zero' })
      return z.NEVER
    }
    if (minor > MAX_AMOUNT_MINOR) {
      ctx.addIssue({ code: 'custom', message: 'That amount is too large' })
      return z.NEVER
    }
    return minor
  })

const descriptionSchema = z
  .string()
  .trim()
  .min(1, 'Add a short description')
  .max(200, 'Keep it under 200 characters')

const notesSchema = z
  .string()
  .trim()
  .max(2000, 'Keep notes under 2,000 characters')
  .nullable()
  .transform((value) => (value === '' ? null : value))

/** What gets written to the expenses table (used by createExpense/updateExpense). */
export const expenseInputSchema = z.object({
  amountMinor: z.number().int().positive().max(MAX_AMOUNT_MINOR),
  occurredOn: isoDateSchema,
  categoryId: z.uuid('Choose a category'),
  description: descriptionSchema,
  paidBy: z.uuid().nullable(),
  notes: notesSchema,
})
export type ExpenseInput = z.input<typeof expenseInputSchema>

/** The add/edit form: amount as typed, everything else as in ExpenseInput. */
export const expenseFormSchema = z
  .object({
    amount: amountInputSchema,
    occurredOn: isoDateSchema,
    categoryId: z.string().min(1, 'Choose a category').pipe(z.uuid('Choose a category')),
    description: descriptionSchema,
    paidBy: z.uuid().nullable(),
    notes: notesSchema,
  })
  .transform(({ amount, ...rest }) => ({ amountMinor: amount, ...rest }))
export type ExpenseFormInput = z.input<typeof expenseFormSchema>

// ---------------------------------------------------------------- list filters

const optional = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined)

/**
 * List filters, parsed leniently from URL search params: anything invalid is dropped rather than
 * failing the page.
 */
export const expenseFiltersSchema = z.object({
  from: optional(isoDateSchema),
  to: optional(isoDateSchema),
  category: optional(z.uuid()),
  paidBy: optional(z.uuid()),
  receipt: optional(z.enum(['with', 'without'])),
  q: optional(
    z
      .string()
      .trim()
      .max(100)
      .transform((value) => value || undefined),
  ),
})
export type ExpenseFilters = z.output<typeof expenseFiltersSchema>

export function parseExpenseFilters(params: Record<string, string | undefined>): ExpenseFilters {
  return expenseFiltersSchema.parse(params)
}

/** Filters → search params, omitting empty values (stable key order for query keys). */
export function expenseFiltersToParams(filters: ExpenseFilters): Record<string, string> {
  const params: Record<string, string> = {}
  for (const key of ['from', 'to', 'category', 'paidBy', 'receipt', 'q'] as const) {
    const value = filters[key]
    if (value) params[key] = value
  }
  return params
}

// ---------------------------------------------------------------- categories

/** Icons offered for categories (lucide names). The app maps each to a component. */
export const CATEGORY_ICONS = [
  'lightbulb',
  'zap',
  'fuel',
  'droplets',
  'wifi',
  'wrench',
  'sparkles',
  'shield',
  'building',
  'key-round',
  'shopping-basket',
  'sofa',
  'circle-ellipsis',
  'graduation-cap',
  'car',
  'baby',
  'heart-pulse',
  'utensils',
  'shirt',
  'paw-print',
  'hammer',
  'flame',
  'tv',
  'phone',
  'gift',
  'landmark',
  'trees',
  'bus',
  'circle',
] as const
export type CategoryIcon = (typeof CATEGORY_ICONS)[number]

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(40, 'Keep it under 40 characters'),
  icon: z.enum(CATEGORY_ICONS),
})
export type CategoryInput = z.input<typeof categoryInputSchema>

// ---------------------------------------------------------------- receipts

export const RECEIPT_MIME_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
} as const
export type ReceiptMimeType = keyof typeof RECEIPT_MIME_TYPES

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024

export function isReceiptMimeType(type: string): type is ReceiptMimeType {
  return Object.hasOwn(RECEIPT_MIME_TYPES, type)
}

export const receiptFileSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().refine(isReceiptMimeType, 'Receipts must be JPEG, PNG, WebP, HEIC or PDF'),
  size: z.number().int().positive().max(MAX_RECEIPT_BYTES, 'Receipts must be 10 MB or smaller'),
})

/** A budget field: empty clears the budget, otherwise a positive amount. */
export const budgetInputSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === '') return null
    const amount = amountInputSchema.safeParse(value)
    if (!amount.success) {
      for (const issue of amount.error.issues)
        ctx.addIssue({ code: 'custom', message: issue.message })
      return z.NEVER
    }
    return amount.data
  })
