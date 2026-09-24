import { assert, assertEquals, assertMatch } from '@std/assert'
import type { RenderedEmail } from '../../../packages/emails/generated/index.ts'
import type { HomeClient } from '../../../packages/shared/src/client.ts'
import { handler, type DailyJobDeps } from './handler.ts'

const SECRET = 'test-cron-secret-0123456789'

type Rpc = (
  fn: string,
  args: Record<string, unknown>,
) => { data: unknown; error: { message: string } | null }

const reminder = (overrides: Record<string, unknown> = {}) => ({
  log_id: 'log-1',
  kind: 'upcoming',
  household_id: 'h1',
  household_name: 'Lekki flat',
  task_id: 't1',
  task_title: 'Service generator',
  due_on: '2026-09-25',
  recipient_user_id: 'u1',
  recipient_email: 'ada@example.com',
  recipient_name: 'Ada Obi',
  assigned_to_recipient: false,
  provider_name: 'Emeka Gen',
  provider_phone: '+2348051234567',
  ...overrides,
})

const defaults: Record<string, unknown> = {
  generate_recurring_expenses: 0,
  claim_task_reminders: [],
  purge_deleted_rows: { receipts: 0, expenses: 0, tasks: 0, providers: 0, storage_paths: [] },
  delete_expired_invites: 0,
  release_task_reminder: null,
}

function setup(
  options: { rpc?: Rpc; sendEmail?: DailyJobDeps['sendEmail']; removeFails?: boolean } = {},
) {
  const calls: { fn: string; args: Record<string, unknown> }[] = []
  const removed: string[][] = []
  const emails: { to: string; email: RenderedEmail }[] = []
  const admin = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args })
      return Promise.resolve(options.rpc?.(fn, args) ?? { data: defaults[fn], error: null })
    },
    storage: {
      from: () => ({
        remove: (paths: string[]) => {
          removed.push(paths)
          return Promise.resolve(
            options.removeFails
              ? { data: null, error: new Error('nope') }
              : { data: [], error: null },
          )
        },
      }),
    },
  } as unknown as HomeClient
  const deps: DailyJobDeps = {
    admin,
    cronSecret: SECRET,
    appUrl: 'https://home.example',
    today: '2026-09-24',
    sendEmail:
      options.sendEmail ??
      ((to, email) => {
        emails.push({ to, email })
        return Promise.resolve()
      }),
  }
  return { deps, calls, removed, emails }
}

const call = (secret?: string) =>
  new Request('http://localhost/daily-jobs', {
    method: 'POST',
    headers: secret === undefined ? {} : { 'x-cron-secret': secret },
    body: '{}',
  })

const quietly = async <T>(fn: () => Promise<T>) => {
  const original = console.error
  console.error = () => {}
  try {
    return await fn()
  } finally {
    console.error = original
  }
}

Deno.test('rejects calls without the right secret', async () => {
  const { deps, calls } = setup()
  for (const secret of [undefined, '', 'wrong', `${SECRET}x`]) {
    const res = await handler(call(secret), deps)
    assertEquals(res.status, 401)
    await res.body?.cancel()
  }
  assertEquals(calls, [])
})

Deno.test('runs every step in order and reports counts', async () => {
  const { deps, calls } = setup({
    rpc: (fn) => ({
      data: { ...defaults, generate_recurring_expenses: 3, delete_expired_invites: 2 }[fn],
      error: null,
    }),
  })
  const res = await handler(call(SECRET), deps)
  assertEquals(res.status, 200)
  assertEquals(await res.json(), {
    ok: true,
    results: {
      recurringExpenses: { created: 3 },
      taskReminders: { sent: 0, failed: 0 },
      purgeDeleted: { receipts: 0, expenses: 0, tasks: 0, providers: 0, files: 0, failed: 0 },
      expireInvites: { deleted: 2 },
    },
  })
  assertEquals(
    calls.map((c) => c.fn),
    [
      'generate_recurring_expenses',
      'claim_task_reminders',
      'purge_deleted_rows',
      'delete_expired_invites',
    ],
  )
})

Deno.test('emails each claimed reminder with the task, due date, provider and link', async () => {
  const { deps, emails } = setup({
    rpc: (fn) => ({
      data:
        fn === 'claim_task_reminders'
          ? [
              reminder(),
              reminder({
                log_id: 'log-2',
                kind: 'overdue',
                due_on: '2026-09-20',
                provider_name: null,
                provider_phone: null,
                recipient_email: 'bola@example.com',
                assigned_to_recipient: true,
              }),
            ]
          : defaults[fn],
      error: null,
    }),
  })
  const res = await handler(call(SECRET), deps)
  assertEquals(res.status, 200)
  assertEquals((await res.json()).results.taskReminders, { sent: 2, failed: 0 })

  const [upcoming, overdue] = emails
  assert(upcoming && overdue)
  assertEquals(upcoming.to, 'ada@example.com')
  assertEquals(upcoming.email.subject, 'Reminder: Service generator is due tomorrow')
  assertMatch(upcoming.email.text, /Provider: Emeka Gen · \+234 805 123 4567/)
  assertMatch(upcoming.email.text, /https:\/\/home\.example\/tasks\/t1/)
  assertMatch(upcoming.email.text, /as a member of Lekki flat/)

  assertEquals(overdue.to, 'bola@example.com')
  assertEquals(overdue.email.subject, 'Overdue: Service generator was due 20 September 2026')
  assert(!overdue.email.text.includes('Provider:'))
  assertMatch(overdue.email.text, /assigned to you/)
})

Deno.test('releases reminders whose email failed and reports the run as failed', async () => {
  const { deps, calls } = setup({
    rpc: (fn) => ({
      data: fn === 'claim_task_reminders' ? [reminder()] : defaults[fn],
      error: null,
    }),
    sendEmail: () => Promise.reject(new Error('Resend down')),
  })
  const res = await quietly(() => handler(call(SECRET), deps))
  assertEquals(res.status, 500)
  assertEquals((await res.json()).results.taskReminders, { sent: 0, failed: 1 })
  assertEquals(calls.find((c) => c.fn === 'release_task_reminder')?.args, { p_log_id: 'log-1' })
})

Deno.test('purging removes the returned receipt files in batches', async () => {
  const paths = Array.from({ length: 1500 }, (_, i) => `h1/e${i}/r.jpg`)
  const { deps, removed } = setup({
    rpc: (fn) => ({
      data:
        fn === 'purge_deleted_rows'
          ? { receipts: 1500, expenses: 700, tasks: 1, providers: 2, storage_paths: paths }
          : defaults[fn],
      error: null,
    }),
  })
  const res = await handler(call(SECRET), deps)
  assertEquals((await res.json()).results.purgeDeleted, {
    receipts: 1500,
    expenses: 700,
    tasks: 1,
    providers: 2,
    files: 1500,
    failed: 0,
  })
  assertEquals(
    removed.map((b) => b.length),
    [1000, 500],
  )
})

Deno.test('a failing step does not stop the others', async () => {
  const { deps, calls } = setup({
    rpc: (fn) =>
      fn === 'claim_task_reminders'
        ? { data: null, error: { message: 'boom' } }
        : { data: defaults[fn], error: null },
  })
  const res = await quietly(() => handler(call(SECRET), deps))
  assertEquals(res.status, 500)
  const body = await res.json()
  assertEquals(body.results.taskReminders, { error: 'boom' })
  assert(calls.some((c) => c.fn === 'delete_expired_invites'))
})
