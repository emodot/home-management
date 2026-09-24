import { z } from 'zod'

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address'))

export const emailSignInSchema = z.object({
  email: emailSchema,
})
export type EmailSignInInput = z.input<typeof emailSignInSchema>
