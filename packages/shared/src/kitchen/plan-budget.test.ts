import { describe, expect, it } from 'vitest'
import { groceriesBudget, weekShareOf } from './plan-budget.ts'

const categories = [
  { id: 'groceries', name: 'Groceries', parent_id: null },
  { id: 'market', name: 'Market', parent_id: 'groceries' },
  { id: 'supermarket', name: 'Supermarket', parent_id: 'groceries' },
  { id: 'fuel', name: 'Fuel', parent_id: null },
]
const totals = [
  { categoryId: 'groceries', totalMinor: 1000000, expenseCount: 2 },
  { categoryId: 'market', totalMinor: 2500000, expenseCount: 3 },
  { categoryId: 'fuel', totalMinor: 9900000, expenseCount: 1 },
]

describe('groceriesBudget', () => {
  it('uses the Groceries budget and everything spent under Groceries', () => {
    expect(
      groceriesBudget(
        categories,
        [{ category_id: 'groceries', monthly_amount_minor: 15000000 }],
        totals,
      ),
    ).toEqual({ categoryId: 'groceries', budgetMinor: 15000000, spentMinor: 3500000 })
  })

  it("adds up its sub-categories' budgets when Groceries has none itself", () => {
    const budgets = [
      { category_id: 'market', monthly_amount_minor: 8000000 },
      { category_id: 'supermarket', monthly_amount_minor: 4000000 },
      { category_id: 'fuel', monthly_amount_minor: 5000000 },
    ]
    expect(groceriesBudget(categories, budgets, totals).budgetMinor).toBe(12000000)
  })

  it('says when there is no budget', () => {
    expect(groceriesBudget(categories, [], totals).budgetMinor).toBeNull()
    expect(groceriesBudget([], [], totals)).toEqual({
      categoryId: null,
      budgetMinor: null,
      spentMinor: 0,
    })
  })
})

describe('weekShareOf', () => {
  it("is 7 days' worth of the month", () => {
    expect(weekShareOf(15500000, '2026-10-11')).toBe(3500000) // 31 days
    expect(weekShareOf(15000000, '2026-09-27')).toBe(3500000) // 30 days
    expect(weekShareOf(15000000, '2026-10-11')).toBe(3387100) // ₦33,870.97, to the naira
  })
})
