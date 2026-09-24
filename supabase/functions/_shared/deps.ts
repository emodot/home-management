import type { User } from '@supabase/supabase-js'
import { DEFAULT_LOCALE, DEFAULT_TIMEZONE } from '../../../packages/shared/src/constants.ts'
import type { HomeClient } from '../../../packages/shared/src/client.ts'
import { createEmailSender, type SendEmail } from './email.ts'
import { isLocalUrl, requireEnv } from './env.ts'
import { createAdminClient, userFromRequest } from './supabase.ts'

export interface Deps {
  admin: HomeClient
  getUser: (req: Request) => Promise<User>
  sendEmail: SendEmail
  appUrl: string
}

/** Real dependencies, built from the function's environment. */
export function createDeps(): Deps {
  const admin = createAdminClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  )
  const appUrl = requireEnv('APP_URL')
  return {
    admin,
    getUser: userFromRequest(admin),
    appUrl,
    sendEmail: createEmailSender({
      apiKey: Deno.env.get('RESEND_API_KEY'),
      from: Deno.env.get('EMAIL_FROM'),
      allowLogOnly: isLocalUrl(appUrl),
    }),
  }
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    dateStyle: 'long',
    timeZone: DEFAULT_TIMEZONE,
  }).format(new Date(iso))
}
