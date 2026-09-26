/** Error codes returned by edge functions as `{ error: { code, message } }`. */
export const APP_ERROR_MESSAGES = {
  unauthorized: 'Please sign in again.',
  invalid_request: 'Something about that request was not right.',
  not_member: "You're not a member of this household.",
  already_member: 'That person is already a member of this household.',
  invite_not_found: "This invite link isn't valid. Ask a member to send you a new invite.",
  invite_expired: 'This invite has expired. Ask a member to send you a new one.',
  invite_revoked: 'This invite was cancelled. Ask a member to send you a new one.',
  invite_used: 'This invite has already been used.',
  last_member: "You're the last member, so leaving will delete the household.",
  forbidden: "You don't have access to that.",
  household_not_found: "That household doesn't exist (it may have been deleted).",
  user_not_found: "That account doesn't exist (it may have been deleted).",
  cannot_modify_self: "You can't do that to your own account here. Use your profile instead.",
  internal: 'Something went wrong. Please try again.',
} as const

export type AppErrorCode = keyof typeof APP_ERROR_MESSAGES

export function isAppErrorCode(value: unknown): value is AppErrorCode {
  return typeof value === 'string' && Object.hasOwn(APP_ERROR_MESSAGES, value)
}

export class AppError extends Error {
  readonly code: AppErrorCode

  constructor(code: AppErrorCode, message: string = APP_ERROR_MESSAGES[code]) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}

export interface ErrorBody {
  error: { code: AppErrorCode; message: string }
}
