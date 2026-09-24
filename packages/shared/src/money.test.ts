import { describe, expect, it } from 'vitest'
import { formatMoney, fromMinor, toMinor } from './money.ts'

describe('toMinor', () => {
  it.each([
    ['45000', 4_500_000],
    ['45,000', 4_500_000],
    ['₦1,200.50', 120_050],
    [' 45000.5 ', 4_500_050],
    ['0.07', 7],
    ['.5', 50],
    ['12.', 1200],
    ['0', 0],
    [2500, 250_000],
    ['0.1', 10],
    ['1000000000000', 100_000_000_000_000],
  ])('%j → %d', (input, expected) => {
    expect(toMinor(input)).toBe(expected)
  })

  it('avoids float rounding errors', () => {
    // 0.1 + 0.2 style inputs stay exact.
    expect(toMinor('0.29')).toBe(29)
    expect(toMinor('1.15')).toBe(115)
    expect(toMinor('4.35')).toBe(435)
  })

  it.each(['', 'abc', '1.234', '1,2.3.4', '-5', '1e5', '₦', '12abc'])('rejects %j', (input) => {
    expect(() => toMinor(input)).toThrow(RangeError)
  })

  it('respects currencies without minor units', () => {
    expect(toMinor('500', 'JPY')).toBe(500)
    expect(() => toMinor('500.5', 'JPY')).toThrow(RangeError)
  })
})

describe('fromMinor', () => {
  it.each([
    [4_500_050, '45000.50'],
    [4_500_000, '45000'],
    [7, '0.07'],
    [0, '0'],
    [-150, '-1.50'],
  ])('%d → %s', (minor, expected) => {
    expect(fromMinor(minor)).toBe(expected)
  })

  it('round-trips with toMinor', () => {
    for (const minor of [1, 99, 100, 123_456, 100_000_000_000_000]) {
      expect(toMinor(fromMinor(minor))).toBe(minor)
    }
  })
})

describe('formatMoney', () => {
  it('formats naira, hiding zero kobo', () => {
    expect(formatMoney(4_500_000)).toBe('₦45,000')
    expect(formatMoney(4_500_050)).toBe('₦45,000.50')
    expect(formatMoney(7)).toBe('₦0.07')
  })

  it('formats large amounts exactly', () => {
    expect(formatMoney(100_000_000_000_001)).toBe('₦1,000,000,000,000.01')
  })
})
