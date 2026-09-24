import { AppError, APP_ERROR_MESSAGES } from '@home/shared'

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return APP_ERROR_MESSAGES.internal
}

export function errorCode(error: unknown) {
  return error instanceof AppError ? error.code : undefined
}
