import { describe, expect, it } from 'vitest'
import { isNetworkError } from './errors.ts'

describe('isNetworkError', () => {
  it('recognises fetch failures from each browser', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkError({ message: 'TypeError: Failed to fetch', code: '' })).toBe(true)
    expect(isNetworkError({ message: 'NetworkError when attempting to fetch resource.' })).toBe(
      true,
    )
    expect(isNetworkError(new TypeError('Load failed'))).toBe(true)
  })

  it("isn't fooled by server errors", () => {
    expect(isNetworkError({ message: 'duplicate key value', code: '23505' })).toBe(false)
    expect(isNetworkError(null)).toBe(false)
  })
})
