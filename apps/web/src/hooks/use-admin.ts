import {
  addAdminAccount,
  createAdminHousehold,
  createAdminHouseholdInvite,
  deleteAdminHousehold,
  deleteAdminUser,
  removeAdminAccount,
  renameAdminHousehold,
  setAdminMemberRole,
  sendAdminPasswordReset,
  setAdminUserDisabled,
} from '@home/shared'
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import { adminKey } from '@/lib/queries'
import { supabase } from '@/lib/supabase'

/** Admin changes refresh the admin area (by default all of it: lists, details, the log). */
function useAdminMutation<T, R>(
  mutationFn: (input: T) => Promise<R>,
  success: (result: R, input: T) => string,
  refresh: QueryKey[] = [adminKey],
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: async (result, input) => {
      toast.success(success(result, input))
      await Promise.all(refresh.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
}

export const useSetUserDisabled = () =>
  useAdminMutation(
    ({ userId, disabled }: { userId: string; email: string; disabled: boolean }) =>
      setAdminUserDisabled(supabase, userId, disabled),
    (_, { email, disabled }) => `${email} ${disabled ? 'disabled' : 're-enabled'}`,
  )

export const useSendPasswordReset = () =>
  useAdminMutation(
    ({ userId }: { userId: string; email: string }) => sendAdminPasswordReset(supabase, userId),
    (_, { email }) => `Password reset email sent to ${email}`,
  )

export const useDeleteUser = () =>
  useAdminMutation(
    ({ userId }: { userId: string; email: string }) => deleteAdminUser(supabase, userId),
    (_, { email }) => `Deleted ${email}`,
  )

export const useRenameHousehold = () =>
  useAdminMutation(
    ({ householdId, name }: { householdId: string; name: string }) =>
      renameAdminHousehold(supabase, householdId, name),
    (_, { name }) => `Renamed to ${name}`,
  )

export const useDeleteHousehold = () =>
  useAdminMutation(
    ({ householdId }: { householdId: string; name: string }) =>
      deleteAdminHousehold(supabase, householdId),
    (_, { name }) => `Deleted ${name}`,
    // Not its own detail page, which would now 404 before we navigate away.
    [
      [...adminKey, 'households'],
      [...adminKey, 'overview'],
    ],
  )

export const useAddAdmin = () =>
  useAdminMutation(
    (input: { email: string; fullName: string; password: string }) =>
      addAdminAccount(supabase, input),
    (_, { email }) => `Super-admin account created for ${email}`,
  )

export const useRemoveAdmin = () =>
  useAdminMutation(
    ({ userId }: { userId: string; email: string }) => removeAdminAccount(supabase, userId),
    ({ deletedAccount }, { email }) =>
      deletedAccount
        ? `Deleted the super-admin account ${email}`
        : `${email} is no longer a super-admin`,
  )

export const useCreateHousehold = () =>
  useAdminMutation(
    (name: string) => createAdminHousehold(supabase, name),
    (_, name) => `Created ${name}`,
  )

/** A household admin invite link; no success toast (the dialog shows the link). */
export function useCreateAdminInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ householdId, email }: { householdId: string; email?: string }) =>
      createAdminHouseholdInvite(supabase, householdId, email),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKey }),
    onError: (error) => toast.error(errorMessage(error)),
  })
}

export const useSetMemberRole = () =>
  useAdminMutation(
    ({
      householdId,
      userId,
      role,
    }: {
      householdId: string
      userId: string
      name: string
      role: 'admin' | 'member'
    }) => setAdminMemberRole(supabase, householdId, userId, role),
    (_, { name, role }) =>
      role === 'admin'
        ? `${name} is now a household admin`
        : `${name} is no longer a household admin`,
  )
