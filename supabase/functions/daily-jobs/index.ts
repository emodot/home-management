import { requireEnv } from '../_shared/env.ts'
import { createAdminClient } from '../_shared/supabase.ts'
import { handler } from './handler.ts'

const deps = {
  admin: createAdminClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY')),
  cronSecret: requireEnv('CRON_SECRET'),
}

Deno.serve((req) => handler(req, deps))
