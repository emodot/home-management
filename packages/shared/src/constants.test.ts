import { describe, expect, it } from 'vitest'
import { DEFAULT_CURRENCY, DEFAULT_LOCALE, DEFAULT_TIMEZONE } from './constants.ts'

describe('defaults', () => {
  it('targets Nigeria', () => {
    expect(DEFAULT_CURRENCY).toBe('NGN')
    expect(DEFAULT_TIMEZONE).toBe('Africa/Lagos')
    expect(DEFAULT_LOCALE).toBe('en-NG')
  })

  it('uses values the Intl APIs accept', () => {
    expect(
      () =>
        new Intl.NumberFormat(DEFAULT_LOCALE, { style: 'currency', currency: DEFAULT_CURRENCY }),
    ).not.toThrow()
    expect(
      () => new Intl.DateTimeFormat(DEFAULT_LOCALE, { timeZone: DEFAULT_TIMEZONE }),
    ).not.toThrow()
  })
})
