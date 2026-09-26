import { assert, assertEquals, assertMatch } from '@std/assert'
import { dbError, fakeDeps, HOUSEHOLD_ID, post, USER } from '../_shared/testing.ts'
import { hashToken } from '../_shared/tokens.ts'
import { handler } from './handler.ts'

const INVITE_ID = 'f0e1d2c3-b4a5-4968-8776-655443322110'
const upserted = {
  invite_id: INVITE_ID,
  email: 'bola@example.com',
  expires_at: '2026-10-01T10:00:00Z',
  household_name: 'Lekki flat',
  inviter_name: 'Ada Obi',
  resent: false,
}
const LINK = /^https:\/\/home\.example\/invite\/([A-Za-z0-9_-]{43})$/

Deno.test('creates a shareable link without an email', async () => {
  const { deps, rpcCalls, emails } = fakeDeps({
    rpc: () => ({ data: [{ ...upserted, email: null }], error: null }),
  })

  const res = await handler(post({ householdId: HOUSEHOLD_ID }), deps)

  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(
    { ...body, inviteUrl: undefined },
    {
      inviteId: INVITE_ID,
      email: null,
      inviteUrl: undefined,
      expiresAt: '2026-10-01T10:00:00Z',
      resent: false,
      emailed: false,
    },
  )
  const token = LINK.exec(body.inviteUrl)?.[1]
  assert(token, 'returns the link')

  const call = rpcCalls[0]!
  assertEquals(call.fn, 'invite_upsert')
  assertEquals(call.args.p_email, '')
  assertEquals(call.args.p_invited_by, USER.id)
  assertEquals(await hashToken(token), call.args.p_token_hash)
  assertEquals(emails.length, 0)
})

Deno.test('emails the same link it returns when given an email', async () => {
  const { deps, rpcCalls, emails } = fakeDeps({ rpc: () => ({ data: [upserted], error: null }) })

  const res = await handler(post({ householdId: HOUSEHOLD_ID, email: ' Bola@Example.com ' }), deps)

  const body = await res.json()
  assertEquals(body.emailed, true)
  assertEquals(rpcCalls[0]!.args.p_email, 'bola@example.com')

  assertEquals(emails.length, 1)
  assertEquals(emails[0]!.to, 'bola@example.com')
  assert(emails[0]!.email.text.includes(body.inviteUrl), 'email contains the returned link')
  assertEquals(emails[0]!.email.subject, 'Ada Obi invited you to Lekki flat on Home')
  assertMatch(emails[0]!.email.text, /expires on 1 October 2026/)
})

Deno.test('makes a new link for an existing invite without emailing', async () => {
  const { deps, rpcCalls, emails } = fakeDeps({
    rpc: () => ({ data: [{ ...upserted, resent: true }], error: null }),
  })

  const res = await handler(post({ householdId: HOUSEHOLD_ID, inviteId: INVITE_ID }), deps)

  const body = await res.json()
  assertEquals(body.resent, true)
  assertEquals(body.emailed, false)
  assertEquals(rpcCalls[0]!.fn, 'invite_rotate')
  assertEquals(rpcCalls[0]!.args.p_invite_id, INVITE_ID)
  assertEquals(rpcCalls[0]!.args.p_user_id, USER.id)
  assertEquals(emails.length, 0)
})

Deno.test('uses a different token every time', async () => {
  const { deps, rpcCalls } = fakeDeps({ rpc: () => ({ data: [upserted], error: null }) })
  await (await handler(post({ householdId: HOUSEHOLD_ID }), deps)).body?.cancel()
  await (await handler(post({ householdId: HOUSEHOLD_ID }), deps)).body?.cancel()
  assert(rpcCalls[0]!.args.p_token_hash !== rpcCalls[1]!.args.p_token_hash)
})

Deno.test('maps database errors to their codes', async () => {
  const { deps, emails } = fakeDeps({ rpc: () => dbError('already_member') })
  const res = await handler(post({ householdId: HOUSEHOLD_ID, email: 'bola@example.com' }), deps)
  assertEquals(res.status, 409)
  assertEquals((await res.json()).error.code, 'already_member')
  assertEquals(emails.length, 0)
})

Deno.test('still returns the link when the email fails', async () => {
  const { deps } = fakeDeps({
    rpc: () => ({ data: [upserted], error: null }),
    sendEmail: () => Promise.reject(new Error('Resend down')),
  })
  const originalError = console.error
  console.error = () => {}
  try {
    const res = await handler(post({ householdId: HOUSEHOLD_ID, email: 'bola@example.com' }), deps)
    assertEquals(res.status, 200)
    const body = await res.json()
    assertEquals(body.emailed, false)
    assertMatch(body.inviteUrl, LINK)
  } finally {
    console.error = originalError
  }
})

Deno.test('rejects invalid input and unauthenticated callers', async () => {
  const { deps, rpcCalls } = fakeDeps({})
  const invalid = await handler(post({ householdId: HOUSEHOLD_ID, email: 'nope' }), deps)
  assertEquals(invalid.status, 400)
  assertEquals((await invalid.json()).error.code, 'invalid_request')

  const both = await handler(
    post({ householdId: HOUSEHOLD_ID, email: 'bola@example.com', inviteId: INVITE_ID }),
    deps,
  )
  assertEquals(both.status, 400)
  await both.body?.cancel()

  const { deps: signedOut } = fakeDeps({ signedIn: false })
  const unauthorized = await handler(post({ householdId: HOUSEHOLD_ID }), signedOut)
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
