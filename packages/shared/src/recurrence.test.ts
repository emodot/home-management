import { describe, expect, it } from 'vitest'
import { advanceDate, describeFrequency, nextDueDate, upcomingDueDates } from './recurrence.ts'

// Same cases as supabase/tests/database/recurring.test.sql (public.advance_date).
describe('advanceDate', () => {
  it.each([
    ['2026-01-31', 'monthly', 1, 31, '2026-02-28'],
    ['2026-02-28', 'monthly', 1, 31, '2026-03-31'],
    ['2028-01-31', 'monthly', 1, 31, '2028-02-29'],
    ['2026-11-30', 'quarterly', 1, 30, '2027-02-28'],
    ['2028-02-29', 'yearly', 1, 29, '2029-02-28'],
    ['2029-02-28', 'yearly', 3, 29, '2032-02-29'],
    ['2026-09-24', 'weekly', 2, 24, '2026-10-08'],
    ['2026-09-15', 'monthly', 2, 15, '2026-11-15'],
    ['2026-12-31', 'daily', 1, 31, '2027-01-01'],
  ] as const)('%s + %s ×%d (anchor %d) = %s', (from, frequency, interval, anchor, expected) => {
    expect(advanceDate(from, frequency, interval, anchor)).toBe(expected)
  })
})

describe('nextDueDate', () => {
  it('fixed schedules advance from the previous due date, anchored to start_on', () => {
    expect(
      nextDueDate({
        scheduleType: 'fixed',
        frequency: 'monthly',
        intervalCount: 1,
        previousDueOn: '2026-02-28',
        completedOn: '2026-03-10',
        startOn: '2026-01-31',
      }),
    ).toBe('2026-03-31')
  })

  it('fixed schedules completed late skip to the first date after completion', () => {
    expect(
      nextDueDate({
        scheduleType: 'fixed',
        frequency: 'monthly',
        intervalCount: 1,
        previousDueOn: '2026-03-31',
        completedOn: '2026-05-10',
        startOn: '2026-01-31',
      }),
    ).toBe('2026-05-31')
  })

  it('after_completion schedules advance from the completion date', () => {
    expect(
      nextDueDate({
        scheduleType: 'after_completion',
        frequency: 'quarterly',
        intervalCount: 1,
        previousDueOn: '2026-06-01',
        completedOn: '2026-06-20',
      }),
    ).toBe('2026-09-20')
  })

  it('one-off tasks have no next date', () => {
    expect(
      nextDueDate({
        scheduleType: 'once',
        frequency: null,
        intervalCount: 1,
        previousDueOn: '2026-06-01',
      }),
    ).toBeNull()
  })
})

describe('upcomingDueDates', () => {
  it('lists future dates keeping the anchor', () => {
    expect(upcomingDueDates('2026-01-31', 'monthly', 1, '2026-01-31', 4)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
  })
})

describe('describeFrequency', () => {
  it('reads naturally', () => {
    expect(describeFrequency('monthly', 1)).toBe('Every month')
    expect(describeFrequency('weekly', 2)).toBe('Every 2 weeks')
    expect(describeFrequency('quarterly', 1)).toBe('Every quarter')
  })
})
