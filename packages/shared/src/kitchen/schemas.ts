import { z } from 'zod'
import { normalizeItemName } from './normalize.ts'
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
