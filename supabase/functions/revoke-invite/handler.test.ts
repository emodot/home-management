import { assertEquals } from '@std/assert'
import { dbError, fakeDeps, post, USER } from '../_shared/testing.ts'
import { handler } from './handler.ts'

const inviteId = 'f0e1d2c3-b4a5-4968-8776-655443322110'

Deno.test('revokes an invite as the caller', async () => {
  const { deps, rpcCalls } = fakeDeps({})
  const res = await handler(post({ inviteId }), deps)
  assertEquals(res.status, 200)
  assertEquals(await res.json(), { ok: true })
  assertEquals(rpcCalls[0], {
    fn: 'invite_revoke',
    args: { p_invite_id: inviteId, p_user_id: USER.id },
  })
})

Deno.test('returns 404 for unknown or foreign invites', async () => {
  const { deps } = fakeDeps({ rpc: () => dbError('invite_not_found') })
  const res = await handler(post({ inviteId }), deps)
  assertEquals(res.status, 404)
  assertEquals((await res.json()).error.code, 'invite_not_found')
})
