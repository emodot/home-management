import { describe, expect, it } from 'vitest'
import type { Expense } from './expenses.ts'
import { expensesToCsv } from './insights.ts'

const expense: Expense = {
  id: 'e1',
  householdId: 'h1',
  amountMinor: 4_500_050,
  currency: 'NGN',
  occurredOn: '2026-09-20',
  categoryId: 'c1',
  description: 'Diesel, 50L',
  notes: null,
  paidBy: 'u1',
  status: 'confirmed',
  createdBy: 'u2',
  updatedBy: 'u2',
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
  deletedAt: null,
  receiptCount: 2,
  recurringExpenseId: null,
}

describe('expensesToCsv', () => {
  it('writes a header and one row per expense with fixed-decimal amounts', () => {
    const csv = expensesToCsv([expense, { ...expense, amountMinor: 1_000_000, paidBy: null }], {
      category: () => 'Fuel & Generator',
      person: (id) => (id === 'u1' ? 'Ada Obi' : id === 'u2' ? 'Bola Ade' : ''),
    })
    expect(csv.replace(/^\uFEFF/, '').split('\r\n')).toEqual([
      'Date,Description,Category,Amount,Currency,Paid by,Notes,Receipts,Added by,Added at',
      '2026-09-20,"Diesel, 50L",Fuel & Generator,45000.50,NGN,Ada Obi,,2,Bola Ade,2026-09-20T10:00:00.000Z',
      '2026-09-20,"Diesel, 50L",Fuel & Generator,10000.00,NGN,,,2,Bola Ade,2026-09-20T10:00:00.000Z',
      '',
    ])
  })
})
