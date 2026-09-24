import type { Database, HomeClient } from '@home/shared'
import { createClient } from '@supabase/supabase-js'
import { env } from './env'

export const supabase: HomeClient = createClient<Database>(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)
