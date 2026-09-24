import {
  createProvider,
  setProviderDeleted,
  updateProvider,
  type Provider,
  type ProviderInput,
} from '@home/shared'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import { expensesKey, providersQuery } from '@/lib/queries'
import { supabase } from '@/lib/supabase'

/** Providers by id, deleted ones included (old expenses still show who did the job). */
export function useProviderLookup(householdId: string) {
  const providers = useSuspenseQuery(providersQuery(householdId)).data
  return useMemo(() => new Map(providers.map((p) => [p.id, p])), [providers])
}

export function useActiveProviders(householdId: string) {
  const providers = useSuspenseQuery(providersQuery(householdId)).data
  return useMemo(() => providers.filter((p) => p.deleted_at === null), [providers])
}

export function useCreateProvider(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ProviderInput) => createProvider(supabase, householdId, input),
    onSuccess: (provider) => {
      queryClient.setQueryData(providersQuery(householdId).queryKey, (old = []) =>
        [...old, provider].sort((a, b) => a.name.localeCompare(b.name)),
      )
    },
    onSettled: () => queryClient.invalidateQueries(providersQuery(householdId)),
  })
}

export function useUpdateProvider(householdId: string, id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ProviderInput) => updateProvider(supabase, id, input),
    onSettled: () => queryClient.invalidateQueries(providersQuery(householdId)),
  })
}

export function useRestoreProvider(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (provider: Pick<Provider, 'id' | 'name'>) =>
      setProviderDeleted(supabase, provider.id, false),
    onSuccess: (_data, provider) => toast.success(`Restored ${provider.name}`),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries(providersQuery(householdId)),
        queryClient.invalidateQueries({ queryKey: expensesKey(householdId) }),
      ]),
  })
}

export function useDeleteProvider(householdId: string) {
  const queryClient = useQueryClient()
  const restore = useRestoreProvider(householdId)
  const { queryKey } = providersQuery(householdId)
  return useMutation({
    mutationFn: (provider: Provider) => setProviderDeleted(supabase, provider.id, true),
    onMutate: async (provider) => {
      await queryClient.cancelQueries({ queryKey })
      queryClient.setQueryData(queryKey, (old) =>
        old?.map((p) =>
          p.id === provider.id ? { ...p, deleted_at: new Date().toISOString() } : p,
        ),
      )
    },
    onSuccess: (_data, provider) =>
      toast.success(`Deleted ${provider.name}`, {
        action: { label: 'Undo', onClick: () => restore.mutate(provider) },
      }),
    onError: (error) => toast.error(`Couldn't delete. ${errorMessage(error)}`),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: expensesKey(householdId) }),
      ]),
  })
}
