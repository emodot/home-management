import { assertEquals } from '@std/assert'
import { dbError, fakeDeps, HOUSEHOLD_ID, post, USER } from '../_shared/testing.ts'
import { hashToken } from '../_shared/tokens.ts'
import { handler } from './handler.ts'

const token = 'Zm9vYmFyYmF6cXV4Zm9vYmFyYmF6cXV4Zm9vYmFyYmE'
const row = {
  household_id: HOUSEHOLD_ID,
  household_name: 'Lekki flat',
  inviter_name: 'Ada Obi',
  already_member: false,
}

Deno.test('previews an invite by the hash of its token', async () => {
  const { deps, rpcCalls } = fakeDeps({ rpc: () => ({ data: [row], error: null }) })
  const res = await handler(post({ token, preview: true }), deps)

  assertEquals(res.status, 200)
  assertEquals(await res.json(), {
    householdId: HOUSEHOLD_ID,
    householdName: 'Lekki flat',
    inviterName: 'Ada Obi',
    alreadyMember: false,
  })
  assertEquals(rpcCalls[0]!.args, {
    p_token_hash: await hashToken(token),
    p_user_id: USER.id,
    p_preview: true,
  })
})

Deno.test('accepts by default', async () => {
  const { deps, rpcCalls } = fakeDeps({
    rpc: () => ({ data: [{ ...row, already_member: true }], error: null }),
  })
  const res = await handler(post({ token }), deps)
  assertEquals((await res.json()).alreadyMember, true)
  assertEquals(rpcCalls[0]!.args.p_preview, false)
})

Deno.test('maps invite errors', async () => {
  for (const [code, status] of [
    ['invite_expired', 410],
    ['invite_not_found', 404],
    ['invite_used', 410],
  ] as const) {
    const { deps } = fakeDeps({ rpc: () => dbError(code) })
    const res = await handler(post({ token }), deps)
    assertEquals(res.status, status)
    assertEquals((await res.json()).error.code, code)
  }
})

Deno.test('rejects malformed tokens without touching the database', async () => {
  const { deps, rpcCalls } = fakeDeps({})
  const res = await handler(post({ token: 'abc' }), deps)
  assertEquals(res.status, 400)
  await res.body?.cancel()
  assertEquals(rpcCalls.length, 0)
})

Deno.test('hides unexpected database errors', async () => {
  const { deps } = fakeDeps({
    rpc: () => ({ data: null, error: { code: '42P01', message: 'relation missing' } }),
  })
  const originalError = console.error
  console.error = () => {}
  try {
    const res = await handler(post({ token }), deps)
    assertEquals(res.status, 500)
    assertEquals((await res.json()).error.code, 'internal')
  } finally {
    console.error = originalError
  }
})
