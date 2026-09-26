import { assertEquals } from '@std/assert'
import type { AuthAdmin } from '../_shared/auth-admin.ts'
import { fakeDeps, HOUSEHOLD_ID, post, USER } from '../_shared/testing.ts'
import { handler, type AdminDeps } from './handler.ts'

const TARGET = '22222222-2222-4222-8222-222222222222'
const OTHER_HOUSEHOLD = '33333333-3333-4333-8333-333333333333'

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

function setup(options: { isAdmin?: boolean; rpc?: RpcHandler } = {}) {
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
  }
  const fake = fakeDeps({
    rpc: (fn, args) => {
      if (fn === 'is_app_admin') return { data: options.isAdmin ?? true, error: null }
      if (fn === 'admin_get_user')
        return { data: args.p_user_id === TARGET ? target : null, error: null }
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

Deno.test('deleting a user leaves their households, deleting ones they were alone in', async () => {
  const { deps, rpcCalls, authCalls, storage } = setup()
  const res = await handler(post({ action: 'deleteUser', userId: TARGET }), deps)

  assertEquals(res.status, 200)
  assertEquals(await res.json(), { deletedHouseholds: ['Bola flat'] })
  assertEquals(
    rpcCalls.filter((c) => c.fn === 'leave_household').map((c) => c.args.p_delete_if_last),
    [true, true],
  )
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
