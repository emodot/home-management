import { assertEquals } from '@std/assert'
import { dbError, fakeDeps, HOUSEHOLD_ID, post, USER } from '../_shared/testing.ts'
import { handler } from './handler.ts'

Deno.test('leaves without touching storage', async () => {
  const storage = { buckets: { receipts: [`${HOUSEHOLD_ID}/e1/a.jpg`] }, removed: [] as string[] }
  const { deps, rpcCalls } = fakeDeps({ rpc: () => ({ data: 'left', error: null }), storage })

  const res = await handler(post({ householdId: HOUSEHOLD_ID }), deps)

  assertEquals(await res.json(), { result: 'left' })
  assertEquals(rpcCalls[0]!.args, {
    p_household_id: HOUSEHOLD_ID,
    p_user_id: USER.id,
    p_delete_if_last: false,
  })
  assertEquals(storage.removed, [])
})

Deno.test("deleting the household removes all of its files and nobody else's", async () => {
  const other = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'
  const storage = {
    buckets: {
      receipts: [
        `${HOUSEHOLD_ID}/e1/a.jpg`,
        `${HOUSEHOLD_ID}/e1/b.pdf`,
        `${HOUSEHOLD_ID}/e2/c.png`,
        `${other}/e3/d.jpg`,
      ],
    },
    removed: [] as string[],
  }
  const { deps, rpcCalls } = fakeDeps({ rpc: () => ({ data: 'deleted', error: null }), storage })

  const res = await handler(post({ householdId: HOUSEHOLD_ID, deleteIfLast: true }), deps)

  assertEquals(await res.json(), { result: 'deleted' })
  assertEquals(rpcCalls[0]!.args.p_delete_if_last, true)
  assertEquals(storage.removed.sort(), [
    `${HOUSEHOLD_ID}/e1/a.jpg`,
    `${HOUSEHOLD_ID}/e1/b.pdf`,
    `${HOUSEHOLD_ID}/e2/c.png`,
  ])
})

Deno.test('deleting works before the receipts bucket exists', async () => {
  const { deps } = fakeDeps({ rpc: () => ({ data: 'deleted', error: null }) })
  const res = await handler(post({ householdId: HOUSEHOLD_ID, deleteIfLast: true }), deps)
  assertEquals(await res.json(), { result: 'deleted' })
})

Deno.test('the last member gets last_member unless they confirm', async () => {
  const { deps } = fakeDeps({ rpc: () => dbError('last_member') })
  const res = await handler(post({ householdId: HOUSEHOLD_ID }), deps)
  assertEquals(res.status, 409)
  assertEquals((await res.json()).error.code, 'last_member')
})
