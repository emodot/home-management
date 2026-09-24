import { describe, expect, it } from 'vitest'
import { budgetStatus, percentChange } from './insights.ts'

describe('budgetStatus', () => {
  it.each([
    [0, 100, 'ok'],
    [79, 100, 'ok'],
    [80, 100, 'warning'],
    [100, 100, 'warning'],
    [101, 100, 'over'],
  ] as const)('%d of %d is %s', (spent, budget, level) => {
    expect(budgetStatus(spent, budget).level).toBe(level)
  })

  it('reports the ratio and what is left', () => {
    expect(budgetStatus(125, 100)).toEqual({ level: 'over', ratio: 1.25, remainingMinor: -25 })
    expect(budgetStatus(30, 120)).toEqual({ level: 'ok', ratio: 0.25, remainingMinor: 90 })
  })
})

describe('percentChange', () => {
  it('computes signed change', () => {
    expect(percentChange(120, 100)).toBe(20)
    expect(percentChange(50, 100)).toBe(-50)
  })

  it('returns null without a baseline', () => {
    expect(percentChange(100, 0)).toBeNull()
  })
})
