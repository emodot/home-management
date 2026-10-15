import { z } from 'zod'

const envSchema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
  // Product tours, the getting-started checklist and feature hints. Off in local dev and tests
  // that aren't about them.
  VITE_ONBOARDING_ENABLED: z.stringbool().default(true),
})

const parsed = envSchema.safeParse(import.meta.env)

if (!parsed.success) {
  throw new Error(
    `Invalid environment variables. Copy apps/web/.env.example to apps/web/.env.\n${z.prettifyError(parsed.error)}`,
  )
}

export const env = parsed.data
