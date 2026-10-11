import { describe, expect, it } from 'vitest'
import {
  expiryLabel,
  expiryStatus,
  isLowStock,
  isOut,
  stepQuantity,
  itemsToUseSoon,
} from './pantry.ts'

describe('expiry', () => {
  const today = '2026-10-14'

  it('places a date against today', () => {
    expect(expiryStatus(null, today)).toEqual({ kind: 'none' })
    expect(expiryStatus('2026-10-12', today)).toEqual({ kind: 'expired', days: 2 })
    expect(expiryStatus('2026-10-14', today)).toEqual({ kind: 'soon', days: 0 })
    expect(expiryStatus('2026-10-17', today)).toEqual({ kind: 'soon', days: 3 })
    expect(expiryStatus('2026-10-18', today)).toEqual({ kind: 'later', days: 4 })
  })

  it('says it in words', () => {
    expect(expiryLabel(expiryStatus('2026-10-13', today))).toBe('Expired yesterday')
    expect(expiryLabel(expiryStatus('2026-10-10', today))).toBe('Expired 4 days ago')
    expect(expiryLabel(expiryStatus('2026-10-14', today))).toBe('Expires today')
    expect(expiryLabel(expiryStatus('2026-10-15', today))).toBe('Expires tomorrow')
    expect(expiryLabel(expiryStatus('2026-10-20', today))).toBe('Expires in 6 days')
    expect(expiryLabel({ kind: 'none' })).toBeNull()
  })

  it('lists what to use soon: expired first, then by date, skipping used-up items', () => {
    const items = [
      { name: 'Later', expiresOn: '2026-10-30', quantity: 1 },
      { name: 'Soon', expiresOn: '2026-10-16', quantity: 1 },
      { name: 'Expired', expiresOn: '2026-10-01', quantity: 2 },
      { name: 'Gone', expiresOn: '2026-10-15', quantity: 0 },
      { name: 'No date', expiresOn: null, quantity: 1 },
    ]
    expect(itemsToUseSoon(items, today).map((i) => i.name)).toEqual(['Expired', 'Soon'])
  })
})

describe('stock', () => {
  it('knows low and out', () => {
    expect(isLowStock({ quantity: 1, lowStockThreshold: 1 })).toBe(true)
    expect(isLowStock({ quantity: 2, lowStockThreshold: 1 })).toBe(false)
    expect(isLowStock({ quantity: 0, lowStockThreshold: null })).toBe(false)
    expect(isOut({ quantity: 0 })).toBe(true)
  })

  it('steps by whole units without going below zero', () => {
    expect(stepQuantity(2.5, -1)).toBe(1.5)
    expect(stepQuantity(0.5, -1)).toBe(0)
    expect(stepQuantity(0, 1)).toBe(1)
  })
})
