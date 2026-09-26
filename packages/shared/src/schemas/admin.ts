import { z } from 'zod'
import { emailSchema, passwordSchema } from './auth.ts'
import { fullNameSchema, householdNameSchema } from './household.ts'

export const ADMIN_PAGE_SIZE = 25

const search = z.string().trim().max(100).optional()
const page = z.number().int().min(0).max(10_000).default(0)
const userId = z.uuid()
const householdId = z.uuid()

/** The "add an admin" form: a separate admin-only account with a temporary password. */
export const addAdminSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  /** Temporary: the new admin must choose their own on first sign-in. */
  password: passwordSchema,
})
export type AddAdminInput = z.input<typeof addAdminSchema>

/** Body of the `admin` edge function: one action per request. App admins only. */
export const adminRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('overview') }),
  z.object({ action: z.literal('listUsers'), search, page }),
  z.object({ action: z.literal('getUser'), userId }),
  z.object({ action: z.literal('setUserDisabled'), userId, disabled: z.boolean() }),
  z.object({ action: z.literal('sendPasswordReset'), userId }),
  z.object({ action: z.literal('deleteUser'), userId }),
  z.object({ action: z.literal('listHouseholds'), search, page }),
  z.object({ action: z.literal('getHousehold'), householdId }),
  z.object({ action: z.literal('renameHousehold'), householdId, name: householdNameSchema }),
  z.object({ action: z.literal('deleteHousehold'), householdId }),
  z.object({ action: z.literal('createHousehold'), name: householdNameSchema }),
  /** A link that makes whoever accepts it a household admin (optionally emailed). */
  z.object({
    action: z.literal('createAdminInvite'),
    householdId,
    email: emailSchema.optional(),
  }),
  z.object({
    action: z.literal('setMemberRole'),
    householdId,
    userId,
    role: z.enum(['admin', 'member']),
  }),
  z.object({ action: z.literal('listAdmins') }),
  addAdminSchema.extend({ action: z.literal('addAdmin') }),
  z.object({ action: z.literal('removeAdmin'), userId }),
])
export type AdminRequest = z.input<typeof adminRequestSchema>

export interface AdminPage<T> {
  items: T[]
  total: number
}

export interface AdminOverview {
  users: number
  households: number
  expenses: number
  tasks: number
  providers: number
  newUsers30d: number
  activeHouseholds30d: number
  /** Last 12 weeks, oldest first; `week` is the Monday (UTC) starting it. */
  signupsByWeek: { week: string; count: number }[]
  recentActions: AdminAction[]
}

export interface AdminAction {
  id: number
  action: string
  targetType: 'user' | 'household'
  targetId: string
  details: Record<string, unknown> | null
  createdAt: string
  adminName: string | null
}

export interface AdminUser {
  id: string
  email: string
  fullName: string | null
  avatarUrl: string | null
  createdAt: string
  lastSignInAt: string | null
  /** Set while the account is disabled. */
  bannedUntil: string | null
  isAdmin: boolean
  householdCount: number
}

export interface AdminUserDetail {
  id: string
  email: string
  fullName: string | null
  isAdmin: boolean
  households: { id: string; name: string; memberCount: number }[]
}

export interface AdminHousehold {
  id: string
  name: string
  createdAt: string
  memberCount: number
  expenseCount: number
  taskCount: number
  lastActivityAt: string | null
}

export interface AdminHouseholdDetail {
  id: string
  name: string
  createdAt: string
  lastActivityAt: string | null
  counts: {
    expenses: number
    receipts: number
    tasks: number
    providers: number
    pendingInvites: number
  }
  members: {
    userId: string
    email: string
    fullName: string | null
    joinedAt: string
    role: 'admin' | 'member'
  }[]
}

export interface AdminInviteLink {
  inviteUrl: string
  expiresAt: string
  email: string | null
  /** False when there was no email, or sending it failed (the link still works). */
  emailed: boolean
}

export interface AdminAccount {
  id: string
  email: string
  fullName: string | null
  adminSince: string
  lastSignInAt: string | null
  /** Non-zero for an account that is also a regular household member. */
  householdCount: number
}

export interface AdminRemoveResult {
  /** True when the account was admin-only and has been deleted; false when it was kept. */
  deletedAccount: boolean
}
