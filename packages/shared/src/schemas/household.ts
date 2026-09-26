import { z } from 'zod'

export const householdNameSchema = z
  .string()
  .trim()
  .min(1, 'Give your household a name')
  .max(80, 'Keep it under 80 characters')

export const fullNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter your name')
  .max(100, 'Keep it under 100 characters')

export const updateProfileSchema = z.object({
  fullName: fullNameSchema,
})
export type UpdateProfileInput = z.input<typeof updateProfileSchema>
