import { assert, assertEquals, assertMatch } from '@std/assert'
import type { AuthAdmin } from '../_shared/auth-admin.ts'
import { fakeDeps, HOUSEHOLD_ID, post, USER } from '../_shared/testing.ts'
import { hashToken } from '../_shared/tokens.ts'
import { handler, type AdminDeps } from './handler.ts'

const TARGET = '22222222-2222-4222-8222-222222222222'
const OTHER_HOUSEHOLD = '33333333-3333-4333-8333-333333333333'
const NEW_ADMIN = '55555555-5555-4555-8555-555555555555'
const ADMIN_ONLY = '66666666-6666-4666-8666-666666666666'

const target = {
  id: TARGET,
  email: 'bola@example.com',
  fullName: 'Bola Ade',
  isAdmin: false,
  households: [
    { id: HOUSEHOLD_ID, name: 'Shared home', memberCount: 2 },
    { id: OTHER_HOUSEHOLD, name: 'Bola flat', memberCount: 1 },
  ],
}

type RpcHandler = (fn: string, args: Record<string, unknown>) => unknown

function setup(options: { isAdmin?: boolean; targetIsAdmin?: boolean; rpc?: RpcHandler } = {}) {
  const authCalls: string[] = []
  const authAdmin: AuthAdmin = {
    setDisabled: (id, disabled) => {
      authCalls.push(`setDisabled ${id} ${String(disabled)}`)
      return Promise.resolve()
    },
    deleteUser: (id) => {
      authCalls.push(`deleteUser ${id}`)
      return Promise.resolve()
    },
    sendPasswordReset: (email, redirectTo) => {
      authCalls.push(`reset ${email} ${redirectTo}`)
      return Promise.resolve()
    },
    createAdminAccount: (email, fullName, password) => {
      authCalls.push(`create ${email} ${fullName} ${password}`)
      return Promise.resolve(NEW_ADMIN)
    },
  }
  const fake = fakeDeps({
    rpc: (fn, args) => {
      if (fn === 'is_app_admin') return { data: options.isAdmin ?? true, error: null }
      if (fn === 'admin_get_user') {
        if (args.p_user_id === ADMIN_ONLY) {
          return { data: { ...target, id: ADMIN_ONLY, isAdmin: true, households: [] }, error: null }
        }
        const found = args.p_user_id === TARGET
        return {
          data: found ? { ...target, isAdmin: options.targetIsAdmin ?? false } : null,
          error: null,
        }
      }
      if (fn === 'leave_household') {
        return { data: args.p_household_id === OTHER_HOUSEHOLD ? 'deleted' : 'left', error: null }
      }
      return { data: options.rpc?.(fn, args) ?? null, error: null }
    },
  })
  const deps: AdminDeps = { ...fake.deps, authAdmin }
  return { deps, rpcCalls: fake.rpcCalls, storage: fake.storage, authCalls }
}

Deno.test('refuses callers who are not app admins', async () => {
  const { deps, rpcCalls } = setup({ isAdmin: false })
  const res = await handler(post({ action: 'overview' }), deps)
  assertEquals(res.status, 403)
  assertEquals((await res.json()).error.code, 'forbidden')
  assertEquals(
    rpcCalls.map((c) => c.fn),
    ['is_app_admin'],
  )
})

Deno.test('lists users a page at a time, hiding past ban dates', async () => {
  const past = '2020-01-01T00:00:00Z'
  const future = '2999-01-01T00:00:00Z'
  const row = (id: string, bannedUntil: string | null) => ({
    id,
    email: `${id}@example.com`,
    full_name: null,
    avatar_url: null,
    created_at: '2026-09-01T00:00:00Z',
    last_sign_in_at: null,
    banned_until: bannedUntil,
    is_admin: false,
    household_count: 1,
    total_count: 60,
  })
  const { deps, rpcCalls } = setup({
    rpc: (fn) => (fn === 'admin_list_users' ? [row('a', past), row('b', future)] : null),
  })
  const res = await handler(post({ action: 'listUsers', search: 'ex', page: 2 }), deps)
  const body = await res.json()
  assertEquals(body.total, 60)
  assertEquals(
    body.items.map((u: { bannedUntil: string | null }) => u.bannedUntil),
    [null, future],
  )
  assertEquals(rpcCalls[1]!.args, { p_search: 'ex', p_limit: 25, p_offset: 50 })
})

Deno.test('deleting a user deletes the account but keeps their households', async () => {
  const { deps, rpcCalls, authCalls, storage } = setup()
  const res = await handler(post({ action: 'deleteUser', userId: TARGET }), deps)

  assertEquals(res.status, 200)
  assertEquals(await res.json(), { ok: true })
  assertEquals(rpcCalls.filter((c) => c.fn === 'leave_household').length, 0)
  assertEquals(storage.removed, [`${TARGET}/avatar.jpg`])
  assertEquals(authCalls, [`deleteUser ${TARGET}`])
  const log = rpcCalls.find((c) => c.fn === 'admin_log')!
  assertEquals(log.args.p_action, 'delete_user')
  assertEquals(log.args.p_admin_id, USER.id)
})

Deno.test('admins cannot disable or delete themselves here', async () => {
  const { deps, authCalls } = setup()
  for (const body of [
    { action: 'deleteUser', userId: USER.id },
    { action: 'setUserDisabled', userId: USER.id, disabled: true },
  ]) {
    const res = await handler(post(body), deps)
    assertEquals(res.status, 400)
    assertEquals((await res.json()).error.code, 'cannot_modify_self')
  }
  assertEquals(authCalls, [])
})

Deno.test('disables, re-enables and resets passwords, logging each', async () => {
  const { deps, authCalls, rpcCalls } = setup()
  for (const body of [
    { action: 'setUserDisabled', userId: TARGET, disabled: true },
    { action: 'setUserDisabled', userId: TARGET, disabled: false },
    { action: 'sendPasswordReset', userId: TARGET },
  ]) {
    const res = await handler(post(body), deps)
    assertEquals(res.status, 200)
    await res.body?.cancel()
  }
  assertEquals(authCalls, [
    `setDisabled ${TARGET} true`,
    `setDisabled ${TARGET} false`,
    'reset bola@example.com https://home.example/auth/callback?next=/reset-password',
  ])
  assertEquals(
    rpcCalls.filter((c) => c.fn === 'admin_log').map((c) => c.args.p_action),
    ['disable_user', 'enable_user', 'send_password_reset'],
  )
})

Deno.test('unknown users and households are 404s', async () => {
  const { deps } = setup()
  const user = await handler(
    post({ action: 'deleteUser', userId: '44444444-4444-4444-8444-444444444444' }),
    deps,
  )
  assertEquals(user.status, 404)
  assertEquals((await user.json()).error.code, 'user_not_found')

  const household = await handler(post({ action: 'getHousehold', householdId: HOUSEHOLD_ID }), deps)
  assertEquals(household.status, 404)
  assertEquals((await household.json()).error.code, 'household_not_found')
})

Deno.test('deletes a household and logs its name', async () => {
  const detail = { id: HOUSEHOLD_ID, name: 'Shared home', members: [{}, {}] }
  const { deps, rpcCalls } = setup({
    rpc: (fn) => (fn === 'admin_get_household' ? detail : null),
  })
  const res = await handler(post({ action: 'deleteHousehold', householdId: HOUSEHOLD_ID }), deps)
  assertEquals(res.status, 200)
  await res.body?.cancel()
  assertEquals(
    rpcCalls.map((c) => c.fn),
    ['is_app_admin', 'admin_get_household', 'admin_delete_household', 'admin_log'],
  )
  assertEquals(rpcCalls[3]!.args.p_details, { name: 'Shared home', members: 2 })
})

Deno.test('rejects unknown actions', async () => {
  const { deps, rpcCalls } = setup()
  const res = await handler(post({ action: 'dropTables' }), deps)
  assertEquals(res.status, 400)
  await res.body?.cancel()
  assertEquals(rpcCalls.length, 0)
})

Deno.test('adds an admin with a fresh, separate account', async () => {
  const { deps, rpcCalls, authCalls } = setup({
    rpc: (fn) => (fn === 'admin_find_user_by_email' ? [] : null),
  })
  const body = {
    action: 'addAdmin',
    email: 'Ops@Example.com',
    fullName: 'Ops Person',
    password: 'temporary pass',
  }
  const res = await handler(post(body), deps)
  assertEquals(res.status, 200)
  assertEquals(await res.json(), { id: NEW_ADMIN })
  assertEquals(authCalls, ['create ops@example.com Ops Person temporary pass'])
  assertEquals(
    rpcCalls.filter((c) => c.fn === 'admin_grant').map((c) => c.args.p_user_id),
    [NEW_ADMIN],
  )
})

Deno.test('refuses an email that already has an account', async () => {
  for (const [isAdmin, code] of [
    [false, 'email_in_use'],
    [true, 'already_admin'],
  ] as const) {
    const { deps, authCalls } = setup({
      rpc: (fn) => (fn === 'admin_find_user_by_email' ? [{ id: TARGET, is_admin: isAdmin }] : null),
    })
    const res = await handler(
      post({
        action: 'addAdmin',
        email: 'bola@example.com',
        fullName: 'B',
        password: 'long enough',
      }),
      deps,
    )
    assertEquals(res.status, 409)
    assertEquals((await res.json()).error.code, code)
    assertEquals(authCalls, [])
  }
})

Deno.test('removing an admin deletes an admin-only account, or just revokes access', async () => {
  const { deps, rpcCalls, authCalls } = setup()
  const adminOnly = await handler(post({ action: 'removeAdmin', userId: ADMIN_ONLY }), deps)
  assertEquals(await adminOnly.json(), { deletedAccount: true })
  assertEquals(authCalls, [`deleteUser ${ADMIN_ONLY}`])

  // TARGET is also in households.
  const { deps: deps2, rpcCalls: calls2, authCalls: auth2 } = setup({ targetIsAdmin: true })
  const member = await handler(post({ action: 'removeAdmin', userId: TARGET }), deps2)
  assertEquals(await member.json(), { deletedAccount: false })
  assertEquals(auth2, [])
  assertEquals(
    calls2.filter((c) => c.fn === 'admin_revoke').map((c) => c.args.p_user_id),
    [TARGET],
  )
  assertEquals(rpcCalls.filter((c) => c.fn === 'admin_revoke').length, 0)
})

Deno.test('admins cannot remove their own admin access', async () => {
  const { deps } = setup()
  const res = await handler(post({ action: 'removeAdmin', userId: USER.id }), deps)
  assertEquals(res.status, 400)
  assertEquals((await res.json()).error.code, 'cannot_modify_self')
})

Deno.test('creates households with no members', async () => {
  const { deps, rpcCalls } = setup({
    rpc: (fn) =>
      fn === 'admin_create_household' ? { id: HOUSEHOLD_ID, name: 'Lekki flat' } : null,
  })
  const res = await handler(post({ action: 'createHousehold', name: ' Lekki flat ' }), deps)
  assertEquals(await res.json(), { id: HOUSEHOLD_ID })
  assertEquals(rpcCalls[1]!.args, { p_name: 'Lekki flat' })
  assertEquals(rpcCalls[2]!.args.p_action, 'create_household')
})

Deno.test('creates a household admin invite link, emailing it when given an email', async () => {
  const invite = {
    invite_id: 'f0e1d2c3-b4a5-4968-8776-655443322110',
    email: 'lead@example.com',
    expires_at: '2026-10-04T10:00:00Z',
    household_name: 'Lekki flat',
  }
  const fake = setup({ rpc: (fn) => (fn === 'admin_create_invite' ? [invite] : null) })
  const emails: string[] = []
  fake.deps.sendEmail = (to, email) => {
    emails.push(`${to}: ${email.text}`)
    return Promise.resolve()
  }

  const res = await handler(
    post({ action: 'createAdminInvite', householdId: HOUSEHOLD_ID, email: 'Lead@Example.com' }),
    fake.deps,
  )
  const body = await res.json()
  assertEquals(body.emailed, true)
  const token = /\/invite\/([A-Za-z0-9_-]{43})$/.exec(body.inviteUrl)?.[1]
  assert(token, 'returns the link')
  const call = fake.rpcCalls.find((c) => c.fn === 'admin_create_invite')!
  assertEquals(call.args.p_email, 'lead@example.com')
  assertEquals(await hashToken(token), call.args.p_token_hash)
  assertEquals(emails.length, 1)
  assertMatch(emails[0]!, /^lead@example\.com: /)
  assert(emails[0]!.includes(body.inviteUrl), 'email contains the link')
})

Deno.test('changes a member role and logs it', async () => {
  const { deps, rpcCalls } = setup()
  const res = await handler(
    post({ action: 'setMemberRole', householdId: HOUSEHOLD_ID, userId: TARGET, role: 'admin' }),
    deps,
  )
  assertEquals(await res.json(), { ok: true })
  assertEquals(rpcCalls.find((c) => c.fn === 'admin_set_member_role')!.args, {
    p_household_id: HOUSEHOLD_ID,
    p_user_id: TARGET,
    p_role: 'admin',
  })
  assertEquals(rpcCalls.find((c) => c.fn === 'admin_log')!.args.p_details, {
    email: 'bola@example.com',
    role: 'admin',
  })
})

Deno.test("deleting a household removes its files and nobody else's", async () => {
  const other = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'
  const fake = setup({
    rpc: (fn) =>
      fn === 'admin_get_household' ? { id: HOUSEHOLD_ID, name: 'Home', members: [] } : null,
  })
  fake.storage.buckets.receipts = [
    `${HOUSEHOLD_ID}/e1/a.jpg`,
    `${HOUSEHOLD_ID}/e2/c.png`,
    `${other}/e3/d.jpg`,
  ]
  const res = await handler(
    post({ action: 'deleteHousehold', householdId: HOUSEHOLD_ID }),
    fake.deps,
  )
  assertEquals(res.status, 200)
  await res.body?.cancel()
  assertEquals(fake.storage.removed.sort(), [
    `${HOUSEHOLD_ID}/e1/a.jpg`,
    `${HOUSEHOLD_ID}/e2/c.png`,
  ])
})
