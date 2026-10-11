import { describe, expect, it } from 'vitest'
import { gasReminderOn, gasStatus, predictNextRefill } from './gas.ts'

const r = (refilledOn: string, cylinderKg: number) => ({ refilledOn, cylinderKg })

describe('predictNextRefill', () => {
  it('needs at least two refills', () => {
    expect(predictNextRefill([])).toBeNull()
    expect(predictNextRefill([r('2026-08-01', 12.5)])).toBeNull()
  })

  it('uses days per kg of the earlier cylinder', () => {
    // 12.5 kg lasted 50 days: 4 days a kg; the last cylinder is 12.5 kg → 50 days on.
    const p = predictNextRefill([r('2026-08-01', 12.5), r('2026-09-20', 12.5)])
    expect(p?.daysPerKg).toBe(4)
    expect(p?.daysPerCylinder).toBe(50)
    expect(p?.nextOn).toBe('2026-11-09')
  })

  it('handles cylinders of different sizes', () => {
    // 12.5 kg lasted 50 days (4/kg); then 6 kg lasted 30 days (5/kg): mean 4.5 days a kg.
    // The last one is 12.5 kg → 56.25 → 56 days after 20 Oct.
    const p = predictNextRefill([r('2026-08-01', 12.5), r('2026-09-20', 6), r('2026-10-20', 12.5)])
    expect(p?.daysPerKg).toBe(4.5)
    expect(p?.daysPerCylinder).toBe(40)
    expect(p?.nextOn).toBe('2026-12-15')
  })

  it('looks at the last three intervals only, whatever order they come in', () => {
    const p = predictNextRefill([
      r('2026-10-01', 10), // newest
      r('2026-01-01', 10),
      r('2026-01-31', 10), // 30 days for 10 kg: 3 a kg (oldest interval, ignored)
      r('2026-03-22', 10), // 50 days: 5 a kg
      r('2026-06-30', 10), // 100 days: 10 a kg
    ]) // …and 30 Jun → 1 Oct: 93 days, 9.3 a kg
    expect(p?.daysPerKg).toBeCloseTo((5 + 10 + 9.3) / 3)
  })

  it('skips same-day refills (a spare cylinder)', () => {
    const p = predictNextRefill([r('2026-08-01', 12.5), r('2026-08-01', 6), r('2026-09-06', 12.5)])
    // Only 1 Aug (6 kg, sorted second) → 6 Sep counts: 36 days / 6 kg = 6 a kg.
    expect(p?.daysPerKg).toBe(6)
    expect(predictNextRefill([r('2026-08-01', 12.5), r('2026-08-01', 6)])).toBeNull()
  })
})

describe('gasStatus', () => {
  const p = predictNextRefill([r('2026-08-01', 12.5), r('2026-09-20', 12.5)])
  if (!p) throw new Error('no prediction')

  it('counts down to the predicted refill', () => {
    expect(gasStatus(p, '2026-10-10')).toEqual({ daysLeft: 30, fractionLeft: 0.6 })
    expect(gasStatus(p, '2026-11-12')).toEqual({ daysLeft: -3, fractionLeft: 0 })
  })

  it('sets the reminder three days before', () => {
    expect(gasReminderOn(p)).toBe('2026-11-06')
  })
})
