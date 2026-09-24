import { describe, expect, it } from 'vitest'
import { escapeLike } from './expenses.ts'

describe('escapeLike', () => {
  it('escapes LIKE wildcards and backslashes', () => {
    expect(escapeLike('50% off_now\\')).toBe('50\\% off\\_now\\\\')
    expect(escapeLike('diesel')).toBe('diesel')
  })
})
