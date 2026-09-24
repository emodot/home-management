import { createEmailSender } from '../_shared/email.ts'
import { isLocalUrl, requireEnv } from '../_shared/env.ts'
import { createAdminClient } from '../_shared/supabase.ts'
import { handler } from './handler.ts'

const appUrl = requireEnv('APP_URL')
const deps = {
  admin: createAdminClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY')),
  cronSecret: requireEnv('CRON_SECRET'),
  appUrl,
  sendEmail: createEmailSender({
    apiKey: Deno.env.get('RESEND_API_KEY'),
    from: Deno.env.get('EMAIL_FROM'),
    allowLogOnly: isLocalUrl(appUrl),
  }),
}

Deno.serve((req) => handler(req, deps))
