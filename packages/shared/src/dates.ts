import { DEFAULT_LOCALE, DEFAULT_TIMEZONE } from './constants.ts'

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60],
  ['month', 30 * 24 * 60 * 60],
  ['week', 7 * 24 * 60 * 60],
  ['day', 24 * 60 * 60],
  ['hour', 60 * 60],
  ['minute', 60],
]

/** "in 6 days", "yesterday", "3 hours ago", "now". */
export function formatRelativeTime(date: string | Date, now: Date = new Date()): string {
  const seconds = (new Date(date).getTime() - now.getTime()) / 1000
  const format = new Intl.RelativeTimeFormat(DEFAULT_LOCALE, { numeric: 'auto' })
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit)
  }
  return format.format(0, 'second')
}

/** A calendar date as YYYY-MM-DD (the format of Postgres `date` columns). */
export type IsoDate = string

/** Today's date in a time zone (Africa/Lagos by default), as YYYY-MM-DD. */
export function todayIn(timeZone: string = DEFAULT_TIMEZONE, now: Date = new Date()): IsoDate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

// Date-only values are handled as UTC midnight so formatting never shifts the day.
const asUtc = (date: IsoDate) => new Date(`${date}T00:00:00Z`)
const toIso = (date: Date): IsoDate => date.toISOString().slice(0, 10)

/** "20 Sept 2026" */
export function formatDate(
  date: IsoDate,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, { ...options, timeZone: 'UTC' }).format(
    asUtc(date),
  )
}

/** "2026-09" */
export function monthOf(date: IsoDate): string {
  return date.slice(0, 7)
}

/** "September 2026" for "2026-09" */
export function formatMonth(month: string): string {
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(asUtc(`${month}-01`))
}

/** First and last day of the month containing `date`, shifted by `offset` months. */
export function monthRange(date: IsoDate, offset = 0): { from: IsoDate; to: IsoDate } {
  const d = asUtc(date)
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1))
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset + 1, 0))
  return { from: toIso(first), to: toIso(last) }
}

/** January 1st to December 31st of the year containing `date`. */
export function yearRange(date: IsoDate): { from: IsoDate; to: IsoDate } {
  const year = date.slice(0, 4)
  return { from: `${year}-01-01`, to: `${year}-12-31` }
}

/** `date` plus `days` (may be negative). */
export function addDays(date: IsoDate, days: number): IsoDate {
  const d = asUtc(date)
  d.setUTCDate(d.getUTCDate() + days)
  return toIso(d)
}
