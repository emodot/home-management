import { describe, expect, it } from 'vitest'
import { groupByStore, mergeStoreTags } from './list.ts'

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
