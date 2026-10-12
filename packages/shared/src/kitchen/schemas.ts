import { z } from 'zod'
import { amountInputSchema } from '../schemas/expenses.ts'
import { normalizeItemName } from './normalize.ts'
import { PANTRY_LOCATIONS } from './pantry.ts'
import { convert, KITCHEN_UNITS } from './units.ts'

export const kitchenUnitSchema = z.enum(KITCHEN_UNITS)

/** Where something is bought ("Mile 12", "Shoprite"); empty means none. */
export const storeTagSchema = z
  .string()
  .trim()
  .max(40, 'Keep it under 40 characters')
  .nullable()
  .transform((value) => (value === '' ? null : value))

export const kitchenItemNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a name')
  .max(80, 'Keep it under 80 characters')
  .refine((name) => normalizeItemName(name).length > 0, 'Use letters or numbers in the name')

/** A catalogue item, as created from the autocomplete or edited later. */
export const kitchenItemInputSchema = z.object({
  name: kitchenItemNameSchema,
  defaultUnit: kitchenUnitSchema.default('pcs'),
  defaultStoreTag: storeTagSchema.default(null),
})
export type KitchenItemInput = z.input<typeof kitchenItemInputSchema>
export type KitchenItemValues = z.output<typeof kitchenItemInputSchema>

/** A quantity as typed ("1.5", "2"): above zero, at most two decimals. */
export const quantityInputSchema = z
  .string()
  .trim()
  .min(1, 'Enter a quantity')
  .transform((value, ctx) => {
    const n = Number(value.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) {
      ctx.addIssue({ code: 'custom', message: 'Enter a quantity above zero' })
      return z.NEVER
    }
    if (n > 99999 || Math.round(n * 100) !== n * 100) {
      ctx.addIssue({ code: 'custom', message: 'Use at most two decimals, like 1.5' })
      return z.NEVER
    }
    return n
  })

/** Editing a list entry. */
export const listItemFormSchema = z.object({
  quantity: quantityInputSchema,
  unit: kitchenUnitSchema,
  storeTag: storeTagSchema,
  notes: z
    .string()
    .trim()
    .max(500, 'Keep notes under 500 characters')
    .transform((value) => (value === '' ? null : value)),
})
export type ListItemFormInput = z.input<typeof listItemFormSchema>
export type ListItemPatch = z.output<typeof listItemFormSchema>

/** A stock level as typed: zero allowed (it's run out), at most two decimals. */
const stockInputSchema = z
  .string()
  .trim()
  .min(1, 'Enter how much there is (0 if none)')
  .transform((value, ctx) => {
    const n = Number(value.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0 || n > 99999 || Math.round(n * 100) !== n * 100) {
      ctx.addIssue({ code: 'custom', message: 'Enter a number like 2 or 1.5' })
      return z.NEVER
    }
    return n
  })

/** Editing a pantry item: stock, where it's kept, expiry and when it counts as running low. */
export const pantryItemFormSchema = z.object({
  quantity: stockInputSchema,
  unit: kitchenUnitSchema,
  location: z.enum(PANTRY_LOCATIONS),
  expiresOn: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Choose a date')
    .transform((v) => (v === '' ? null : v)),
  lowStockThreshold: z
    .string()
    .trim()
    .transform((value, ctx) => {
      if (value === '') return null
      const n = Number(value.replace(',', '.'))
      if (!Number.isFinite(n) || n < 0 || n > 99999) {
        ctx.addIssue({ code: 'custom', message: 'Enter a number, or leave it empty' })
        return z.NEVER
      }
      return Math.round(n * 100) / 100
    }),
})
export type PantryItemFormInput = z.input<typeof pantryItemFormSchema>
export type PantryItemFormValues = z.output<typeof pantryItemFormSchema>

/** Logging a cooking gas refill. */
export const gasRefillFormSchema = z.object({
  refilledOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date'),
  cylinderKg: z
    .string()
    .trim()
    .min(1, 'Enter the cylinder size')
    .transform((value, ctx) => {
      const kg = Number(value.replace(',', '.'))
      if (!Number.isFinite(kg) || kg <= 0 || kg > 100) {
        ctx.addIssue({ code: 'custom', message: 'Enter the size in kg, like 12.5' })
        return z.NEVER
      }
      return Math.round(kg * 100) / 100
    }),
  amount: amountInputSchema,
  paidBy: z.uuid(),
  providerId: z.uuid().nullable(),
  addReminder: z.boolean(),
})
export type GasRefillFormInput = z.input<typeof gasRefillFormSchema>
export type GasRefillFormValues = z.output<typeof gasRefillFormSchema>

/** "1 bag = 50 kg" on an item's page. */
export const itemConversionFormSchema = z
  .object({
    unit: kitchenUnitSchema,
    factor: z
      .string()
      .trim()
      .min(1, 'Enter how many')
      .transform((value, ctx) => {
        const n = Number(value.replace(',', '.'))
        if (!Number.isFinite(n) || n <= 0) {
          ctx.addIssue({ code: 'custom', message: 'Enter a number above zero' })
          return z.NEVER
        }
        if (n > 1000000 || Math.round(n * 10000) !== n * 10000) {
          ctx.addIssue({ code: 'custom', message: 'Use at most four decimals, like 0.25' })
          return z.NEVER
        }
        return n
      }),
    toUnit: kitchenUnitSchema,
  })
  .superRefine((value, ctx) => {
    if (value.unit === value.toUnit) {
      ctx.addIssue({ code: 'custom', path: ['toUnit'], message: 'Pick a different unit' })
    } else if (convert(1, value.unit, value.toUnit) !== null) {
      ctx.addIssue({ code: 'custom', path: ['toUnit'], message: 'These already convert' })
    }
  })
export type ItemConversionFormInput = z.input<typeof itemConversionFormSchema>
export type ItemConversionFormValues = z.output<typeof itemConversionFormSchema>

/** Whole minutes as typed; empty means not known. */
const minutesInputSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === '') return null
    const n = Number(value)
    if (!Number.isInteger(n) || n < 0 || n > 1440) {
      ctx.addIssue({ code: 'custom', message: 'Enter whole minutes, up to 1440' })
      return z.NEVER
    }
    return n
  })

/** One ingredient row on the recipe form. */
export const recipeIngredientFormSchema = z.object({
  itemId: z.string().min(1),
  name: z.string(),
  /** Empty for "to taste". */
  quantity: z
    .string()
    .trim()
    .transform((value, ctx) => {
      if (value === '') return null
      const parsed = quantityInputSchema.safeParse(value)
      if (!parsed.success) {
        ctx.addIssue({ code: 'custom', message: parsed.error.issues[0]?.message ?? 'Check it' })
        return z.NEVER
      }
      return parsed.data
    }),
  unit: kitchenUnitSchema,
  isOptional: z.boolean(),
  note: z
    .string()
    .trim()
    .max(200, 'Keep it under 200 characters')
    .transform((value) => (value === '' ? null : value)),
})

export const recipeFormSchema = z.object({
  title: z.string().trim().min(1, 'Give it a name').max(120, 'Keep it under 120 characters'),
  servings: z
    .string()
    .trim()
    .min(1, 'Enter how many it serves')
    .transform((value, ctx) => {
      const n = Number(value)
      if (!Number.isInteger(n) || n < 1 || n > 100) {
        ctx.addIssue({ code: 'custom', message: 'Enter a whole number from 1 to 100' })
        return z.NEVER
      }
      return n
    }),
  prepMinutes: minutesInputSchema,
  cookMinutes: minutesInputSchema,
  tags: z
    .array(z.string().trim().min(1).max(30, 'Keep tags under 30 characters'))
    .max(12, 'Up to 12 tags')
    .transform((tags) =>
      tags.filter((t, i) => tags.findIndex((o) => o.toLowerCase() === t.toLowerCase()) === i),
    ),
  notes: z
    .string()
    .trim()
    .max(4000, 'Keep notes under 4,000 characters')
    .transform((value) => (value === '' ? null : value)),
  ingredients: z.array(recipeIngredientFormSchema).max(60, 'Up to 60 ingredients'),
  steps: z
    .array(z.object({ body: z.string().trim().max(2000, 'Keep each step under 2,000 characters') }))
    .max(40, 'Up to 40 steps')
    .transform((steps) => steps.map((s) => s.body).filter((body) => body !== '')),
})
export type RecipeFormInput = z.input<typeof recipeFormSchema>
export type RecipeFormValues = z.output<typeof recipeFormSchema>
