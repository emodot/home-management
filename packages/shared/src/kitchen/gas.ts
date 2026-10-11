import { addDays, type IsoDate } from '../dates.ts'

/** A cooking gas refill, as far as the prediction cares. */
export interface GasRefill {
  refilledOn: IsoDate
  cylinderKg: number
}

export interface GasPrediction {
  /** How many days a kilogram lasts this household (mean over the last 3 refills). */
  daysPerKg: number
  /** The same, over the cylinders as bought: mean days between refills. */
  daysPerCylinder: number
  last: GasRefill
  /** When the gas from the last refill should run out. */
  nextOn: IsoDate
}

/** How many past refills the averages look at. */
export const PREDICTION_WINDOW = 3

const DAY_MS = 86_400_000
const daysBetween = (from: IsoDate, to: IsoDate) =>
  Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS)

/**
 * Predicts the next refill: days per kg is the mean, over the last 3 intervals, of the days
 * between two refills divided by the kg of the earlier one; the next date is the last refill plus
 * that rate times the last cylinder's kg. Null with fewer than two refills (no interval yet).
 * Same-day refills (e.g. a spare cylinder) don't count as an interval.
 */
export function predictNextRefill(refills: GasRefill[]): GasPrediction | null {
  const sorted = [...refills].sort((a, b) => a.refilledOn.localeCompare(b.refilledOn))
  const intervals: { days: number; perKg: number }[] = []
  for (let i = 1; i < sorted.length; i++) {
    const before = sorted[i - 1]
    const after = sorted[i]
    if (!before || !after) continue
    const days = daysBetween(before.refilledOn, after.refilledOn)
    if (days > 0 && before.cylinderKg > 0) intervals.push({ days, perKg: days / before.cylinderKg })
  }
  const last = sorted.at(-1)
  const recent = intervals.slice(-PREDICTION_WINDOW)
  if (!last || recent.length === 0) return null
  const mean = (xs: number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length
  const daysPerKg = mean(recent.map((i) => i.perKg))
  return {
    daysPerKg,
    daysPerCylinder: mean(recent.map((i) => i.days)),
    last,
    nextOn: addDays(last.refilledOn, Math.round(daysPerKg * last.cylinderKg)),
  }
}

export interface GasStatus {
  /** Days until the predicted refill; negative when it's overdue. */
  daysLeft: number
  /** Share of the current cylinder's predicted life still to go, 0–1 (for a progress bar). */
  fractionLeft: number
}

export function gasStatus(prediction: GasPrediction, today: IsoDate): GasStatus {
  const total = daysBetween(prediction.last.refilledOn, prediction.nextOn)
  const daysLeft = daysBetween(today, prediction.nextOn)
  return {
    daysLeft,
    fractionLeft: total <= 0 ? 0 : Math.min(1, Math.max(0, daysLeft / total)),
  }
}

/** Reminders are due this many days before the predicted refill. */
export const GAS_REMINDER_DAYS_BEFORE = 3

/** When the "Refill cooking gas" task should be due for this prediction. */
export function gasReminderOn(prediction: GasPrediction): IsoDate {
  return addDays(prediction.nextOn, -GAS_REMINDER_DAYS_BEFORE)
}
