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

/** Supabase caps passwords at 72 characters (bcrypt). */
export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use at most 72 characters')

export const passwordSignInSchema = z.object({
  email: emailSchema,
  // Checked by Supabase; only require something here.
  password: z.string().min(1, 'Enter your password'),
})
export type PasswordSignInInput = z.input<typeof passwordSignInSchema>

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
})
export type SignUpInput = z.input<typeof signUpSchema>

export const newPasswordSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords don't match",
    path: ['confirm'],
  })
export type NewPasswordInput = z.input<typeof newPasswordSchema>

export const changePasswordSchema = z
  .object({
    current: z.string().min(1, 'Enter your current password'),
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords don't match",
    path: ['confirm'],
  })
  .refine((v) => v.password !== v.current, {
    message: 'Choose a password different from your current one',
    path: ['password'],
  })
export type ChangePasswordInput = z.input<typeof changePasswordSchema>

export const changeEmailSchema = z.object({
  email: emailSchema,
})
export type ChangeEmailInput = z.input<typeof changeEmailSchema>
