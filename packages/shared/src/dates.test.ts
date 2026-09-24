import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from './dates.ts'

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
