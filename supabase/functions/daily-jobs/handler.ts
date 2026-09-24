import type { HomeClient } from '../../../packages/shared/src/client.ts'
import { corsHeaders, json } from '../_shared/http.ts'

export interface DailyJobDeps {
  admin: HomeClient
  cronSecret: string
}

/** Constant-time string comparison, so the secret can't be guessed byte by byte from timing. */
function safeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder()
  const x = encoder.encode(a)
  const y = encoder.encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

type Step = (deps: DailyJobDeps) => Promise<Record<string, number>>

/**
 * The daily steps, in order. Each is idempotent, so running the job twice is harmless.
 * Steps 2-4 (reminders, purging soft-deleted rows, expiring invites) arrive in M8.
 */
export const STEPS: Record<string, Step> = {
  // 1. Pending expenses for recurring bills that are due (each household's local "today").
  async recurringExpenses({ admin }) {
    const { data, error } = await admin.rpc('generate_recurring_expenses', {})
    if (error) throw new Error(error.message)
    return { created: data }
  },
}

/**
 * Called by pg_cron (see the daily_jobs_cron migration) with the shared secret in x-cron-secret.
 * A failing step doesn't stop the others; the response lists each step's result.
 */
export async function handler(req: Request, deps: DailyJobDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Use POST' })
  if (!safeEqual(req.headers.get('x-cron-secret') ?? '', deps.cronSecret)) {
    return json(401, { error: 'Unauthorized' })
  }

  const results: Record<string, unknown> = {}
  let failed = false
  for (const [name, step] of Object.entries(STEPS)) {
    try {
      results[name] = await step(deps)
    } catch (error) {
      failed = true
      console.error(`daily-jobs: ${name} failed`, error)
      results[name] = { error: error instanceof Error ? error.message : String(error) }
    }
  }
  console.log('daily-jobs', JSON.stringify(results))
  return json(failed ? 500 : 200, { ok: !failed, results })
}
