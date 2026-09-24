import { describe, expect, it } from 'vitest'
import { describeDue, describeSchedule, taskDueState } from './tasks.ts'

const today = '2026-09-24'
const task = (nextDueOn: string, isActive = true) => ({ nextDueOn, isActive })

describe('taskDueState', () => {
  it.each([
    ['2026-09-20', 'overdue', -4],
    ['2026-09-24', 'today', 0],
    ['2026-09-25', 'upcoming', 1],
    ['2026-10-24', 'upcoming', 30],
    ['2026-10-25', 'later', 31],
  ] as const)('%s is %s', (due, state, days) => {
    expect(taskDueState(task(due), today)).toEqual({ state, days })
  })

  it('treats inactive tasks as done', () => {
    expect(taskDueState(task('2026-09-01', false), today).state).toBe('done')
  })
})

describe('describeDue', () => {
  it.each([
    ['2026-09-23', 'Overdue by 1 day'],
    ['2026-09-20', 'Overdue by 4 days'],
    ['2026-09-24', 'Due today'],
    ['2026-09-25', 'Due tomorrow'],
    ['2026-10-01', 'Due in 7 days'],
  ])('%s → %s', (due, text) => {
    expect(describeDue(task(due), today)).toBe(text)
  })
})

describe('describeSchedule', () => {
  it('reads naturally', () => {
    expect(describeSchedule('after_completion', 'monthly', 3)).toBe(
      "Every 3 months after it's done",
    )
    expect(describeSchedule('fixed', 'monthly', 1)).toBe('Every month')
    expect(describeSchedule('once', null, 1)).toBe('One-off')
  })
})
