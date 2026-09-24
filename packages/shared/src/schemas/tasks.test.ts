import { describe, expect, it } from 'vitest'
import { taskInputSchema } from './tasks.ts'

const providerId = '0d4f3a5e-8a9b-4c6d-9e7f-1a2b3c4d5e6f'
const base = {
  title: ' Service generator ',
  description: '',
  scheduleType: 'after_completion',
  frequency: 'monthly',
  intervalCount: '3',
  nextDueOn: '2026-10-01',
  assigneeId: null,
  providerId,
  defaultCategoryId: '',
  reminderDaysBefore: '2',
} as const

describe('taskInputSchema', () => {
  it('parses the form into the write shape', () => {
    expect(taskInputSchema.parse(base)).toEqual({
      title: 'Service generator',
      description: null,
      scheduleType: 'after_completion',
      frequency: 'monthly',
      intervalCount: 3,
      nextDueOn: '2026-10-01',
      assigneeId: null,
      providerId,
      defaultCategoryId: null,
      reminderDaysBefore: 2,
    })
  })

  it('drops the frequency of one-off tasks', () => {
    expect(taskInputSchema.parse({ ...base, scheduleType: 'once' })).toMatchObject({
      frequency: null,
      intervalCount: 1,
    })
  })

  it('requires a frequency for repeating tasks', () => {
    const result = taskInputSchema.safeParse({ ...base, frequency: null })
    expect(result.error?.issues[0]).toMatchObject({
      path: ['frequency'],
      message: 'Choose how often it repeats',
    })
  })

  it('bounds reminders to 0-30 days', () => {
    expect(taskInputSchema.safeParse({ ...base, reminderDaysBefore: '31' }).success).toBe(false)
    expect(taskInputSchema.safeParse({ ...base, reminderDaysBefore: '0' }).success).toBe(true)
  })
})
