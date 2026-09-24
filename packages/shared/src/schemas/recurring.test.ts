import { describe, expect, it } from 'vitest'
import { recurringExpenseFormSchema } from './recurring.ts'

const categoryId = '0d4f3a5e-8a9b-4c6d-9e7f-1a2b3c4d5e6f'
const valid = {
  description: ' Spectranet ',
  amount: '22,000',
  categoryId,
  paidBy: null,
  frequency: 'monthly',
  intervalCount: '1',
  nextDueOn: '2026-10-01',
} as const

describe('recurringExpenseFormSchema', () => {
  it('produces the write shape', () => {
    expect(recurringExpenseFormSchema.parse(valid)).toEqual({
      description: 'Spectranet',
      amountMinor: 2_200_000,
      categoryId,
      paidBy: null,
      frequency: 'monthly',
      intervalCount: 1,
      nextDueOn: '2026-10-01',
    })
  })

  it.each([
    [{ intervalCount: '0' }, 'At least 1'],
    [{ intervalCount: '1.5' }, 'Use a whole number'],
    [{ frequency: 'daily' }, undefined],
    [{ amount: '' }, 'Enter an amount'],
  ])('rejects %j', (override, message) => {
    const result = recurringExpenseFormSchema.safeParse({ ...valid, ...override })
    expect(result.success).toBe(false)
    if (message) expect(result.error?.issues[0]?.message).toBe(message)
  })
})
