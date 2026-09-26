import { HttpError } from './http.ts'

// Codes raised by the SQL functions (see supabase/migrations) and the HTTP status for each.
const DB_ERRORS = {
  not_member: 403,
  already_member: 409,
  invite_not_found: 404,
  invite_expired: 410,
  invite_revoked: 410,
  invite_used: 410,
  last_member: 409,
  household_not_found: 404,
} as const

/** Turns an expected `raise exception '<code>'` from Postgres into an HttpError. */
export function fromDbError(error: { code?: string; message: string }): Error {
  if (error.code === 'P0001' && Object.hasOwn(DB_ERRORS, error.message)) {
    const code = error.message as keyof typeof DB_ERRORS
    return new HttpError(DB_ERRORS[code], code)
  }
  return new Error(`Database error: ${error.code ?? ''} ${error.message}`)
}
