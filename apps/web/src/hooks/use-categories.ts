import {
  createCategory,
  reorderCategories,
  updateCategory,
  type Category,
  type CategoryInput,
} from '@home/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import { categoriesQuery } from '@/lib/queries'
import { supabase } from '@/lib/supabase'

function friendlyError(error: unknown) {
  // 23505: names are unique among siblings (household, parent, lower(name)).
  if ((error as { code?: string } | null)?.code === '23505') {
    return 'A category with that name already exists there.'
  }
  return errorMessage(error)
}

export function useCreateCategory(householdId: string) {
  const queryClient = useQueryClient()
  const { queryKey } = categoriesQuery(householdId)
  return useMutation({
    /** With `parentId`, a sub-category of that category. New ones go last among their siblings. */
    mutationFn: ({ parentId = null, ...input }: CategoryInput & { parentId?: string | null }) => {
      const siblings = (queryClient.getQueryData(queryKey) ?? []).filter(
        (c) => c.parent_id === parentId,
      )
      const nextOrder = Math.max(0, ...siblings.map((c) => c.sort_order)) + 1
      return createCategory(supabase, householdId, input, nextOrder, parentId)
    },
    onSuccess: (category) => toast.success(`Added ${category.name}`),
    onError: (error) => toast.error(friendlyError(error)),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })
}

export function useUpdateCategory(householdId: string) {
  const queryClient = useQueryClient()
  const { queryKey } = categoriesQuery(householdId)
  return useMutation({
    mutationFn: ({
      id,
      changes,
    }: {
      id: string
      changes: Partial<CategoryInput> & { isArchived?: boolean; parentId?: string | null }
    }) => updateCategory(supabase, id, changes),
    onMutate: async ({ id, changes }) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData(queryKey)
      queryClient.setQueryData(queryKey, (old) =>
        old?.map((c) =>
          c.id === id
            ? {
                ...c,
                name: changes.name?.trim() ?? c.name,
                icon: changes.icon ?? c.icon,
                is_archived: changes.isArchived ?? c.is_archived,
                parent_id: changes.parentId !== undefined ? changes.parentId : c.parent_id,
              }
            : // Archiving a category archives its sub-categories (the database does the same).
              changes.isArchived !== undefined && c.parent_id === id
              ? { ...c, is_archived: changes.isArchived }
              : c,
        ),
      )
      return { previous }
    },
    onError: (error, _vars, context) => {
      queryClient.setQueryData(queryKey, context?.previous)
      toast.error(friendlyError(error))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })
}

/** Saves a new order for one set of siblings (top-level categories, or one category's subs). */
export function useReorderCategories(householdId: string) {
  const queryClient = useQueryClient()
  const { queryKey } = categoriesQuery(householdId)
  return useMutation({
    mutationFn: (ordered: Category[]) =>
      reorderCategories(
        supabase,
        householdId,
        ordered.map((c) => c.id),
      ),
    onMutate: async (ordered) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData(queryKey)
      const position = new Map(ordered.map((c, i) => [c.id, i + 1]))
      queryClient.setQueryData(queryKey, (old) =>
        old
          ?.map((c) => ({ ...c, sort_order: position.get(c.id) ?? c.sort_order }))
          .sort((a, b) => a.sort_order - b.sort_order),
      )
      return { previous }
    },
    onError: (error, _vars, context) => {
      queryClient.setQueryData(queryKey, context?.previous)
      toast.error(errorMessage(error))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })
}
