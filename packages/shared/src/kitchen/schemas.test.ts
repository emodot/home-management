import { describe, expect, it } from 'vitest'
import { listItemFormSchema, pantryItemFormSchema, quantityInputSchema } from './schemas.ts'

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

describe('pantryItemFormSchema', () => {
  const base = {
    quantity: '2',
    unit: 'kg',
    location: 'fridge',
    expiresOn: '',
    lowStockThreshold: '',
  }

  it('allows zero stock and empty optional fields', () => {
    expect(pantryItemFormSchema.parse({ ...base, quantity: '0' })).toEqual({
      quantity: 0,
      unit: 'kg',
      location: 'fridge',
      expiresOn: null,
      lowStockThreshold: null,
    })
  })

  it('reads an expiry and a threshold', () => {
    const parsed = pantryItemFormSchema.parse({
      ...base,
      expiresOn: '2026-10-20',
      lowStockThreshold: '0,5',
    })
    expect([parsed.expiresOn, parsed.lowStockThreshold]).toEqual(['2026-10-20', 0.5])
  })

  it('rejects negative stock and unknown places', () => {
    expect(pantryItemFormSchema.safeParse({ ...base, quantity: '-1' }).success).toBe(false)
    expect(pantryItemFormSchema.safeParse({ ...base, location: 'garage' }).success).toBe(false)
  })
})
