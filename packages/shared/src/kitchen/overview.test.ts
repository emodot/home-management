import { describe, expect, it } from 'vitest'
import { foodCategoryIds, foodSpendMinor } from './overview.ts'

const cat = (id: string, name: string, parent_id: string | null = null) => ({ id, name, parent_id })
const categories = [
  cat('g', 'Groceries'),
  cat('g-meat', 'Meat', 'g'),
  cat('gas', 'cooking gas'),
  cat('fuel', 'Fuel & Generator'),
  cat('fake', 'Groceries', 'fuel'), // a sub-category with the same name doesn't count on its own
]
const total = (categoryId: string, totalMinor: number) => ({
  categoryId,
  totalMinor,
  expenseCount: 1,
})

describe('food spend', () => {
  it('finds the top-level food categories by name, ignoring case', () => {
    expect(foodCategoryIds(categories)).toEqual(['g', 'gas'])
  })

  it('adds up food categories and their sub-categories only', () => {
    expect(
      foodSpendMinor(
        [
          total('g', 1000),
          total('g-meat', 500),
          total('gas', 2000),
          total('fuel', 9000),
          total('fake', 70),
        ],
        categories,
      ),
    ).toBe(3500)
  })

  it('is zero without food categories', () => {
    expect(foodSpendMinor([total('fuel', 9000)], [cat('fuel', 'Fuel')])).toBe(0)
  })
})
