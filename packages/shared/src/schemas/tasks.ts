import { z } from 'zod'
import { isoDateSchema } from './expenses.ts'

export const TASK_SCHEDULE_TYPES = ['fixed', 'after_completion', 'once'] as const
export type TaskScheduleType = (typeof TASK_SCHEDULE_TYPES)[number]
export const TASK_FREQUENCIES = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const
export type TaskFrequency = (typeof TASK_FREQUENCIES)[number]

const title = z
  .string()
  .trim()
  .min(1, 'Give the task a name')
  .max(120, 'Keep it under 120 characters')
const description = z
  .string()
  .trim()
  .max(2000, 'Keep it under 2,000 characters')
  .nullable()
  .transform((value) => (value === '' ? null : value))
const count = (min: number, max: number) =>
  z.coerce
    .number<string | number>()
    .int('Use a whole number')
    .min(min, `At least ${min}`)
    .max(max, `At most ${max}`)
const optionalId = z
  .string()
  .nullable()
  .transform((value) => (value === '' ? null : value))
  .pipe(z.uuid().nullable())

/** What gets written to tasks. One-off tasks never keep a frequency. */
export const taskInputSchema = z
  .object({
    title,
    description,
    scheduleType: z.enum(TASK_SCHEDULE_TYPES),
    frequency: z.enum(TASK_FREQUENCIES).nullable(),
    intervalCount: count(1, 99),
    nextDueOn: isoDateSchema,
    assigneeId: optionalId,
    providerId: optionalId,
    defaultCategoryId: optionalId,
    reminderDaysBefore: count(0, 30),
  })
  .transform((task) =>
    task.scheduleType === 'once' ? { ...task, frequency: null, intervalCount: 1 } : task,
  )
  .refine((task) => task.scheduleType === 'once' || task.frequency !== null, {
    message: 'Choose how often it repeats',
    path: ['frequency'],
  })
export type TaskInput = z.input<typeof taskInputSchema>
export type TaskValues = z.output<typeof taskInputSchema>

export const completeTaskSchema = z.object({
  completedOn: isoDateSchema,
  notes: z
    .string()
    .trim()
    .max(2000, 'Keep notes under 2,000 characters')
    .transform((value) => (value === '' ? null : value)),
})
export type CompleteTaskInput = z.input<typeof completeTaskSchema>
export type CompleteTaskValues = z.output<typeof completeTaskSchema>
