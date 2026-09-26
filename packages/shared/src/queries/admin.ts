import { unwrap, type HomeClient } from '../client.ts'
import { invokeFunction } from '../functions.ts'
import {
  adminRequestSchema,
  type AdminAccount,
  type AdminRemoveResult,
  type AdminDeleteUserResult,
  type AdminHousehold,
  type AdminHouseholdDetail,
  type AdminOverview,
  type AdminPage,
  type AdminRequest,
  type AdminUser,
  type AdminUserDetail,
} from '../schemas/admin.ts'

/** Whether the signed-in user is an app admin (they can only see their own row). */
export async function isAppAdmin(client: HomeClient, userId: string): Promise<boolean> {
  const row = unwrap(
    await client.from('app_admins').select('user_id').eq('user_id', userId).maybeSingle(),
  )
  return row !== null
}

function admin<T>(client: HomeClient, request: AdminRequest): Promise<T> {
  return invokeFunction<T>(client, 'admin', adminRequestSchema.parse(request))
}

interface ListInput {
  search?: string
  page?: number
}

export const getAdminOverview = (client: HomeClient) =>
  admin<AdminOverview>(client, { action: 'overview' })

export const listAdminUsers = (client: HomeClient, input: ListInput) =>
  admin<AdminPage<AdminUser>>(client, { action: 'listUsers', ...input })

export const getAdminUser = (client: HomeClient, userId: string) =>
  admin<AdminUserDetail>(client, { action: 'getUser', userId })

export const setAdminUserDisabled = (client: HomeClient, userId: string, disabled: boolean) =>
  admin<{ ok: true }>(client, { action: 'setUserDisabled', userId, disabled })

export const sendAdminPasswordReset = (client: HomeClient, userId: string) =>
  admin<{ ok: true }>(client, { action: 'sendPasswordReset', userId })

export const deleteAdminUser = (client: HomeClient, userId: string) =>
  admin<AdminDeleteUserResult>(client, { action: 'deleteUser', userId })

export const listAdminHouseholds = (client: HomeClient, input: ListInput) =>
  admin<AdminPage<AdminHousehold>>(client, { action: 'listHouseholds', ...input })

export const getAdminHousehold = (client: HomeClient, householdId: string) =>
  admin<AdminHouseholdDetail>(client, { action: 'getHousehold', householdId })

export const renameAdminHousehold = (client: HomeClient, householdId: string, name: string) =>
  admin<{ ok: true }>(client, { action: 'renameHousehold', householdId, name })

export const deleteAdminHousehold = (client: HomeClient, householdId: string) =>
  admin<{ ok: true }>(client, { action: 'deleteHousehold', householdId })

export const listAdminAccounts = (client: HomeClient) =>
  admin<AdminAccount[]>(client, { action: 'listAdmins' })

export const addAdminAccount = (
  client: HomeClient,
  input: { email: string; fullName: string; password: string },
) => admin<{ id: string }>(client, { action: 'addAdmin', ...input })

export const removeAdminAccount = (client: HomeClient, userId: string) =>
  admin<AdminRemoveResult>(client, { action: 'removeAdmin', userId })
