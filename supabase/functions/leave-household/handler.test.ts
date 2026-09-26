import { assertEquals } from '@std/assert'
import { dbError, fakeDeps, HOUSEHOLD_ID, post, USER } from '../_shared/testing.ts'
import { handler } from './handler.ts'

Deno.test('leaves without deleting anything', async () => {
  const storage = { buckets: { receipts: [`${HOUSEHOLD_ID}/e1/a.jpg`] }, removed: [] as string[] }
  const { deps, rpcCalls } = fakeDeps({ rpc: () => ({ data: 'left', error: null }), storage })

  const res = await handler(post({ householdId: HOUSEHOLD_ID }), deps)

  assertEquals(await res.json(), { result: 'left' })
  assertEquals(rpcCalls[0]!.args, { p_household_id: HOUSEHOLD_ID, p_user_id: USER.id })
  assertEquals(storage.removed, [])
})

Deno.test('the last household admin cannot leave while others remain', async () => {
  const { deps } = fakeDeps({ rpc: () => dbError('last_admin') })
  const res = await handler(post({ householdId: HOUSEHOLD_ID }), deps)
  assertEquals(res.status, 409)
  assertEquals((await res.json()).error.code, 'last_admin')
})
