import type { IsoDate } from './dates.ts'

export type Frequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
export type ScheduleType = 'fixed' | 'after_completion' | 'once'

const MONTHS: Partial<Record<Frequency, number>> = { monthly: 1, quarterly: 3, yearly: 12 }

const parts = (date: IsoDate) => {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number)
  return { y, m, d }
}
const iso = (y: number, m: number, d: number) =>
  `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

/**
 * Moves `from` forward by one step. Month-based steps keep `anchorDay` where the month allows it,
 * so a bill anchored to the 31st goes Jan 31 → Feb 28 (29 in leap years) → Mar 31.
 * Mirrors public.advance_date() in the database; keep them in step.
 */
export function advanceDate(
  from: IsoDate,
  frequency: Frequency,
  intervalCount: number,
  anchorDay: number = parts(from).d,
): IsoDate {
  const { y, m, d } = parts(from)
  if (frequency === 'daily' || frequency === 'weekly') {
    const days = intervalCount * (frequency === 'weekly' ? 7 : 1)
    const date = new Date(Date.UTC(y, m - 1, d + days))
    return date.toISOString().slice(0, 10)
  }
  const monthIndex = y * 12 + (m - 1) + intervalCount * (MONTHS[frequency] ?? 1)
  const year = Math.floor(monthIndex / 12)
  const month = (monthIndex % 12) + 1
  return iso(year, month, Math.min(anchorDay, daysInMonth(year, month)))
}

/**
 * The next due date after an occurrence. Mirrors public.complete_task().
 * - fixed: steps along the schedule from the previous due date (anchored to `startOn`'s day),
 *   regardless of when it was done, to the first date after the completion — so a late completion
 *   doesn't leave already-missed repeats overdue.
 * - after_completion: from the completion date.
 * - once: no next date.
 */
export function nextDueDate({
  scheduleType,
  frequency,
  intervalCount,
  previousDueOn,
  completedOn,
  startOn,
}: {
  scheduleType: ScheduleType
  frequency: Frequency | null
  intervalCount: number
  previousDueOn: IsoDate
  completedOn?: IsoDate
  startOn?: IsoDate
}): IsoDate | null {
  if (scheduleType === 'once' || !frequency) return null
  if (scheduleType === 'after_completion') {
    return advanceDate(completedOn ?? previousDueOn, frequency, intervalCount)
  }
  const anchor = parts(startOn ?? previousDueOn).d
  let next = advanceDate(previousDueOn, frequency, intervalCount, anchor)
  while (completedOn && next <= completedOn)
    next = advanceDate(next, frequency, intervalCount, anchor)
  return next
}

/** The next `count` due dates starting at `nextDueOn` (for previews). */
export function upcomingDueDates(
  nextDueOn: IsoDate,
  frequency: Frequency,
  intervalCount: number,
  startOn: IsoDate,
  count: number,
): IsoDate[] {
  const dates = [nextDueOn]
  while (dates.length < count) {
    dates.push(advanceDate(dates.at(-1) ?? nextDueOn, frequency, intervalCount, parts(startOn).d))
  }
  return dates
}

const UNIT: Record<Frequency, [string, string]> = {
  daily: ['day', 'days'],
  weekly: ['week', 'weeks'],
  monthly: ['month', 'months'],
  quarterly: ['quarter', 'quarters'],
  yearly: ['year', 'years'],
}

/** "Every month", "Every 2 weeks". */
export function describeFrequency(frequency: Frequency, intervalCount: number): string {
  const [one, many] = UNIT[frequency]
  return intervalCount === 1 ? `Every ${one}` : `Every ${intervalCount} ${many}`
}
