import { describe, expect, it } from 'vitest'
import {
  amountInputSchema,
  budgetInputSchema,
  expenseFiltersToParams,
  expenseFormSchema,
  parseExpenseFilters,
  receiptFileSchema,
} from './expenses.ts'

const categoryId = '0d4f3a5e-8a9b-4c6d-9e7f-1a2b3c4d5e6f'

describe('amountInputSchema', () => {
  it('parses to minor units', () => {
    expect(amountInputSchema.parse('45,000.50')).toBe(4_500_050)
  })

  it.each([
    ['', 'Enter an amount'],
    ['0', 'Enter an amount above zero'],
    ['abc', 'Enter a valid amount, like 45,000 or 1,250.50'],
    ['1.234', 'Enter a valid amount, like 45,000 or 1,250.50'],
    ['2000000000000', 'That amount is too large'],
  ])('rejects %j with a helpful message', (input, message) => {
    const result = amountInputSchema.safeParse(input)
    expect(result.error?.issues[0]?.message).toBe(message)
  })
})

describe('expenseFormSchema', () => {
  it('produces the write shape', () => {
    expect(
      expenseFormSchema.parse({
        amount: '45,000',
        occurredOn: '2026-09-20',
        categoryId,
        description: '  NEPA token ',
        paidBy: null,
        providerId: null,
        notes: '   ',
      }),
    ).toEqual({
      amountMinor: 4_500_000,
      occurredOn: '2026-09-20',
      categoryId,
      description: 'NEPA token',
      paidBy: null,
      providerId: null,
      notes: null,
    })
  })

  it('asks for a category', () => {
    const result = expenseFormSchema.safeParse({
      amount: '1',
      occurredOn: '2026-09-20',
      categoryId: '',
      description: 'x',
      paidBy: null,
      providerId: null,
      notes: null,
    })
    expect(result.error?.issues.map((i) => [i.path[0], i.message])).toEqual([
      ['categoryId', 'Choose a category'],
    ])
  })

  it('rejects impossible dates', () => {
    const result = expenseFormSchema.safeParse({
      amount: '1',
      occurredOn: '2026-02-30',
      categoryId,
      description: 'x',
      paidBy: null,
      providerId: null,
      notes: null,
    })
    expect(result.success).toBe(false)
  })
})

describe('expense filters', () => {
  it('keeps valid values and drops invalid ones', () => {
    expect(
      parseExpenseFilters({
        from: '2026-09-01',
        to: 'yesterday',
        category: categoryId,
        paidBy: 'nope',
        receipt: 'without',
        q: '  diesel ',
      }),
    ).toEqual({
      from: '2026-09-01',
      to: undefined,
      category: categoryId,
      paidBy: undefined,
      provider: undefined,
      receipt: 'without',
      q: 'diesel',
    })
  })

  it('round-trips through search params', () => {
    const filters = parseExpenseFilters({ q: 'gen', receipt: 'with' })
    expect(expenseFiltersToParams(filters)).toEqual({ receipt: 'with', q: 'gen' })
    expect(expenseFiltersToParams(parseExpenseFilters({ q: '   ' }))).toEqual({})
  })
})

describe('receiptFileSchema', () => {
  it('accepts supported files up to 10 MB', () => {
    expect(
      receiptFileSchema.safeParse({
        fileName: 'r.pdf',
        mimeType: 'application/pdf',
        size: 10 * 1024 * 1024,
      }).success,
    ).toBe(true)
  })

  it('rejects other types and big files', () => {
    expect(
      receiptFileSchema.safeParse({ fileName: 'r.gif', mimeType: 'image/gif', size: 10 }).success,
    ).toBe(false)
    expect(
      receiptFileSchema.safeParse({
        fileName: 'r.jpg',
        mimeType: 'image/jpeg',
        size: 10 * 1024 * 1024 + 1,
      }).success,
    ).toBe(false)
  })
})

describe('budgetInputSchema', () => {
  it('clears on empty input and parses amounts', () => {
    expect(budgetInputSchema.parse('  ')).toBeNull()
    expect(budgetInputSchema.parse('50,000')).toBe(5_000_000)
    expect(budgetInputSchema.safeParse('0').error?.issues[0]?.message).toBe(
      'Enter an amount above zero',
    )
    expect(budgetInputSchema.safeParse('abc').error?.issues[0]?.message).toBe(
      'Enter a valid amount, like 45,000 or 1,250.50',
    )
  })
})
