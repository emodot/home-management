import {
  completeTask,
  createTask,
  nextDueDate,
  setTaskDeleted,
  undoTaskCompletion,
  updateTask,
  type CompleteTaskInput,
  type Task,
  type TaskInput,
} from '@home/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import { expensesKey, tasksKey, tasksQuery } from '@/lib/queries'
import { supabase } from '@/lib/supabase'

function useRefreshTasks(householdId: string) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: tasksKey(householdId) }),
      queryClient.invalidateQueries({ queryKey: expensesKey(householdId) }),
    ])
}

export function useSaveTask(householdId: string, existing?: Task) {
  const refresh = useRefreshTasks(householdId)
  return useMutation({
    mutationFn: (input: TaskInput) =>
      existing
        ? updateTask(supabase, existing, input).then(() => existing.id)
        : createTask(supabase, householdId, input).then((t) => t.id),
    onSettled: refresh,
  })
}

export function useRestoreTask(householdId: string) {
  const refresh = useRefreshTasks(householdId)
  return useMutation({
    mutationFn: (task: Pick<Task, 'id' | 'title'>) => setTaskDeleted(supabase, task.id, false),
    onSuccess: (_d, task) => toast.success(`Restored ${task.title}`),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: refresh,
  })
}

export function useDeleteTask(householdId: string) {
  const queryClient = useQueryClient()
  const refresh = useRefreshTasks(householdId)
  const restore = useRestoreTask(householdId)
  const { queryKey } = tasksQuery(householdId)
  return useMutation({
    mutationFn: (task: Task) => setTaskDeleted(supabase, task.id, true),
    onMutate: async (task) => {
      await queryClient.cancelQueries({ queryKey })
      queryClient.setQueryData(queryKey, (old) => old?.filter((t) => t.id !== task.id))
    },
    onSuccess: (_d, task) =>
      toast.success(`Deleted ${task.title}`, {
        action: { label: 'Undo', onClick: () => restore.mutate(task) },
      }),
    onError: (error) => toast.error(`Couldn't delete. ${errorMessage(error)}`),
    onSettled: refresh,
  })
}

/**
 * Marks a task done. The list updates straight away (the next due date is computed the same way
 * the database does it); the toast offers Undo. `onCompleted` gets the completion id so the page
 * can ask whether to log an expense.
 */
export function useCompleteTask(
  householdId: string,
  today: string,
  onCompleted: (task: Task, completionId: string) => void,
) {
  const queryClient = useQueryClient()
  const refresh = useRefreshTasks(householdId)
  const { queryKey } = tasksQuery(householdId)

  const undo = useMutation({
    mutationFn: (completionId: string) => undoTaskCompletion(supabase, completionId),
    onSuccess: () => toast.success('Undone'),
    onError: (error) => toast.error(`Couldn't undo. ${errorMessage(error)}`),
    onSettled: refresh,
  })

  return useMutation({
    mutationFn: ({ task, input }: { task: Task; input?: CompleteTaskInput }) =>
      completeTask(supabase, task.id, input ?? { completedOn: today, notes: '' }),
    onMutate: async ({ task, input }) => {
      await queryClient.cancelQueries({ queryKey })
      const completedOn = input?.completedOn ?? today
      queryClient.setQueryData(queryKey, (old) =>
        old?.map((t) => {
          if (t.id !== task.id) return t
          const next = nextDueDate({
            scheduleType: t.schedule_type,
            frequency: t.frequency,
            intervalCount: t.interval_count,
            previousDueOn: t.next_due_on,
            completedOn,
            startOn: t.start_on,
          })
          return next ? { ...t, next_due_on: next } : { ...t, is_active: false }
        }),
      )
    },
    onSuccess: (completionId, { task }) => {
      toast.success(`Done: ${task.title}`, {
        action: { label: 'Undo', onClick: () => undo.mutate(completionId) },
      })
      onCompleted(task, completionId)
    },
    onError: (error) => toast.error(`Couldn't mark it done. ${errorMessage(error)}`),
    onSettled: refresh,
  })
}
