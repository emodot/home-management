import { describe, expect, it } from 'vitest'
import { itemSearchKey, normalizeItemName } from './normalize.ts'

describe('normalizeItemName', () => {
  it('makes singular and plural spellings the same item', () => {
    for (const [a, b] of [
      ['Tomatoes ', 'tomato'],
      ['Eggs', 'egg'],
      ['Onions', 'Onion'],
      ['Sweet potatoes', 'sweet potato'],
      ['Maggi cubes', 'Maggi cube'],
      ['Peaches', 'peach'],
      ['Berries', 'berry'],
      ['Cookies', 'cookie'],
      ['Bay leaves', 'bay leaf'],
      ['Plantains', 'plantain'],
    ]) {
      expect(normalizeItemName(a ?? '')).toBe(normalizeItemName(b ?? ''))
    }
    expect(normalizeItemName('Tomatoes ')).toBe('tomato')
  })

  it('leaves words that only look plural', () => {
    expect(normalizeItemName('Rice')).toBe('rice')
    expect(normalizeItemName('Garri')).toBe('garri')
    expect(normalizeItemName('Couscous')).toBe('couscous')
    expect(normalizeItemName('Glass')).toBe('glass')
    expect(normalizeItemName('Molasses')).toBe('molasses')
    expect(normalizeItemName('Peas')).toBe('pea')
  })

  it('only changes the last word', () => {
    expect(normalizeItemName('Beans flour')).toBe('beans flour')
  })

  it('ignores case, spacing, accents and punctuation', () => {
    expect(normalizeItemName('  Ụgụ   LEAVES ')).toBe('ugu leaf')
    expect(normalizeItemName('Salt & pepper')).toBe('salt and pepper')
    expect(normalizeItemName("Mama's pride rice")).toBe('mama s pride rice')
    expect(normalizeItemName('!!!')).toBe('')
  })
})

describe('itemSearchKey', () => {
  it('keeps the words as typed', () => {
    expect(itemSearchKey(' Tomatoes, fresh ')).toBe('tomatoes fresh')
  })
})
