import { describe, expect, it } from 'vitest'
import { convert, formatQuantity, isKitchenUnit, KITCHEN_UNITS, unitLabel } from './units.ts'

describe('units', () => {
  it('knows the local measures', () => {
    expect(KITCHEN_UNITS).toContain('mudu')
    expect(isKitchenUnit('paint_bucket')).toBe(true)
    expect(isKitchenUnit('cup')).toBe(false)
  })

  it('labels singular and plural', () => {
    expect(unitLabel('paint_bucket')).toBe('paint bucket')
    expect(unitLabel('bunch', 2)).toBe('bunches')
    expect(unitLabel('mudu', 3)).toBe('mudu')
    expect(formatQuantity(1, 'pcs')).toBe('1 piece')
    expect(formatQuantity(1.5, 'litre')).toBe('1.5 litres')
    expect(formatQuantity(2, 'kg')).toBe('2 kg')
    expect(formatQuantity(0.333, 'kg')).toBe('0.33 kg')
  })
})

describe('convert', () => {
  it('converts within mass and volume', () => {
    expect(convert(1.5, 'kg', 'g')).toBe(1500)
    expect(convert(250, 'g', 'kg')).toBe(0.25)
    expect(convert(500, 'ml', 'litre')).toBe(0.5)
    expect(convert(2, 'litre', 'ml')).toBe(2000)
  })

  it('returns the quantity for the same unit, even a local one', () => {
    expect(convert(3, 'derica', 'derica')).toBe(3)
  })

  it("doesn't convert across families or for local measures", () => {
    expect(convert(1, 'kg', 'litre')).toBeNull()
    expect(convert(1, 'bag', 'kg')).toBeNull()
    expect(convert(1, 'mudu', 'derica')).toBeNull()
  })

  it("follows an item's own conversions, both ways and through metric", () => {
    const rice = [{ unit: 'bag', factor: 50, toUnit: 'kg' }] as const
    expect(convert(2, 'bag', 'kg', rice)).toBe(100)
    expect(convert(2, 'bag', 'g', rice)).toBe(100000)
    expect(convert(25, 'kg', 'bag', rice)).toBe(0.5)
    expect(convert(5000, 'g', 'bag', rice)).toBeCloseTo(0.1)
    expect(convert(1, 'tin', 'kg', rice)).toBeNull()
  })

  it('chains conversions between local measures', () => {
    const tomatoes = [
      { unit: 'crate', factor: 4, toUnit: 'paint_bucket' },
      { unit: 'paint_bucket', factor: 6, toUnit: 'derica' },
    ] as const
    expect(convert(1, 'crate', 'derica', tomatoes)).toBe(24)
    expect(convert(12, 'derica', 'crate', tomatoes)).toBeCloseTo(0.5)
  })

  it('ignores conversions that make no sense', () => {
    expect(convert(1, 'bag', 'kg', [{ unit: 'bag', factor: 0, toUnit: 'kg' }])).toBeNull()
    expect(convert(1, 'bag', 'kg', [{ unit: 'bag', factor: 1, toUnit: 'bag' }])).toBeNull()
  })
})
