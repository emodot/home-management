import type { HomeClient } from '../../../packages/shared/src/client.ts'

/** The Supabase Auth admin operations the admin function needs (an interface, for tests). */
export interface AuthAdmin {
  setDisabled(userId: string, disabled: boolean): Promise<void>
  deleteUser(userId: string): Promise<void>
  sendPasswordReset(email: string, redirectTo: string): Promise<void>
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
  }
}
