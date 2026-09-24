import { renderTaskReminderEmail } from '../../../packages/emails/generated/index.ts'
import type { HomeClient } from '../../../packages/shared/src/client.ts'
import { addDays, formatDate, todayIn } from '../../../packages/shared/src/dates.ts'
import { formatPhone } from '../../../packages/shared/src/phone.ts'
import type { SendEmail } from '../_shared/email.ts'
import { corsHeaders, json } from '../_shared/http.ts'

const RECEIPTS_BUCKET = 'receipts'

export interface DailyJobDeps {
  admin: HomeClient
  cronSecret: string
  sendEmail: SendEmail
  appUrl: string
  /** Overrides "today" (Africa/Lagos) in tests. */
  today?: string
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

/** "today", "tomorrow" or "on 3 October". */
function describeDueDay(dueOn: string, today: string): string {
  if (dueOn === today) return 'today'
  if (dueOn === addDays(today, 1)) return 'tomorrow'
  return `on ${formatDate(dueOn, { day: 'numeric', month: 'long' })}`
}

/** A step's result. `failed` > 0 marks the whole run as failed (so cron logs show it). */
type StepResult = Record<string, number> & { failed?: number }
type Step = (deps: DailyJobDeps) => Promise<StepResult>

/** The daily steps, in order. Each is idempotent, so running the job twice is harmless. */
export const STEPS: Record<string, Step> = {
  // 1. Pending expenses for recurring bills that are due (each household's local "today").
  async recurringExpenses({ admin }) {
    const { data, error } = await admin.rpc('generate_recurring_expenses', {})
    if (error) throw new Error(error.message)
    return { created: data }
  },

  // 2. Task reminders. claim_task_reminders logs each reminder first (its unique constraint stops
  //    duplicates); a reminder whose email fails is released so tomorrow's run retries it.
  async taskReminders({ admin, sendEmail, appUrl, today = todayIn() }) {
    const { data, error } = await admin.rpc('claim_task_reminders', {})
    if (error) throw new Error(error.message)

    let sent = 0
    let failed = 0
    for (const r of data) {
      const overdue = r.kind === 'overdue'
      const withProvider = r.provider_name !== null
      const variant = overdue
        ? withProvider
          ? 'overdueWithProvider'
          : 'overdue'
        : withProvider
          ? 'upcomingWithProvider'
          : 'upcoming'
      const email = renderTaskReminderEmail(variant, {
        recipientName: r.recipient_name,
        taskTitle: r.task_title,
        householdName: r.household_name,
        dueDate: formatDate(r.due_on, { dateStyle: 'long' }),
        dueText: describeDueDay(r.due_on, today),
        taskUrl: new URL(`/tasks/${r.task_id}`, appUrl).toString(),
        providerLine: withProvider
          ? [r.provider_name, r.provider_phone && formatPhone(r.provider_phone)]
              .filter(Boolean)
              .join(' · ')
          : '',
        reason: r.assigned_to_recipient
          ? 'It’s assigned to you.'
          : `You’re getting this as a member of ${r.household_name}.`,
      })
      try {
        await sendEmail(r.recipient_email, email)
        sent++
      } catch (sendError) {
        failed++
        console.error(`daily-jobs: reminder ${r.log_id} to ${r.recipient_email} failed`, sendError)
        const { error: releaseError } = await admin.rpc('release_task_reminder', {
          p_log_id: r.log_id,
        })
        if (releaseError) console.error('daily-jobs: could not release reminder', releaseError)
      }
    }
    return { sent, failed }
  },

  // 3. Hard-delete rows soft-deleted over 30 days ago, then their receipt files.
  async purgeDeleted({ admin }) {
    const { data, error } = await admin.rpc('purge_deleted_rows', {})
    if (error) throw new Error(error.message)
    const result = data as {
      receipts: number
      expenses: number
      tasks: number
      providers: number
      storage_paths: string[]
    }

    let files = 0
    let failed = 0
    for (let i = 0; i < result.storage_paths.length; i += 1000) {
      const batch = result.storage_paths.slice(i, i + 1000)
      const { error: removeError } = await admin.storage.from(RECEIPTS_BUCKET).remove(batch)
      if (removeError) {
        // The rows are gone already; the files are orphans to clean up by hand.
        failed += batch.length
        console.error('daily-jobs: could not remove receipt files', batch, removeError)
      } else {
        files += batch.length
      }
    }
    return {
      receipts: result.receipts,
      expenses: result.expenses,
      tasks: result.tasks,
      providers: result.providers,
      files,
      failed,
    }
  },

  // 4. Remove invites that expired more than 30 days ago (expired ones can't be accepted anyway).
  async expireInvites({ admin }) {
    const { data, error } = await admin.rpc('delete_expired_invites', {})
    if (error) throw new Error(error.message)
    return { deleted: data }
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
  let ok = true
  for (const [name, step] of Object.entries(STEPS)) {
    try {
      const result = await step(deps)
      results[name] = result
      if ((result.failed ?? 0) > 0) ok = false
    } catch (error) {
      ok = false
      console.error(`daily-jobs: ${name} failed`, error)
      results[name] = { error: error instanceof Error ? error.message : String(error) }
    }
  }
  console.log('daily-jobs', JSON.stringify(results))
  return json(ok ? 200 : 500, { ok, results })
}
