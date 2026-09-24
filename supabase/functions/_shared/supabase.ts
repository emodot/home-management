import { createClient, type User } from '@supabase/supabase-js'
import type { HomeClient } from '../../../packages/shared/src/client.ts'
import type { Database } from '../../../packages/shared/src/database.types.ts'
import { HttpError } from './http.ts'

/** Service-role client. Bypasses RLS, so every function checks membership itself. */
export function createAdminClient(url: string, serviceRoleKey: string): HomeClient {
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Resolves the caller from the Authorization header, or throws 401. */
export function userFromRequest(admin: HomeClient) {
  return async (req: Request): Promise<User> => {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) throw new HttpError(401, 'unauthorized')
    const { data, error } = await admin.auth.getUser(token)
    if (error || !data.user) throw new HttpError(401, 'unauthorized')
    return data.user
  }
}
