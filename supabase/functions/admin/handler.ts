import {
  ADMIN_PAGE_SIZE,
  adminRequestSchema,
  type AdminAccount,
  type AdminHousehold,
  type AdminHouseholdDetail,
  type AdminInviteLink,
  type AdminOverview,
  type AdminPage,
  type AdminRemoveResult,
  type AdminUser,
  type AdminUserDetail,
} from '../../../packages/shared/src/schemas/admin.ts'
import { renderInviteEmail } from '../../../packages/emails/generated/index.ts'
import type { Json } from '../../../packages/shared/src/database.types.ts'
import type { AuthAdmin } from '../_shared/auth-admin.ts'
import { fromDbError } from '../_shared/db-errors.ts'
import { formatDate, type Deps } from '../_shared/deps.ts'
import { endpoint, HttpError } from '../_shared/http.ts'
import { removeHouseholdFiles } from '../_shared/storage.ts'
import { generateToken, hashToken } from '../_shared/tokens.ts'

export interface AdminDeps extends Deps {
  authAdmin: AuthAdmin
}

const OK = { ok: true } as const

/**
 * The operator admin area: overview, users and households across the whole app. Only callers in
 * public.app_admins get past the first check; every change is recorded in admin_actions.
 */
export const handler = endpoint(adminRequestSchema, async (request, user, deps: AdminDeps) => {
  const db = deps.admin
  const rpc = async <T>(result: PromiseLike<{ data: unknown; error: unknown }>) => {
    const { data, error } = await result
    if (error) throw fromDbError(error as { code?: string; message: string })
    return data as T
  }
  const log = (
    action: string,
    targetType: 'user' | 'household',
    targetId: string,
    details?: Json,
  ) =>
    rpc(
      db.rpc('admin_log', {
        p_admin_id: user.id,
        p_action: action,
        p_target_type: targetType,
        p_target_id: targetId,
        p_details: details ?? null,
      }),
    )
  const getUser = async (userId: string) => {
    const detail = await rpc<AdminUserDetail | null>(
      db.rpc('admin_get_user', { p_user_id: userId }),
    )
    if (!detail) throw new HttpError(404, 'user_not_found')
    return detail
  }
  const notSelf = (userId: string) => {
    if (userId === user.id) throw new HttpError(400, 'cannot_modify_self')
  }

  if (!(await rpc<boolean>(db.rpc('is_app_admin', { p_user_id: user.id })))) {
    throw new HttpError(403, 'forbidden')
  }

  switch (request.action) {
    case 'listAdmins': {
      const rows = await rpc<
        {
          id: string
          email: string
          full_name: string | null
          admin_since: string
          last_sign_in_at: string | null
          household_count: number
        }[]
      >(db.rpc('admin_list_admins'))
      const admins: AdminAccount[] = rows.map((r) => ({
        id: r.id,
        email: r.email,
        fullName: r.full_name,
        adminSince: r.admin_since,
        lastSignInAt: r.last_sign_in_at,
        householdCount: r.household_count,
      }))
      return admins
    }

    case 'addAdmin': {
      // Admin accounts are separate from regular ones, so the email must be unused.
      const existing = await rpc<{ id: string; is_admin: boolean }[]>(
        db.rpc('admin_find_user_by_email', { p_email: request.email }),
      )
      if (existing[0]) {
        throw new HttpError(409, existing[0].is_admin ? 'already_admin' : 'email_in_use')
      }
      const id = await deps.authAdmin.createAdminAccount(
        request.email,
        request.fullName,
        request.password,
      )
      await rpc(db.rpc('admin_grant', { p_user_id: id }))
      await log('add_admin', 'user', id, { email: request.email })
      return { id }
    }

    case 'removeAdmin': {
      notSelf(request.userId)
      const target = await getUser(request.userId)
      if (!target.isAdmin) throw new HttpError(404, 'user_not_found')
      // An admin-only account has no other use, so it goes; one that's also in households stays
      // as a regular account.
      const deletedAccount = target.households.length === 0
      if (deletedAccount) await deps.authAdmin.deleteUser(request.userId)
      else await rpc(db.rpc('admin_revoke', { p_user_id: request.userId }))
      await log('remove_admin', 'user', request.userId, { email: target.email, deletedAccount })
      const result: AdminRemoveResult = { deletedAccount }
      return result
    }

    case 'overview':
      return rpc<AdminOverview>(db.rpc('admin_overview'))

    case 'listUsers': {
      const rows = await rpc<
        {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          created_at: string
          last_sign_in_at: string | null
          banned_until: string | null
          is_admin: boolean
          household_count: number
          total_count: number
        }[]
      >(
        db.rpc('admin_list_users', {
          p_search: request.search ?? '',
          p_limit: ADMIN_PAGE_SIZE,
          p_offset: request.page * ADMIN_PAGE_SIZE,
        }),
      )
      const page: AdminPage<AdminUser> = {
        total: Number(rows[0]?.total_count ?? 0),
        items: rows.map((r) => ({
          id: r.id,
          email: r.email,
          fullName: r.full_name,
          avatarUrl: r.avatar_url,
          createdAt: r.created_at,
          lastSignInAt: r.last_sign_in_at,
          // Supabase keeps a past ban date after re-enabling; only a future one means disabled.
          bannedUntil:
            r.banned_until && new Date(r.banned_until) > new Date() ? r.banned_until : null,
          isAdmin: r.is_admin,
          householdCount: r.household_count,
        })),
      }
      return page
    }

    case 'getUser':
      return getUser(request.userId)

    case 'setUserDisabled': {
      notSelf(request.userId)
      const target = await getUser(request.userId)
      await deps.authAdmin.setDisabled(request.userId, request.disabled)
      await log(request.disabled ? 'disable_user' : 'enable_user', 'user', request.userId, {
        email: target.email,
      })
      return OK
    }

    case 'sendPasswordReset': {
      const target = await getUser(request.userId)
      const redirectTo = new URL('/auth/callback?next=/reset-password', deps.appUrl).toString()
      await deps.authAdmin.sendPasswordReset(target.email, redirectTo)
      await log('send_password_reset', 'user', request.userId, { email: target.email })
      return OK
    }

    case 'deleteUser': {
      notSelf(request.userId)
      const target = await getUser(request.userId)
      // Their memberships go with the account; households always stay (super-admins delete them).
      await db.storage.from('avatars').remove([`${request.userId}/avatar.jpg`])
      await deps.authAdmin.deleteUser(request.userId)
      await log('delete_user', 'user', request.userId, {
        email: target.email,
        households: target.households.map((h) => h.name),
      })
      return OK
    }

    case 'createHousehold': {
      const household = await rpc<{ id: string; name: string }>(
        db.rpc('admin_create_household', { p_name: request.name }),
      )
      await log('create_household', 'household', household.id, { name: household.name })
      return { id: household.id }
    }

    case 'createAdminInvite': {
      const token = generateToken()
      const rows = await rpc<
        { invite_id: string; email: string | null; expires_at: string; household_name: string }[]
      >(
        db.rpc('admin_create_invite', {
          p_household_id: request.householdId,
          p_email: request.email ?? '',
          p_token_hash: await hashToken(token),
        }),
      )
      const invite = rows[0]
      if (!invite) throw new Error('admin_create_invite returned no rows')
      const inviteUrl = new URL(`/invite/${token}`, deps.appUrl).toString()
      let emailed = false
      if (invite.email) {
        try {
          await deps.sendEmail(
            invite.email,
            renderInviteEmail({
              inviterName: 'The Home team',
              householdName: invite.household_name,
              inviteUrl,
              email: invite.email,
              expiresOn: formatDate(invite.expires_at),
            }),
          )
          emailed = true
        } catch (emailError) {
          // The link still works; the dashboard shows it to copy instead.
          console.error(emailError)
        }
      }
      await log('create_admin_invite', 'household', request.householdId, {
        name: invite.household_name,
        email: invite.email,
      })
      const result: AdminInviteLink = {
        inviteUrl,
        expiresAt: invite.expires_at,
        email: invite.email,
        emailed,
      }
      return result
    }

    case 'setMemberRole': {
      await rpc(
        db.rpc('admin_set_member_role', {
          p_household_id: request.householdId,
          p_user_id: request.userId,
          p_role: request.role,
        }),
      )
      const member = await getUser(request.userId)
      await log('set_member_role', 'household', request.householdId, {
        email: member.email,
        role: request.role,
      })
      return OK
    }

    case 'listHouseholds': {
      const rows = await rpc<
        {
          id: string
          name: string
          created_at: string
          member_count: number
          expense_count: number
          task_count: number
          last_activity_at: string | null
          total_count: number
        }[]
      >(
        db.rpc('admin_list_households', {
          p_search: request.search ?? '',
          p_limit: ADMIN_PAGE_SIZE,
          p_offset: request.page * ADMIN_PAGE_SIZE,
        }),
      )
      const page: AdminPage<AdminHousehold> = {
        total: Number(rows[0]?.total_count ?? 0),
        items: rows.map((r) => ({
          id: r.id,
          name: r.name,
          createdAt: r.created_at,
          memberCount: r.member_count,
          expenseCount: r.expense_count,
          taskCount: r.task_count,
          lastActivityAt: r.last_activity_at,
        })),
      }
      return page
    }

    case 'getHousehold': {
      const detail = await rpc<AdminHouseholdDetail | null>(
        db.rpc('admin_get_household', { p_household_id: request.householdId }),
      )
      if (!detail) throw new HttpError(404, 'household_not_found')
      return detail
    }

    case 'renameHousehold':
      await rpc(
        db.rpc('admin_rename_household', {
          p_household_id: request.householdId,
          p_name: request.name,
        }),
      )
      await log('rename_household', 'household', request.householdId, { name: request.name })
      return OK

    case 'deleteHousehold': {
      const detail = await rpc<AdminHouseholdDetail | null>(
        db.rpc('admin_get_household', { p_household_id: request.householdId }),
      )
      if (!detail) throw new HttpError(404, 'household_not_found')
      await rpc(db.rpc('admin_delete_household', { p_household_id: request.householdId }))
      await removeFilesQuietly(deps, request.householdId)
      await log('delete_household', 'household', request.householdId, {
        name: detail.name,
        members: detail.members.length,
      })
      return OK
    }
  }
})

/** The rows are already gone; a storage failure only leaves orphaned files, so log it. */
async function removeFilesQuietly(deps: Deps, householdId: string) {
  try {
    await removeHouseholdFiles(deps.admin, householdId)
  } catch (error) {
    console.error(`Failed to remove files for deleted household ${householdId}`, error)
  }
}
