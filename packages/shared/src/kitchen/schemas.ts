import { z } from 'zod'
import { normalizeItemName } from './normalize.ts'
import { PANTRY_LOCATIONS } from './pantry.ts'
import { KITCHEN_UNITS } from './units.ts'

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
