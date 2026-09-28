import { describe, expect, it } from 'vitest'
import { categoryPath, categoryTree, rollUpTotals, topLevelId } from './category-tree.ts'

const c = (id: string, name: string, parent_id: string | null = null) => ({ id, name, parent_id })
const categories = [
  c('u', 'Utilities'),
  c('b', 'Borehole', 'u'),
  c('g', 'Groceries'),
  c('w', 'Waste', 'u'),
  c('x', 'Orphan', 'missing'),
]
const byId = new Map(categories.map((x) => [x.id, x]))

describe('categoryTree', () => {
  it('nests sub-categories under their parent, keeping order', () => {
    expect(
      categoryTree(categories).map((n) => [n.category.id, n.children.map((ch) => ch.id)]),
    ).toEqual([
      ['u', ['b', 'w']],
      ['g', []],
      ['x', []],
    ])
  })
})

describe('categoryPath and topLevelId', () => {
  it('names sub-categories with their parent', () => {
    expect(categoryPath('b', byId)).toBe('Utilities › Borehole')
    expect(categoryPath('g', byId)).toBe('Groceries')
    expect(categoryPath('nope', byId)).toBe('Unknown')
    expect(topLevelId('b', byId)).toBe('u')
    expect(topLevelId('u', byId)).toBe('u')
    expect(topLevelId('x', byId)).toBe('x')
  })
})

describe('rollUpTotals', () => {
  it('adds sub-category spending into the parent and lists the breakdown', () => {
    const rolled = rollUpTotals(
      [
        { categoryId: 'u', totalMinor: 100, expenseCount: 1 },
        { categoryId: 'b', totalMinor: 300, expenseCount: 2 },
        { categoryId: 'w', totalMinor: 50, expenseCount: 1 },
        { categoryId: 'g', totalMinor: 200, expenseCount: 4 },
      ],
      byId,
    )
    expect(rolled.map((r) => [r.categoryId, r.totalMinor, r.expenseCount])).toEqual([
      ['u', 450, 4],
      ['g', 200, 4],
    ])
    expect(rolled[0]?.children.map((ch) => ch.categoryId)).toEqual(['b', 'w'])
  })
})
