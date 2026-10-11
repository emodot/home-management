import { describe, expect, it } from 'vitest'
import { listItemFormSchema, quantityInputSchema } from './schemas.ts'

describe('quantityInputSchema', () => {
  it('reads decimals, with a comma or a point', () => {
    expect(quantityInputSchema.parse(' 1.5 ')).toBe(1.5)
    expect(quantityInputSchema.parse('2,25')).toBe(2.25)
    expect(quantityInputSchema.parse('3')).toBe(3)
  })

  it('rejects zero, negatives, words and too many decimals', () => {
    for (const bad of ['0', '-1', 'two', '', '1.255', '100000']) {
      expect(quantityInputSchema.safeParse(bad).success).toBe(false)
    }
  })
})

describe('listItemFormSchema', () => {
  it('turns empty store and notes into none', () => {
    expect(
      listItemFormSchema.parse({ quantity: '2', unit: 'kg', storeTag: '  ', notes: ' ' }),
    ).toEqual({ quantity: 2, unit: 'kg', storeTag: null, notes: null })
  })
})
