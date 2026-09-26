import {
  deleteAdminHousehold,
  deleteAdminUser,
  renameAdminHousehold,
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
    ({ deletedHouseholds }, { email }) =>
      deletedHouseholds.length > 0
        ? `Deleted ${email} and ${deletedHouseholds.join(', ')}`
        : `Deleted ${email}`,
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
