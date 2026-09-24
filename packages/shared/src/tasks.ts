import { addDays, type IsoDate } from './dates.ts'
import { describeFrequency } from './recurrence.ts'
import type { TaskFrequency, TaskScheduleType } from './schemas/tasks.ts'

export type TaskDueState = 'overdue' | 'today' | 'upcoming' | 'later' | 'done'

/** Days in the "upcoming" window shown on the tasks page. */
export const UPCOMING_DAYS = 30

const daysBetween = (from: IsoDate, to: IsoDate) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

/** Where a task stands relative to `today`, plus how many days away (negative when overdue). */
export function taskDueState(
  task: { nextDueOn: IsoDate; isActive: boolean },
  today: IsoDate,
): { state: TaskDueState; days: number } {
  const days = daysBetween(today, task.nextDueOn)
  if (!task.isActive) return { state: 'done', days }
  if (days < 0) return { state: 'overdue', days }
  if (days === 0) return { state: 'today', days }
  return { state: task.nextDueOn <= addDays(today, UPCOMING_DAYS) ? 'upcoming' : 'later', days }
}

/** "Overdue by 3 days", "Due today", "Due tomorrow", "Due in 5 days". */
export function describeDue(
  task: { nextDueOn: IsoDate; isActive: boolean },
  today: IsoDate,
): string {
  const { state, days } = taskDueState(task, today)
  if (state === 'done') return 'Done'
  if (state === 'overdue') return days === -1 ? 'Overdue by 1 day' : `Overdue by ${-days} days`
  if (state === 'today') return 'Due today'
  return days === 1 ? 'Due tomorrow' : `Due in ${days} days`
}

/** "Every 3 months after it's done", "Every month", "One-off". */
export function describeSchedule(
  scheduleType: TaskScheduleType,
  frequency: TaskFrequency | null,
  intervalCount: number,
): string {
  if (scheduleType === 'once' || !frequency) return 'One-off'
  const base = describeFrequency(frequency, intervalCount)
  return scheduleType === 'after_completion' ? `${base} after it's done` : base
}
