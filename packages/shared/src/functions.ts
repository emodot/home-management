import type { HomeClient } from './client.ts'
import { AppError, isAppErrorCode } from './errors.ts'

/**
 * Calls an edge function and returns its JSON body. Failures are rethrown as AppError using the
 * `{ error: { code, message } }` body the functions return.
 */
export async function invokeFunction<T>(
  client: HomeClient,
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const result = await client.functions.invoke<T>(name, { body })
  const error: unknown = result.error
  if (!error) return result.data as T

  const context = error instanceof Error ? (error as { context?: unknown }).context : undefined
  if (context instanceof Response) {
    const payload = (await context.json().catch(() => null)) as {
      error?: { code?: unknown; message?: unknown }
    } | null
    const code = payload?.error?.code
    if (isAppErrorCode(code)) {
      const message = payload?.error?.message
      throw new AppError(code, typeof message === 'string' ? message : undefined)
    }
  }
  throw new AppError('internal')
}
