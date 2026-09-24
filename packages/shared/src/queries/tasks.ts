import { unwrap, type HomeClient } from '../client.ts'
import type { Tables } from '../database.types.ts'
import {
  completeTaskSchema,
  taskInputSchema,
  type CompleteTaskInput,
  type TaskFrequency,
  type TaskInput,
  type TaskScheduleType,
} from '../schemas/tasks.ts'
import { toExpense, type Expense } from './expenses.ts'

export type Task = Omit<Tables<'tasks'>, 'schedule_type' | 'frequency'> & {
  schedule_type: TaskScheduleType
  frequency: TaskFrequency | null
}
export type TaskCompletion = Tables<'task_completions'>

/** The household's tasks (not deleted), soonest due first. */
export async function listTasks(client: HomeClient, householdId: string): Promise<Task[]> {
  const rows = unwrap(
    await client
      .from('tasks')
      .select('*')
      .eq('household_id', householdId)
      .is('deleted_at', null)
      .order('next_due_on')
      .order('title'),
  )
  return rows as Task[]
}

/** A task by id, including deleted ones (for restore). */
export async function getTask(client: HomeClient, id: string): Promise<Task | null> {
  const row = unwrap(await client.from('tasks').select('*').eq('id', id).maybeSingle())
  return row as Task | null
}

function toColumns(input: TaskInput) {
  const t = taskInputSchema.parse(input)
  return {
    title: t.title,
    description: t.description,
    schedule_type: t.scheduleType,
    frequency: t.frequency,
    interval_count: t.intervalCount,
    next_due_on: t.nextDueOn,
    assignee_id: t.assigneeId,
    provider_id: t.providerId,
    default_category_id: t.defaultCategoryId,
    reminder_days_before: t.reminderDaysBefore,
  }
}

/** Creates a task whose first due date (`nextDueOn`) also anchors month-end dates. */
export async function createTask(
  client: HomeClient,
  householdId: string,
  input: TaskInput,
): Promise<Task> {
  const columns = toColumns(input)
  const row = unwrap(
    await client
      .from('tasks')
      .insert({ household_id: householdId, ...columns, start_on: columns.next_due_on })
      .select('*')
      .single(),
  )
  return row as Task
}

/**
 * Updates a task. Changing the schedule or the next due date re-anchors it to the new date; other
 * edits keep the original anchor. Editing a finished one-off task with a new date reactivates it.
 */
export async function updateTask(
  client: HomeClient,
  existing: Task,
  input: TaskInput,
): Promise<void> {
  const columns = toColumns(input)
  const rescheduled =
    columns.next_due_on !== existing.next_due_on ||
    columns.schedule_type !== existing.schedule_type ||
    columns.frequency !== existing.frequency ||
    columns.interval_count !== existing.interval_count
  unwrap(
    await client
      .from('tasks')
      .update({
        ...columns,
        ...(rescheduled && { start_on: columns.next_due_on, is_active: true }),
      })
      .eq('id', existing.id),
  )
}

/** Soft delete (deleted = true) or restore. */
export async function setTaskDeleted(
  client: HomeClient,
  id: string,
  deleted: boolean,
): Promise<void> {
  unwrap(
    await client
      .from('tasks')
      .update({ deleted_at: deleted ? new Date().toISOString() : null })
      .eq('id', id),
  )
}

/** Marks a task done and advances it. Returns the completion id (to link an expense). */
export async function completeTask(
  client: HomeClient,
  taskId: string,
  input?: CompleteTaskInput,
): Promise<string> {
  const parsed = input ? completeTaskSchema.parse(input) : undefined
  return unwrap(
    await client.rpc('complete_task', {
      p_task_id: taskId,
      ...(parsed && { p_completed_on: parsed.completedOn }),
      ...(parsed?.notes && { p_notes: parsed.notes }),
    }),
  )
}

export async function undoTaskCompletion(client: HomeClient, completionId: string): Promise<void> {
  unwrap(await client.rpc('undo_task_completion', { p_completion_id: completionId }))
}

export interface TaskHistoryEntry extends TaskCompletion {
  expenses: Expense[]
}

/** Completions (newest first), each with the expenses logged against it. */
export async function listTaskHistory(
  client: HomeClient,
  taskId: string,
): Promise<TaskHistoryEntry[]> {
  const completions = unwrap(
    await client
      .from('task_completions')
      .select('*')
      .eq('task_id', taskId)
      .order('completed_on', { ascending: false })
      .order('created_at', { ascending: false }),
  )
  if (completions.length === 0) return []
  const expenses = unwrap(
    await client
      .from('expense_list')
      .select('*')
      .in(
        'task_completion_id',
        completions.map((c) => c.id),
      )
      .is('deleted_at', null),
  ).map(toExpense)
  return completions.map((c) => ({
    ...c,
    expenses: expenses.filter((e) => e.taskCompletionId === c.id),
  }))
}

/** A completion with its task, for prefilling "log an expense for this". */
export async function getTaskCompletion(
  client: HomeClient,
  completionId: string,
): Promise<{ completion: TaskCompletion; task: Task } | null> {
  const completion = unwrap(
    await client.from('task_completions').select('*').eq('id', completionId).maybeSingle(),
  )
  if (!completion) return null
  const task = await getTask(client, completion.task_id)
  return task ? { completion, task } : null
}

export async function listProviderTasks(
  client: HomeClient,
  householdId: string,
  providerId: string,
): Promise<Task[]> {
  const rows = unwrap(
    await client
      .from('tasks')
      .select('*')
      .eq('household_id', householdId)
      .eq('provider_id', providerId)
      .is('deleted_at', null)
      .order('next_due_on'),
  )
  return rows as Task[]
}
