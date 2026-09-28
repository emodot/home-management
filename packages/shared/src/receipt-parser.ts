import type { IsoDate } from './dates.ts'
import { MAX_AMOUNT_MINOR, toMinor } from './money.ts'

/** What a scanned receipt says. Anything that couldn't be read is null. */
export interface ParsedReceipt {
  amountMinor: number | null
  occurredOn: IsoDate | null
  /** The shop, business or transfer recipient, tidied for use as a description. */
  vendor: string | null
}

const MAX_VENDOR_LENGTH = 80
/** Receipts older than this are more likely a misread than a real date. */
const MAX_AGE_YEARS = 5

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}
const MONTH_NAME = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?'

/**
 * OCR misreads digits as letters (45,O00, 1l,500, 2S0). Fix them only inside tokens that are
 * mostly digits, so words are left alone.
 */
function fixDigitTokens(line: string): string {
  return line.replace(/[\dOoIl|S][\dOoIl|S,.]*/g, (token) => {
    const digits = token.replace(/\D/g, '').length
    const letters = token.replace(/[\d,.]/g, '').length
    if (digits < 2 || letters > digits) return token
    return token.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/S/g, '5')
  })
}

function normalise(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => fixDigitTokens(line.replace(/[\t ]+/g, ' ').trim()))
    .filter((line) => line.length > 0)
}

// ---------------------------------------------------------------- dates

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function toIso(year: number, month: number, day: number): IsoDate | null {
  const fullYear = year < 100 ? 2000 + year : year
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(fullYear, month)) return null
  return `${fullYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const DATE_PATTERNS: { regex: RegExp; read: (m: RegExpMatchArray) => IsoDate | null }[] = [
  // 2026-09-12
  {
    regex: /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g,
    read: (m) => toIso(Number(m[1]), Number(m[2]), Number(m[3])),
  },
  // 12/09/2026, 12-09-26, 12.09.2026: day first, unless the second number can't be a month
  // (09/25/2026).
  {
    regex: /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/g,
    read: (m) => {
      const a = Number(m[1])
      const b = Number(m[2])
      const year = Number(m[3])
      return b > 12 && a <= 12 ? toIso(year, a, b) : toIso(year, b, a)
    },
  },
  // 12 Sep 2026, 12th September, 2026, 12-Sep-26
  {
    regex: new RegExp(
      `\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s,-]*${MONTH_NAME}[\\s,-]*(\\d{4}|\\d{2})\\b`,
      'gi',
    ),
    read: (m) => toIso(Number(m[3]), MONTHS[(m[2] ?? '').toLowerCase()] ?? 0, Number(m[1])),
  },
  // Sep 12, 2026
  {
    regex: new RegExp(`\\b${MONTH_NAME}\\s*(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(\\d{4})\\b`, 'gi'),
    read: (m) => toIso(Number(m[3]), MONTHS[(m[1] ?? '').toLowerCase()] ?? 0, Number(m[2])),
  },
]

function datesIn(line: string): IsoDate[] {
  const found: IsoDate[] = []
  for (const { regex, read } of DATE_PATTERNS) {
    for (const match of line.matchAll(regex)) {
      const date = read(match)
      if (date) found.push(date)
    }
  }
  return found
}

function findDate(lines: string[], today: IsoDate): IsoDate | null {
  const earliest = `${Number(today.slice(0, 4)) - MAX_AGE_YEARS}${today.slice(4)}`
  const plausible = (date: IsoDate) => date <= today && date >= earliest
  // A labelled date ("Date:", "Transaction Date") beats any other date on the receipt.
  const labelled = lines.filter((line) => /\bdate\b/i.test(line))
  for (const group of [labelled, lines]) {
    for (const line of group) {
      const date = datesIn(line).find(plausible)
      if (date) return date
    }
  }
  return null
}

// ---------------------------------------------------------------- amounts

const MONEY = /(₦|NGN|\bN(?=\s?\d))?\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/g

/** Lines that carry a total, best first. */
const TOTAL_RANKS = [
  /\bGRAND\s*TOTAL\b/,
  /\bTOTAL\s*(DUE|PAYABLE|AMOUNT|PAID)\b|\bAMOUNT\s*(DUE|PAYABLE|PAID)\b|\bNET\s*(TOTAL|AMOUNT)\b/,
  /\bTOTAL\b/,
  /\bAMOUNT\b|\bAMT\b/,
]
/** Amounts on these lines are never the total. */
const NOT_TOTAL =
  /\bSUB\s*-?\s*TOTAL\b|\bVAT\b|\bTAX\b|\bCHANGE\b|TENDER|DISCOUNT|BALANCE|\bCASH\b|SAVED|SAVINGS|\bQTY\b|\bITEMS?\b|\bFEE\b|\bCHARGES?\b|\bPOINTS\b/

interface Money {
  minor: number
  /** Written like money (₦, thousands separators or kobo), not just a number. */
  moneyLike: boolean
}

function moneyIn(line: string): Money[] {
  // Dates, times and long digit runs (phone, card and reference numbers) aren't amounts.
  const cleaned = line
    .replace(/\b\d{1,4}[/.-]\d{1,2}[/.-]\d{2,4}\b/g, ' ')
    .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, ' ')
    .replace(/\d{7,}(?!\.\d)/g, ' ')
  const found: Money[] = []
  for (const match of cleaned.matchAll(MONEY)) {
    const number = match[2] ?? ''
    try {
      const minor = toMinor(number)
      if (minor > 0 && minor <= MAX_AMOUNT_MINOR) {
        found.push({ minor, moneyLike: !!match[1] || /[,.]/.test(number) })
      }
    } catch {
      // Not an amount.
    }
  }
  return found
}

const largest = (values: Money[]) =>
  values.reduce<number | null>((max, m) => (max === null || m.minor > max ? m.minor : max), null)

function findAmount(lines: string[]): number | null {
  const upper = lines.map((line) => line.toUpperCase().replace(/\(?\bINCL[A-Z.]*\b[^)]*\)?/g, ' '))
  const best: (number | null)[] = TOTAL_RANKS.map(() => null)

  upper.forEach((line, i) => {
    const rank = TOTAL_RANKS.findIndex((regex) => regex.test(line))
    if (rank === -1 || (rank >= 2 && NOT_TOTAL.test(line))) return
    let amounts = moneyIn(line)
    // "TOTAL" on one line, the amount alone on the next.
    const next = upper[i + 1]
    if (amounts.length === 0 && next && /^[^A-Z]*$/.test(next)) amounts = moneyIn(next)
    const value = largest(amounts)
    const current = best[rank] ?? null
    if (value !== null && (current === null || value > current)) best[rank] = value
  })

  const ranked = best.find((value) => value !== null)
  if (ranked != null) return ranked
  // No total line: the largest money-looking amount that isn't change, VAT and so on.
  return largest(
    upper
      .filter((line) => !NOT_TOTAL.test(line))
      .flatMap((line) => moneyIn(line).filter((m) => m.moneyLike)),
  )
}

// ---------------------------------------------------------------- vendor

const VENDOR_LABEL =
  /^(?:beneficiary|recipient|merchant|receiver|paid to|sent to|account name)(?:\s*(?:name|details))?\s*[:-]?\s*(.*)$/i
const NOT_VENDOR =
  /receipt|welcome|thank|invoice|\btel\b|phone|www\.|http|@|\.com|\bcopy\b|transaction|\bdate\b|\btime\b|cashier|\btill\b|terminal|\bpos\b|\bvat\b|\btin\b|\brc\b|street|\bst\.|road|\brd\b|avenue|\bave\b|crescent|\bclose\b|\bplot\b|\bno\.?\s*\d|successful|approved|status/i

function tidyVendor(raw: string): string | null {
  // Drop what follows a name: account numbers, "| Opay".
  const text = (raw.split(/\||\d{6,}/)[0] ?? '')
    .replace(/[•*_=~#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[^\p{L}\d]+|[^\p{L}\d.)]+$/gu, '')
    .trim()
  const letters = text.replace(/[^\p{L}]/gu, '')
  if (letters.length < 3) return null
  const upperShare = letters.replace(/[^\p{Lu}]/gu, '').length / letters.length
  const cased =
    upperShare > 0.8
      ? text
          .toLowerCase()
          .replace(/(^|[\s&(/-])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase())
      : text
  return cased.slice(0, MAX_VENDOR_LENGTH).trim()
}

function findVendor(lines: string[]): string | null {
  // Transfer receipts name who was paid.
  for (const [i, line] of lines.entries()) {
    const match = VENDOR_LABEL.exec(line)
    if (!match) continue
    const vendor = tidyVendor(match[1] ?? '') ?? tidyVendor(lines[i + 1] ?? '')
    if (vendor && !NOT_VENDOR.test(vendor)) return vendor
  }
  // Otherwise the business name printed at the top.
  for (const line of lines.slice(0, 6)) {
    if (/^\d/.test(line) || NOT_VENDOR.test(line)) continue
    const nonSpace = line.replace(/\s/g, '')
    const letters = nonSpace.replace(/[^\p{L}]/gu, '').length
    if (letters < 3 || letters / nonSpace.length < 0.6) continue
    const vendor = tidyVendor(line)
    if (vendor) return vendor
  }
  return null
}

/**
 * Reads the total, date and shop from receipt text (from OCR or a PDF's text layer). Built for
 * Nigerian receipts: naira amounts and day-first dates. `today` (in the household's timezone)
 * rules out future dates.
 */
export function parseReceiptText(text: string, { today }: { today: IsoDate }): ParsedReceipt {
  const lines = normalise(text)
  return {
    amountMinor: findAmount(lines),
    occurredOn: findDate(lines, today),
    vendor: findVendor(lines),
  }
}

const GENERIC_WORDS = new Set([
  'the',
  'and',
  'ltd',
  'limited',
  'plc',
  'nig',
  'nigeria',
  'store',
  'stores',
  'shop',
  'supermarket',
  'mart',
  'enterprise',
  'enterprises',
  'ventures',
  'services',
  'global',
  'company',
])

/** The word to look a vendor up by in past expenses: "SHOPRITE LEKKI" → "shoprite". */
export function vendorSearchTerm(vendor: string): string | null {
  const words = vendor.toLowerCase().match(/\p{L}[\p{L}']*/gu) ?? []
  return words.find((word) => word.length >= 3 && !GENERIC_WORDS.has(word)) ?? null
}
