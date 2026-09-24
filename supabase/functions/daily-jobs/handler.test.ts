import { assertEquals } from '@std/assert'
import type { HomeClient } from '../../../packages/shared/src/client.ts'
import { handler } from './handler.ts'

const SECRET = 'test-cron-secret-0123456789'

function fakeAdmin(
  rpc: (fn: string, args: unknown) => { data: unknown; error: { message: string } | null },
) {
  const calls: string[] = []
  const admin = {
    rpc: (fn: string, args: unknown) => {
      calls.push(fn)
      return Promise.resolve(rpc(fn, args))
    },
  } as unknown as HomeClient
  return { admin, calls }
}

const call = (secret?: string) =>
  new Request('http://localhost/daily-jobs', {
    method: 'POST',
    headers: secret === undefined ? {} : { 'x-cron-secret': secret },
    body: '{}',
  })

Deno.test('rejects calls without the right secret', async () => {
  const { admin, calls } = fakeAdmin(() => ({ data: 0, error: null }))
  for (const secret of [undefined, '', 'wrong', `${SECRET}x`]) {
    const res = await handler(call(secret), { admin, cronSecret: SECRET })
    assertEquals(res.status, 401)
    await res.body?.cancel()
  }
  assertEquals(calls, [])
})

Deno.test('generates recurring expenses and reports counts', async () => {
  const { admin, calls } = fakeAdmin(() => ({ data: 3, error: null }))
  const res = await handler(call(SECRET), { admin, cronSecret: SECRET })
  assertEquals(res.status, 200)
  assertEquals(await res.json(), { ok: true, results: { recurringExpenses: { created: 3 } } })
  assertEquals(calls, ['generate_recurring_expenses'])
})

Deno.test('reports a failing step with a 500', async () => {
  const { admin } = fakeAdmin(() => ({ data: null, error: { message: 'boom' } }))
  const originalError = console.error
  console.error = () => {}
  try {
    const res = await handler(call(SECRET), { admin, cronSecret: SECRET })
    assertEquals(res.status, 500)
    assertEquals(await res.json(), { ok: false, results: { recurringExpenses: { error: 'boom' } } })
  } finally {
    console.error = originalError
  }
})
