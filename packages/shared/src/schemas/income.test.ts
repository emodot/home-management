import { describe, expect, it } from 'vitest'
import { incomeFormSchema } from './income.ts'

const valid = {
  amount: '500,000',
  receivedOn: '2026-09-28',
  budgetMonth: '2026-10',
  source: '  Salary – Acme Ltd ',
  receivedBy: null,
  notes: '',
}

describe('incomeFormSchema', () => {
  it('produces the write shape', () => {
    expect(incomeFormSchema.parse(valid)).toEqual({
      amountMinor: 50_000_000,
      receivedOn: '2026-09-28',
      budgetMonth: '2026-10',
      source: 'Salary – Acme Ltd',
      receivedBy: null,
      notes: null,
    })
  })

  it.each([
    [{ source: '   ' }, 'Say where it came from'],
    [{ amount: '0' }, 'Enter an amount above zero'],
    [{ budgetMonth: '2026-13' }, 'Choose a month'],
  ])('rejects %j', (override, message) => {
    const result = incomeFormSchema.safeParse({ ...valid, ...override })
    expect(result.error?.issues[0]?.message).toBe(message)
  })
})
