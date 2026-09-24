import { z } from 'zod'
import { normalizePhone } from '../phone.ts'

export const PROVIDER_TRADES = [
  'plumber',
  'electrician',
  'generator_technician',
  'cleaner',
  'painter',
  'carpenter',
  'ac_technician',
  'fumigator',
  'other',
] as const
export type ProviderTrade = (typeof PROVIDER_TRADES)[number]

export const TRADE_LABELS: Record<ProviderTrade, string> = {
  plumber: 'Plumber',
  electrician: 'Electrician',
  generator_technician: 'Generator technician',
  cleaner: 'Cleaner',
  painter: 'Painter',
  carpenter: 'Carpenter',
  ac_technician: 'AC technician',
  fumigator: 'Fumigator',
  other: 'Other',
}

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => (value === '' ? null : value))
    .nullable()

/** Empty → null; otherwise normalised to E.164 (Nigerian numbers by default). */
const phoneSchema = z
  .string()
  .nullable()
  .transform((value, ctx) => {
    if (value === null || value.trim() === '') return null
    const e164 = normalizePhone(value)
    if (!e164) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number, like 0803 123 4567' })
      return z.NEVER
    }
    return e164
  })

export const providerInputSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(100, 'Keep it under 100 characters'),
  trade: z.enum(PROVIDER_TRADES),
  phone: phoneSchema,
  whatsapp: phoneSchema,
  email: z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : value.toLowerCase()))
    .pipe(z.email('Enter a valid email address').nullable())
    .nullable(),
  area: optionalText(100, 'Keep it under 100 characters'),
  notes: optionalText(2000, 'Keep notes under 2,000 characters'),
  rating: z.number().int().min(1).max(5).nullable(),
})
export type ProviderInput = z.input<typeof providerInputSchema>
export type ProviderValues = z.output<typeof providerInputSchema>
