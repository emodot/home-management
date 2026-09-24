import { describe, expect, it } from 'vitest'
import {
  addDays,
  formatDate,
  formatMonth,
  formatRelativeTime,
  monthOf,
  monthRange,
  todayIn,
  yearRange,
} from './dates.ts'

const now = new Date('2026-09-24T12:00:00Z')
const offset = (seconds: number) => new Date(now.getTime() + seconds * 1000)

describe('formatRelativeTime', () => {
  it.each([
    [offset(7 * 24 * 3600 - 60), 'in 7 days'],
    [offset(8 * 24 * 3600), 'next week'],
    [offset(6 * 24 * 3600), 'in 6 days'],
    [offset(-24 * 3600), 'yesterday'],
    [offset(-3 * 3600), '3 hours ago'],
    [offset(-20), 'now'],
  ])('formats %s', (date, expected) => {
    expect(formatRelativeTime(date, now)).toBe(expected)
  })

  it('accepts ISO strings', () => {
    expect(formatRelativeTime('2026-09-25T12:00:00Z', now)).toBe('tomorrow')
  })
})

describe('todayIn', () => {
  it('uses the Lagos calendar day, not UTC', () => {
    // 23:30 UTC is already 00:30 the next day in Lagos (UTC+1).
    expect(todayIn('Africa/Lagos', new Date('2026-09-24T23:30:00Z'))).toBe('2026-09-25')
    expect(todayIn('Africa/Lagos', new Date('2026-09-24T22:30:00Z'))).toBe('2026-09-24')
  })
})

describe('date-only helpers', () => {
  it('format without shifting the day', () => {
    expect(formatDate('2026-09-20')).toBe('20 Sept 2026')
    expect(formatMonth('2026-09')).toBe('September 2026')
    expect(monthOf('2026-09-20')).toBe('2026-09')
  })

  it('compute month and year ranges', () => {
    expect(monthRange('2026-09-20')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(monthRange('2026-03-31', -1)).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(monthRange('2028-03-15', -1)).toEqual({ from: '2028-02-01', to: '2028-02-29' })
    expect(monthRange('2026-01-10', -1)).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(yearRange('2026-09-20')).toEqual({ from: '2026-01-01', to: '2026-12-31' })
  })

  it('adds days across month ends', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})
