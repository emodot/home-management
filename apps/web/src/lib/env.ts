import { z } from 'zod'

const envSchema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
})

const parsed = envSchema.safeParse(import.meta.env)

if (!parsed.success) {
  throw new Error(
    `Invalid environment variables — copy apps/web/.env.example to apps/web/.env.\n${z.prettifyError(parsed.error)}`,
  )
}

export const env = parsed.data
