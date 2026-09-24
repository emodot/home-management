import type { z } from 'zod'
import type { User } from '@supabase/supabase-js'
import {
  APP_ERROR_MESSAGES,
  type AppErrorCode,
  type ErrorBody,
} from '../../../packages/shared/src/errors.ts'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: AppErrorCode,
    message: string = APP_ERROR_MESSAGES[code],
  ) {
    super(message)
  }
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    const body: ErrorBody = { error: { code: error.code, message: error.message } }
    return json(error.status, body)
  }
  console.error(error)
  const body: ErrorBody = { error: { code: 'internal', message: APP_ERROR_MESSAGES.internal } }
  return json(500, body)
}

/**
 * Wraps a POST endpoint: CORS preflight, authentication, zod validation of the JSON body and
 * mapping of errors to `{ error: { code, message } }`.
 */
export function endpoint<
  S extends z.ZodType,
  Deps extends { getUser: (req: Request) => Promise<User> },
>(schema: S, run: (input: z.output<S>, user: User, deps: Deps) => Promise<unknown>) {
  return async (req: Request, deps: Deps): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    try {
      if (req.method !== 'POST') throw new HttpError(405, 'invalid_request', 'Use POST.')
      const user = await deps.getUser(req)
      const parsed = schema.safeParse(await req.json().catch(() => undefined))
      if (!parsed.success) {
        throw new HttpError(400, 'invalid_request', parsed.error.issues[0]?.message)
      }
      return json(200, await run(parsed.data, user, deps))
    } catch (error) {
      return errorResponse(error)
    }
  }
}
