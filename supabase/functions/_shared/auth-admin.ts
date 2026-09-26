import type { HomeClient } from '../../../packages/shared/src/client.ts'

/** The Supabase Auth admin operations the admin function needs (an interface, for tests). */
export interface AuthAdmin {
  setDisabled(userId: string, disabled: boolean): Promise<void>
  deleteUser(userId: string): Promise<void>
  sendPasswordReset(email: string, redirectTo: string): Promise<void>
  /** Creates a confirmed account that must change its password on first sign-in; returns its id. */
  createAdminAccount(email: string, fullName: string, password: string): Promise<string>
}

// Supabase bans for a duration; ~100 years is "until re-enabled".
const DISABLED_FOR = '876000h'

export function createAuthAdmin(admin: HomeClient): AuthAdmin {
  return {
    async setDisabled(userId, disabled) {
      const { error } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: disabled ? DISABLED_FOR : 'none',
      })
      if (error) throw error
    },
    async deleteUser(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) throw error
    },
    async sendPasswordReset(email, redirectTo) {
      const { error } = await admin.auth.resetPasswordForEmail(email, { redirectTo })
      if (error) throw error
    },
    async createAdminAccount(email, fullName, password) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, must_change_password: true },
      })
      if (error) throw error
      return data.user.id
    },
  }
}
