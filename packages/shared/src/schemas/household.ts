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

export const createHouseholdSchema = z.object({
  name: householdNameSchema,
})
export type CreateHouseholdInput = z.input<typeof createHouseholdSchema>

export const updateProfileSchema = z.object({
  fullName: fullNameSchema,
})
export type UpdateProfileInput = z.input<typeof updateProfileSchema>

/** First-run form: who you are and your first household. */
export const onboardingSchema = z.object({
  fullName: fullNameSchema,
  householdName: householdNameSchema,
})
export type OnboardingInput = z.input<typeof onboardingSchema>
