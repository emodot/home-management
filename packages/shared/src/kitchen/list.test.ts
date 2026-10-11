import { describe, expect, it } from 'vitest'
import { groupByStore, mergeStoreTags, shoppingProgress, unitPriceMinor } from './list.ts'

const entry = (name: string, storeTag: string | null, createdAt: string) => ({
  name,
  storeTag,
  createdAt,
})

describe('groupByStore', () => {
  it('groups by store, alphabetically, with no-store entries last', () => {
    const groups = groupByStore([
      entry('Pepper', 'Mile 12', '2026-10-01T10:02:00Z'),
      entry('Salt', null, '2026-10-01T10:00:00Z'),
      entry('Rice', 'Shoprite', '2026-10-01T10:01:00Z'),
      entry('Tomatoes', 'mile 12 ', '2026-10-01T10:00:30Z'),
    ])
    expect(groups.map((g) => [g.store, g.items.map((i) => i.name)])).toEqual([
      ['mile 12', ['Tomatoes', 'Pepper']],
      ['Shoprite', ['Rice']],
      [null, ['Salt']],
    ])
  })

  it('handles an empty list', () => {
    expect(groupByStore([])).toEqual([])
  })
})

describe('mergeStoreTags', () => {
  it('keeps the first spelling of each store, in order, up to the limit', () => {
    expect(
      mergeStoreTags(
        [
          ['Mile 12', null, ' Shoprite '],
          ['mile 12', 'Oyingbo', '', 'Spar'],
        ],
        3,
      ),
    ).toEqual(['Mile 12', 'Shoprite', 'Oyingbo'])
  })
})

describe('shoppingProgress', () => {
  it('adds up the prices of checked entries and counts the unpriced ones', () => {
    expect(
      shoppingProgress([
        { isChecked: true, pricePaidMinor: 500000 },
        { isChecked: true, pricePaidMinor: null },
        { isChecked: false, pricePaidMinor: null },
        { isChecked: true, pricePaidMinor: 1250000 },
      ]),
    ).toEqual({ count: 4, checked: 3, totalMinor: 1750000, unpriced: 1 })
  })
})

describe('unitPriceMinor', () => {
  it('divides a line price by the quantity', () => {
    expect(unitPriceMinor(500000, 2)).toBe(250000)
    expect(unitPriceMinor(100000, 3)).toBe(33333)
    expect(unitPriceMinor(150000, 0.5)).toBe(300000)
  })

  it('has nothing to add for one unit or no price', () => {
    expect(unitPriceMinor(500000, 1)).toBeNull()
    expect(unitPriceMinor(null, 2)).toBeNull()
  })
})
