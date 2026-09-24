import { assert, assertEquals, assertMatch } from '@std/assert'
import { dbError, fakeDeps, HOUSEHOLD_ID, post, USER } from '../_shared/testing.ts'
import { hashToken } from '../_shared/tokens.ts'
import { handler } from './handler.ts'

const upserted = {
  invite_id: 'f0e1d2c3-b4a5-4968-8776-655443322110',
  email: 'bola@example.com',
  expires_at: '2026-10-01T10:00:00Z',
  household_name: 'Lekki flat',
  inviter_name: 'Ada Obi',
  resent: false,
}

Deno.test('creates an invite and emails a link whose token matches the stored hash', async () => {
  const { deps, rpcCalls, emails } = fakeDeps({ rpc: () => ({ data: [upserted], error: null }) })

  const res = await handler(post({ householdId: HOUSEHOLD_ID, email: ' Bola@Example.com ' }), deps)

  assertEquals(res.status, 200)
  assertEquals(await res.json(), {
    inviteId: upserted.invite_id,
    email: 'bola@example.com',
    resent: false,
  })

  const call = rpcCalls[0]!
  assertEquals(call.fn, 'invite_upsert')
  assertEquals(call.args.p_household_id, HOUSEHOLD_ID)
  assertEquals(call.args.p_email, 'bola@example.com')
  assertEquals(call.args.p_invited_by, USER.id)

  assertEquals(emails.length, 1)
  assertEquals(emails[0]!.to, 'bola@example.com')
  const link = emails[0]!.email.text.match(/https:\/\/home\.example\/invite\/([A-Za-z0-9_-]{43})/)
  assert(link, 'email contains the invite link')
  assertEquals(await hashToken(link[1]!), call.args.p_token_hash)
  assertEquals(emails[0]!.email.subject, 'Ada Obi invited you to Lekki flat on Home')
  assertMatch(emails[0]!.email.text, /expires on 1 October 2026/)
})

Deno.test('uses a different token every time', async () => {
  const { deps, rpcCalls } = fakeDeps({ rpc: () => ({ data: [upserted], error: null }) })
  await handler(post({ householdId: HOUSEHOLD_ID, email: 'bola@example.com' }), deps)
  await handler(post({ householdId: HOUSEHOLD_ID, email: 'bola@example.com' }), deps)
  assert(rpcCalls[0]!.args.p_token_hash !== rpcCalls[1]!.args.p_token_hash)
})

Deno.test('maps database errors to their codes', async () => {
  const { deps, emails } = fakeDeps({ rpc: () => dbError('already_member') })
  const res = await handler(post({ householdId: HOUSEHOLD_ID, email: 'bola@example.com' }), deps)
  assertEquals(res.status, 409)
  assertEquals((await res.json()).error.code, 'already_member')
  assertEquals(emails.length, 0)
})

Deno.test('reports email failures as email_failed', async () => {
  const { deps } = fakeDeps({
    rpc: () => ({ data: [upserted], error: null }),
    sendEmail: () => Promise.reject(new Error('Resend down')),
  })
  const res = await handler(post({ householdId: HOUSEHOLD_ID, email: 'bola@example.com' }), deps)
  assertEquals(res.status, 502)
  assertEquals((await res.json()).error.code, 'email_failed')
})

Deno.test('rejects invalid input and unauthenticated callers', async () => {
  const { deps, rpcCalls } = fakeDeps({})
  const invalid = await handler(post({ householdId: HOUSEHOLD_ID, email: 'nope' }), deps)
  assertEquals(invalid.status, 400)
  assertEquals((await invalid.json()).error.code, 'invalid_request')

  const { deps: signedOut } = fakeDeps({ signedIn: false })
  const unauthorized = await handler(
    post({ householdId: HOUSEHOLD_ID, email: 'bola@example.com' }),
    signedOut,
  )
  assertEquals(unauthorized.status, 401)
  await unauthorized.body?.cancel()

  assertEquals(rpcCalls.length, 0)
})

Deno.test('answers CORS preflight and rejects other methods', async () => {
  const { deps } = fakeDeps({})
  const preflight = await handler(post(null, 'OPTIONS'), deps)
  assertEquals(preflight.status, 200)
  assertEquals(preflight.headers.get('Access-Control-Allow-Origin'), '*')
  await preflight.body?.cancel()

  const get = await handler(post(null, 'GET'), deps)
  assertEquals(get.status, 405)
  await get.body?.cancel()
})
