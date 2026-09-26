import { z } from 'zod'
import { householdNameSchema } from './household.ts'

export const ADMIN_PAGE_SIZE = 25

const search = z.string().trim().max(100).optional()
const page = z.number().int().min(0).max(10_000).default(0)
const userId = z.uuid()
const householdId = z.uuid()

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
  members: { userId: string; email: string; fullName: string | null; joinedAt: string }[]
}

export interface AdminDeleteUserResult {
  /** Households deleted because this user was their only member. */
  deletedHouseholds: string[]
}
